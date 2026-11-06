'use strict';

/**
 * Screenshots of the Descall+ hotkey / audio / notification settings panels.
 * Needs the Vite dev server for premium-audio-harness.html:
 *   npx vite --port 5199 --host 127.0.0.1 &
 *   xvfb-run -a npx electron electron/e2e/premiumAudioShots.e2e.cjs --no-sandbox
 * Env: DESCALL_SHOTS_DIR (default ../.shots/premium/audio), HARNESS_URL, SHOT_LANG.
 * Prints "[e2e-premium-shots] OK <n>" and exits 0.
 */

const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const base = process.env.HARNESS_URL || 'http://127.0.0.1:5199/premium-audio-harness.html';
const outDir = process.env.DESCALL_SHOTS_DIR || path.join(__dirname, '..', '..', '..', '.shots', 'premium', 'audio');
const lang = process.env.SHOT_LANG || 'en';
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'descall-pa-shots-')));
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const PANELS = ['global_mute', 'global_ptt', 'custom_hotkeys', 'media_keys', 'quick_launcher', 'per_user_volume_hotkeys', 'mic_presets', 'noise_gate', 'mic_monitor', 'voice_activity_monitor', 'auto_device_switch', 'audio_routing', 'audio_device_profiles', 'stream_audio_control', 'notification_history', 'focus_mode', 'notification_profiles', 'smart_game_notifications', 'quick_reply'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
    const win = new BrowserWindow({ width: 820, height: 900, show: true, backgroundColor: '#0d0f17', webPreferences: { contextIsolation: true } });
    let n = 0;
    for (const panel of PANELS) {
      await win.loadURL(`${base}?panel=${panel}&lang=${lang}&desktop=1`);
      await sleep(panel === 'noise_gate' ? 1800 : 900);
      if (panel === 'noise_gate') {
        // Start the mic test so the level meter moves (fake device: a tone).
        await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Test microphone|Mikrofonu dene/.test(x.textContent)); b && b.click(); return true; })()`);
        await sleep(1500);
      }
      const h = await win.webContents.executeJavaScript('Math.min(2400, document.documentElement.scrollHeight)');
      win.setContentSize(820, Math.max(400, h));
      await sleep(250);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `settings-${panel}${lang === 'en' ? '' : `-${lang}`}.png`), img.toPNG());
      n += 1;
    }
    console.log(`[e2e-premium-shots] OK ${n} -> ${outDir}`);
    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    console.error('[e2e-premium-shots] FAIL', err && err.stack ? err.stack : err);
    app.exit(1);
  }
});
