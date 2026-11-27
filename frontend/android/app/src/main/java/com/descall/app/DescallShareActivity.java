package com.descall.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;

import com.getcapacitor.BridgeActivity;

/**
 * "Paylaş > Descall" Android share target (ACTION_SEND / SEND_MULTIPLE and Direct Share,
 * AndroidManifest.xml). Hosts the web share sheet (/share, src/components/share/SharePage.jsx,
 * draft A Android layout) in its own WebView with only what the sheet needs; the send itself
 * runs in DescallShareWorker, so closing this sheet never stops it. Also opened from the share
 * notification ("Ayrıntılar") with EXTRA_JOB_ID to show that job's progress or result.
 */
public class DescallShareActivity extends BridgeActivity {
  public static final String EXTRA_JOB_ID = "com.descall.app.share.JOB_ID";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DescallSharePlugin.class);
    registerPlugin(DescallHapticsPlugin.class);
    super.onCreate(savedInstanceState);
    EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
    if (getBridge() == null) return;
    WebView web = getBridge().getWebView();
    if (web == null) return;
    web.getSettings().setTextZoom(100);
    // Replace the app's start page before any of its script runs: only the sheet boots here.
    web.loadUrl(getBridge().getLocalUrl() + "/share?variant=android");
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    // A second share while the sheet is open starts a fresh sheet for it.
    if (intent != null && intent != getIntent() && (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()))) {
      setIntent(intent);
      recreate();
    }
  }
}
