package com.lagulee.focusflight;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FocusMonitorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
