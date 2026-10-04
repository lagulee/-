package com.lagulee.focusflight;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 안드로이드에서 "지금 어떤 앱을 쓰고 있는지"를 알려 주는 플러그인.
 * 사용 기록 접근(PACKAGE_USAGE_STATS) 권한이 필요하다. 데이터는 기기 밖으로 나가지 않는다.
 */
@CapacitorPlugin(
    name = "FocusMonitor",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class FocusMonitorPlugin extends Plugin {

    private final Map<String, String> labels = new HashMap<>();

    static boolean hasUsageAccess(Context ctx) {
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        int mode;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        } else {
            mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** 홈 화면(런처) 패키지들. 홈 화면에 있는 것은 위반으로 보지 않는다 */
    static Set<String> launcherPackages(Context ctx) {
        Set<String> out = new HashSet<>();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo ri : ctx.getPackageManager().queryIntentActivities(home, 0)) {
            out.add(ri.activityInfo.packageName);
        }
        return out;
    }

    private String labelOf(String pkg) {
        String cached = labels.get(pkg);
        if (cached != null) return cached;
        String label = pkg;
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            label = pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException ignored) {
            // 보이지 않는 패키지는 이름 대신 패키지명
        }
        labels.put(pkg, label);
        return label;
    }

    private boolean notificationsGranted() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void getEnvironment(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("ownPackage", ctx.getPackageName());
        ret.put("usageGranted", hasUsageAccess(ctx));
        ret.put("notificationsGranted", notificationsGranted());
        ret.put("sdk", Build.VERSION.SDK_INT);
        JSArray launchers = new JSArray();
        for (String p : launcherPackages(ctx)) launchers.put(p);
        ret.put("launchers", launchers);
        call.resolve(ret);
    }

    /** 감지 과정을 기기 로그에 남긴다 (릴리스 빌드에서도). 패키지 이름만 담는다 */
    @PluginMethod
    public void log(PluginCall call) {
        android.util.Log.i("FocusFlight", call.getString("message", ""));
        call.resolve();
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (notificationsGranted()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback");
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", notificationsGranted());
        call.resolve(ret);
    }

    /**
     * since 이후의 앱 전환·화면 켜짐/꺼짐 기록.
     * 앱이 백그라운드에 있던 동안의 기록도 돌려주므로, 돌아왔을 때 무슨 일이 있었는지 다시 계산할 수 있다.
     */
    @PluginMethod
    public void getEvents(PluginCall call) {
        Context ctx = getContext();
        long now = System.currentTimeMillis();
        long since = call.getDouble("since", (double) (now - 60_000)).longValue();
        JSObject ret = new JSObject();
        ret.put("now", now);
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        ret.put("screenOn", pm.isInteractive());
        JSArray events = new JSArray();
        if (!hasUsageAccess(ctx)) {
            ret.put("granted", false);
            ret.put("events", events);
            call.resolve(ret);
            return;
        }
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        UsageEvents ev = usm.queryEvents(Math.max(0, since), now);
        UsageEvents.Event e = new UsageEvents.Event();
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            String type = null;
            int t = e.getEventType();
            if (t == UsageEvents.Event.MOVE_TO_FOREGROUND) type = "app";
            else if (Build.VERSION.SDK_INT >= 28 && t == UsageEvents.Event.SCREEN_NON_INTERACTIVE) type = "screen_off";
            else if (Build.VERSION.SDK_INT >= 28 && t == UsageEvents.Event.SCREEN_INTERACTIVE) type = "screen_on";
            if (type == null) continue;
            JSObject o = new JSObject();
            o.put("t", e.getTimeStamp());
            o.put("type", type);
            if (type.equals("app")) {
                o.put("pkg", e.getPackageName());
                o.put("label", labelOf(e.getPackageName()));
            }
            events.put(o);
        }
        ret.put("granted", true);
        ret.put("events", events);
        call.resolve(ret);
    }

    /** 허용 앱을 고를 수 있도록 실행 가능한 앱 목록 */
    @PluginMethod
    public void listApps(PluginCall call) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        Set<String> seen = new HashSet<>();
        List<JSObject> apps = new ArrayList<>();
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(ctx.getPackageName()) || !seen.add(pkg)) continue;
            JSObject o = new JSObject();
            o.put("pkg", pkg);
            o.put("label", ri.loadLabel(pm).toString());
            apps.add(o);
        }
        apps.sort((a, b) -> a.getString("label", "").compareToIgnoreCase(b.getString("label", "")));
        JSArray arr = new JSArray();
        for (JSObject o : apps) arr.put(o);
        JSObject ret = new JSObject();
        ret.put("apps", arr);
        call.resolve(ret);
    }

    /** 비행 중 백그라운드 감시(알림) 시작 */
    @PluginMethod
    public void startWatch(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, FocusWatchService.class);
        try {
            intent.putExtra("allowed", toStringArray(call.getArray("allowed", new JSArray())));
            intent.putExtra("neutral", toStringArray(call.getArray("neutral", new JSArray())));
        } catch (JSONException e) {
            call.reject("bad arguments", e);
            return;
        }
        intent.putExtra("toleranceMs", (long) call.getDouble("toleranceMs", 2000.0).doubleValue());
        intent.putExtra("graceMs", (long) call.getDouble("graceMs", 10000.0).doubleValue());
        intent.putExtra("endsAt", (long) call.getDouble("endsAt", 0.0).doubleValue());
        intent.putExtra("title", call.getString("title", "비행 중"));
        ContextCompat.startForegroundService(ctx, intent);
        call.resolve();
    }

    @PluginMethod
    public void stopWatch(PluginCall call) {
        Context ctx = getContext();
        ctx.stopService(new Intent(ctx, FocusWatchService.class));
        call.resolve();
    }

    private static String[] toStringArray(JSArray arr) throws JSONException {
        List<String> list = arr.toList();
        return list.toArray(new String[0]);
    }
}
