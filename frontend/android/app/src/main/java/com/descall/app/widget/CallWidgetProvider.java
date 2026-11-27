package com.descall.app.widget;

/** Live call (draft B call): who is talking, timer, mute, sound and leave. */
public class CallWidgetProvider extends BaseWidgetProvider {
  @Override
  int kind() {
    return WidgetRenderer.KIND_CALL;
  }
}
