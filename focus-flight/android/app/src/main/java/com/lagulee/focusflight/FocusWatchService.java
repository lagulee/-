package com.lagulee.focusflight;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 비행 중 Focus Flight 밖에 있을 때 1초마다 지금 앱을 확인해, 허용되지 않은 앱이면
 * "난기류" 알림으로 돌아오라고 알려 준다. 최종 판정(착륙·추락)은 앱으로 돌아왔을 때 화면 쪽에서 기록으로 다시 계산한다.
 */
public class FocusWatchService extends Service {

    private static final String CHANNEL_FLIGHT = "flight";
    private static final String CHANNEL_ALERT = "turbulence";
    private static final int ID_FLIGHT = 1;
    private static final int ID_ALERT = 2;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> allowed = new HashSet<>();
    private final Set<String> neutral = new HashSet<>();
    private long toleranceMs = 2000;
    private long graceMs = 10000;
    private long endsAt = 0;
    private String title = "비행 중";

    private String current;
    private long lastQuery;
    private long awaySince = 0;
    private boolean alerted = false;
    private boolean crashed = false;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            check();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            allowed.clear();
            neutral.clear();
            String[] a = intent.getStringArrayExtra("allowed");
            String[] n = intent.getStringArrayExtra("neutral");
            if (a != null) allowed.addAll(Arrays.asList(a));
            if (n != null) neutral.addAll(Arrays.asList(n));
            toleranceMs = intent.getLongExtra("toleranceMs", 2000);
            graceMs = intent.getLongExtra("graceMs", 10000);
            endsAt = intent.getLongExtra("endsAt", 0);
            String t = intent.getStringExtra("title");
            if (t != null) title = t;
        }
        allowed.add(getPackageName());
        neutral.addAll(FocusMonitorPlugin.launcherPackages(this));
        neutral.add("com.android.systemui");
        createChannels();
        Notification n = flightNotification();
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, ID_FLIGHT, n, type);
        current = getPackageName();
        lastQuery = System.currentTimeMillis() - 5000;
        awaySince = 0;
        alerted = false;
        crashed = false;
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.cancel(ID_ALERT);
        super.onDestroy();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel flight = new NotificationChannel(CHANNEL_FLIGHT, "비행 중", NotificationManager.IMPORTANCE_LOW);
        flight.setDescription("비행 중 남은 시간을 보여 줍니다");
        NotificationChannel alert = new NotificationChannel(CHANNEL_ALERT, "난기류 경고", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("비행 중 다른 앱을 쓰면 돌아오라고 알려 줍니다");
        alert.enableVibration(true);
        nm.createNotificationChannel(flight);
        nm.createNotificationChannel(alert);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification flightNotification() {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_FLIGHT)
            .setSmallIcon(R.drawable.ic_stat_plane)
            .setContentTitle("✈️ " + title)
            .setContentText("집중 비행 중입니다. 다른 앱을 열면 난기류가 생겨요.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp());
        if (endsAt > 0) {
            b.setWhen(endsAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        }
        return b.build();
    }

    /** 마지막 확인 이후의 기록으로 지금 맨 앞의 앱을 갱신한다 */
    private void updateCurrent() {
        if (!FocusMonitorPlugin.hasUsageAccess(this)) return;
        UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        UsageEvents ev = usm.queryEvents(lastQuery, now);
        UsageEvents.Event e = new UsageEvents.Event();
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) current = e.getPackageName();
        }
        lastQuery = now;
    }

    private void check() {
        long now = System.currentTimeMillis();
        if (endsAt > 0 && now > endsAt + 5000) {
            stopSelf();
            return;
        }
        updateCurrent();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        boolean away = pm.isInteractive() && current != null && !allowed.contains(current) && !neutral.contains(current);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (!away) {
            awaySince = 0;
            if (alerted) {
                nm.cancel(ID_ALERT);
                alerted = false;
            }
            return;
        }
        if (crashed) return;
        if (awaySince == 0) awaySince = now;
        long awayMs = now - awaySince;
        if (awayMs < toleranceMs) return;
        long left = (toleranceMs + graceMs - awayMs + 999) / 1000;
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_stat_plane)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setOnlyAlertOnce(alerted);
        if (left > 0) {
            b.setContentTitle("⚠️ 난기류! " + left + "초 안에 돌아오세요")
                .setContentText("눌러서 Focus Flight로 돌아가기");
        } else {
            b.setContentTitle("💥 추락했습니다").setContentText("Focus Flight를 열어 결과를 확인하세요");
            crashed = true;
        }
        nm.notify(ID_ALERT, b.build());
        alerted = true;
    }
}
