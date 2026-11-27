package com.descall.app.widget;

/** Online friends (draft B friends): favorite faces with status and activity. */
public class FriendsWidgetProvider extends BaseWidgetProvider {
  @Override
  int kind() {
    return WidgetRenderer.KIND_FRIENDS;
  }
}
