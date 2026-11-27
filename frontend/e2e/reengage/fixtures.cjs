'use strict';

/**
 * Growth 3B e2e fixtures: synthetic people and numbers shaped like the draft (Ece, Kaan,
 * Zeynep; Gece Kuşları). Nothing real. Answers for the mocked backend in reengage.e2e.cjs.
 */

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = 3600e3;
const D = 24 * H;

function fixtures(base, now = Date.now()) {
  const av = (name) => `${base}/e2e-assets/av-${name}`;
  const prefs = (extra = {}) => ({ important: false, importantAt: null, voice: 'default', messages: 'always', breakQuiet: false, nudges: true, primaryAction: 'join', mutedUntil: null, ...extra });
  const person = (n, name, extra = {}) => ({
    id: uid(n), username: name.toLowerCase().replace(/[^a-z]/g, ''), name, avatarUrl: av(name.toLowerCase()), friend: true, presence: 'offline',
    lastSeen: new Date(now - 26 * H).toISOString(), voice: null, sharedStreak: 0, thisMonth: { called: 0, joined: 0 }, friendSince: '2026-04-12T10:00:00Z', mutualServers: 1,
    prefs: prefs(), badge: 'default', ...extra,
  });
  const people = [
    person(201, 'Ece', { presence: 'online', voice: { serverId: 's-gk', serverName: 'Gece Kuşları', channelId: 'c-sohbet', channelName: 'Sohbet', withNames: ['Kaan'] }, sharedStreak: 12, thisMonth: { called: 4, joined: 3 }, mutualServers: 3, prefs: prefs({ important: true, importantAt: '2026-10-01T10:00:00Z', voice: 'always' }), badge: 'always' }),
    person(202, 'Kaan', { presence: 'idle', sharedStreak: 4, lastSeen: new Date(now - 3 * H).toISOString(), prefs: prefs({ important: true, importantAt: '2026-10-03T10:00:00Z' }), badge: 'always' }),
    person(203, 'Zeynep', { lastSeen: new Date(now - 5 * H).toISOString(), prefs: prefs({ important: true, importantAt: '2026-10-05T10:00:00Z' }), badge: 'always' }),
    person(204, 'Mert', { lastSeen: new Date(now - 2 * H).toISOString() }),
    person(205, 'Elif', { lastSeen: new Date(now - 30 * H).toISOString() }),
    person(206, 'Can', { thisMonth: { called: 9, joined: 1 }, prefs: prefs({ voice: 'off' }), badge: 'muted' }),
    person(207, 'Selin', { lastSeen: new Date(now - 3 * D).toISOString() }),
  ];
  const center = {
    ready: true,
    settings: { types: { friendVoice: true, mentions: true, unread: true, streak: true, digest: true }, quietStart: 23, quietEnd: 9, quietMessages: false, voiceDailyMax: 3, digestDay: 0, digestHour: 11 },
    importantMax: 8,
    importantCount: 3,
    people,
    servers: [
      { id: 's-gk', name: 'Gece Kuşları', iconUrl: null, level: 'all', importantHere: 3, messagesThisWeek: 640 },
      { id: 's-kk', name: 'Kodlama Kulübü', iconUrl: null, level: 'mentions', importantHere: 0, messagesThisWeek: 212 },
      { id: 's-fg', name: 'Film Gecesi', iconUrl: null, level: 'muted', importantHere: 1, messagesThisWeek: 31 },
    ],
    emailOn: true,
    bestHour: 21,
    timezone: 'Europe/Istanbul',
  };
  const tomorrow9 = new Date(now);
  tomorrow9.setUTCDate(tomorrow9.getUTCDate() + 1);
  tomorrow9.setUTCHours(6, 0, 0, 0);
  const next = { todayCount: 1, fromPeerToday: 1, earliestAt: new Date(tomorrow9.getTime() - 5 * H - 46 * 60e3).toISOString(), nextAt: tomorrow9.toISOString(), nextQuiet: true, vip: true };
  const meFace = { id: uid(1), name: 'Demir', username: 'demir', avatarUrl: av('demir') };
  const streaks = {
    ready: true,
    day: '2026-11-27',
    personal: { streak: 5, claimedToday: true, claimAmount: 0, nextBonus: 0, balance: 1240, todayReward: 60 },
    shared: [
      { peer: { id: uid(201), name: 'Ece', username: 'ece', avatarUrl: av('ece') }, count: 12, best: 12, doneToday: true, meToday: true, peerToday: true, atRisk: false, canNudge: false },
      { peer: { id: uid(202), name: 'Kaan', username: 'kaan', avatarUrl: av('kaan') }, count: 4, best: 9, doneToday: false, meToday: false, peerToday: true, atRisk: true, canNudge: false },
      { peer: { id: uid(203), name: 'Zeynep', username: 'zeynep', avatarUrl: av('zeynep') }, count: 2, best: 2, doneToday: false, meToday: true, peerToday: false, atRisk: true, canNudge: true },
    ],
    tasks: [
      { slot: 1, kind: 'message', target: { id: uid(201), name: 'Ece' }, reward: 15, progress: 1, goal: 1, done: true, doneAt: new Date(now - 2 * H).toISOString(), paid: 15, bonus: 0 },
      { slot: 2, kind: 'save_streak', target: { id: uid(202), name: 'Kaan' }, reward: 25, progress: 0, goal: 1, done: false, doneAt: null, paid: 0, bonus: 10 },
      { slot: 3, kind: 'voice', target: { id: uid(201), name: 'Ece' }, reward: 25, progress: 3, goal: 10, done: false, doneAt: null, paid: 0, bonus: 0 },
    ],
    sharedBonus: 10,
  };
  const suggestion = {
    suggestion: { id: uid(900), target: { id: uid(208), username: 'arda', name: 'Arda', avatarUrl: av('arda'), absentDays: 7 }, serverId: 's-gk', serverName: 'Gece Kuşları', voiceMinutes: 180, dmMessages: 42, reward: 50, liveInServer: 3, expiresAt: new Date(now + 2 * D).toISOString() },
  };
  const tpl = (pushTitle, pushBody, emailSubject, emailBody, approved = true) => ({ pushTitle, pushBody, emailSubject, emailBody, edited: !approved, approved });
  const langsTpl = {
    tr: tpl("{sunucu} sunucusunda {sayi} arkadaşın seste", "{arkadas_1} ve {arkadas_2} şu an konuşuyor. Katılmak tek dokunuş.", "{arkadas_1} ve {arkadas_2} bu hafta {sayi} kez buluştu", "{sunucu} sunucusunda {sayi} sesli buluşma oldu ve {bahsetme} kez senden bahsedildi."),
  };
  for (const l of ['pt-BR', 'en', 'de', 'es', 'fr']) langsTpl[l] = tpl('{arkadas_1} · {sunucu}', '{arkadas_1} · {arkadas_2}', '{arkadas_1} · {sayi}', '{sunucu} · {sayi} · {bahsetme}');
  langsTpl.ru = tpl('{arkadas_1} в {sunucu}', '{arkadas_1} и {arkadas_2} сейчас общаются.', '{arkadas_1} и {arkadas_2}: {sayi}', '{sunucu}: {sayi}, {bahsetme}', false);
  const campaigns = [
    { id: 'new_quiet', kind: 'new_quiet', order: 1, icon: 'user', channels: ['push', 'email'], status: 'live', holdoutPct: 10, audience: 118, reachable: 96, sentWeek: 74, sentToday: 22, returnRate: 23, openRate: 38, log: [] },
    { id: 'inactive7', kind: 'inactive7', order: 2, icon: 'clock', channels: ['push', 'email'], status: 'live', holdoutPct: 10, audience: 186, reachable: 141, sentWeek: 318, sentToday: 64, returnRate: 17, openRate: 31, log: [] },
    { id: 'friend_call', kind: 'friend_call', order: 3, icon: 'bell', channels: ['push'], status: 'auto', holdoutPct: 0, audience: 21, reachable: 21, sentWeek: 21, sentToday: 4, returnRate: 43, openRate: 61, log: [] },
    { id: 'inactive14', kind: 'inactive14', order: 4, icon: 'moon', channels: ['email'], status: 'draft', holdoutPct: 10, audience: 241, reachable: 198, sentWeek: 0, sentToday: 0, returnRate: null, openRate: null, log: [] },
    { id: 'weekly_digest', kind: 'weekly_digest', order: 5, icon: 'mail', channels: ['email'], status: 'live', holdoutPct: 10, audience: 512, reachable: 470, sentWeek: 470, sentToday: 0, returnRate: 12, openRate: 44, log: [] },
    { id: 'streak_reminder', kind: 'streak_reminder', order: 6, icon: 'flame', channels: ['push'], status: 'live', holdoutPct: 0, audience: 63, reachable: 63, sentWeek: 210, sentToday: 63, returnRate: 51, openRate: 57, log: [] },
  ];
  const mode = { mode: 'live', sending: 'live', envMode: 'live', ceiling: 'live', capped: false, override: 'live', paused: false };
  const overview = { ready: true, mode, console: { modeOverride: 'live', paused: false, callReward: 50, gift14Amount: 150, taskRewards: true }, today: { sent: 412, returned: 61, net: 9 }, campaigns };
  const hours = [2, 1, 1, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 6, 5, 6, 8, 10, 12, 15, 24, 31, 27, 9];
  const waveId = uid(700);
  const workspace = {
    campaign: { ...campaigns[1], templates: langsTpl, log: [{ at: new Date(now - 26 * H).toISOString(), by: 'demir', action: 'approve', detail: 'pt-BR' }] },
    mode,
    stats: { audience: 186, reachable: 141, reachableNow: 119, sentWeek: 318, return48: 17, control: 8, net: 9, sourceCall: 38 },
    excluded: { noDevice: 26, weekly: 10, unsubscribed: 9, quiet: 22 },
    languages: [
      { lang: 'tr', approved: true, edited: false, share: 74, sent: 236, openRate: 41 },
      { lang: 'pt-BR', approved: true, edited: false, share: 9, sent: 29, openRate: 36 },
      { lang: 'en', approved: true, edited: false, share: 8, sent: 25, openRate: 33 },
      { lang: 'de', approved: true, edited: false, share: 4, sent: 13, openRate: 29 },
      { lang: 'es', approved: true, edited: false, share: 2, sent: 6, openRate: 30 },
      { lang: 'fr', approved: true, edited: false, share: 2, sent: 0, openRate: null },
      { lang: 'ru', approved: false, edited: true, share: 1, sent: 9, openRate: 4 },
    ],
    bestHours: hours,
    quiet: { start: 23, end: 9 },
    results: { funnel: { sent: 318, failed: 3, delivered: 301, opened: 98, openedApp: 61, acted: 37, recalled: 0 }, lift: { rate: 17, control: 8, net: 9, n: 318, controlN: 35 }, outcomes: { d7Return48h: { target: 18 }, firstMessageRate: { returners: 61, wrote: 29, rate: 47.5 } } },
    waves: [{ id: waveId, campaign_id: 'inactive7', label: '21:00', status: 'done', audience: 64, sent: 64, started_at: new Date(now - 40 * 60e3).toISOString(), dry_run: false }],
    log: [{ at: new Date(now - 26 * H).toISOString(), by: 'demir', action: 'approve', detail: 'pt-BR' }],
  };
  const preview = {
    lang: 'tr',
    sample: { id: uid(209), name: 'Demir', avatarUrl: null, absentDays: 8, device: 'iPhone', timezone: 'Europe/Istanbul', bestHour: 21 },
    push: { title: "Gece Kuşları sunucusunda 3 arkadaşın seste", body: 'Ece, Kaan ve Zeynep şu an Sohbet kanalında. Katılmak tek dokunuş.', faces: [{ name: 'Ece' }, { name: 'Kaan' }] },
    email: { subject: 'Ece ve Kaan bu hafta 9 kez buluştu', body: 'Gece Kuşları sunucusunda 9 sesli buluşma oldu ve 2 kez senden bahsedildi.' },
    fallback: false,
    vars: {},
  };
  const live = {
    wave: { id: waveId, campaign_id: 'inactive7', label: '21:00', status: 'done', audience: 64, sent: 64, undo_until: null, dry_run: false },
    counters: { sent: 64, failed: 0, delivered: 61, opened: 19, openedApp: 11, acted: 6, recalled: 0 },
    unopened: 42,
    opened: 19,
    holdout: 7,
    returners: [
      { userId: uid(205), name: 'Elif', avatarUrl: null, kind: 'voice', at: new Date(now - 60e3).toISOString() },
      { userId: uid(206), name: 'Can', avatarUrl: null, kind: 'message', at: new Date(now - 4 * 60e3).toISOString() },
      { userId: uid(210), name: 'Arda', avatarUrl: null, kind: 'opened_app', at: new Date(now - 6 * 60e3).toISOString() },
    ],
    canUndo: false,
  };
  const friendCall = {
    ready: true, shown: 57, called: 21, returned: 9, rewarded: 9, rate: 43, systemRate: 15, descoin: 900, reward: 50,
    rules: { callerPerWeek: 1, targetPerMonth: 2, callerMinAccountDays: 30, minActiveMinutes: 10 },
    log: [
      { id: 'l1', at: new Date(now - 54 * 60e3).toISOString(), status: 'rewarded', caller: { name: 'Kaan' }, target: { name: 'Arda' }, amount: 50, activeMinutes: 12, denyReason: null },
      { id: 'l2', at: new Date(now - 76 * 60e3).toISOString(), status: 'denied', caller: { name: 'Can' }, target: { name: 'Elif' }, amount: 0, activeMinutes: 14, denyReason: 'same_device' },
    ],
    decisions: [{ at: new Date(now - 2 * D).toISOString(), by: 'demir', reason: 'önce 2 hafta veri', action: 'reward' }],
  };
  const outcomes = { ready: true, mode, d7Return48h: { all: { n: 339, returned: 61, rate: 18 }, friendCall: { n: 21, returned: 9, rate: 43 }, system: { n: 318, returned: 52, rate: 16.4 }, control: { n: 35, returned: 3, rate: 8.6 }, target: 18 }, firstMessageRate: { returners: 61, wrote: 29, rate: 47.5 } };
  return { center, next, streaks, suggestion, overview, workspace, preview, live, friendCall, outcomes, meFace, waveId };
}

module.exports = { fixtures, uid };
