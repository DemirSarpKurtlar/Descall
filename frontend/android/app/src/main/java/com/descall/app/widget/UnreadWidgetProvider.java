package com.descall.app.widget;

/** Unread messages (draft B unread): senders' faces and message bubbles. */
public class UnreadWidgetProvider extends BaseWidgetProvider {
  @Override
  int kind() {
    return WidgetRenderer.KIND_UNREAD;
  }
}
