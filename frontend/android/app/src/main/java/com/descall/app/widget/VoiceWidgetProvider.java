package com.descall.app.widget;

/** Who is in voice (draft B voice): rooms as face clusters with one tap Join. */
public class VoiceWidgetProvider extends BaseWidgetProvider {
  @Override
  int kind() {
    return WidgetRenderer.KIND_VOICE;
  }
}
