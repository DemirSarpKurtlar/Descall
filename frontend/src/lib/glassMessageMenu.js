/** Stage 3: on Liquid Glass the message menu is an iOS long-press, not a tap. */
export const MESSAGE_MENU_LONG_PRESS_MS = 450;

export function messageMenuOpensOnTap(glass) {
  return !glass;
}
