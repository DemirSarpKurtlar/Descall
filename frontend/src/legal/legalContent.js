/**
 * Full text of the Terms of Service and Privacy Policy, in Turkish and
 * English. Rendered by LegalContentModal (registration flow) and by the
 * marketing site's /terms and /privacy pages — this file is the single
 * source of truth so both surfaces always show the exact same text.
 *
 * Structure: { tr: { title, updated, intro, sections: [{ heading, paragraphs: [...] }] }, en: {...} }
 */

const LAST_UPDATED = "10 Ekim 2026";
const LAST_UPDATED_EN = "October 10, 2026";
// Privacy Policy revised separately (2.9.141: calls are never recorded, full list of
// third-party services incl. PostHog, GIPHY, LiveKit; AI assistant removed).
const PRIVACY_LAST_UPDATED = "10 Ekim 2026";
const PRIVACY_LAST_UPDATED_EN = "October 10, 2026";

export const TERMS_CONTENT = {
  tr: {
    title: "Hizmet Şartları",
    updated: `Son güncelleme: ${LAST_UPDATED}`,
    intro:
      "Bu Hizmet Şartları (\"Şartlar\"), Descall isimli sesli, görüntülü ve mesajlaşma platformunun (web, masaüstü ve mobil uygulamalar dahil, \"Descall\", \"Hizmet\", \"biz\" veya \"bizim\") kullanımını düzenler. Descall'a bir hesap oluşturarak, giriş yaparak veya Hizmet'i herhangi bir şekilde kullanarak bu Şartları okuduğunuzu, anladığınızı ve bunlara bağlı kalmayı kabul ettiğinizi beyan edersiniz. Bu Şartları kabul etmiyorsanız, lütfen Hizmet'i kullanmayın ve hesap oluşturmayın.",
    sections: [
      {
        heading: "1. Kabul ve Ehliyet",
        paragraphs: [
          "Descall'ı kullanabilmek için en az 13 yaşında olmanız gerekir. 13-18 yaş arasındaysanız, Descall'ı yalnızca bir ebeveyn veya yasal vasinizin izniyle ve gözetiminde kullanabilirsiniz; hesap oluşturarak bu iznin size verildiğini beyan edersiniz.",
          "Bu Şartları kabul ederek, (a) bu Şartlarla bağlı kalma hukuki ehliyetine sahip olduğunuzu, (b) verdiğiniz tüm bilgilerin doğru ve güncel olduğunu ve (c) Hizmet'i yürürlükteki tüm yasa ve yönetmeliklere uygun şekilde kullanacağınızı beyan ve taahhüt edersiniz.",
          "Descall, herhangi bir kullanıcının bu yaş ve ehliyet şartlarını karşılamadığına dair makul bir şüphe duyduğunda, ilgili hesabı herhangi bir bildirim yapma zorunluluğu olmadan askıya alma veya kapatma hakkını saklı tutar.",
          "Hesap sahibinin 13 yaşından küçük olduğunu öğrenirsek hesabı kapatır ve silme işlemini başlatırız. 16 yaşından küçük hesaplar, çerezleri kabul etseler bile analitik veya reklam ölçümüne dahil edilmez.",
        ],
      },
      {
        heading: "2. Hizmetin Tanımı",
        paragraphs: [
          "Descall; birebir (DM) ve grup metin sohbeti, sesli ve görüntülü arama, ekran paylaşımı, dosya/medya paylaşımı, arkadaşlık ve topluluk (grup) yönetimi, mesaj sabitleme, kullanıcı engelleme, iki faktörlü kimlik doğrulama (2FA) ve e-posta doğrulama, push bildirimleri ve profil kişiselleştirme (banner, avatar çerçevesi, profil arkaplanı, tema, rozet, unvan, isim efekti, avatar efekti ve sohbet balonu gibi kozmetik öğeler) dahil olmak üzere çeşitli iletişim ve topluluk özellikleri sunan bir platformdur.",
          "Hizmet, bağlantı kalitenize göre ses/görüntü akış hızını ve çözünürlüğünü otomatik olarak ayarlayan uyarlanabilir bit hızı teknolojisi kullanır; bu, gerçek zamanlı ağ koşullarına bağlı olarak arama kalitesinin değişebileceği anlamına gelir ve Descall belirli bir kalite seviyesini garanti etmez.",
          "Descall, önceden bildirimde bulunmaksızın veya bulunarak, herhangi bir özelliği ekleme, değiştirme, askıya alma veya kaldırma hakkını saklı tutar. Hizmet'in belirli özellikleri belirli platformlarda (web, masaüstü, Android/iOS) farklılık gösterebilir.",
        ],
      },
      {
        heading: "3. Hesap Oluşturma ve Güvenlik",
        paragraphs: [
          "Hesap oluştururken doğru ve size ait bir kullanıcı adı seçmeli, güçlü bir parola belirlemeli ve (varsa) geçerli bir e-posta adresi sağlamalısınız. Hesabınızla ilişkili tüm etkinliklerden siz sorumlusunuz; parolanızı ve doğrulama kodlarınızı üçüncü kişilerle paylaşmamalısınız.",
          "Descall, hesap güvenliğini artırmak amacıyla e-posta ile gönderilen doğrulama kodları üzerinden iki faktörlü kimlik doğrulama (2FA) ve e-posta doğrulama özellikleri sunar. Bu özellikleri etkinleştirmeniz önerilir; hesabınızın yetkisiz erişime uğradığından şüphelenirseniz derhal bize bildirmelisiniz.",
          "Google hesabınız üzerinden oturum açmayı seçerseniz, Google'ın kendi kullanım şartları ve gizlilik politikası da geçerli olur; Descall, Google'dan yalnızca kimlik doğrulama için gerekli temel profil bilgilerini (ad, e-posta, profil fotoğrafı) alır.",
          "Bir hesabın birden fazla kişi tarafından paylaşılması, satılması veya devredilmesi yasaktır. Her hesap yalnızca onu oluşturan gerçek kişi tarafından kullanılmalıdır.",
        ],
      },
      {
        heading: "4. Kabul Edilebilir Kullanım",
        paragraphs: [
          "Descall'ı kullanırken aşağıdakileri yapmamayı kabul edersiniz: (a) diğer kullanıcıları taciz etmek, tehdit etmek, zorbalık yapmak veya kasıtlı olarak sıkıntı vermek; (b) yasa dışı, müstehcen, nefret söylemi içeren, şiddeti körükleyen veya küçükleri istismar eden içerik paylaşmak; (c) spam, kimlik avı, dolandırıcılık veya yanıltıcı içerik yaymak; (d) Hizmet'in altyapısına, sunucularına veya ağlarına yetkisiz erişim sağlamaya çalışmak; (e) tersine mühendislik, bot, otomasyon aracı veya benzeri yöntemlerle Hizmet'i manipüle etmek; (f) başka bir kullanıcının kimliğine bürünmek veya sahte hesap oluşturmak; (g) DesCoin kazanma sistemini otomatik betikler, çoklu hesaplar (multi-accounting), boş/etkin olmayan aramalarda bekleme veya benzeri hilelerle istismar etmeye çalışmak.",
          "Grup sohbetlerinde ve sesli/görüntülü aramalarda, diğer katılımcıların rahatsız olabileceği içerik (yüksek sesli gürültü, uygunsuz görüntüler, rahatsız edici ekran paylaşımı vb.) paylaşmaktan kaçınmalısınız. Grup yöneticileri, kendi topluluklarında ek kurallar belirleyebilir ve bu kurallara uymayan üyeleri çıkarabilir.",
          "Descall, bu kuralları ihlal ettiğine karar verdiği içerikleri kaldırma, ilgili hesapları uyarma, askıya alma veya kalıcı olarak kapatma hakkını, herhangi bir tazminat yükümlülüğü olmaksızın saklı tutar. Ciddi ihlaller yetkili makamlara bildirilebilir.",
        ],
      },
      {
        heading: "5. Sesli/Görüntülü Aramalar, Ekran Paylaşımı ve İçerik",
        paragraphs: [
          "Sesli ve görüntülü aramalar ile ekran paylaşımı, katılımcılar arasında gerçek zamanlı olarak doğrudan veya yalnızca iletimi sağlayan medya aktarma sunucuları (TURN / LiveKit) üzerinden iletilir. Descall aramaları kaydetmez: aramaların ses, görüntü veya ekran içeriği hiçbir zaman kaydedilmez veya saklanmaz. Bir katılımcının aramayı kendi cihazında kayıt etmesi, o katılımcının sorumluluğundadır ve Descall bu tür kayıtlar üzerinde herhangi bir kontrol veya sorumluluk kabul etmez.",
          "Bir görüşmeye veya ekran paylaşımına katılarak, diğer katılımcıların (yasal sınırlar dahilinde) görüşmeyi kaydedebileceğini kabul edersiniz; bu nedenle paylaştığınız içeriğin (ekran görüntüsü dahil) hassas veya gizli bilgi içermediğinden emin olmalısınız.",
          "Gönderdiğiniz mesajlar, medya dosyaları ve profil içerikleri (avatar, banner vb.) için tüm hak ve sorumluluk size aittir; bu içerikleri paylaşarak, Hizmet'i sağlamak amacıyla (depolama, iletim, önizleme oluşturma gibi) gerekli ölçüde işlenmesine izin verirsiniz.",
          "Descall, telif hakkı ihlali, yasa dışı içerik veya bu Şartların ihlali bildirimlerini değerlendirir ve gerekli görüldüğünde ilgili içeriği kaldırabilir. Tekrarlayan ihlallerde bulunan hesaplar kapatılabilir.",
        ],
      },
      {
        heading: "6. DesCoin Sanal Para Birimi",
        paragraphs: [
          "DesCoin, yalnızca Descall içinde kullanılabilen, gerçek para karşılığı satın alınamayan ve nakde çevrilemeyen sanal bir uygulama içi para birimidir. DesCoin'in hiçbir gerçek dünya parasal değeri yoktur ve herhangi bir yasal para birimi, menkul kıymet veya kripto varlık olarak değerlendirilemez.",
          "DesCoin, sesli sohbette aktif olarak bulunma, mesajlaşma ve ekran paylaşımı gibi platform içi etkinliklere katılarak, sunucu tarafında doğrulanan ve saatlik/günlük üst limitlere tabi kurallarla kazanılır. Kazanım kuralları, kötüye kullanımı (bot, çoklu hesap, otomasyon, boş/etkin olmayan oturumlarda bekleme vb.) önlemek amacıyla tasarlanmıştır ve önceden bildirimde bulunmadan değiştirilebilir.",
          "Descall, hile, manipülasyon veya sistemin amaçlanan kullanımına aykırı davranış tespit ettiği takdirde, ilgili hesabın DesCoin bakiyesini geri alma (revoke), sıfırlama veya hesabı askıya alma hakkını saklı tutar.",
          "DesCoin bakiyeniz, hesabınıza özeldir, başka bir kullanıcıya devredilemez veya satılamaz (Descall'ın kendi hediye/bağış mekanizmaları dışında) ve hesabınızın kapatılması durumunda herhangi bir tazminat veya iade hakkı doğurmaz.",
          "Descall yönetimi, destek, telafi veya promosyon amacıyla takdirine bağlı olarak kullanıcılara DesCoin verebilir veya geri alabilir; bu işlemler denetim amacıyla kayıt altına alınır.",
        ],
      },
      {
        heading: "7. Mağaza ve Dijital Kozmetik Ürünler",
        paragraphs: [
          "Descall Mağazası; banner, avatar çerçevesi, profil arkaplanı, uygulama teması, profil rozeti, profil unvanı, isim efekti, avatar efekti ve sohbet balonu teması gibi kozmetik dijital ürünler sunar. Bu ürünler yalnızca görsel kişiselleştirme amaçlıdır ve Hizmet'in temel işlevselliğini etkilemez.",
          "Mağazadaki tüm ürünler DesCoin ile satın alınır; gerçek para ile doğrudan satın alma imkânı bulunmamaktadır. Satın alınan bir dijital ürün, yalnızca ilgili hesapta kullanılabilecek sınırlı, devredilemez bir kullanım hakkı sağlar; ürün üzerinde herhangi bir mülkiyet hakkı doğmaz.",
          "Descall, katalogdaki ürünleri, fiyatları ve kategorileri herhangi bir zamanda değiştirme, kaldırma veya yeni ürünler ekleme hakkını saklı tutar. Satın alınmış bir ürünün ileride kullanımdan kaldırılması (deprecate) durumunda harcanan DesCoin'in iadesi garanti edilmez.",
          "Bir yönetici, bir kullanıcıya mesaj eşliğinde hediye olarak dijital ürün veya DesCoin gönderebilir; bu hediyeler, alıcı çevrimiçiyse anında, çevrimdışıysa bir sonraki bağlantısında bildirim olarak gösterilir.",
        ],
      },
      {
        heading: "8. Arkadaşlık, Engelleme ve Moderasyon",
        paragraphs: [
          "Descall, kullanıcıların birbirlerine arkadaşlık isteği göndermesine, kabul etmesine veya reddetmesine imkân tanır. Karşılıklı arkadaşlık, doğrudan mesajlaşma (DM) özelliklerinin bir kısmı için gerekli olabilir.",
          "Bir kullanıcıyı engellediğinizde, o kullanıcı sizinle doğrudan mesajlaşamaz, sesli/görüntülü arama başlatamaz ve size arkadaşlık isteği gönderemez; engelleme işlemi karşı tarafa bildirilmez. Engellemeyi istediğiniz zaman kaldırabilirsiniz.",
          "Grup yöneticileri ve platform yöneticileri (adminler), topluluk kurallarının uygulanması amacıyla üyeleri gruptan çıkarma, mesajları silme veya belirli özelliklere erişimi kısıtlama yetkisine sahiptir. Bu yetkiler kötüye kullanılamaz; kötüye kullanıldığına dair bildirimler Descall tarafından incelenir.",
        ],
      },
      {
        heading: "9. Bildirimler, E-posta ve Push Bildirimleri",
        paragraphs: [
          "Hesap doğrulama, güvenlik uyarıları, arkadaşlık istekleri ve önemli hizmet güncellemeleri gibi işlemsel iletişimler için e-posta ve/veya push bildirimleri (tarayıcı, masaüstü ve mobil) kullanabiliriz. Bu türden işlemsel bildirimler, hesabınızın normal işleyişinin bir parçasıdır ve tamamen kapatılamayabilir.",
          "Cihaz ayarlarınızdan veya uygulama içi bildirim tercihlerinizden isteğe bağlı bildirim türlerini (yeni mesaj, arama, aktivite bildirimleri vb.) açıp kapatabilirsiniz.",
        ],
      },
      {
        heading: "10. Üçüncü Taraf Servisler",
        paragraphs: [
          "Descall, Hizmet'i işletebilmek için güvenilir üçüncü taraf sağlayıcılardan yararlanır: veritabanı ve dosya depolama için Supabase, işlemsel e-posta gönderimi için Resend, mobil push bildirimleri için Firebase Cloud Messaging ve Apple Push Notification service (APNs), sunucu barındırma için Render, web sitesi barındırma için Vercel, sesli kanallarda medya iletimi için LiveKit, ürün analitiği için PostHog, hata raporları için Sentry ve GIF arama için GIPHY. Sağlayıcıların tam listesi ve işledikleri veriler Gizlilik Politikası'nda yer alır.",
          "Google ile giriş veya Apple ile giriş özelliğini kullanmayı seçerseniz, Google'ın veya Apple'ın kendi hizmet şartları da geçerli olur. Descall, bu üçüncü taraf servislerin kendi hizmet kesintilerinden veya politika değişikliklerinden sorumlu tutulamaz.",
        ],
      },
      {
        heading: "11. Fikri Mülkiyet Hakları",
        paragraphs: [
          "Descall markası, logosu, arayüz tasarımı, yazılım kodu ve mağazadaki tüm görsel/kozmetik varlıklar (bannerlar, çerçeveler, temalar, rozet ikonları, efektler dahil) Descall'ın veya lisans verenlerinin münhasır mülkiyetindedir ve telif hakkı, marka ve ilgili fikri mülkiyet yasalarıyla korunmaktadır.",
          "Bu Şartlar size Hizmet'i kişisel, ticari olmayan amaçlarla kullanmanız için sınırlı, münhasır olmayan ve devredilemez bir lisans verir. Descall'ın yazılı izni olmadan Hizmet'in herhangi bir bölümünü kopyalayamaz, değiştiremez, dağıtamaz veya türev çalışma oluşturamazsınız.",
          "Kendi oluşturduğunuz içerik (mesajlar, profil bilgileri, yüklediğiniz medya) üzerindeki haklarınızı saklı tutarsınız; ancak bu içeriği Descall'a, Hizmet'i sağlamak amacıyla gerekli ölçüde (depolama, iletim, önizleme oluşturma) kullanma hakkı vermiş olursunuz.",
          "Telif hakkınızın ihlal edildiğini düşünüyorsanız contact@descall.com adresine bildirim gönderin. Bildirimde şunlar yer almalıdır: (1) korunan eserin tanımı, (2) Descall üzerindeki içeriğin adresi veya bulunmasını sağlayacak ayrıntı, (3) adınız ve iletişim e-postanız, (4) kullanımın yetkisiz olduğuna dair iyi niyetli inancınızı belirten beyan, (5) bildirimin doğru olduğunu ve hak sahibi ya da yetkili olduğunuzu belirten beyan, (6) fiziksel veya elektronik imzanız. İncelememizden sonra ihlal ettiğini gördüğümüz içeriği kaldırır veya erişimi kapatırız. İçeriği paylaşan kişi aynı adrese karşı bildirim gönderebilir; karşı bildirimde iletişim bilgileri, kaldırılan içeriğin tanımı, içeriğin yanlışlıkla kaldırıldığına dair iyi niyetli inanç beyanı ve yaşadığı yerin mahkemelerinin yetkisini kabul ettiğine dair beyan bulunur. Telif hakkını tekrar tekrar ihlal eden hesaplar kapatılabilir. Bir mesajı veya kullanıcıyı uygulama içindeki mesaj menüsünden de bildirebilirsiniz.",
        ],
      },
      {
        heading: "12. Hesabın Askıya Alınması ve Feshi",
        paragraphs: [
          "Bu Şartları, topluluk kurallarını veya yürürlükteki yasaları ihlal ettiğinizi tespit etmemiz durumunda, hesabınızı önceden bildirimde bulunmaksızın askıya alma veya kalıcı olarak kapatma hakkını saklı tutarız. Ciddiyet derecesine göre önce bir uyarı verilebilir, ancak bu her durumda garanti edilmez.",
          "Hesabınızı istediğiniz zaman ayarlar menüsünden veya bizimle iletişime geçerek kapatabilirsiniz. Hesap kapatıldığında, DesCoin bakiyesi, satın alınan dijital ürünler ve mesaj geçmişi dahil ilgili veriler, yürürlükteki veri saklama politikamıza uygun şekilde silinir veya anonimleştirilir; bu işlemler geri alınamaz ve herhangi bir tazminat hakkı doğurmaz.",
          "Bu bölümde yer alan hükümler, mahiyeti itibarıyla fesihten sonra da geçerliliğini sürdüren hükümlerle (fikri mülkiyet, sorumluluğun sınırlandırılması, tazminat, uyuşmazlık çözümü) birlikte geçerliliğini korur.",
        ],
      },
      {
        heading: "13. Garantilerin Sınırlandırılması",
        paragraphs: [
          "Hizmet, \"olduğu gibi\" (\"as-is\") ve \"mevcut olduğu şekliyle\" (\"as-available\") esasına göre, açık veya zımni hiçbir garanti verilmeksizin sunulmaktadır; buna, belirli bir amaca uygunluk, ticarete uygunluk, kesintisizlik ve hatasızlık garantileri dahildir ancak bunlarla sınırlı değildir.",
          "Descall, Hizmet'in kesintisiz, hatasız, güvenli veya tüm cihaz/tarayıcı kombinasyonlarıyla uyumlu olacağını garanti etmez. Ağ koşulları, bakım çalışmaları veya beklenmeyen teknik sorunlar nedeniyle geçici kesintiler yaşanabilir.",
        ],
      },
      {
        heading: "14. Sorumluluğun Sınırlandırılması",
        paragraphs: [
          "Yürürlükteki yasaların izin verdiği azami ölçüde, Descall ve yöneticileri, çalışanları veya iş ortakları; Hizmet'in kullanımından veya kullanılamamasından kaynaklanan dolaylı, arızi, özel, cezai veya sonuç niteliğindeki zararlardan (veri kaybı, kâr kaybı, itibar kaybı, DesCoin bakiyesi veya dijital ürün kaybı dahil) sorumlu tutulamaz.",
          "Descall'ın bu Şartlar kapsamındaki toplam sorumluluğu, herhangi bir durumda, ilgili olayın gerçekleştiği tarihten önceki on iki (12) ay içinde (varsa) Hizmet için ödediğiniz toplam ücreti aşamaz; Descall'ın çoğu özelliği ücretsiz olduğundan, bu tutar genellikle sıfırdır.",
        ],
      },
      {
        heading: "15. Tazminat",
        paragraphs: [
          "Bu Şartları veya yürürlükteki herhangi bir yasayı ihlal etmenizden veya Hizmet'i uygunsuz şekilde kullanmanızdan kaynaklanan her türlü iddia, zarar, kayıp ve makul yasal masraflara karşı Descall'ı, yöneticilerini ve çalışanlarını tazmin etmeyi ve zarardan ari tutmayı kabul edersiniz.",
        ],
      },
      {
        heading: "16. Uyuşmazlıkların Çözümü ve Uygulanacak Hukuk",
        paragraphs: [
          "Bu Şartlardan kaynaklanan herhangi bir anlaşmazlık durumunda, öncelikle İletişim sayfamız üzerinden bizimle iletişime geçerek meseleyi dostane bir şekilde çözmeye çalışmanızı rica ederiz; çoğu sorun bu şekilde hızlıca çözülebilmektedir.",
          "Bu Şartlar, Descall'ın faaliyet gösterdiği ülkenin yürürlükteki kanunlarına göre yorumlanır ve uygulanır; kanunlar ihtilafına ilişkin hükümler bu uygulamayı etkilemez. Dostane çözüm sağlanamaması durumunda, uyuşmazlık yetkili mahkemeler önünde çözülür.",
        ],
      },
      {
        heading: "17. Şartlarda Değişiklik",
        paragraphs: [
          "Bu Şartları zaman zaman güncelleyebiliriz. Önemli değişiklikler yapıldığında, Hizmet içinde bir bildirim gösterilerek veya (hesabınıza kayıtlı bir e-posta varsa) e-posta yoluyla bilgilendirilirsiniz. Güncellenmiş Şartların yayınlanmasından sonra Hizmet'i kullanmaya devam etmeniz, değişiklikleri kabul ettiğiniz anlamına gelir.",
          "Bu sayfanın en üstünde yer alan \"son güncelleme\" tarihi, en son yapılan değişikliğin tarihini gösterir; önceki sürümler talep üzerine sağlanabilir.",
        ],
      },
      {
        heading: "18. Çeşitli Hükümler ve İletişim",
        paragraphs: [
          "Bu Şartların herhangi bir hükmünün geçersiz veya uygulanamaz sayılması, kalan hükümlerin geçerliliğini etkilemez. Descall'ın bu Şartlar kapsamındaki herhangi bir hakkını kullanmamış olması, o haktan feragat ettiği anlamına gelmez.",
          "Bu Şartlar, Gizlilik Politikamızla birlikte, Descall ile aranızdaki ilişkiye dair anlaşmanın tamamını oluşturur ve önceki tüm sözlü veya yazılı anlaşmaların yerine geçer.",
          "Bu Şartlarla ilgili sorularınız için İletişim sayfamız üzerinden bizimle iletişime geçebilirsiniz.",
        ],
      },
    ],
  },
  en: {
    title: "Terms of Service",
    updated: `Last updated: ${LAST_UPDATED_EN}`,
    intro:
      "These Terms of Service (the \"Terms\") govern your use of Descall, our voice, video, and messaging platform, including our web, desktop, and mobile applications (\"Descall\", the \"Service\", \"we\", or \"us\"). By creating an account, signing in, or using the Service in any way, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree to these Terms, please do not use the Service or create an account.",
    sections: [
      {
        heading: "1. Acceptance and Eligibility",
        paragraphs: [
          "You must be at least 13 years old to use Descall. If you are between 13 and 18, you may only use Descall with the permission and supervision of a parent or legal guardian; by creating an account, you represent that such permission has been granted.",
          "By accepting these Terms, you represent and warrant that (a) you have the legal capacity to be bound by these Terms, (b) all information you provide is accurate and current, and (c) you will use the Service in compliance with all applicable laws and regulations.",
          "Descall reserves the right to suspend or close any account it reasonably suspects does not meet these age or capacity requirements, without prior notice.",
          "If we learn that an account holder is under 13, we close the account and start deletion. Accounts under 16 are not included in analytics or advertising measurement, even if they accept cookies.",
        ],
      },
      {
        heading: "2. Description of the Service",
        paragraphs: [
          "Descall is a platform offering a range of communication and community features, including one-to-one (DM) and group text chat, voice and video calling, screen sharing, file/media sharing, friend and community (group) management, message pinning, user blocking, two-factor authentication (2FA) and email verification, push notifications, and profile customization (cosmetic items such as banners, avatar frames, profile backgrounds, themes, badges, titles, name effects, avatar effects, and chat bubble skins).",
          "The Service uses adaptive bitrate technology that automatically adjusts audio/video streaming quality and resolution based on your connection quality; call quality may therefore vary depending on real-time network conditions, and Descall does not guarantee any specific quality level.",
          "Descall reserves the right to add, modify, suspend, or remove any feature, with or without prior notice. Certain features may vary across platforms (web, desktop, Android/iOS).",
        ],
      },
      {
        heading: "3. Account Creation and Security",
        paragraphs: [
          "When creating an account, you must choose an accurate username that belongs to you, set a strong password, and (if applicable) provide a valid email address. You are responsible for all activity associated with your account and must not share your password or verification codes with any third party.",
          "Descall offers two-factor authentication (2FA) and email verification via email-delivered codes to help secure your account. We recommend enabling these features; if you suspect unauthorized access to your account, you must notify us immediately.",
          "If you choose to sign in with Google, Google's own terms of service and privacy policy also apply. Descall only receives the basic profile information (name, email, profile photo) necessary for authentication.",
          "Sharing, selling, or transferring an account between multiple people is prohibited. Each account must be used only by the individual who created it.",
        ],
      },
      {
        heading: "4. Acceptable Use",
        paragraphs: [
          "When using Descall, you agree not to: (a) harass, threaten, bully, or intentionally distress other users; (b) share illegal, obscene, hateful, violence-inciting content, or content that exploits minors; (c) spread spam, phishing, fraud, or misleading content; (d) attempt unauthorized access to the Service's infrastructure, servers, or networks; (e) reverse-engineer, use bots, automation tools, or similar methods to manipulate the Service; (f) impersonate another user or create fake accounts; (g) attempt to exploit the DesCoin earning system via automated scripts, multi-accounting, idle/inactive call sessions, or similar cheating methods.",
          "In group chats and voice/video calls, you should avoid sharing content that other participants may find disturbing (loud noise, inappropriate imagery, disruptive screen sharing, etc.). Group administrators may set additional rules within their own communities and may remove members who violate them.",
          "Descall reserves the right to remove content it determines violates these rules, and to warn, suspend, or permanently close related accounts, without any liability for compensation. Serious violations may be reported to relevant authorities.",
        ],
      },
      {
        heading: "5. Voice/Video Calls, Screen Sharing, and Content",
        paragraphs: [
          "Voice and video calls and screen sharing are transmitted in real time between participants, either directly or through media relay servers (TURN / LiveKit) that only route them. Descall does not record calls: the audio, video, and screen content of calls is never recorded or stored. If a participant records a call on their own device, that is solely their responsibility, and Descall accepts no control or liability over such recordings.",
          "By joining a call or screen share, you acknowledge that other participants may (within legal limits) record the session; you should therefore ensure that anything you share (including on-screen content) does not contain sensitive or confidential information.",
          "You retain full responsibility for the messages, media files, and profile content (avatar, banner, etc.) you send; by sharing such content, you grant Descall the rights necessary to process it (storage, transmission, generating previews) solely to provide the Service.",
          "Descall reviews reports of copyright infringement, illegal content, or violations of these Terms and may remove relevant content when appropriate. Accounts with repeated violations may be closed.",
        ],
      },
      {
        heading: "6. The DesCoin Virtual Currency",
        paragraphs: [
          "DesCoin is a virtual in-app currency usable only within Descall; it cannot be purchased with real money and cannot be cashed out. DesCoin has no real-world monetary value and does not constitute legal tender, a security, or a crypto asset of any kind.",
          "DesCoin is earned through server-verified participation in in-platform activities such as active presence in voice chat, messaging, and screen sharing, subject to hourly/daily caps. Earning rules are designed to prevent abuse (bots, multi-accounting, automation, idling in inactive sessions, etc.) and may change without prior notice.",
          "Descall reserves the right to revoke, reset, or reduce a DesCoin balance, or suspend an account, if it detects cheating, manipulation, or behavior contrary to the system's intended use.",
          "Your DesCoin balance is specific to your account, cannot be transferred or sold to another user (outside of Descall's own gifting mechanisms), and does not give rise to any compensation or refund right if your account is closed.",
          "Descall staff may, at their discretion, grant or revoke DesCoin for support, compensation, or promotional purposes; such actions are logged for audit purposes.",
        ],
      },
      {
        heading: "7. The Shop and Digital Cosmetic Items",
        paragraphs: [
          "The Descall Shop offers digital cosmetic products such as banners, avatar frames, profile backgrounds, app themes, profile badges, profile titles, name effects, avatar effects, and chat bubble skins. These items are purely visual customizations and do not affect the Service's core functionality.",
          "All shop items are purchased with DesCoin; there is no way to purchase items directly with real money. A purchased digital item grants only a limited, non-transferable right to use it on the associated account; no ownership right over the item is created.",
          "Descall reserves the right to change, remove, or add items, prices, and categories to the catalog at any time. If a purchased item is later deprecated, refund of the DesCoin spent is not guaranteed.",
          "An administrator may send a digital item or DesCoin as a gift to a user, along with a message; such gifts are shown immediately if the recipient is online, or delivered as a notification the next time they connect if offline.",
        ],
      },
      {
        heading: "8. Friends, Blocking, and Moderation",
        paragraphs: [
          "Descall allows users to send, accept, or decline friend requests. Mutual friendship may be required for certain direct messaging (DM) features.",
          "When you block a user, they can no longer message you directly, start voice/video calls with you, or send you friend requests; the block action is not disclosed to the other party. You may unblock a user at any time.",
          "Group administrators and platform staff (admins) have the authority to remove members, delete messages, or restrict access to certain features in order to enforce community rules. This authority may not be abused; reports of abuse are reviewed by Descall.",
        ],
      },
      {
        heading: "9. Notifications, Email, and Push Notifications",
        paragraphs: [
          "We may use email and/or push notifications (browser, desktop, and mobile) for transactional communications such as account verification, security alerts, friend requests, and important service updates. Such transactional notifications are part of the normal operation of your account and may not be fully disabled.",
          "You can enable or disable optional notification types (new message, call, activity notifications, etc.) from your device settings or in-app notification preferences.",
        ],
      },
      {
        heading: "10. Third-Party Services",
        paragraphs: [
          "Descall relies on trusted third-party providers to operate the Service: Supabase for database and file storage, Resend for transactional email delivery, Firebase Cloud Messaging and Apple Push Notification service (APNs) for mobile push notifications, Render for server hosting, Vercel for website hosting, LiveKit for media routing in voice channels, PostHog for product analytics, Sentry for error reports, and GIPHY for GIF search. The full list of providers and the data they process is in the Privacy Policy.",
          "If you choose to use Google Sign-In or Sign in with Apple, Google's or Apple's own terms of service also apply. Descall cannot be held responsible for outages or policy changes on the part of these third-party services.",
        ],
      },
      {
        heading: "11. Intellectual Property Rights",
        paragraphs: [
          "The Descall brand, logo, interface design, software code, and all visual/cosmetic assets in the shop (including banners, frames, themes, badge icons, and effects) are the exclusive property of Descall or its licensors and are protected by copyright, trademark, and related intellectual property laws.",
          "These Terms grant you a limited, non-exclusive, non-transferable license to use the Service for personal, non-commercial purposes. You may not copy, modify, distribute, or create derivative works from any part of the Service without Descall's written permission.",
          "You retain your rights to content you create (messages, profile information, uploaded media); however, by sharing such content you grant Descall the rights necessary to use it solely to the extent required to provide the Service (storage, transmission, generating previews).",
          "If you believe content on Descall infringes your copyright, email a notice to contact@descall.com. Include: (1) a description of the copyrighted work, (2) the URL or enough detail to find the material on Descall, (3) your name and contact email, (4) a statement that you have a good-faith belief the use is not authorized, (5) a statement that the notice is accurate and that you are the owner or authorized to act, and (6) your physical or electronic signature. We review notices and remove or disable access to material we find infringing. The person who posted the material may send a counter-notice to the same address with their contact details, identification of the removed material, a statement that they have a good-faith belief it was removed by mistake, and their consent to the jurisdiction of the courts where they live. Accounts that repeatedly infringe copyright may be terminated. You can also report a message or a user from the in-app message menu.",
        ],
      },
      {
        heading: "12. Account Suspension and Termination",
        paragraphs: [
          "We reserve the right to suspend or permanently close your account without prior notice if we determine that you have violated these Terms, community rules, or applicable law. Depending on the severity, a warning may be issued first, but this is not guaranteed in every case.",
          "You may close your account at any time from the settings menu or by contacting us. Upon account closure, related data — including your DesCoin balance, purchased digital items, and message history — is deleted or anonymized in accordance with our applicable data retention policy; this action is irreversible and does not give rise to any right of compensation.",
          "The provisions of this section survive termination alongside other provisions that by their nature should survive (intellectual property, limitation of liability, indemnification, dispute resolution).",
        ],
      },
      {
        heading: "13. Disclaimer of Warranties",
        paragraphs: [
          "The Service is provided on an \"as-is\" and \"as-available\" basis, without warranties of any kind, whether express or implied, including but not limited to warranties of fitness for a particular purpose, merchantability, uninterrupted operation, or error-free performance.",
          "Descall does not guarantee that the Service will be uninterrupted, error-free, secure, or compatible with every device/browser combination. Temporary outages may occur due to network conditions, maintenance work, or unexpected technical issues.",
        ],
      },
      {
        heading: "14. Limitation of Liability",
        paragraphs: [
          "To the maximum extent permitted by applicable law, Descall and its officers, employees, or business partners shall not be liable for any indirect, incidental, special, punitive, or consequential damages (including loss of data, profits, goodwill, or loss of DesCoin balance or digital items) arising from your use of or inability to use the Service.",
          "Descall's total liability under these Terms shall in no event exceed the total amount you have paid for the Service (if any) in the twelve (12) months preceding the event giving rise to the claim; since most of Descall's features are free, this amount is typically zero.",
        ],
      },
      {
        heading: "15. Indemnification",
        paragraphs: [
          "You agree to indemnify and hold harmless Descall, its officers, and employees from and against any claims, damages, losses, and reasonable legal expenses arising from your violation of these Terms or applicable law, or your improper use of the Service.",
        ],
      },
      {
        heading: "16. Dispute Resolution and Governing Law",
        paragraphs: [
          "In the event of any dispute arising from these Terms, we kindly ask that you first contact us through our Contact page to try to resolve the matter amicably; most issues can be resolved quickly this way.",
          "These Terms shall be interpreted and applied in accordance with the laws applicable in the country where Descall operates, without regard to conflict-of-law provisions. If an amicable resolution cannot be reached, the dispute shall be resolved before the competent courts.",
        ],
      },
      {
        heading: "17. Changes to These Terms",
        paragraphs: [
          "We may update these Terms from time to time. When material changes are made, you will be notified through an in-Service notice or, if your account has a registered email, by email. Continuing to use the Service after updated Terms are published constitutes your acceptance of the changes.",
          "The \"last updated\" date at the top of this page reflects the date of the most recent change; earlier versions can be provided upon request.",
        ],
      },
      {
        heading: "18. General Provisions and Contact",
        paragraphs: [
          "If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect. Descall's failure to exercise any right under these Terms shall not be deemed a waiver of that right.",
          "These Terms, together with our Privacy Policy, constitute the entire agreement between you and Descall regarding your relationship with the Service and supersede any prior oral or written agreements.",
          "If you have any questions about these Terms, please contact us via our Contact page.",
        ],
      },
    ],
  },
};

export const PRIVACY_CONTENT = {
  tr: {
    title: "Gizlilik Politikası",
    updated: `Son güncelleme: ${PRIVACY_LAST_UPDATED}`,
    intro:
      "Bu Gizlilik Politikası, Descall'ı (\"biz\", \"bizim\") kullanırken hangi bilgileri topladığımızı, bu bilgileri nasıl kullandığımızı, kimlerle paylaştığımızı ve verileriniz üzerindeki haklarınızı açıklar. Descall'a bir hesap oluşturarak veya Hizmet'i kullanarak, bu politikada açıklanan uygulamaları kabul etmiş olursunuz.",
    sections: [
      {
        heading: "Veri sorumlusu",
        paragraphs: [
          "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve, uygulanabildiği ölçüde, Avrupa Birliği Genel Veri Koruma Tüzüğü (GDPR) kapsamında veri sorumlusu Demir Sarp Kurtlar'dır. İletişim: contact@descall.com.",
        ],
      },
      {
        heading: "1. Topladığımız Bilgiler",
        paragraphs: [
          "Hesap bilgileri: Kullanıcı adınız, parolanızın güvenli (bcrypt ile) karma (hash) hâli, isteğe bağlı e-posta adresiniz, profil fotoğrafınız ve seçtiğiniz görünen ad gibi hesap oluştururken veya profilinizi düzenlerken sağladığınız bilgiler.",
          "İletişim içeriği: Gönderdiğiniz doğrudan mesajlar (DM) ve grup mesajları, paylaştığınız medya/dosyalar, mesaj sabitlemeleri ve tepkiler (emoji reaksiyonları). Bu içerikler, ilgili sohbetin katılımcılarına gösterilmek üzere işlenir ve saklanır.",
          "Görüşme meta verileri: Sesli/görüntülü arama süresi, katılımcı sayısı, bağlantı kalitesi göstergeleri (uyarlanabilir bit hızı için) ve ekran paylaşımı oturum bilgileri. Aramalar kaydedilmez: görüşmenin ses, görüntü veya ekran içeriği hiçbir zaman kaydedilmez veya saklanmaz.",
          "Etkinlik ve DesCoin verileri: DesCoin kazanım sisteminin hile içermeyecek şekilde çalışmasını sağlamak için, sesli sohbette bulunma süreniz, mesaj gönderme sıklığınız ve ekran paylaşımı etkinliğiniz gibi sunucu tarafında doğrulanan etkinlik verileri ile DesCoin bakiyeniz ve işlem geçmişiniz (ledger).",
          "Teknik ve cihaz bilgileri: IP adresi, tarayıcı/işletim sistemi türü, cihaz kimliği, uygulama sürümü, oturum belirteçleri (session token) ve push bildirimleri için cihaz kayıt bilgileri (FCM/Web Push belirteçleri; iOS uygulamasında Apple Push Notification service (APNs) cihaz belirteçleri: mesaj bildirimleri için bildirim belirteci ve gelen aramalar için VoIP belirteci). iOS cihaz belirteçleri ve bildirim dili yalnızca bildirimleri ve gelen aramaları o cihaza iletmek için kullanılır; çıkış yaptığınızda, bildirimleri kapattığınızda veya Apple belirtecin geçersiz olduğunu bildirdiğinde silinir.",
          "Ödeme veya finansal bilgi toplamıyoruz: Descall'da gerçek para ile ödeme alınmaz; tüm mağaza satın alımları DesCoin ile yapılır, bu nedenle kredi kartı veya benzeri finansal bilgi toplanmaz veya saklanmaz.",
          "Kullanım analitiği: Uygulamanın nasıl kullanıldığını anlamak için PostHog ile uygulama içi olayları (örneğin kayıt, giriş, açılan sayfalar ve özellik kullanımı) ve beklenmeyen hata olaylarını toplarız. Giriş yaptığınızda bu olaylar hesap kimliğiniz, kullanıcı adınız ve (varsa) e-posta adresinizle ilişkilendirilir. Oturum kaydı (ekran/oturum tekrarı) kapalıdır; ekranınız veya yazdıklarınız kaydedilmez. PostHog analitiği reklam profili oluşturmak için kullanılmaz ve satılmaz. Web sitesinde ve masaüstü uygulamasında, onayınızdan sonra Google Ads dönüşüm etiketi yalnızca reklamlardan gelen kayıtları ölçer. Bu etiket iOS uygulamasında yüklenmez. Onaydan önce hiçbir reklam veya analitik etiketi yüklenmez. 16 yaşından küçük hesaplarda, onay verseniz bile analitik ve reklam ölçümü kapalıdır.",
          "Yerel depolama ve çerezler: Oturumunuzu sürdürmek, dil ve tema tercihlerinizi hatırlamak ve PostHog analitiği için tarayıcınızın yerel depolama alanını (localStorage) ve birinci taraf çerezleri kullanırız. iOS uygulamasında reklam veya izleme (tracking) araçları kullanılmaz. Yalnızca web sitesinde ve masaüstü uygulamasında, onayınızdan sonra reklamlardan gelen kayıtları ölçmek için Google Ads dönüşüm etiketi (gtag) yüklenebilir ve çerez kullanabilir.",
        ],
      },
      {
        heading: "2. Bilgileri Nasıl Kullanıyoruz",
        paragraphs: [
          "Hizmet'i sağlamak: Mesajlaşma, sesli/görüntülü arama, ekran paylaşımı, arkadaşlık, grup yönetimi ve profil kişiselleştirme özelliklerini çalıştırmak için.",
          "Hesap güvenliği: Kimlik doğrulama, 2FA ve e-posta doğrulama kodlarının gönderilmesi, şüpheli oturum tespiti ve yetkisiz erişimin önlenmesi için.",
          "Hile önleme ve bütünlük: DesCoin kazanım sisteminin adil çalışmasını sağlamak, bot/otomasyon kullanımını, çoklu hesapları ve manipülasyonu tespit etmek için etkinlik verilerini analiz ederiz.",
          "İletişim: Doğrulama kodları, güvenlik uyarıları, arkadaşlık istekleri ve önemli hizmet güncellemeleri gibi işlemsel bildirimleri e-posta veya push bildirimi olarak göndermek için.",
          "İyileştirme: Hizmet'in performansını, güvenilirliğini ve kullanıcı deneyimini analiz etmek ve geliştirmek için (örneğin bağlantı kalitesi teşhisleri, hata günlükleri).",
          "Kişisel verilerinizi hiçbir şekilde üçüncü taraflara satmıyoruz. Bölüm 4'te açıklanan web sitesi kayıt dönüşümü ölçümü dışında reklam amacıyla paylaşmıyoruz.",
        ],
      },
      {
        heading: "3. İşlemenin Hukuki Dayanağı",
        paragraphs: [
          "Verilerinizi işlerken şu hukuki dayanaklara güveniriz: (a) hizmet sözleşmesinin ifası için gereklilik (mesajlaşma, arama gibi temel özellikler), (b) hesap güvenliğinin sağlanması ve hile/kötüye kullanımın önlenmesi gibi meşru menfaatlerimiz, (c) hesap oluştururken ve isteğe bağlı özellikleri (örneğin push bildirimleri, Google ile giriş, analitik ve reklam ölçümü, ürün güncellemeleri listesi) etkinleştirirken verdiğiniz açık onay ve (d) yasal yükümlülüklere uyum. Analitik ve reklam çerezleri yalnızca onayınızla işlenir; onayı ayarlardaki Gizlilik bölümünden geri alabilirsiniz.",
        ],
      },
      {
        heading: "4. Bilgilerin Paylaşılması ve Hizmet Sağlayıcılar",
        paragraphs: [
          "Verilerinizi, Hizmet'i işletmemize yardımcı olan ve bizim talimatlarımız doğrultusunda hareket eden güvenilir hizmet sağlayıcılarla (veri işleyicileriyle) paylaşırız: veritabanı, dosya depolama ve kimlik doğrulama için Supabase; işlemsel e-posta gönderimi için Resend; mobil push bildirimleri için Firebase Cloud Messaging (Google); iOS uygulamasında bildirimlerin ve gelen aramaların iletilmesi için Apple Push Notification service (APNs, Apple); sunucu barındırma için Render; web sitesinin barındırılması ve çerez kullanmayan toplu ziyaret istatistikleri (yalnızca web sitesi) için Vercel; sunucu sesli kanallarında ses/görüntü akışlarının iletilmesi için LiveKit ve aramaların bağlantısı için TURN aktarma sunucuları (akışlar yalnızca iletilir, kaydedilmez); ve ürün analitiği için PostHog (AB veri bölgesi). Bu sağlayıcılarla yalnızca Hizmet'i sağlamak için gerekli veriler paylaşılır.",
          "Kullanmayı seçtiğiniz özelliklere bağlı üçüncü taraflar: GIF aradığınızda arama metniniz ve IP adresiniz doğrudan GIPHY'ye (GIPHY, Inc.) gönderilir; Google ile giriş yaptığınızda Google'dan, Apple ile giriş yaptığınızda Apple'dan yalnızca kimlik doğrulama için gereken bilgiler alınır; bir Valorant hesabı bağlarsanız Riot ID'niz, oyun istatistiklerini getirmek için Riot Games ve HenrikDev API ile paylaşılır. Yalnızca web sitesinde ve masaüstü uygulamasında, onayınızdan sonra reklam kampanyalarından gelen kayıtları ölçmek için Google Ads dönüşüm etiketi (Google) kullanılır; bu etiket iOS uygulamasında yüklenmez ve onaydan önce yüklenmez.",
          "Çökme ve hata raporları: Uygulama, web sitesi, masaüstü uygulaması veya sunucularımız bir hatayla karşılaştığında, hata izleme sağlayıcımız Sentry'ye (Functional Software, Inc.) teknik bir rapor gönderilir. Rapor; hata mesajını, yığın izini (stack trace), hatanın oluştuğu sayfa veya API adresini ve cihaz, işletim sistemi, tarayıcı ve uygulama sürümü bilgilerini içerir. Raporlar adınızı, e-posta adresinizi, mesaj içeriklerinizi veya IP adresinizi içermeyecek şekilde yapılandırılmıştır; oturum anahtarları (token) rapordan çıkarılır. Bu raporlar Sentry'nin Avrupa Birliği (AB) veri bölgesinde saklanır ve yalnızca hataları bulup düzeltmek için kullanılır.",
          "Gönderdiğiniz mesajlar ve medya, yalnızca seçtiğiniz alıcılara (DM karşı tarafı veya grup üyeleri) gösterilir; Descall çalışanları, yalnızca güvenlik soruşturmaları, kullanıcı şikayetlerinin incelenmesi veya yasal yükümlülüklerin yerine getirilmesi için gerekli olduğunda içeriğe erişebilir.",
          "Yasal bir zorunluluk (mahkeme kararı, yasal talep) olması, haklarımızı korumamız gerekmesi veya kullanıcıların güvenliğini sağlamamız gerektiği durumlar hariç, kişisel verilerinizi kolluk kuvvetleri veya diğer üçüncü taraflarla paylaşmayız.",
        ],
      },
      {
        heading: "5. Çerezler ve Yerel Depolama",
        paragraphs: [
          "iOS uygulamasında reklam veya izleme çerezleri ya da araçları kullanılmaz. Web sitesinde ve masaüstü uygulamasında tek reklam aracı, onayınızdan sonra reklamlardan gelen kayıtları ölçen Google Ads dönüşüm etiketidir (bölüm 4). PostHog analitiği birinci taraf çerez ve yerel depolama kullanır. Oturum belirtecinizi, dil tercihinizi, tema ayarlarınızı ve benzeri kullanıcı arayüzü tercihlerini saklamak için tarayıcınızın yerel depolama alanını (localStorage) kullanırız. Bu bilgileri tarayıcı ayarlarınızdan istediğiniz zaman temizleyebilirsiniz; ancak bu, oturumunuzun sonlanmasına neden olabilir.",
        ],
      },
      {
        heading: "6. Veri Güvenliği",
        paragraphs: [
          "Parolalarınız, tersine çevrilemeyen bcrypt algoritmasıyla karma (hash) hâlinde saklanır; parolanızın düz metin hâlini hiçbir zaman görüntülemeyiz veya saklamayız.",
          "Hesabınızı ek olarak korumak için iki faktörlü kimlik doğrulama (2FA) ve e-posta doğrulama özellikleri sunuyoruz. Ayrıca oturum yönetimi ile şüpheli veya eski oturumları tek tek sonlandırabilirsiniz.",
          "Verileriniz, sektör standardı şifreleme (aktarım sırasında TLS/HTTPS) kullanılarak korunan altyapı sağlayıcıları üzerinde barındırılır. Hiçbir sistem %100 güvenli olamaz; bir güvenlik ihlali şüphesi durumunda derhal harekete geçer ve gerektiğinde etkilenen kullanıcıları bilgilendiririz.",
        ],
      },
      {
        heading: "7. Veri Saklama Süresi",
        paragraphs: [
          "Verilerinizi, hesabınız aktif olduğu sürece ve Hizmet'i sağlamak için gerekli olduğu ölçüde saklarız. Hesabınızı kapattığınızda silme talebi kaydedilir; 14 günlük süre sonunda mesaj geçmişi, DesCoin bakiyesi ve mağaza envanteri dahil kişisel verileriniz, yasal saklama yükümlülüklerimiz dışında silinir veya anonimleştirilir. Analitik verileri, onayı geri çekene kadar tutulur. Ürün güncellemeleri listesindeki e-posta, abonelikten çıkana kadar tutulur.",
          "Güvenlik günlükleri ve hile tespiti amacıyla tutulan etkinlik kayıtları, kötüye kullanımın araştırılması amacıyla sınırlı bir süre daha saklanabilir.",
        ],
      },
      {
        heading: "8. Çocukların Gizliliği",
        paragraphs: [
          "Descall, 13 yaşın altındaki çocuklardan bilerek kişisel veri toplamaz. Hesap sahibinin 13 yaşından küçük olduğunu öğrenirsek hesabı kullanıma kapatır ve silme işlemini başlatırız (14 günlük silme süresi). 16 yaşından küçük hesaplarda analitik ve reklam ölçümü, onay verilse bile açılmaz. Bir ebeveyn veya vasi olarak, 13 yaşın altındaki bir çocuğun bize kişisel veri sağladığını düşünüyorsanız, contact@descall.com adresinden bize yazın.",
        ],
      },
      {
        heading: "9. Kullanıcı Hakları",
        paragraphs: [
          "KVKK madde 11 kapsamında: kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, düzeltme ve silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve zarara uğramanız hâlinde tazminat talep etme haklarına sahipsiniz.",
          "GDPR'nin uygulandığı durumlarda ayrıca erişim, düzeltme, silme, işlemenin kısıtlanması, veri taşınabilirliği, itiraz ve onayı geri çekme haklarınız vardır. Bu hakların çoğunu uygulama içindeki profil ve ayarlar menülerinden kullanabilirsiniz (profili düzenleme, hesabı silme, Gizlilik bölümünden analitik tercihini değiştirme).",
          "Talepleriniz için contact@descall.com adresine yazın; makul bir süre içinde değerlendiririz. KVKK kapsamındaki şikayetlerinizi Kişisel Verileri Koruma Kurulu'na, GDPR kapsamındaki şikayetlerinizi ise ikamet ettiğiniz AB üyesi ülkenin denetim otoritesine iletebilirsiniz.",
        ],
      },
      {
        heading: "10. Uluslararası Veri Transferi",
        paragraphs: [
          "Hizmet sağlayıcılarımız (Supabase, Resend, Firebase, Apple, Render, Vercel, LiveKit, PostHog, Sentry, GIPHY, Google Ads), verilerinizi kayıtlı olduğunuz ülkeden farklı ülkelerde bulunan sunucularda işleyebilir. PostHog ve Sentry Avrupa Birliği bölgesinde tutulur. Aktarımda standart sözleşme maddeleri veya yeterlilik kararı gibi güvenceler kullanılır.",
        ],
      },
      {
        heading: "11. Pazarlama İletişimleri",
        paragraphs: [
          "Descall, izniniz olmadan size pazarlama e-postaları göndermez. Hesap e-postaları doğrulama, 2FA kodları, güvenlik uyarıları ve hesap kapatma gibi işlemsel iletilerle sınırlıdır. Hediye veya DesCoin için pazarlama e-postası göndermeyiz. İsteğe bağlı ürün güncellemeleri listesi çifte onaylıdır; her e-postada abonelikten çıkma bağlantısı bulunur.",
        ],
      },
      {
        heading: "12. Bu Politikada Değişiklikler",
        paragraphs: [
          "Bu Gizlilik Politikasını zaman zaman güncelleyebiliriz. Önemli değişiklikler yapıldığında, Hizmet içinde bir bildirim gösterilerek veya (varsa) kayıtlı e-posta adresiniz üzerinden bilgilendirilirsiniz. Güncellenmiş politikanın yayınlanmasından sonra Hizmet'i kullanmaya devam etmeniz, güncellemeleri kabul ettiğiniz anlamına gelir.",
        ],
      },
      {
        heading: "13. Bize Ulaşın",
        paragraphs: [
          "Bu Gizlilik Politikası veya kişisel verilerinizin işlenmesiyle ilgili sorularınız için veri sorumlusu Demir Sarp Kurtlar'a contact@descall.com adresinden yazabilirsiniz. KVKK kapsamındaki şikayetler için Kişisel Verileri Koruma Kurulu'na, GDPR kapsamındaki şikayetler için ikamet ettiğiniz AB ülkesinin denetim otoritesine başvurabilirsiniz.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: `Last updated: ${PRIVACY_LAST_UPDATED_EN}`,
    intro:
      "This Privacy Policy explains what information we collect when you use Descall (\"we\", \"us\"), how we use it, who we share it with, and what rights you have over your data. By creating an account or using the Service, you agree to the practices described in this policy.",
    sections: [
      {
        heading: "Data controller",
        paragraphs: [
          "For the Turkish Personal Data Protection Law (KVKK, Law No. 6698) and, where it applies, the EU General Data Protection Regulation (GDPR), the data controller is Demir Sarp Kurtlar. Contact: contact@descall.com.",
        ],
      },
      {
        heading: "1. Information We Collect",
        paragraphs: [
          "Account information: Your username, a securely hashed (bcrypt) form of your password, your optional email address, your profile photo, and any display name you choose when creating your account or editing your profile.",
          "Communication content: The direct messages (DMs) and group messages you send, media/files you share, message pins, and reactions (emoji). This content is processed and stored so it can be shown to the participants of the relevant conversation.",
          "Call metadata: Voice/video call duration, participant count, connection quality indicators (for adaptive bitrate), and screen-share session information. Calls are not recorded: the audio, video, and screen content of a call is never recorded or stored.",
          "Activity and DesCoin data: To ensure the DesCoin earning system operates fairly and without cheating, we collect server-verified activity data such as your time spent actively present in voice chat, your messaging frequency, and your screen-sharing activity, along with your DesCoin balance and transaction history (ledger).",
          "Technical and device information: IP address, browser/operating system type, device identifier, app version, session tokens, and device registration information for push notifications (FCM/Web Push tokens; in the iOS app, Apple Push Notification service (APNs) device tokens: an alert token for message notifications and a VoIP token for incoming calls). iOS device tokens and the notification language are used only to deliver notifications and incoming calls to that device, and are deleted when you log out, turn notifications off, or Apple reports the token as invalid.",
          "We do not collect payment or financial information: Descall does not accept real-money payments; all shop purchases are made with DesCoin, so no credit card or similar financial information is collected or stored.",
          "Usage analytics: To understand how the app is used, we collect in-app events with PostHog (for example sign-up, login, pages opened, and feature usage) and unexpected error events. When you are signed in, these events are linked to your account ID, username, and (if set) email address. Session recording (screen/session replay) is turned off; your screen and what you type are not recorded. PostHog analytics is not used to build advertising profiles and is never sold. On the website and the desktop app, after you accept, the Google Ads conversion tag only measures sign-ups that come from ads. That tag is not loaded in the iOS app. No advertising or analytics tag loads before you accept. Accounts under 16 are excluded from analytics and ad measurement even if they accept.",
          "Local storage and cookies: We use your browser's local storage (localStorage) and first-party cookies to keep you signed in, remember your language and theme preferences, and for PostHog analytics. The iOS app does not use advertising or tracking tools. On the website and the desktop app only, and only after you accept, the Google Ads conversion tag (gtag) may be loaded to measure sign-ups that come from ads, and it may use cookies.",
        ],
      },
      {
        heading: "2. How We Use Information",
        paragraphs: [
          "To provide the Service: operating messaging, voice/video calling, screen sharing, friends, group management, and profile customization features.",
          "Account security: to authenticate you, deliver 2FA and email verification codes, detect suspicious sessions, and prevent unauthorized access.",
          "Anti-cheat and integrity: we analyze activity data to keep the DesCoin earning system fair and to detect bot/automation use, multi-accounting, and manipulation.",
          "Communication: to send transactional notifications by email or push, such as verification codes, security alerts, friend requests, and important service updates.",
          "Improvement: to analyze and improve the Service's performance, reliability, and user experience (e.g., connection quality diagnostics, error logs).",
          "We never sell your personal data to third parties. Apart from the website sign-up conversion measurement described in section 4, we do not share it for advertising purposes.",
        ],
      },
      {
        heading: "3. Legal Basis for Processing",
        paragraphs: [
          "We rely on the following legal bases when processing your data: (a) necessity for the performance of our service agreement (core features like messaging and calling), (b) our legitimate interests in maintaining account security and preventing cheating/abuse, (c) your consent when you create an account and when you turn on optional features (push notifications, Google Sign-In, analytics and ad measurement, and the product-update list), and (d) compliance with legal obligations. Analytics and advertising cookies are processed only with your consent, which you can change later in Settings → Privacy.",
        ],
      },
      {
        heading: "4. Sharing of Information and Service Providers",
        paragraphs: [
          "We share your data with trusted service providers (data processors) who help us operate the Service and act under our instructions: Supabase for database, file storage, and authentication; Resend for transactional email delivery; Firebase Cloud Messaging (Google) for mobile push notifications; Apple Push Notification service (APNs, Apple) to deliver notifications and incoming calls in the iOS app; Render for server hosting; Vercel for website hosting and cookieless aggregate visit statistics (website only); LiveKit for routing audio/video streams in server voice channels and TURN relay servers for connecting calls (streams are only relayed, never recorded); and PostHog (EU data region) for product analytics. Only the data necessary to provide the Service is shared with these providers.",
          "Third parties tied to features you choose to use: when you search for GIFs, your search text and IP address are sent directly to GIPHY (GIPHY, Inc.); when you sign in with Google or Apple, we receive only the information needed for authentication from Google or Apple; if you link a Valorant account, your Riot ID is shared with Riot Games and the HenrikDev API to fetch your game stats. On the website and the desktop app only, and only after you accept, the Google Ads conversion tag (Google) is used to measure sign-ups from ad campaigns; it is not loaded in the iOS app and it is not loaded before consent.",
          "Crash and error reports: when the app, the website, the desktop app or our servers run into an error, a technical report is sent to our error-monitoring provider Sentry (Functional Software, Inc.). A report contains the error message, the stack trace, the page or API address where the error happened, and device, operating system, browser and app version details. Reports are configured not to include your name, email address, message contents or IP address, and sign-in tokens are stripped from them. These reports are stored in Sentry's European Union (EU) data region and are used only to find and fix bugs.",
          "Messages and media you send are shown only to your chosen recipients (the other party in a DM or group members); Descall staff may only access content when necessary for security investigations, reviewing user reports, or fulfilling legal obligations.",
          "We do not share your personal data with law enforcement or other third parties except where required by a legal obligation (court order, legal request), where necessary to protect our rights, or where necessary to protect user safety.",
        ],
      },
      {
        heading: "5. Cookies and Local Storage",
        paragraphs: [
          "The iOS app does not use advertising or tracking cookies or tools. On the website and the desktop app, the only advertising tool is the Google Ads conversion tag that measures sign-ups from ads after you accept (section 4). PostHog analytics uses a first-party cookie and local storage. We use your browser's local storage (localStorage) to store your session token, language preference, theme settings, and similar UI preferences. You may clear this information from your browser settings at any time, though doing so may end your session.",
        ],
      },
      {
        heading: "6. Data Security",
        paragraphs: [
          "Your password is stored as an irreversible hash using the bcrypt algorithm; we never view or store your password in plain text.",
          "We offer two-factor authentication (2FA) and email verification to add extra protection to your account. Session management also lets you individually terminate suspicious or old sessions.",
          "Your data is hosted on infrastructure providers that use industry-standard encryption (TLS/HTTPS in transit). No system can be 100% secure; in the event of a suspected security breach, we act promptly and notify affected users where required.",
        ],
      },
      {
        heading: "7. Data Retention",
        paragraphs: [
          "We retain your data for as long as your account is active and as necessary to provide the Service. When you close your account, deletion is requested and, after a 14-day period, your personal data — including message history, DesCoin balance, and shop inventory — is deleted or anonymized, except where we have a legal obligation to retain it. Analytics data is kept until you withdraw consent. An email on the product-update list is kept until you unsubscribe.",
          "Security logs and activity records kept for cheat detection purposes may be retained for a limited additional period for the purpose of investigating abuse.",
        ],
      },
      {
        heading: "8. Children's Privacy",
        paragraphs: [
          "Descall does not knowingly collect personal data from children under 13. If we learn that an account holder is under 13, we close the account and start deletion (14-day deletion period). Accounts under 16 are not included in analytics or advertising measurement, even if they accept. If you are a parent or guardian and believe a child under 13 has provided us with personal data, email contact@descall.com.",
        ],
      },
      {
        heading: "9. Your Rights",
        paragraphs: [
          "Under KVKK Article 11 you may learn whether your personal data is processed, request information if it is, learn the purpose of processing and whether it is used for that purpose, know the third parties it is transferred to in Turkey or abroad, request correction if it is incomplete or inaccurate, request deletion or destruction, request that corrections and deletions be notified to those third parties, object to a result against you that is produced solely by automated analysis, and request compensation if you suffer damage.",
          "Where the GDPR applies you also have the rights of access, rectification, erasure, restriction, portability, objection, and withdrawal of consent. You can use most of these from the in-app profile and settings (edit your profile, delete your account, change the analytics choice under Privacy).",
          "Email requests to contact@descall.com. We review them within a reasonable time. You may complain to the Turkish Personal Data Protection Board (Kişisel Verileri Koruma Kurulu) under the KVKK, or to the supervisory authority in the EU member state where you live where the GDPR applies.",
        ],
      },
      {
        heading: "10. International Data Transfers",
        paragraphs: [
          "Our service providers (Supabase, Resend, Firebase, Apple, Render, Vercel, LiveKit, PostHog, Sentry, GIPHY, and Google Ads) may process your data on servers located in countries other than the one you reside in. PostHog and Sentry are kept in the European Union region. Transfers use safeguards such as standard contractual clauses or an adequacy decision.",
        ],
      },
      {
        heading: "11. Marketing Communications",
        paragraphs: [
          "Descall does not send you marketing emails without your consent. Account emails are limited to transactional messages such as verification, 2FA codes, security alerts, and account closure. We do not send gift or DesCoin marketing emails. The optional product-update list is double opt-in, and every email includes an unsubscribe link.",
        ],
      },
      {
        heading: "12. Changes to This Policy",
        paragraphs: [
          "We may update this Privacy Policy from time to time. When material changes are made, you will be notified through an in-Service notice or, if applicable, to your registered email address. Continuing to use the Service after an updated policy is published constitutes your acceptance of the updates.",
        ],
      },
      {
        heading: "13. Contact Us",
        paragraphs: [
          "Questions about this Privacy Policy or the processing of your personal data: the data controller is Demir Sarp Kurtlar, contact@descall.com. Complaints under the KVKK go to the Turkish Personal Data Protection Board. Where the GDPR applies, you may complain to the supervisory authority in the EU member state where you live.",
        ],
      },
    ],
  },
};

export const COPYRIGHT_CONTENT = {
  tr: {
    title: "Telif hakkı bildirimleri",
    updated: `Son güncelleme: ${LAST_UPDATED}`,
    intro:
      "Descall üzerindeki bir içeriğin telif hakkınızı ihlal ettiğini düşünüyorsanız aşağıdaki bildirimi contact@descall.com adresine gönderin. Uygulama içinden bir mesajı veya kullanıcıyı mesaj menüsündeki bildir seçeneğiyle de iletebilirsiniz.",
    sections: [
      {
        heading: "Bildirimde bulunması gerekenler",
        paragraphs: [
          "Bildirimde şunlar yer almalıdır: (1) korunan eserin tanımı, (2) Descall üzerindeki içeriğin adresi veya bulunmasını sağlayacak ayrıntı, (3) adınız ve iletişim e-postanız, (4) kullanımın yetkisiz olduğuna dair iyi niyetli inancınızı belirten beyan, (5) bildirimin doğru olduğunu ve hak sahibi ya da yetkili olduğunuzu belirten beyan, (6) fiziksel veya elektronik imzanız.",
          "İncelememizden sonra ihlal ettiğini gördüğümüz içeriği kaldırır veya erişimi kapatırız.",
        ],
      },
      {
        heading: "Karşı bildirim",
        paragraphs: [
          "İçeriği paylaşan kişi aynı adrese karşı bildirim gönderebilir. Karşı bildirimde iletişim bilgileri, kaldırılan içeriğin tanımı, içeriğin yanlışlıkla kaldırıldığına dair iyi niyetli inanç beyanı ve yaşadığı yerin mahkemelerinin yetkisini kabul ettiğine dair beyan bulunur.",
          "Telif hakkını tekrar tekrar ihlal eden hesaplar kapatılabilir.",
        ],
      },
    ],
  },
  en: {
    title: "Copyright notices",
    updated: `Last updated: ${LAST_UPDATED_EN}`,
    intro:
      "If you believe content on Descall infringes your copyright, send the notice below to contact@descall.com. You can also report a message or a user from the in-app message menu.",
    sections: [
      {
        heading: "What a notice must include",
        paragraphs: [
          "Include: (1) a description of the copyrighted work, (2) the URL or enough detail to find the material on Descall, (3) your name and contact email, (4) a statement that you have a good-faith belief the use is not authorized, (5) a statement that the notice is accurate and that you are the owner or authorized to act, and (6) your physical or electronic signature.",
          "We review notices and remove or disable access to material we find infringing.",
        ],
      },
      {
        heading: "Counter-notice",
        paragraphs: [
          "The person who posted the material may send a counter-notice to the same address with their contact details, identification of the removed material, a statement that they have a good-faith belief it was removed by mistake, and their consent to the jurisdiction of the courts where they live.",
          "Accounts that repeatedly infringe copyright may be terminated.",
        ],
      },
    ],
  },
};
