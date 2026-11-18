//! The few native (MessageBox) texts shown when there is no WebView yet or no window at all.

pub struct T {
    pub title: &'static str,
    pub wv_q: &'static str,
    pub wv_fail: &'static str,
    pub un_q: &'static str,
    pub un_done: &'static str,
    pub un_fail: &'static str,
}

pub fn get(lang: &str) -> &'static T {
    match lang {
        "tr" => &T {
            title: "Descall Kurulum",
            wv_q: "Kurulum ekranı için Microsoft Edge WebView2 gerekiyor. Şimdi kurulsun mu? (yaklaşık 2 MB, yönetici izni gerekmez)",
            wv_fail: "WebView2 kurulamadı. descall.com/download adresinden çevrimdışı kurulum paketini deneyebilirsin.",
            un_q: "Descall kaldırılsın mı?\n\nUygulama dosyaları silinir. Sohbetlerin hesabında kalır.",
            un_done: "Descall kaldırıldı.",
            un_fail: "Descall kaldırılamadı. Açıksa kapatıp yeniden dene.",
        },
        "de" => &T {
            title: "Descall Setup",
            wv_q: "Für das Setup wird Microsoft Edge WebView2 benötigt. Jetzt installieren? (etwa 2 MB, keine Adminrechte nötig)",
            wv_fail: "WebView2 konnte nicht installiert werden. Versuche den Offline-Installer auf descall.com/download.",
            un_q: "Descall deinstallieren?\n\nDie App-Dateien werden entfernt. Deine Chats bleiben in deinem Konto.",
            un_done: "Descall wurde deinstalliert.",
            un_fail: "Descall konnte nicht deinstalliert werden. Schließe es und versuche es erneut.",
        },
        "es" => &T {
            title: "Instalador de Descall",
            wv_q: "El instalador necesita Microsoft Edge WebView2. ¿Instalarlo ahora? (unos 2 MB, sin permisos de administrador)",
            wv_fail: "No se pudo instalar WebView2. Prueba el instalador sin conexión en descall.com/download.",
            un_q: "¿Desinstalar Descall?\n\nSe eliminan los archivos de la app. Tus chats siguen en tu cuenta.",
            un_done: "Descall se desinstaló.",
            un_fail: "No se pudo desinstalar Descall. Ciérralo y vuelve a intentarlo.",
        },
        "fr" => &T {
            title: "Installation de Descall",
            wv_q: "L'installation a besoin de Microsoft Edge WebView2. L'installer maintenant ? (environ 2 Mo, sans droits admin)",
            wv_fail: "WebView2 n'a pas pu être installé. Essaie l'installateur hors ligne sur descall.com/download.",
            un_q: "Désinstaller Descall ?\n\nLes fichiers de l'app sont supprimés. Tes discussions restent sur ton compte.",
            un_done: "Descall a été désinstallé.",
            un_fail: "Impossible de désinstaller Descall. Ferme-le et réessaie.",
        },
        "pt-BR" => &T {
            title: "Instalação do Descall",
            wv_q: "A instalação precisa do Microsoft Edge WebView2. Instalar agora? (cerca de 2 MB, sem permissão de administrador)",
            wv_fail: "Não foi possível instalar o WebView2. Tente o instalador offline em descall.com/download.",
            un_q: "Desinstalar o Descall?\n\nOs arquivos do app são removidos. Suas conversas ficam na sua conta.",
            un_done: "O Descall foi desinstalado.",
            un_fail: "Não foi possível desinstalar o Descall. Feche-o e tente de novo.",
        },
        "ru" => &T {
            title: "Установка Descall",
            wv_q: "Для установщика нужен Microsoft Edge WebView2. Установить сейчас? (около 2 МБ, права администратора не нужны)",
            wv_fail: "Не удалось установить WebView2. Попробуй офлайн-установщик на descall.com/download.",
            un_q: "Удалить Descall?\n\nФайлы приложения будут удалены. Чаты останутся в аккаунте.",
            un_done: "Descall удалён.",
            un_fail: "Не удалось удалить Descall. Закрой его и попробуй снова.",
        },
        _ => &T {
            title: "Descall Setup",
            wv_q: "Setup needs Microsoft Edge WebView2. Install it now? (about 2 MB, no admin rights needed)",
            wv_fail: "WebView2 could not be installed. Try the offline installer at descall.com/download.",
            un_q: "Uninstall Descall?\n\nThe app files are removed. Your chats stay with your account.",
            un_done: "Descall was uninstalled.",
            un_fail: "Descall could not be uninstalled. Close it and try again.",
        },
    }
}
