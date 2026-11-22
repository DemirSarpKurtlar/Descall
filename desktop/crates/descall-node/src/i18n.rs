//! Popover text (tr first, en fallback). The page gets the whole table of its language with
//! every state, so it never hard-codes a string; `{name}` placeholders are filled here or by
//! the page with [`fill`].

use serde_json::{Map, Value};

pub const LANGS: &[&str] = &["tr", "en"];

const TR: &[(&str, &str)] = &[
    ("app.title", "Descall Node"),
    ("host.line", "{host} · servis v{version}"),
    ("state.active", "Aktif"),
    ("state.game", "Oyun modu"),
    ("state.paused", "Duraklatıldı"),
    ("state.pausedSchedule", "Plan dışında"),
    ("state.pausedGame", "Oyuna devredildi"),
    ("state.pausedSuspend", "Uyku"),
    ("state.starting", "Başlatılıyor"),
    ("state.draining", "Boşaltılıyor"),
    ("state.drained", "Boşaltıldı"),
    ("state.backoff", "Yeniden deneniyor ({s} sn)"),
    ("state.error", "Hata"),
    ("state.setup", "Kurulum gerekli"),
    ("state.stopped", "Durduruldu"),
    ("error.crashing", "Sunucu 10 dakikada 5 kez durdu. Günlüğe bak, sonra yeniden dene."),
    ("error.keyRevoked", "Düğüm anahtarı iptal edildi. Admin paneli > Sunucu Ağı'ndan yeni anahtar alıp kurulumda değiştir."),
    ("error.runtime", "Çalışma dosyaları eksik ya da doğrulanamadı. Descall Node'u yeniden kur."),
    ("gauge.ram", "RAM"),
    ("gauge.cpu", "CPU"),
    ("gauge.conns", "Bağlantı"),
    ("gauge.connsSub", "{p95} ms · {mbps} Mbps"),
    ("gauge.none", "-"),
    ("slider.ram", "RAM payı"),
    ("slider.cpu", "CPU"),
    ("slider.cores", "{n} çekirdek"),
    ("slider.capacity", "bu payla ~{n} kullanıcı"),
    ("slider.applying", "uygulanıyor, kullanıcılar Render'a aktarılıp yeniden başlatılacak"),
    ("slider.local", "yalnız bu PC'de, sunucu açılınca eşitlenecek"),
    ("toggle.game", "Oyun modu"),
    ("toggle.gameHint", "oyun açılınca {share}'a düşer"),
    ("toggle.gameHandover", "oyun açılınca herkes Render'a geçer"),
    ("toggle.gameNow", "şimdi oyunda: {what}"),
    ("toggle.gameOff", "kapalı, oyunda da tam pay"),
    ("toggle.schedule", "Zaman planı"),
    ("schedule.in", "şimdi plan içinde ({range})"),
    ("schedule.out", "plan dışında · sonraki {day} {time}"),
    ("schedule.none", "plan yok, hep açık"),
    ("schedule.off", "kapalı, hep açık"),
    ("game.reason.exclusive", "tam ekran oyun"),
    ("game.reason.listed", "{exe}"),
    ("game.reason.gpu", "GPU %{pct}"),
    ("btn.pause", "Duraklat"),
    ("btn.resume", "Devam et"),
    ("btn.drain", "Boşalt"),
    ("btn.admin", "Admin paneli"),
    ("btn.retry", "Yeniden dene"),
    ("btn.setup", "Kurulumu aç"),
    ("footer.today", "Bugün {dur} çalıştı"),
    ("footer.drops", "{n} kopma"),
    ("footer.saved", "bu ay ~{usd}$ değerinde kapasite"),
    ("badge.new", "YENİ"),
    ("dur.hm", "{h} sa {m} dk"),
    ("dur.m", "{m} dk"),
    ("net.tunnel", "Tünel"),
    ("net.kv", "Key Value"),
    ("net.up", "bağlı"),
    ("net.down", "bağlanıyor"),
    ("net.off", "kapalı"),
    ("link.logs", "Günlük"),
    ("link.settings", "Kurulum"),
    ("wd.0", "Paz"),
    ("wd.1", "Pzt"),
    ("wd.2", "Sal"),
    ("wd.3", "Çar"),
    ("wd.4", "Per"),
    ("wd.5", "Cum"),
    ("wd.6", "Cmt"),
    ("setup.title", "İlk kurulum"),
    ("setup.titleEdit", "Kurulum"),
    ("setup.intro", "Her değer bu bilgisayarda Windows DPAPI ile şifrelenip saklanır. Gizli değerler kaydedildikten sonra bir daha gösterilmez; yalnızca değiştirebilirsin."),
    ("setup.group.connection", "Bağlantı"),
    ("setup.group.backend", "Sunucu gizlileri"),
    ("setup.group.livekit", "LiveKit"),
    ("setup.group.advanced", "Gelişmiş"),
    ("setup.f.primaryUrl", "Render ana sunucu adresi"),
    ("setup.h.primaryUrl", "Render > servis > adres, örn. https://des-call.onrender.com"),
    ("setup.f.publicUrl", "Bu PC'nin genel adresi"),
    ("setup.h.publicUrl", "Cloudflare tünelinin adresi, boşsa https://pc.descall.com"),
    ("setup.f.nodeKey", "Düğüm anahtarı"),
    ("setup.h.nodeKey", "Admin paneli > Sunucu Ağı > Anahtar oluştur (dsk_node_...)"),
    ("setup.f.tunnelToken", "Cloudflare tünel jetonu"),
    ("setup.h.tunnelToken", "Cloudflare Zero Trust > Networks > Tunnels > tünel > Install connector"),
    ("setup.f.supabaseUrl", "Supabase URL"),
    ("setup.h.supabaseUrl", "Render ortamındaki SUPABASE_URL"),
    ("setup.f.supabaseServiceKey", "Supabase service role anahtarı"),
    ("setup.h.supabaseServiceKey", "Render ortamındaki SUPABASE_SERVICE_ROLE_KEY"),
    ("setup.f.jwtSecret", "JWT gizlisi"),
    ("setup.h.jwtSecret", "Render ortamındaki JWT_SECRET (birebir aynı olmalı)"),
    ("setup.f.redisUrl", "Key Value (Redis) dış adresi"),
    ("setup.h.redisUrl", "Render Key Value > External URL (rediss://), boşsa tek düğüm"),
    ("setup.f.livekitUrl", "LiveKit URL"),
    ("setup.h.livekitUrl", "Render ortamındaki LIVEKIT_URL"),
    ("setup.f.livekitApiKey", "LiveKit API anahtarı"),
    ("setup.h.livekitApiKey", "Render ortamındaki LIVEKIT_API_KEY"),
    ("setup.f.livekitApiSecret", "LiveKit API gizlisi"),
    ("setup.h.livekitApiSecret", "Render ortamındaki LIVEKIT_API_SECRET"),
    ("setup.f.extraEnv", "Ek ortam değişkenleri"),
    ("setup.h.extraEnv", "Render > Environment > Export ile alınan KEY=değer satırları"),
    ("setup.set", "ayarlı"),
    ("setup.notSet", "ayarlı değil"),
    ("setup.count", "{n} değişken"),
    ("setup.required", "zorunlu"),
    ("setup.replace", "Değiştir"),
    ("setup.clear", "Temizle"),
    ("setup.save", "Kaydet ve başlat"),
    ("setup.saveEdit", "Kaydet"),
    ("setup.cancel", "Vazgeç"),
    ("setup.saved", "Kaydedildi."),
    ("setup.missing", "Eksik: {n} zorunlu alan"),
    ("setup.autostart", "Windows ile başlat"),
    ("setup.wipe", "Gizlileri sil ve durdur"),
    ("setup.wipeConfirm", "Bu PC'deki bütün Descall Node gizlileri silinir ve düğüm durur. Anahtarı admin panelinden de iptal et. Emin misin?"),
    ("setup.err.required", "Bu alan zorunlu."),
    ("setup.err.url", "Geçerli bir adres değil."),
    ("setup.err.nodeKey", "dsk_node_ ile başlayan 52 karakterlik anahtar bekleniyor."),
    ("setup.err.tunnelToken", "Cloudflare tünel jetonu gibi görünmüyor."),
    ("setup.err.supabaseKey", "service_role anahtarı (eyJ... veya sb_secret_...) bekleniyor."),
    ("setup.err.short", "Çok kısa."),
    ("setup.err.envLines", "Her satır ANAHTAR=değer biçiminde olmalı."),
    ("setup.err.tooLong", "Çok uzun."),
    ("setup.err.unknown", "Bilinmeyen alan."),
    ("setup.err.store", "Windows şifreli depoya yazılamadı."),
    ("logs.title", "Günlük"),
    ("logs.hint", "Gizli değerler yazılmadan önce maskelenir."),
    ("logs.open", "Klasörü aç"),
    ("logs.refresh", "Yenile"),
    ("logs.back", "Geri"),
    ("logs.empty", "Henüz kayıt yok."),
    ("tray.tooltip", "Descall Node: {state}"),
    ("tray.quit", "Çıkış (kullanıcıları aktararak)"),
    ("tray.open", "Paneli aç"),
];

const EN: &[(&str, &str)] = &[
    ("app.title", "Descall Node"),
    ("host.line", "{host} · service v{version}"),
    ("state.active", "Active"),
    ("state.game", "Game mode"),
    ("state.paused", "Paused"),
    ("state.pausedSchedule", "Outside schedule"),
    ("state.pausedGame", "Handed over (game)"),
    ("state.pausedSuspend", "Asleep"),
    ("state.starting", "Starting"),
    ("state.draining", "Draining"),
    ("state.drained", "Drained"),
    ("state.backoff", "Retrying ({s} s)"),
    ("state.error", "Error"),
    ("state.setup", "Setup needed"),
    ("state.stopped", "Stopped"),
    ("error.crashing", "The server stopped 5 times in 10 minutes. Check the log, then retry."),
    ("error.keyRevoked", "The node key was revoked. Create a new one in Admin panel > Server network and replace it in setup."),
    ("error.runtime", "Runtime files are missing or failed verification. Reinstall Descall Node."),
    ("gauge.ram", "RAM"),
    ("gauge.cpu", "CPU"),
    ("gauge.conns", "Connections"),
    ("gauge.connsSub", "{p95} ms · {mbps} Mbps"),
    ("gauge.none", "-"),
    ("slider.ram", "RAM share"),
    ("slider.cpu", "CPU"),
    ("slider.cores", "{n} cores"),
    ("slider.capacity", "~{n} users with this share"),
    ("slider.applying", "applying: users move to Render, then a restart"),
    ("slider.local", "this PC only, syncs when the server is up"),
    ("toggle.game", "Game mode"),
    ("toggle.gameHint", "drops to {share} when a game starts"),
    ("toggle.gameHandover", "everyone moves to Render when a game starts"),
    ("toggle.gameNow", "in game: {what}"),
    ("toggle.gameOff", "off, full share while gaming"),
    ("toggle.schedule", "Schedule"),
    ("schedule.in", "inside the schedule now ({range})"),
    ("schedule.out", "outside the schedule · next {day} {time}"),
    ("schedule.none", "no slots, always on"),
    ("schedule.off", "off, always on"),
    ("game.reason.exclusive", "full-screen game"),
    ("game.reason.listed", "{exe}"),
    ("game.reason.gpu", "GPU {pct}%"),
    ("btn.pause", "Pause"),
    ("btn.resume", "Resume"),
    ("btn.drain", "Drain"),
    ("btn.admin", "Admin panel"),
    ("btn.retry", "Retry"),
    ("btn.setup", "Open setup"),
    ("footer.today", "Ran {dur} today"),
    ("footer.drops", "{n} drops"),
    ("footer.saved", "~${usd} of capacity this month"),
    ("badge.new", "NEW"),
    ("dur.hm", "{h} h {m} min"),
    ("dur.m", "{m} min"),
    ("net.tunnel", "Tunnel"),
    ("net.kv", "Key Value"),
    ("net.up", "connected"),
    ("net.down", "connecting"),
    ("net.off", "off"),
    ("link.logs", "Log"),
    ("link.settings", "Setup"),
    ("wd.0", "Sun"),
    ("wd.1", "Mon"),
    ("wd.2", "Tue"),
    ("wd.3", "Wed"),
    ("wd.4", "Thu"),
    ("wd.5", "Fri"),
    ("wd.6", "Sat"),
    ("setup.title", "First-run setup"),
    ("setup.titleEdit", "Setup"),
    ("setup.intro", "Every value is encrypted on this PC with Windows DPAPI. Secret values are never shown again after saving; you can only replace them."),
    ("setup.group.connection", "Connection"),
    ("setup.group.backend", "Server secrets"),
    ("setup.group.livekit", "LiveKit"),
    ("setup.group.advanced", "Advanced"),
    ("setup.f.primaryUrl", "Render primary URL"),
    ("setup.h.primaryUrl", "Render > service > URL, e.g. https://des-call.onrender.com"),
    ("setup.f.publicUrl", "Public URL of this PC"),
    ("setup.h.publicUrl", "The Cloudflare tunnel hostname, empty: https://pc.descall.com"),
    ("setup.f.nodeKey", "Node key"),
    ("setup.h.nodeKey", "Admin panel > Server network > Create key (dsk_node_...)"),
    ("setup.f.tunnelToken", "Cloudflare tunnel token"),
    ("setup.h.tunnelToken", "Cloudflare Zero Trust > Networks > Tunnels > tunnel > Install connector"),
    ("setup.f.supabaseUrl", "Supabase URL"),
    ("setup.h.supabaseUrl", "SUPABASE_URL from the Render environment"),
    ("setup.f.supabaseServiceKey", "Supabase service role key"),
    ("setup.h.supabaseServiceKey", "SUPABASE_SERVICE_ROLE_KEY from the Render environment"),
    ("setup.f.jwtSecret", "JWT secret"),
    ("setup.h.jwtSecret", "JWT_SECRET from the Render environment (must be identical)"),
    ("setup.f.redisUrl", "Key Value (Redis) external URL"),
    ("setup.h.redisUrl", "Render Key Value > External URL (rediss://), empty: single node"),
    ("setup.f.livekitUrl", "LiveKit URL"),
    ("setup.h.livekitUrl", "LIVEKIT_URL from the Render environment"),
    ("setup.f.livekitApiKey", "LiveKit API key"),
    ("setup.h.livekitApiKey", "LIVEKIT_API_KEY from the Render environment"),
    ("setup.f.livekitApiSecret", "LiveKit API secret"),
    ("setup.h.livekitApiSecret", "LIVEKIT_API_SECRET from the Render environment"),
    ("setup.f.extraEnv", "Extra environment variables"),
    ("setup.h.extraEnv", "KEY=value lines from Render > Environment > Export"),
    ("setup.set", "set"),
    ("setup.notSet", "not set"),
    ("setup.count", "{n} variables"),
    ("setup.required", "required"),
    ("setup.replace", "Replace"),
    ("setup.clear", "Clear"),
    ("setup.save", "Save and start"),
    ("setup.saveEdit", "Save"),
    ("setup.cancel", "Cancel"),
    ("setup.saved", "Saved."),
    ("setup.missing", "Missing: {n} required fields"),
    ("setup.autostart", "Start with Windows"),
    ("setup.wipe", "Delete secrets and stop"),
    ("setup.wipeConfirm", "Every Descall Node secret on this PC is deleted and the node stops. Also revoke the key in the admin panel. Are you sure?"),
    ("setup.err.required", "This field is required."),
    ("setup.err.url", "Not a valid URL."),
    ("setup.err.nodeKey", "Expected a 52-character key starting with dsk_node_."),
    ("setup.err.tunnelToken", "This does not look like a Cloudflare tunnel token."),
    ("setup.err.supabaseKey", "Expected the service_role key (eyJ... or sb_secret_...)."),
    ("setup.err.short", "Too short."),
    ("setup.err.envLines", "Every line must be KEY=value."),
    ("setup.err.tooLong", "Too long."),
    ("setup.err.unknown", "Unknown field."),
    ("setup.err.store", "Could not write to the Windows encrypted store."),
    ("logs.title", "Log"),
    ("logs.hint", "Secret values are masked before they are written."),
    ("logs.open", "Open folder"),
    ("logs.refresh", "Refresh"),
    ("logs.back", "Back"),
    ("logs.empty", "Nothing logged yet."),
    ("tray.tooltip", "Descall Node: {state}"),
    ("tray.quit", "Quit (moves users first)"),
    ("tray.open", "Open panel"),
];

fn table(lang: &str) -> &'static [(&'static str, &'static str)] {
    if lang.to_ascii_lowercase().starts_with("tr") {
        TR
    } else {
        EN
    }
}

/// Language of the OS UI list: Turkish when it comes first among tr / en, else English.
pub fn pick(os_langs: &[String]) -> &'static str {
    for l in os_langs {
        let l = l.to_ascii_lowercase();
        if l.starts_with("tr") {
            return "tr";
        }
        if l.starts_with("en") {
            return "en";
        }
    }
    "tr"
}

pub fn t(lang: &str, key: &str) -> String {
    table(lang).iter().chain(EN.iter()).find(|(k, _)| *k == key).map(|(_, v)| v.to_string()).unwrap_or_else(|| key.to_string())
}

pub fn fill(template: &str, args: &[(&str, &str)]) -> String {
    let mut s = template.to_string();
    for (k, v) in args {
        s = s.replace(&format!("{{{k}}}"), v);
    }
    s
}

pub fn tf(lang: &str, key: &str, args: &[(&str, &str)]) -> String {
    fill(&t(lang, key), args)
}

/// The whole table for the page.
pub fn strings(lang: &str) -> Value {
    let mut m = Map::new();
    for (k, v) in EN.iter().chain(table(lang).iter()) {
        m.insert((*k).to_string(), Value::String((*v).to_string()));
    }
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_tables_have_the_same_keys() {
        let tr: Vec<_> = TR.iter().map(|(k, _)| *k).collect();
        let en: Vec<_> = EN.iter().map(|(k, _)| *k).collect();
        for k in &tr {
            assert!(en.contains(k), "en lacks {k}");
        }
        for k in &en {
            assert!(tr.contains(k), "tr lacks {k}");
        }
        let mut sorted = tr.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), tr.len(), "duplicate key");
    }

    #[test]
    fn every_setup_field_and_error_has_text() {
        for f in crate::secrets::FIELDS {
            assert_ne!(t("tr", &format!("setup.f.{}", f.id)), format!("setup.f.{}", f.id));
            assert_ne!(t("en", &format!("setup.h.{}", f.id)), format!("setup.h.{}", f.id));
            assert_ne!(t("tr", &format!("setup.group.{}", f.group)), format!("setup.group.{}", f.group));
        }
        for k in ["setup.err.required", "setup.err.url", "setup.err.nodeKey", "setup.err.tunnelToken", "setup.err.supabaseKey", "setup.err.short", "setup.err.envLines", "setup.err.tooLong", "setup.err.unknown"] {
            assert_ne!(t("tr", k), k);
        }
    }

    #[test]
    fn lookup_and_fill() {
        assert_eq!(t("tr-TR", "btn.drain"), "Boşalt");
        assert_eq!(t("de", "btn.drain"), "Drain");
        assert_eq!(tf("tr", "slider.cores", &[("n", "4")]), "4 çekirdek");
        assert_eq!(t("tr", "missing.key"), "missing.key");
        assert_eq!(pick(&["de-DE".into(), "en-US".into(), "tr-TR".into()]), "en");
        assert_eq!(pick(&["tr-TR".into()]), "tr");
        assert_eq!(pick(&[]), "tr");
        assert_eq!(strings("tr")["btn.pause"], "Duraklat");
        // No emoji anywhere in the UI text.
        for (_, v) in TR.iter().chain(EN.iter()) {
            assert!(v.chars().all(|c| (c as u32) < 0x2190 || c == '·'), "{v}");
        }
    }
}
