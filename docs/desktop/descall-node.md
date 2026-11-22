# Descall Node: bilgisayarındaki ikinci sunucu

Descall Node, Windows bilgisayarını Descall'un **ikinci tam backend düğümü** yapan küçük bir tepsi uygulamasıdır. Render (Starter, 512 MB) ana düğüm olarak her zaman açık kalır; PC açıkken yükün bir kısmını PC üstlenir. Render belleği %60'ı geçince yeni bağlantılar PC'ye, PC kendi RAM payının %85'ine gelince yeniden Render'a gider (sınırları Admin > Sunucu Ağı'ndan değiştirirsin).

- Pencere yok: saat yanındaki **DN** simgesine tıklayınca Windows 11 hızlı ayarlar gibi bir panel açılır (Taslak A, "Tepsi paneli").
- Simgenin rengi durumu söyler: **mor** aktif, **sarı** oyun modu, **gri** duraklatıldı / plan dışı, **mavi** başlatılıyor / boşaltılıyor / yeniden deneniyor, **kırmızı** hata.
- Panelde: RAM / CPU / bağlantı göstergeleri ve son saatin RAM çizgisi, RAM payı (0,5-8 GB) ve CPU (1-8 çekirdek) kaydırıcıları (kaydırırken "bu payla ~N kullanıcı" önizlemesi), oyun modu ve zaman planı anahtarları, **Duraklat / Boşalt / Admin paneli** düğmeleri, bugünkü çalışma süresi, kopma sayısı ve "bu ay ~X$ değerinde kapasite" satırı, tünel ve Key Value bağlantı noktaları, **Günlük** ve **Kurulum** bağlantıları.
- Panelde yaptığın değişiklik admin paneline, admin panelinde yaptığın panele yansır (ikisi de aynı `dc:cfg:pc` ayarını kullanır).

## Nasıl çalışır

| Parça | Ne yapar |
| --- | --- |
| `desktop/node-app` (DescallNode.exe) | Tauri 2 tepsi uygulaması. Backend'i ve tüneli başlatır, izler, düşerse 1-2-4...60 sn aralıkla yeniden dener (10 dakikada 5 çöküşte durur ve "Yeniden dene" ister). |
| `runtime\node.exe` | Paketle gelen Node.js 24 (sürümü ve SHA-256'sı `runtime.lock.json`'da sabit). `frontend/backend/server.js`'i 127.0.0.1:3210'da çalıştırır. |
| `runtime\cloudflared.exe` | Cloudflare tüneli: `https://pc.descall.com` -> `http://localhost:3210`. Jeton komut satırında değil ortam değişkeninde (`TUNNEL_TOKEN`) durur. |
| Windows Job Object | Backend'i RAM payınla (işlem + iş belleği sınırı, `--max-old-space-size` = payın %70'i), CPU çekirdek sayınla (sert CPU oranı) sınırlar, düşük öncelikte çalıştırır; uygulama kapanırsa backend ve tünel de kapanır. Pay hiçbir zaman PC RAM'inin yarısını geçmez. |
| `desktop/crates/descall-node` | Bütün kurallar (durum makinesi, sınırlar, plan, oyun algılama, kalp atışı, kapasite/tasarruf hesabı, günlük maskeleme, panel metinleri). Linux'ta da test edilir. |

Neden Windows servisi değil de oturum uygulaması: panel, DPAPI (kullanıcıya bağlı şifreleme), oyun algılama (ön plandaki pencere, GPU) ve oturum kapanışı mesajları kullanıcının oturumuna aittir; oturum 0'da çalışan bir servis bunların her biri için ikinci bir süreç ve aradaki iletişimi gerektirirdi. Uygulama Windows'a girişte kendiliğinden başlar (HKCU Run); "servisi durdur" karşılığı `DescallNode.exe --stop` komutudur (kurulum/kaldırma bunu kullanır, önce kullanıcıları aktarır).

### Kalp atışı ve ayar eşitleme
- Uygulama açılışta ve sonra 30 sn'de bir ana sunucuya `POST /api/node/register` gönderir (başlıkta `Authorization: Bearer dsk_node_...`). Cevaptaki `cfg` PC'nin ayarıdır; backend kapalıyken (duraklatma, plan, oyun) bile ayarlar böylece gelir. 401/403 = anahtar iptal edilmiş: düğüm kullanıcıları aktarıp durur ve yeni anahtar ister.
- Panelden değişen ayar yerel backend üzerinden (`PUT /api/node/local/cfg`) kümeye yazılır; backend o an kapalıysa "yalnız bu PC'de, sunucu açılınca eşitlenecek" yazar ve açılınca gönderilir.
- RAM payı değişirse kullanıcılar Render'a aktarılır ve backend yeni payla yeniden başlar (V8 yığın sınırı çalışırken değişemez); çekirdek sayısı anında uygulanır.

### Yerel kontrol uçları (`frontend/backend/routes/node.js`)
Uygulama kendi backend'iyle yalnız 127.0.0.1 üstünden ve her açılışta rastgele üretilen `DESCALL_NODE_CONTROL_TOKEN` ile (`x-descall-node-control` başlığı) konuşur. Backend jetonu sabit sürede karşılaştırır; isteğin doğrudan 127.0.0.1 / ::1'den gelmesini, `Host` değerinin 127.0.0.1 / localhost olmasını, `Origin` olmamasını ve Cloudflare / vekil başlıklarının (`CF-Connecting-IP`, `cf-ray`, `X-Forwarded-For` ...) hiç olmamasını ister; tünelden gelen istek de 127.0.0.1'den gelir ama bu başlıkları her zaman taşır, bu yüzden reddedilir:

| Uç | Gövde / cevap |
| --- | --- |
| `GET /api/node/health` | `{ ok, nodeId, role, state }` (genel sözleşmede var) |
| `GET /api/node/local/status` | `{ state, conns, remaining, p95ms, memRss (MB), memLimit, cpu, cores, gameMode, draining, cfg, kv: { ok } }` |
| `POST /api/node/local/drain` | `{ reason, timeoutMs }` -> hemen `{ ok, remaining }`; arkada durum "draining", her sokete `node:move`, sonra "paused" ve Render'a `drain-done` |
| `POST /api/node/local/state` | `{ state: active\|paused\|draining, gameMode, memoryMb }` -> `dc:nodes` kaydı buna uyar |
| `PUT /api/node/local/cfg` | kısmi `dc:cfg:pc` -> `{ cfg }` (yönetim paneliyle aynı doğrulama; acil durum anahtarı buradan değişmez) |

Bu uçlar yoksa (eski backend) uygulama yine çalışır: boşaltma yerine süreci durdurur (istemciler 2-5 sn içinde Render'a bağlanır) ve ayarları kayıt cevabından alır.

Backend'e giden ortam: `NODE_ENV=production`, `PORT=3210`, `DESCALL_NODE_ID=pc-xxxxxx`, `DESCALL_NODE_ROLE=secondary`, `DESCALL_NODE_PUBLIC_URL`, `DESCALL_NODE_PRIMARY_URL` (backend eski adı `DESCALL_PRIMARY_URL`'i de kabul eder), `DESCALL_NODE_KEY`, `DESCALL_NODE_MEMORY_MB`, `DESCALL_NODE_CORES`, `DESCALL_NODE_CONTROL_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `REDIS_URL` (varsa) ve "Ek ortam değişkenleri" satırları. Bilgisayarın kendi ortamından yalnız Windows'un temel değişkenleri geçer.

## Kurulum

1. GitHub Actions > **Descall Node** iş akışını çalıştır (veya bir PR'da otomatik çalışır); `descall-node-setup` çıktısındaki `Descall Node_1.0.0_x64-setup.exe` dosyasını indir. Kurulum yalnız senin kullanıcı hesabına yapılır, yönetici izni istemez. (Henüz imzasız: SmartScreen "Yine de çalıştır" isteyebilir.)
2. Kurulumu çalıştır. İlk açılışta saat yanında gri **DN** simgesi belirir ve panel **İlk kurulum** formuyla açılır.
3. Uygulama ilk açılışta "Windows ile başlat"ı bir kez açar; istersen kurulum formundaki anahtardan kapatırsın.

### İlk kurulum adımları

Önce iki şeyi hazırla:

**A. Cloudflare tüneli (`pc.descall.com`)**
1. Cloudflare panelinde **Zero Trust > Networks > Tunnels > Create a tunnel** > tür **Cloudflared**, ad `descall-pc`.
2. "Install and run a connector" ekranında Windows'u seç; gösterilen komuttaki uzun jetonu (`eyJ...`) kopyala. **Komutu çalıştırma**: cloudflared'i Descall Node kendisi çalıştırır.
3. **Public Hostnames > Add a public hostname**: Subdomain `pc`, Domain `descall.com`, Service **HTTP**, URL `localhost:3210`. Kaydet.
4. Aynı sayfada **Additional application settings > Connection** altında "No TLS Verify" gerekmez (yerel bağlantı HTTP). WebSocket varsayılan olarak açıktır.

**B. Düğüm anahtarı**
1. Descall'da **Admin paneli > Sunucu Ağı > Anahtar oluştur** (adım doğrulaması ister), ad örneğin `ev-pc`.
2. Gösterilen `dsk_node_...` anahtarını kopyala; bir daha gösterilmez (sunucuda yalnız SHA-256'sı saklanır).

Sonra formu doldur (her alanın altında nereden alınacağı yazar):

| Alan | Nereden |
| --- | --- |
| Render ana sunucu adresi | Render > servis > adres, örn. `https://des-call.onrender.com` |
| Bu PC'nin genel adresi | boş bırak (`https://pc.descall.com`), başka bir alan adı kullandıysan onu yaz |
| Düğüm anahtarı | B adımındaki `dsk_node_...` |
| Cloudflare tünel jetonu | A adımındaki `eyJ...` jeton |
| Supabase URL | Render > Environment > `SUPABASE_URL` |
| Supabase service role anahtarı | Render > Environment > `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API > service_role) |
| JWT gizlisi | Render > Environment > `JWT_SECRET` (birebir aynı olmalı, yoksa oturumlar PC'de geçersiz olur) |
| Key Value (Redis) dış adresi | Render > Key Value > **Connect > External** (`rediss://...`). Render'da "Access Control"a evinin IP'sini eklemen gerekir. Boş bırakırsan PC tek başına çalışır ve kümeye katılmaz; hibrit için gerekli. |
| LiveKit URL / API anahtarı / API gizlisi | Render > Environment > `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Ek ortam değişkenleri | Render > Environment > **Export** ile alınan `KEY=değer` satırları (ör. `TOTP_ENC_KEY`, `MEDIA_URL_SECRET`, web push anahtarları). `PORT`, `NODE_ENV`, `NODE_OPTIONS` ve `DESCALL_NODE_*` uygulamaya aittir, yazılsa da kullanılmaz. |

**Kaydet ve başlat**'a bas. Değerler bu bilgisayarda Windows DPAPI ile (yalnız senin Windows hesabın açabilir) ve yalnız senin erişebildiğin `%LOCALAPPDATA%\DescallNode\secure\` klasöründe şifreli saklanır. Gizli alanlar bir daha gösterilmez; formda yalnız "ayarlı" görünür ve **Değiştir** ile yenisini yazabilirsin. Kaydettikten sonra simge maviye (başlatılıyor), birkaç saniye içinde mora (aktif) döner; Admin > Sunucu Ağı'nda PC düğümü belirir.

Çalışma dosyaları (node.exe, cloudflared.exe) her açılışta paketteki `runtime-manifest.json` SHA-256 değerleriyle karşılaştırılır; tutmazsa düğüm hiç başlamaz ("Çalışma dosyaları eksik ya da doğrulanamadı").

## Günlük kullanım

- **Duraklat**: kullanıcılar Render'a aktarılır (en çok 10 sn beklenir), sonra backend ve tünel kapanır, RAM boşalır. **Devam et** ile geri açılır.
- **Boşalt**: kullanıcılar Render'a aktarılır ama süreçler açık kalır (yeni kullanıcı gelmez). **Devam et** ile hemen yeniden kullanıcı alır. Bakım ve deneme için.
- **Admin paneli**: tarayıcıda Admin > Sunucu Ağı sekmesini açar.
- **Oyun modu**: tam ekran (exclusive) oyun, listedeki bir oyun (cs2, Valorant, Fortnite, Minecraft...) ya da 30 sn boyunca %80 üstü GPU algılanınca pay oyun payına (varsayılan 1 GB) iner; pay 0 ya da "tam devir" seçiliyse herkes Render'a geçer ve düğüm duraklar. Oyun kapandıktan 60 sn sonra eski paya döner. OBS, tarayıcılar, Descall gibi uygulamalar hiç oyun sayılmaz.
- **Zaman planı**: admin panelindeki saat dilimleri (Europe/Istanbul; "18:00-02:00" gibi gece yarısını geçen dilimler desteklenir) dışında düğüm kendiliğinden duraklar, dilim başlayınca açılır. Anahtarı kapatırsan plan yok sayılır ve PC hep açık kalır.
- **Bilgisayarı kapatma / oturumu kapatma**: Windows kapanırken uygulama "Descall Node kullanıcıları Render'a aktarıyor" diyerek kapanışı en çok 10 sn bekletir, kullanıcıları aktarır, sonra kapanır.
- **Uyku**: Windows uykuda uygulamaları beklemez (yaklaşık 2 sn); aktarma başlatılır, yetişmeyen istemciler 2-5 sn içinde Render'a kendiliğinden bağlanır. Sesli görüşmeler (LiveKit) hiç kopmaz.
- **Elektrik / internet kesintisi**: istemciler 2-5 sn içinde Render'a bağlanır; uygulama tekrar açılınca düğüm kendiliğinden katılır.
- **Günlük**: paneldeki **Günlük** bağlantısı son 200 satırı gösterir, **Klasörü aç** `%LOCALAPPDATA%\DescallNode\logs\` klasörünü açar (`node.log`, 2 MB'ta döner, 5 eski dosya tutulur). Her satır yazılmadan önce maskelenir: kayıtlı gizli değerler ve gizli biçimler (`dsk_node_...`, `eyJ...` jetonlar, `sb_secret_...`, `Bearer ...`, adreslerdeki parolalar) `[gizli]` olur.

## Kaldırma

1. Admin > Sunucu Ağı'nda PC'yi **Nazikçe boşalt** (ya da paneldeki **Duraklat**).
2. Admin > Sunucu Ağı > Anahtarlar'da PC'nin anahtarını **İptal et** (sebep yaz).
3. Panelde **Kurulum > Gizlileri sil ve durdur** (iki kez basılır): bütün DPAPI kayıtları silinir, düğüm durur.
4. Windows Ayarlar > Uygulamalar'dan **Descall Node**'u kaldır (kaldırıcı önce `--stop` ile kullanıcıları aktarır, girişte başlatma kaydını siler). `%LOCALAPPDATA%\DescallNode` klasöründe günlükler kalır; istersen sil.
5. Cloudflare'de `descall-pc` tünelini ve `pc.descall.com` hostname'ini sil.

## Güvenlik notları

- **BitLocker'ı aç** (Ayarlar > Gizlilik ve güvenlik > Cihaz şifreleme / BitLocker). DPAPI kayıtları Windows hesabına bağlıdır; disk şifreli değilse ve bilgisayar çalınırsa hesap parolası kırılarak açılabilir. Windows hesabında güçlü parola veya Windows Hello kullan.
- **PC kaybolur veya çalınırsa**: hemen Admin > Sunucu Ağı'nda düğüm anahtarını iptal et (PC artık kayıt olamaz ve trafik almaz), Cloudflare'de tüneli sil, sonra sırayla Supabase service role anahtarını, `JWT_SECRET`'i (bütün oturumlar düşer), LiveKit API gizlisini ve Key Value parolasını yenile ve Render'a da yaz.
- Gizliler yalnız backend sürecinin ve cloudflared'in ortamına gider: dosyada düz metin, günlükte, panelde veya ağda başka bir yerde bulunmaz. Panel bir değeri yalnız "ayarlı" olarak görür.
- Dışarıdan yalnız Cloudflare tüneli üzerinden (`pc.descall.com`, TLS) ulaşılır; modeminde port açman gerekmez. Backend `DESCALL_NODE_ROLE=secondary` iken yalnız 127.0.0.1:3210'u dinler; Windows Güvenlik Duvarı yine de node.exe için izin sorarsa **izin verme** (tünel yerel bağlantı kullanır, gerekmez).
- Yerel kontrol uçları yalnız 127.0.0.1'den ve her açılışta değişen rastgele jetonla çalışır.
- Bu PC'de her tür veri işlenebilir (sahibin onayıyla); PC'yi başkalarıyla paylaşıyorsan Descall Node'u ayrı ve yönetici olmayan bir Windows hesabında çalıştır.
- Kurulum dosyası henüz imzasız; yalnız bu deponun GitHub Actions çıktısından indir.

## Geliştirici notları

- Testler: `cd desktop && cargo test -p descall-node` (her işletim sisteminde), `cargo check -p descall-node-app --target x86_64-pc-windows-gnu` (Windows kodunun çapraz denetimi), `python3 -m unittest discover -s node-app/tools`.
- Panel görünümü: `cargo run -p descall-node --example popover_states` gerçek görünüm modelinden örnek durumlar üretir; `ui/index.html` Tauri olmadan `window.__NODE_MOCK__` ile açılır (ekran görüntüleri bu yolla alındı).
- Çalışma paketi: `python desktop/node-app/tools/package_runtime.py` -> `desktop/target/node-runtime` (node.exe SHA-256 sabit; cloudflared GitHub sürümünün yayımlanan digest'iyle doğrulanır, değeri `runtime.lock.json`'a sabitlenmeli), sonra `npx @tauri-apps/cli@2 build --config tauri.bundle.conf.json`.
- Geliştirmede `DESCALL_NODE_RUNTIME_DIR` başka bir çalışma kökünü, `DESCALL_NODE_PORT` başka bir portu gösterir. Windows dışında gizliler yalnız bellekte tutulur ve Job Object, güç ve oyun algılama devre dışıdır.
