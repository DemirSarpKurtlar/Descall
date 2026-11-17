'use strict';

/**
 * App lock (Descall+): what a toast may show while the app is locked. Pure, tested by
 * premium/appLockRedact.selftest.mjs. Messages become one generic "Descall" notice (no sender,
 * preview, avatar or quick-reply field), all grouped under one tag; calls still ring, as
 * "Descall", without the caller's or the group's name.
 */

const LOCKED_TAG = 'descall-locked';

function redactLockedNotification(payload, { lockedText = '' } = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const options = payload.options && typeof payload.options === 'object' ? payload.options : {};
  const data = options.data && typeof options.data === 'object' ? options.data : {};
  const type = String(data.type || '');
  const isCall = type === 'call' || type === 'group-call';
  const next = {
    title: 'Descall',
    options: {
      tag: isCall ? options.tag : LOCKED_TAG,
      body: isCall ? '' : String(lockedText || ''),
      requireInteraction: Boolean(options.requireInteraction),
      silent: Boolean(options.silent),
      avatarUrl: null,
      data: isCall
        ? { type, callType: data.callType === 'video' ? 'video' : 'voice', callId: data.callId, groupId: data.groupId }
        : {},
    },
  };
  return next; // quickReply, style and every other decoration are dropped on purpose
}

module.exports = { LOCKED_TAG, redactLockedNotification };
