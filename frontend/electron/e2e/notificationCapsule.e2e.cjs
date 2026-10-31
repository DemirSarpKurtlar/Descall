'use strict';
/**
 * Electron e2e for the desktop notification capsule (3.0.0, mockup 33): real
 * notification windows from notificationWindow.cjs, real input events.
 *  - message capsule sits at the top centre of the work area, 480 DIPs wide
 *  - slides in (blur → sharp) and settles; "Mesaj" opens the chat (onClick)
 *  - × closes without opening; swipe up dismisses without opening
 *  - same chat update refreshes the text + count in place
 *  - call capsule: Kabul et / Reddet reach main; body click does nothing
 *  - stack: second capsule below the first, both centred
 *  - auto-dismiss after the duration
 *   xvfb-run -a npx electron electron/e2e/notificationCapsule.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir>. Prints "[e2e-capsule] OK" or "... FAIL <reason>".
 */
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const fail = (r) => { console.log(`[e2e-capsule] FAIL ${r}`); app.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    // The capsule text follows the UI language (3.7.21). This test checks the Turkish
    // labels, as for a user whose renderer reported "tr"; the runner's OS locale is English.
    require('../mainI18n.cjs').setLocale('tr');
    const nw = require('../notificationWindow.cjs');
    const { describeNotification, NOTIF_WIDTH, NOTIF_HEIGHT, SHADOW_PAD } = require('../notificationCard.cjs');
    const area = screen.getPrimaryDisplay().workArea;
    const events = [];
    const show = (title, body, data, extra = {}) => nw.showNotificationWindow({
      title,
      body,
      type: data.type === 'call' ? 'call' : 'default',
      duration: 60000,
      model: describeNotification({ title, body, data }),
      onClick: () => events.push(`click:${title}`),
      onAccept: () => events.push(`accept:${title}`),
      onDecline: () => events.push(`decline:${title}`),
      ...extra,
    });
    const closed = (win) => new Promise((r) => { if (win.isDestroyed()) r(); else win.once('closed', r); });
    const center = (wc, sel) => wc.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    const click = async (wc, sel) => {
      const { x, y } = await center(wc, sel);
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      await wait(40);
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    };

    // 1. Group message capsule: placement, content, entrance.
    const w1 = show('Hafta Sonu Ekibi', 'Mert: Kaleci kim olacak bu sefer? 😄', { type: 'group', from: 'Mert', fromId: 'demo-mert4', groupName: 'Hafta Sonu Ekibi', groupId: 'g1' });
    await wait(1200);
    if (w1.isDestroyed() || !w1.isVisible()) return fail('capsule not shown');
    const b1 = w1.getBounds();
    const capsuleX = b1.x + SHADOW_PAD;
    const capsuleW = b1.width - SHADOW_PAD * 2;
    if (capsuleW !== Math.min(NOTIF_WIDTH, area.width - 24)) return fail(`width ${capsuleW}`);
    if (Math.abs(capsuleX + capsuleW / 2 - (area.x + area.width / 2)) > 1) return fail(`not centred: ${JSON.stringify(b1)} in ${JSON.stringify(area)}`);
    if (b1.y + SHADOW_PAD - area.y > 16) return fail(`not at the top: y=${b1.y}`);
    const wc1 = w1.webContents;
    const dom = await wc1.executeJavaScript(`({
      name: document.querySelector('.title-text').textContent,
      ctx: document.querySelector('.ctx').textContent,
      body: document.querySelector('.body-text').textContent,
      pill: document.querySelector('.pill')?.textContent.trim(),
      badge: !!document.querySelector('.badge.group'),
      opacity: getComputedStyle(document.querySelector('.card')).opacity,
      filter: getComputedStyle(document.querySelector('.card')).filter,
      transform: getComputedStyle(document.querySelector('.card')).transform,
      radius: getComputedStyle(document.querySelector('.card')).borderRadius,
      h: document.querySelector('.card').getBoundingClientRect().height,
    })`);
    if (dom.name !== 'Mert' || dom.ctx !== 'Hafta Sonu Ekibi' || dom.body !== 'Kaleci kim olacak bu sefer? 😄') return fail(`content ${JSON.stringify(dom)}`);
    if (dom.pill !== 'Mesaj' || !dom.badge) return fail(`pill/badge ${JSON.stringify(dom)}`);
    if (dom.opacity !== '1' || dom.filter !== 'none') return fail(`entrance did not settle ${JSON.stringify(dom)}`);
    if (dom.h !== NOTIF_HEIGHT) return fail(`height ${dom.h}`);
    if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'capsule-group.png'), (await w1.capturePage()).toPNG());

    // 2. Grouped update in place.
    nw.updateShownNotification(w1, { title: 'Ece', body: 'Ben olurum!', context: 'Hafta Sonu Ekibi', count: 2 });
    await wait(300);
    const upd = await wc1.executeJavaScript(`[document.querySelector('.title-text').textContent, document.querySelector('.body-text').textContent, document.querySelector('.count').textContent].join('|')`);
    if (upd !== 'Ece|Ben olurum!|2') return fail(`update ${upd}`);

    // 3. Second capsule stacks below, also centred.
    const w2 = show('Ayşe', 'Saat 18:00 olur mu?', { type: 'dm', from: 'Ayşe', fromId: 'demo-ayse3', conversationId: 'u-a' });
    await wait(1000);
    const b2 = w2.getBounds();
    if (b2.x !== b1.x) return fail('second capsule not centred like the first');
    if (b2.y - b1.y !== NOTIF_HEIGHT + 12) return fail(`stack gap ${b2.y - b1.y}`);

    // 4. "Mesaj" opens the chat.
    await click(wc1, '.pill');
    await closed(w1);
    if (events.join(',') !== 'click:Hafta Sonu Ekibi') return fail(`after Mesaj: ${events}`);
    await wait(400);
    if (w2.getBounds().y !== b1.y) return fail('stack did not move up');

    // 5. Swipe up dismisses without opening.
    const wc2 = w2.webContents;
    const p = await center(wc2, '.text');
    wc2.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    wc2.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 6; i += 1) {
      await wait(16);
      wc2.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y - i * 7, modifiers: ['leftButtonDown'] });
    }
    wc2.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y - 42, button: 'left', clickCount: 1 });
    await Promise.race([closed(w2), wait(2000)]);
    if (!w2.isDestroyed()) return fail('swipe up did not dismiss');
    if (events.length !== 1) return fail(`swipe opened the chat: ${events}`);

    // 6. × closes without opening.
    const w3 = show('Mert çevrimiçi', '', { type: 'friend-online', username: 'Mert', userId: 'demo-mert4' });
    await wait(1000);
    const online = await w3.webContents.executeJavaScript(`[document.querySelector('.title-text').textContent, document.querySelector('.body-text').textContent, !!document.querySelector('.badge.dot')].join('|')`);
    if (online !== 'Mert çevrimiçi|Az önce bağlandı|true') return fail(`online ${online}`);
    await click(w3.webContents, '.close-btn');
    await closed(w3);
    if (events.length !== 1) return fail(`× opened the chat: ${events}`);

    // 7. Call capsule: body does nothing, Kabul et reaches main.
    const w4 = show('Ayşe', 'Sesli arama', { type: 'call', from: 'Ayşe', callerName: 'Ayşe' });
    await wait(1000);
    const wc4 = w4.webContents;
    const callDom = await wc4.executeJavaScript(`[document.querySelector('.title-text').textContent, document.querySelector('.ctx').textContent, getComputedStyle(document.querySelector('.ctx')).color, !!document.querySelector('.decline'), !!document.querySelector('.accept')].join('|')`);
    if (callDom !== 'Ayşe|arıyor...|rgb(48, 209, 88)|true|true') return fail(`call ${callDom}`);
    if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'capsule-call.png'), (await w4.capturePage()).toPNG());
    await click(wc4, '.text');
    await wait(400);
    if (w4.isDestroyed()) return fail('call body click dismissed the call');
    await click(wc4, '.accept');
    await closed(w4);
    if (events[1] !== 'accept:Ayşe') return fail(`accept ${events}`);

    // 8. Auto-dismiss after the duration (upwards).
    const w5 = show('Can', '📷 Fotoğraf', { type: 'dm', from: 'Can', conversationId: 'u-c' }, { duration: 1200 });
    await Promise.race([closed(w5), wait(5000)]);
    if (!w5.isDestroyed()) return fail('no auto-dismiss');
    if (events.length !== 2) return fail(`timeout opened the chat: ${events}`);

    console.log('[e2e-capsule] OK');
    app.exit(0);
  } catch (e) { fail(e && e.stack); }
});
