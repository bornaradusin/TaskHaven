package io.github.bornaradusin.taskhaven;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the app's own plugin: updates from GitHub (UpdaterPlugin)
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
