import Foundation

// Copy of the watch games in every UI language, through the watch's own mechanism
// (L.lang from WatchStrings.swift: the iPhone app's language, else the watch's).
// Foundation only (selftest/gamestrings compiles it). Keep every key in all 7 locales.
// Game names are the draft's own names and stay the same in every language.

enum GL {
    static func t(_ key: String, _ vars: [String: String] = [:]) -> String {
        let entry = table[key]
        var out = entry?[L.lang] ?? entry?["en"] ?? key
        for (name, value) in vars { out = out.replacingOccurrences(of: "{\(name)}", with: value) }
        return out
    }

    static func plural(_ key: String, _ n: Int, _ vars: [String: String] = [:]) -> String {
        let exact = "\(key).\(DescallWatchLocale.pluralCategory(n, L.lang))"
        let use = table[exact]?[L.lang] != nil ? exact : "\(key).other"
        return t(use, vars.merging(["n": "\(n)"]) { a, _ in a })
    }

    static func name(_ g: GameId) -> String {
        switch g {
        case .pong: return "Raket"
        case .bricks: return "Prizma"
        case .snake: return "Yılankavi"
        case .merge: return "Katla"
        case .blocks: return "Blokaj"
        case .mines: return "Sonar"
        case .sudoku: return "Dokuzlu"
        case .chess: return "Hamle"
        case .runner: return "Işıltı"
        case .cards: return "Yirmibir"
        }
    }

    static func genre(_ g: GameId) -> String { t("genre.\(g.rawValue)") }
    static func hint(_ g: GameId) -> String { t("hint.\(g.rawValue)") }

    /// Label of a mode ("Usta", "Labirent", "3 x 3").
    static func mode(_ g: GameId, _ m: String) -> String {
        switch g {
        case .pong, .chess: return t("lvl.\(m)")
        case .mines, .sudoku: return t("diff.\(m)")
        case .snake: return t("snake.\(m)")
        case .merge: return m == "mini" ? "3 × 3" : "4 × 4"
        case .blocks: return t("blocks.\(m)")
        default: return ""
        }
    }

    static func goal(_ c: DailyChallenge) -> String {
        "\(name(c.game)) · " + t("goal.\(c.goal.rawValue)", ["n": number(c.target)])
    }

    /// "48.230" in Turkish, "48,230" in English.
    static func number(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = L.locale
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    static func medal(_ m: RunnerMedal) -> String { t("medal.\(m.rawValue)") }
    static func power(_ p: BrickPower) -> String { t("power.\(p.rawValue)") }

    /// "6 sa 12 dk kaldı".
    static func timeLeft(_ seconds: Int) -> String {
        let h = seconds / 3600, m = (seconds % 3600) / 60
        return h > 0 ? t("leftHM", ["h": "\(h)", "m": "\(m)"]) : t("leftM", ["m": "\(max(1, m))"])
    }

    /// "2:14" hours:minutes for the weekly summary.
    static func hoursMinutes(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 3600, (seconds % 3600) / 60)
    }

    static func chessResult(_ r: ChessResult) -> String { t("chess.\(r.rawValue)") }
    static func cardsOutcome(_ o: CardsOutcome) -> String { t("cards.\(o.rawValue)") }

    // key -> locale -> text.
    // Filled by plain assignments: one nested dictionary literal of every key and locale is very
    // slow for the optimizer in Release builds.
    static let table: [String: [String: String]] = makeTable()

    private static func makeTable() -> [String: [String: String]] {
        var d = [String: [String: String]](minimumCapacity: 256)
        // Entry, hub
        d["mola"] = ["tr": "Mola", "en": "Break", "de": "Pause", "es": "Descanso", "fr": "Pause", "pt-BR": "Pausa", "ru": "Перерыв"] as [String: String]
        d["games"] = ["tr": "Oyunlar", "en": "Games", "de": "Spiele", "es": "Juegos", "fr": "Jeux", "pt-BR": "Jogos", "ru": "Игры"] as [String: String]
        d["gamesCount"] = ["tr": "{n} oyun", "en": "{n} games", "de": "{n} Spiele", "es": "{n} juegos", "fr": "{n} jeux", "pt-BR": "{n} jogos", "ru": "Игр: {n}"] as [String: String]
        d["waiting"] = ["tr": "{game} bekliyor", "en": "{game} is waiting", "de": "{game} wartet", "es": "{game} te espera", "fr": "{game} t'attend", "pt-BR": "{game} esperando", "ru": "{game} ждёт"] as [String: String]
        d["onlyYou"] = ["tr": "Yalnızca senin hesabında, yalnızca saatte", "en": "Only on your account, only on the watch", "de": "Nur in deinem Konto, nur auf der Watch", "es": "Solo en tu cuenta, solo en el reloj", "fr": "Seulement sur ton compte, seulement sur la montre", "pt-BR": "Só na sua conta, só no relógio", "ru": "Только в вашем аккаунте, только на часах"] as [String: String]
        d["thisWeek"] = ["tr": "Bu hafta", "en": "This week", "de": "Diese Woche", "es": "Esta semana", "fr": "Cette semaine", "pt-BR": "Esta semana", "ru": "На этой неделе"] as [String: String]
        d["dayStreak"] = ["tr": "{n} gün seri", "en": "{n}-day streak", "de": "{n} Tage in Folge", "es": "Racha de {n} días", "fr": "{n} jours d'affilée", "pt-BR": "{n} dias seguidos", "ru": "{n} дн. подряд"] as [String: String]
        d["hoursLabel"] = ["tr": "saat", "en": "hours", "de": "Stunden", "es": "horas", "fr": "heures", "pt-BR": "horas", "ru": "часов"] as [String: String]
        d["roundsLabel"] = ["tr": "oyun", "en": "rounds", "de": "Runden", "es": "partidas", "fr": "parties", "pt-BR": "partidas", "ru": "партий"] as [String: String]
        d["recordsLabel"] = ["tr": "rekor", "en": "records", "de": "Rekorde", "es": "récords", "fr": "records", "pt-BR": "recordes", "ru": "рекордов"] as [String: String]
        d["continue"] = ["tr": "Devam et", "en": "Continue", "de": "Weiterspielen", "es": "Continuar", "fr": "Reprendre", "pt-BR": "Continuar", "ru": "Продолжить"] as [String: String]
        d["resume"] = ["tr": "Devam", "en": "Resume", "de": "Weiter", "es": "Seguir", "fr": "Reprendre", "pt-BR": "Retomar", "ru": "Дальше"] as [String: String]
        d["challenge"] = ["tr": "Günün görevi", "en": "Daily challenge", "de": "Tagesaufgabe", "es": "Reto del día", "fr": "Défi du jour", "pt-BR": "Desafio do dia", "ru": "Задание дня"] as [String: String]
        d["againstClock"] = ["tr": "Saate karşı", "en": "Beat the clock", "de": "Gegen die Uhr", "es": "Contra el reloj", "fr": "Contre la montre", "pt-BR": "Contra o relógio", "ru": "Наперегонки со временем"] as [String: String]
        d["leftHM"] = ["tr": "{h} sa {m} dk kaldı", "en": "{h} h {m} min left", "de": "noch {h} Std. {m} Min.", "es": "quedan {h} h {m} min", "fr": "encore {h} h {m} min", "pt-BR": "faltam {h} h {m} min", "ru": "осталось {h} ч {m} мин"] as [String: String]
        d["leftM"] = ["tr": "{m} dk kaldı", "en": "{m} min left", "de": "noch {m} Min.", "es": "quedan {m} min", "fr": "encore {m} min", "pt-BR": "faltam {m} min", "ru": "осталось {m} мин"] as [String: String]
        d["challengeDone"] = ["tr": "Bugünkü görev tamam", "en": "Today's challenge done", "de": "Heutige Aufgabe geschafft", "es": "Reto de hoy completado", "fr": "Défi du jour réussi", "pt-BR": "Desafio de hoje feito", "ru": "Задание дня выполнено"] as [String: String]
        d["challengeStreak"] = ["tr": "{n} gün üst üste", "en": "{n} days in a row", "de": "{n} Tage in Folge", "es": "{n} días seguidos", "fr": "{n} jours de suite", "pt-BR": "{n} dias seguidos", "ru": "{n} дн. подряд"] as [String: String]
        d["challengeMet"] = ["tr": "Görev tamam", "en": "Challenge met", "de": "Aufgabe geschafft", "es": "Reto superado", "fr": "Défi réussi", "pt-BR": "Desafio cumprido", "ru": "Задание выполнено"] as [String: String]
        d["challengeMissed"] = ["tr": "Süre doldu", "en": "Time is up", "de": "Zeit abgelaufen", "es": "Se acabó el tiempo", "fr": "Temps écoulé", "pt-BR": "O tempo acabou", "ru": "Время вышло"] as [String: String]
        d["goal.tile"] = ["tr": "60 sn'de {n}", "en": "{n} in 60 s", "de": "{n} in 60 s", "es": "{n} en 60 s", "fr": "{n} en 60 s", "pt-BR": "{n} em 60 s", "ru": "{n} за 60 с"] as [String: String]
        d["goal.eaten"] = ["tr": "60 sn'de {n} yem", "en": "{n} pellets in 60 s", "de": "{n} Happen in 60 s", "es": "{n} bolitas en 60 s", "fr": "{n} pastilles en 60 s", "pt-BR": "{n} pílulas em 60 s", "ru": "{n} шариков за 60 с"] as [String: String]
        d["goal.lines"] = ["tr": "60 sn'de {n} satır", "en": "{n} lines in 60 s", "de": "{n} Reihen in 60 s", "es": "{n} líneas en 60 s", "fr": "{n} lignes en 60 s", "pt-BR": "{n} linhas em 60 s", "ru": "{n} линий за 60 с"] as [String: String]
        d["goal.spires"] = ["tr": "60 sn'de {n} kule", "en": "{n} spires in 60 s", "de": "{n} Türme in 60 s", "es": "{n} torres en 60 s", "fr": "{n} flèches en 60 s", "pt-BR": "{n} torres em 60 s", "ru": "{n} шпилей за 60 с"] as [String: String]
        d["goal.bricks"] = ["tr": "60 sn'de {n} tuğla", "en": "{n} bricks in 60 s", "de": "{n} Steine in 60 s", "es": "{n} ladrillos en 60 s", "fr": "{n} briques en 60 s", "pt-BR": "{n} tijolos em 60 s", "ru": "{n} кирпичей за 60 с"] as [String: String]
        d["goal.points"] = ["tr": "60 sn'de {n} sayı", "en": "{n} points in 60 s", "de": "{n} Punkte in 60 s", "es": "{n} puntos en 60 s", "fr": "{n} points en 60 s", "pt-BR": "{n} pontos em 60 s", "ru": "{n} очков за 60 с"] as [String: String]
        d["goal.cleared"] = ["tr": "60 sn'de tahtayı temizle", "en": "Clear the board in 60 s", "de": "Feld in 60 s räumen", "es": "Limpia el tablero en 60 s", "fr": "Nettoie la grille en 60 s", "pt-BR": "Limpe o tabuleiro em 60 s", "ru": "Очистить поле за 60 с"] as [String: String]
        d["goal.hands"] = ["tr": "60 sn'de {n} el kazan", "en": "Win {n} hands in 60 s", "de": "{n} Hände in 60 s gewinnen", "es": "Gana {n} manos en 60 s", "fr": "Gagne {n} mains en 60 s", "pt-BR": "Ganhe {n} mãos em 60 s", "ru": "Выиграть {n} раздач за 60 с"] as [String: String]
        d["start"] = ["tr": "Başla", "en": "Start", "de": "Los", "es": "Empezar", "fr": "Commencer", "pt-BR": "Começar", "ru": "Начать"] as [String: String]
        d["group.reflex"] = ["tr": "Refleks", "en": "Reflex", "de": "Reaktion", "es": "Reflejos", "fr": "Réflexes", "pt-BR": "Reflexo", "ru": "Реакция"] as [String: String]
        d["group.puzzle"] = ["tr": "Bulmaca", "en": "Puzzle", "de": "Rätsel", "es": "Puzles", "fr": "Casse-tête", "pt-BR": "Quebra-cabeça", "ru": "Головоломки"] as [String: String]
        d["group.table"] = ["tr": "Masa", "en": "Table", "de": "Tisch", "es": "Mesa", "fr": "Table", "pt-BR": "Mesa", "ru": "Настольные"] as [String: String]
        d["noBest"] = ["tr": "Henüz skor yok", "en": "No score yet", "de": "Noch kein Ergebnis", "es": "Aún sin marca", "fr": "Pas encore de score", "pt-BR": "Sem pontuação ainda", "ru": "Пока нет результата"] as [String: String]
        d["yourTurn"] = ["tr": "Sıra sende", "en": "Your move", "de": "Du bist dran", "es": "Te toca", "fr": "À toi", "pt-BR": "Sua vez", "ru": "Ваш ход"] as [String: String]
        d["savedGame"] = ["tr": "Kayıtlı oyun", "en": "Saved game", "de": "Gespeichertes Spiel", "es": "Partida guardada", "fr": "Partie enregistrée", "pt-BR": "Jogo salvo", "ru": "Сохранённая игра"] as [String: String]
        d["newGame"] = ["tr": "Yeni oyun", "en": "New game", "de": "Neues Spiel", "es": "Partida nueva", "fr": "Nouvelle partie", "pt-BR": "Novo jogo", "ru": "Новая игра"] as [String: String]
        d["stats"] = ["tr": "İstatistik", "en": "Stats", "de": "Statistik", "es": "Estadísticas", "fr": "Statistiques", "pt-BR": "Estatísticas", "ru": "Статистика"] as [String: String]
        d["plays"] = ["tr": "{n} oyun", "en": "{n} played", "de": "{n} gespielt", "es": "{n} jugadas", "fr": "{n} jouées", "pt-BR": "{n} jogadas", "ru": "сыграно {n}"] as [String: String]
        d["best"] = ["tr": "En iyi", "en": "Best", "de": "Bestwert", "es": "Mejor", "fr": "Meilleur", "pt-BR": "Melhor", "ru": "Лучший"] as [String: String]
        d["synced"] = ["tr": "Hesabına eşitlendi", "en": "Synced to your account", "de": "Mit deinem Konto abgeglichen", "es": "Sincronizado con tu cuenta", "fr": "Synchronisé avec ton compte", "pt-BR": "Sincronizado com sua conta", "ru": "Синхронизировано с аккаунтом"] as [String: String]
        d["syncedAgo"] = ["tr": "Eşitlendi · {ago}", "en": "Synced · {ago}", "de": "Abgeglichen · {ago}", "es": "Sincronizado · {ago}", "fr": "Synchronisé · {ago}", "pt-BR": "Sincronizado · {ago}", "ru": "Синхронизировано · {ago}"] as [String: String]
        d["savedOnWatch"] = ["tr": "Saatte kaydedildi, sonra eşitlenecek", "en": "Saved on the watch, syncs later", "de": "Auf der Watch gespeichert, wird später abgeglichen", "es": "Guardado en el reloj, se sincroniza luego", "fr": "Enregistré sur la montre, synchro plus tard", "pt-BR": "Salvo no relógio, sincroniza depois", "ru": "Сохранено на часах, синхронизация позже"] as [String: String]
        d["syncNow"] = ["tr": "Şimdi eşitle", "en": "Sync now", "de": "Jetzt abgleichen", "es": "Sincronizar ahora", "fr": "Synchroniser", "pt-BR": "Sincronizar agora", "ru": "Синхронизировать"] as [String: String]
        d["storageOff"] = ["tr": "Hesap kaydı henüz açık değil, skorlar saatte", "en": "Account storage not set up yet, scores stay on the watch", "de": "Kontospeicher noch nicht eingerichtet, Ergebnisse bleiben auf der Watch", "es": "El guardado en la cuenta aún no está activo; las marcas quedan en el reloj", "fr": "Stockage du compte pas encore prêt, les scores restent sur la montre", "pt-BR": "Armazenamento da conta ainda não ativo; pontuações ficam no relógio", "ru": "Хранилище аккаунта ещё не готово, результаты на часах"] as [String: String]
        d["haptics"] = ["tr": "Dokunsal", "en": "Haptics", "de": "Haptik", "es": "Vibración", "fr": "Retour haptique", "pt-BR": "Vibração", "ru": "Отклик"] as [String: String]
        d["haptics.strong"] = ["tr": "Güçlü", "en": "Strong", "de": "Stark", "es": "Fuerte", "fr": "Fort", "pt-BR": "Forte", "ru": "Сильный"] as [String: String]
        d["haptics.light"] = ["tr": "Hafif", "en": "Light", "de": "Leicht", "es": "Suave", "fr": "Léger", "pt-BR": "Leve", "ru": "Лёгкий"] as [String: String]
        d["on"] = ["tr": "Açık", "en": "On", "de": "An", "es": "Activado", "fr": "Activé", "pt-BR": "Ligado", "ru": "Вкл."] as [String: String]
        d["haptics.off"] = ["tr": "Kapalı", "en": "Off", "de": "Aus", "es": "Apagada", "fr": "Désactivé", "pt-BR": "Desligada", "ru": "Выкл."] as [String: String]

        // Shell
        d["paused"] = ["tr": "Duraklatıldı", "en": "Paused", "de": "Pausiert", "es": "En pausa", "fr": "En pause", "pt-BR": "Pausado", "ru": "Пауза"] as [String: String]
        d["restart"] = ["tr": "Yeniden başla", "en": "Start over", "de": "Neu starten", "es": "Empezar de nuevo", "fr": "Recommencer", "pt-BR": "Recomeçar", "ru": "Начать заново"] as [String: String]
        d["difficulty"] = ["tr": "Zorluk", "en": "Difficulty", "de": "Schwierigkeit", "es": "Dificultad", "fr": "Difficulté", "pt-BR": "Dificuldade", "ru": "Сложность"] as [String: String]
        d["quit"] = ["tr": "Oyundan çık", "en": "Leave game", "de": "Spiel verlassen", "es": "Salir del juego", "fr": "Quitter la partie", "pt-BR": "Sair do jogo", "ru": "Выйти из игры"] as [String: String]
        d["quitSaved"] = ["tr": "Oyun kaydedilir, sonra devam edebilirsin", "en": "The game is saved, continue any time", "de": "Das Spiel wird gespeichert", "es": "La partida se guarda para seguir luego", "fr": "La partie est enregistrée", "pt-BR": "O jogo fica salvo para depois", "ru": "Игра сохранится"] as [String: String]
        d["newRecord"] = ["tr": "YENİ REKOR", "en": "NEW RECORD", "de": "NEUER REKORD", "es": "NUEVO RÉCORD", "fr": "NOUVEAU RECORD", "pt-BR": "NOVO RECORDE", "ru": "НОВЫЙ РЕКОРД"] as [String: String]
        d["previous"] = ["tr": "önceki {v}", "en": "previous {v}", "de": "vorher {v}", "es": "anterior {v}", "fr": "précédent {v}", "pt-BR": "anterior {v}", "ru": "было {v}"] as [String: String]
        d["playAgain"] = ["tr": "Tekrar oyna", "en": "Play again", "de": "Nochmal spielen", "es": "Jugar otra vez", "fr": "Rejouer", "pt-BR": "Jogar de novo", "ru": "Сыграть ещё"] as [String: String]
        d["backToGames"] = ["tr": "Oyunlara dön", "en": "Back to games", "de": "Zu den Spielen", "es": "Volver a los juegos", "fr": "Retour aux jeux", "pt-BR": "Voltar aos jogos", "ru": "К играм"] as [String: String]
        d["youWon"] = ["tr": "Kazandın", "en": "You won", "de": "Gewonnen", "es": "Has ganado", "fr": "Gagné", "pt-BR": "Você venceu", "ru": "Победа"] as [String: String]
        d["youLost"] = ["tr": "Kaybettin", "en": "You lost", "de": "Verloren", "es": "Has perdido", "fr": "Perdu", "pt-BR": "Você perdeu", "ru": "Поражение"] as [String: String]
        d["draw"] = ["tr": "Berabere", "en": "Draw", "de": "Remis", "es": "Tablas", "fr": "Nulle", "pt-BR": "Empate", "ru": "Ничья"] as [String: String]
        d["gameOver"] = ["tr": "Oyun bitti", "en": "Game over", "de": "Spiel vorbei", "es": "Fin de la partida", "fr": "Partie terminée", "pt-BR": "Fim de jogo", "ru": "Игра окончена"] as [String: String]
        d["solved"] = ["tr": "Çözdün", "en": "Solved", "de": "Gelöst", "es": "Resuelto", "fr": "Résolu", "pt-BR": "Resolvido", "ru": "Решено"] as [String: String]
        d["lastRounds"] = ["tr": "Son oyunlar", "en": "Recent rounds", "de": "Letzte Runden", "es": "Últimas partidas", "fr": "Dernières parties", "pt-BR": "Últimas partidas", "ru": "Последние партии"] as [String: String]
        d["fromWhereLeft"] = ["tr": "Kaldığın yerden", "en": "Where you left off", "de": "Wo du aufgehört hast", "es": "Donde lo dejaste", "fr": "Là où tu t'étais arrêté", "pt-BR": "De onde parou", "ru": "С того же места"] as [String: String]
        d["savedAsleep"] = ["tr": "Ekran uyurken kaydedildi", "en": "Saved while the screen slept", "de": "Gespeichert, während der Bildschirm schlief", "es": "Guardado con la pantalla apagada", "fr": "Enregistré pendant la veille", "pt-BR": "Salvo com a tela apagada", "ru": "Сохранено, пока экран спал"] as [String: String]
        d["wait"] = ["tr": "Bekle", "en": "Get ready", "de": "Gleich geht's los", "es": "Prepárate", "fr": "Prépare-toi", "pt-BR": "Prepare-se", "ru": "Приготовьтесь"] as [String: String]
        d["raiseWrist"] = ["tr": "Bileğini kaldır, 3 sn sonra devam", "en": "Raise your wrist, back in 3 s", "de": "Handgelenk heben, weiter in 3 s", "es": "Levanta la muñeca, sigue en 3 s", "fr": "Lève le poignet, reprise dans 3 s", "pt-BR": "Levante o pulso, volta em 3 s", "ru": "Поднимите руку, продолжение через 3 с"] as [String: String]
        d["timeStops"] = ["tr": "Süre bilek inikken durur", "en": "The clock stops while your wrist is down", "de": "Die Zeit steht, solange das Handgelenk unten ist", "es": "El tiempo se para con la muñeca abajo", "fr": "Le temps s'arrête poignet baissé", "pt-BR": "O tempo para com o pulso abaixado", "ru": "Время стоит, пока рука опущена"] as [String: String]
        d["critical"] = ["tr": "KRİTİK UYARI", "en": "CRITICAL ALERT", "de": "KRITISCHE WARNUNG", "es": "ALERTA CRÍTICA", "fr": "ALERTE CRITIQUE", "pt-BR": "ALERTA CRÍTICO", "ru": "КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ"] as [String: String]
        d["alert.errors"] = ["tr": "Hata artışı", "en": "Error spike", "de": "Fehleranstieg", "es": "Pico de errores", "fr": "Pic d'erreurs", "pt-BR": "Pico de erros", "ru": "Всплеск ошибок"] as [String: String]
        d["alert.health"] = ["tr": "Sistem kritik durumda", "en": "System is critical", "de": "System kritisch", "es": "Sistema en estado crítico", "fr": "Système critique", "pt-BR": "Sistema crítico", "ru": "Система в критическом состоянии"] as [String: String]
        d["alert.reports"] = ["tr": "Rapor yığılması", "en": "Reports piling up", "de": "Meldungen häufen sich", "es": "Se acumulan reportes", "fr": "Les signalements s'accumulent", "pt-BR": "Denúncias acumulando", "ru": "Копятся жалобы"] as [String: String]
        d["alertErrorsBody"] = ["tr": "Son 1 saatte {n} hata", "en": "{n} errors in the last hour", "de": "{n} Fehler in der letzten Stunde", "es": "{n} errores en la última hora", "fr": "{n} erreurs dans la dernière heure", "pt-BR": "{n} erros na última hora", "ru": "Ошибок за час: {n}"] as [String: String]
        d["alertReportsBody"] = ["tr": "{n} açık rapor", "en": "{n} open reports", "de": "{n} offene Meldungen", "es": "{n} reportes abiertos", "fr": "{n} signalements ouverts", "pt-BR": "{n} denúncias abertas", "ru": "Открытых жалоб: {n}"] as [String: String]
        d["autoPaused"] = ["tr": "{game} otomatik duraklatıldı", "en": "{game} paused automatically", "de": "{game} automatisch pausiert", "es": "{game} se pausó solo", "fr": "{game} mis en pause automatiquement", "pt-BR": "{game} pausado automaticamente", "ru": "{game} поставлена на паузу"] as [String: String]
        d["goErrors"] = ["tr": "Hatalara git", "en": "Open errors", "de": "Zu den Fehlern", "es": "Ver errores", "fr": "Voir les erreurs", "pt-BR": "Ver erros", "ru": "К ошибкам"] as [String: String]
        d["goReports"] = ["tr": "Raporlara git", "en": "Open reports", "de": "Zu den Meldungen", "es": "Ver reportes", "fr": "Voir les signalements", "pt-BR": "Ver denúncias", "ru": "К жалобам"] as [String: String]
        d["goAdmin"] = ["tr": "Yönetici paneline git", "en": "Open the admin panel", "de": "Zum Adminbereich", "es": "Abrir el panel de admin", "fr": "Ouvrir l'administration", "pt-BR": "Abrir o painel admin", "ru": "К панели администратора"] as [String: String]
        d["backToGame"] = ["tr": "Oyuna dön", "en": "Back to the game", "de": "Zurück zum Spiel", "es": "Volver al juego", "fr": "Retour au jeu", "pt-BR": "Voltar ao jogo", "ru": "Вернуться в игру"] as [String: String]
        d["score"] = ["tr": "Skor", "en": "Score", "de": "Punkte", "es": "Puntos", "fr": "Score", "pt-BR": "Pontos", "ru": "Счёт"] as [String: String]
        d["levelN"] = ["tr": "Seviye {n}", "en": "Level {n}", "de": "Level {n}", "es": "Nivel {n}", "fr": "Niveau {n}", "pt-BR": "Nível {n}", "ru": "Уровень {n}"] as [String: String]
        d["lines"] = ["tr": "{n} satır", "en": "{n} lines", "de": "{n} Reihen", "es": "{n} líneas", "fr": "{n} lignes", "pt-BR": "{n} linhas", "ru": "линий: {n}"] as [String: String]
        d["time"] = ["tr": "Süre", "en": "Time", "de": "Zeit", "es": "Tiempo", "fr": "Temps", "pt-BR": "Tempo", "ru": "Время"] as [String: String]
        d["winsShort.one"] = ["tr": "{n} G", "en": "{n} win", "de": "{n} Sieg", "es": "{n} victoria", "fr": "{n} victoire", "pt-BR": "{n} vitória", "ru": "{n} победа"] as [String: String]
        d["winsShort.other"] = ["tr": "{n} G", "en": "{n} wins", "de": "{n} Siege", "es": "{n} victorias", "fr": "{n} victoires", "pt-BR": "{n} vitórias", "ru": "{n} побед"] as [String: String]
        d["winsShort.few"] = ["ru": "{n} победы"] as [String: String]
        d["winsShort.many"] = ["ru": "{n} побед"] as [String: String]
        d["undo"] = ["tr": "Geri al", "en": "Undo", "de": "Rückgängig", "es": "Deshacer", "fr": "Annuler", "pt-BR": "Desfazer", "ru": "Отменить"] as [String: String]
        d["hintBtn"] = ["tr": "İpucu", "en": "Hint", "de": "Tipp", "es": "Pista", "fr": "Indice", "pt-BR": "Dica", "ru": "Подсказка"] as [String: String]
        d["left"] = ["tr": "{n} hak", "en": "{n} left", "de": "noch {n}", "es": "quedan {n}", "fr": "encore {n}", "pt-BR": "restam {n}", "ru": "осталось {n}"] as [String: String]
        d["preparing"] = ["tr": "Hazırlanıyor", "en": "Preparing", "de": "Wird vorbereitet", "es": "Preparando", "fr": "Préparation", "pt-BR": "Preparando", "ru": "Подготовка"] as [String: String]

        // Genres and controls
        d["genre.pong"] = ["tr": "Masa tenisi · yapay zekâya karşı", "en": "Table tennis · against the AI", "de": "Tischtennis · gegen die KI", "es": "Tenis de mesa · contra la IA", "fr": "Tennis de table · contre l'IA", "pt-BR": "Tênis de mesa · contra a IA", "ru": "Настольный теннис · против ИИ"] as [String: String]
        d["genre.bricks"] = ["tr": "Tuğla kırma", "en": "Brick breaker", "de": "Steine brechen", "es": "Rompeladrillos", "fr": "Casse-briques", "pt-BR": "Quebra-tijolos", "ru": "Разбей кирпичи"] as [String: String]
        d["genre.snake"] = ["tr": "Yılan", "en": "Snake", "de": "Schlange", "es": "Serpiente", "fr": "Serpent", "pt-BR": "Cobrinha", "ru": "Змейка"] as [String: String]
        d["genre.merge"] = ["tr": "Sayı birleştirme", "en": "Number merge", "de": "Zahlen verbinden", "es": "Unir números", "fr": "Fusion de nombres", "pt-BR": "Juntar números", "ru": "Слияние чисел"] as [String: String]
        d["genre.blocks"] = ["tr": "Düşen bloklar", "en": "Falling blocks", "de": "Fallende Blöcke", "es": "Bloques que caen", "fr": "Blocs qui tombent", "pt-BR": "Blocos caindo", "ru": "Падающие блоки"] as [String: String]
        d["genre.mines"] = ["tr": "Mayın bulma", "en": "Mine finder", "de": "Minensuche", "es": "Busca minas", "fr": "Démineur", "pt-BR": "Caça-minas", "ru": "Поиск мин"] as [String: String]
        d["genre.sudoku"] = ["tr": "Sayı bulmacası (sudoku türü)", "en": "Number puzzle (sudoku style)", "de": "Zahlenrätsel (Sudoku)", "es": "Rompecabezas numérico (sudoku)", "fr": "Grille de chiffres (sudoku)", "pt-BR": "Quebra-cabeça numérico (sudoku)", "ru": "Числовая головоломка (судоку)"] as [String: String]
        d["genre.chess"] = ["tr": "Satranç · yapay zekâya karşı", "en": "Chess · against the AI", "de": "Schach · gegen die KI", "es": "Ajedrez · contra la IA", "fr": "Échecs · contre l'IA", "pt-BR": "Xadrez · contra a IA", "ru": "Шахматы · против ИИ"] as [String: String]
        d["genre.runner"] = ["tr": "Dokun, uç: sonsuz koşu", "en": "Tap to fly: endless run", "de": "Tippen zum Fliegen: Endlosflug", "es": "Toca para volar: carrera sin fin", "fr": "Touche pour voler : course sans fin", "pt-BR": "Toque para voar: corrida sem fim", "ru": "Касание для полёта: бесконечный забег"] as [String: String]
        d["genre.cards"] = ["tr": "Kart · krupiyeye karşı", "en": "Cards · against the dealer", "de": "Karten · gegen den Croupier", "es": "Cartas · contra el crupier", "fr": "Cartes · contre le croupier", "pt-BR": "Cartas · contra o crupiê", "ru": "Карты · против крупье"] as [String: String]
        d["hint.pong"] = ["tr": "Taç: raket · Dokun: smaç", "en": "Crown: paddle · Tap: smash", "de": "Krone: Schläger · Tippen: Schmetterball", "es": "Corona: pala · Toque: remate", "fr": "Couronne : raquette · Touche : smash", "pt-BR": "Coroa: raquete · Toque: cortada", "ru": "Колёсико: ракетка · Касание: смэш"] as [String: String]
        d["hint.bricks"] = ["tr": "Taç: raket · Dokun: fırlat", "en": "Crown: paddle · Tap: launch", "de": "Krone: Schläger · Tippen: Ball los", "es": "Corona: pala · Toque: lanzar", "fr": "Couronne : raquette · Touche : lancer", "pt-BR": "Coroa: raquete · Toque: lançar", "ru": "Колёсико: ракетка · Касание: запуск"] as [String: String]
        d["hint.snake"] = ["tr": "Kaydır: yön", "en": "Swipe: turn", "de": "Wischen: Richtung", "es": "Desliza: girar", "fr": "Glisse : tourner", "pt-BR": "Deslize: virar", "ru": "Свайп: поворот"] as [String: String]
        d["hint.merge"] = ["tr": "Kaydır: birleştir", "en": "Swipe: merge", "de": "Wischen: verbinden", "es": "Desliza: unir", "fr": "Glisse : fusionner", "pt-BR": "Deslize: juntar", "ru": "Свайп: слияние"] as [String: String]
        d["hint.blocks"] = ["tr": "Taç: döndür · Kaydır: taşı · Dokun: düşür", "en": "Crown: rotate · Swipe: move · Tap: drop", "de": "Krone: drehen · Wischen: schieben · Tippen: fallen", "es": "Corona: girar · Desliza: mover · Toque: soltar", "fr": "Couronne : tourner · Glisse : déplacer · Touche : lâcher", "pt-BR": "Coroa: girar · Deslize: mover · Toque: soltar", "ru": "Колёсико: поворот · Свайп: сдвиг · Касание: сброс"] as [String: String]
        d["hint.mines"] = ["tr": "Taç: yakınlaştır · Basılı tut: işaretle", "en": "Crown: zoom · Hold: flag", "de": "Krone: Zoom · Halten: markieren", "es": "Corona: zoom · Mantén: marcar", "fr": "Couronne : zoom · Maintien : drapeau", "pt-BR": "Coroa: zoom · Segure: marcar", "ru": "Колёсико: масштаб · Удержание: флажок"] as [String: String]
        d["hint.sudoku"] = ["tr": "Taç: rakam · Dokun: yaz", "en": "Crown: digit · Tap: write", "de": "Krone: Ziffer · Tippen: eintragen", "es": "Corona: cifra · Toque: escribir", "fr": "Couronne : chiffre · Touche : écrire", "pt-BR": "Coroa: dígito · Toque: escrever", "ru": "Колёсико: цифра · Касание: записать"] as [String: String]
        d["hint.chess"] = ["tr": "Taç: taş ve kare · Dokun: seç", "en": "Crown: piece and square · Tap: choose", "de": "Krone: Figur und Feld · Tippen: wählen", "es": "Corona: pieza y casilla · Toque: elegir", "fr": "Couronne : pièce et case · Touche : choisir", "pt-BR": "Coroa: peça e casa · Toque: escolher", "ru": "Колёсико: фигура и поле · Касание: выбор"] as [String: String]
        d["hint.runner"] = ["tr": "Dokun: Lumo kanat çırpar", "en": "Tap: Lumo flaps", "de": "Tippen: Lumo flattert", "es": "Toque: Lumo aletea", "fr": "Touche : Lumo bat des ailes", "pt-BR": "Toque: Lumo bate as asas", "ru": "Касание: Люмо машет крыльями"] as [String: String]
        d["hint.cards"] = ["tr": "Taç: bahis puanı · Dokun: kart çek / dur", "en": "Crown: bet points · Tap: hit / stand", "de": "Krone: Einsatz · Tippen: Karte / halten", "es": "Corona: apuesta · Toque: pedir / plantarse", "fr": "Couronne : mise · Touche : carte / rester", "pt-BR": "Coroa: aposta · Toque: pedir / parar", "ru": "Колёсико: ставка · Касание: ещё / хватит"] as [String: String]

        // Modes
        d["lvl.easy"] = ["tr": "Kolay", "en": "Easy", "de": "Leicht", "es": "Fácil", "fr": "Facile", "pt-BR": "Fácil", "ru": "Легко"] as [String: String]
        d["lvl.normal"] = ["tr": "Orta", "en": "Medium", "de": "Mittel", "es": "Media", "fr": "Moyen", "pt-BR": "Médio", "ru": "Средне"] as [String: String]
        d["lvl.hard"] = ["tr": "Usta", "en": "Master", "de": "Meister", "es": "Maestro", "fr": "Maître", "pt-BR": "Mestre", "ru": "Мастер"] as [String: String]
        d["diff.easy"] = ["tr": "Kolay", "en": "Easy", "de": "Leicht", "es": "Fácil", "fr": "Facile", "pt-BR": "Fácil", "ru": "Легко"] as [String: String]
        d["diff.medium"] = ["tr": "Orta", "en": "Medium", "de": "Mittel", "es": "Media", "fr": "Moyen", "pt-BR": "Médio", "ru": "Средне"] as [String: String]
        d["diff.hard"] = ["tr": "Zor", "en": "Hard", "de": "Schwer", "es": "Difícil", "fr": "Difficile", "pt-BR": "Difícil", "ru": "Сложно"] as [String: String]
        d["snake.walls"] = ["tr": "Duvarlı", "en": "Walls", "de": "Mit Wänden", "es": "Con muros", "fr": "Avec murs", "pt-BR": "Com paredes", "ru": "Со стенами"] as [String: String]
        d["snake.wrap"] = ["tr": "Geçişli", "en": "Wrap", "de": "Durchgehend", "es": "Sin bordes", "fr": "Traversant", "pt-BR": "Atravessar", "ru": "Сквозной"] as [String: String]
        d["snake.maze"] = ["tr": "Engelli", "en": "Maze", "de": "Labyrinth", "es": "Laberinto", "fr": "Labyrinthe", "pt-BR": "Labirinto", "ru": "Лабиринт"] as [String: String]
        d["blocks.marathon"] = ["tr": "Maraton", "en": "Marathon", "de": "Marathon", "es": "Maratón", "fr": "Marathon", "pt-BR": "Maratona", "ru": "Марафон"] as [String: String]
        d["blocks.sprint"] = ["tr": "2 dk", "en": "2 min", "de": "2 Min.", "es": "2 min", "fr": "2 min", "pt-BR": "2 min", "ru": "2 мин"] as [String: String]
        d["speed"] = ["tr": "Hız", "en": "Speed", "de": "Tempo", "es": "Velocidad", "fr": "Vitesse", "pt-BR": "Velocidade", "ru": "Скорость"] as [String: String]
        d["speed.1"] = ["tr": "Yavaş", "en": "Slow", "de": "Langsam", "es": "Lenta", "fr": "Lente", "pt-BR": "Lenta", "ru": "Медленно"] as [String: String]
        d["speed.2"] = ["tr": "Normal", "en": "Normal", "de": "Normal", "es": "Normal", "fr": "Normale", "pt-BR": "Normal", "ru": "Обычно"] as [String: String]
        d["speed.3"] = ["tr": "Hızlı", "en": "Fast", "de": "Schnell", "es": "Rápida", "fr": "Rapide", "pt-BR": "Rápida", "ru": "Быстро"] as [String: String]
        d["mode"] = ["tr": "Mod", "en": "Mode", "de": "Modus", "es": "Modo", "fr": "Mode", "pt-BR": "Modo", "ru": "Режим"] as [String: String]

        // Raket
        d["ai"] = ["tr": "YZ", "en": "AI", "de": "KI", "es": "IA", "fr": "IA", "pt-BR": "IA", "ru": "ИИ"] as [String: String]
        d["rally"] = ["tr": "Ralli {n}", "en": "Rally {n}", "de": "Ballwechsel {n}", "es": "Peloteo {n}", "fr": "Échange {n}", "pt-BR": "Rali {n}", "ru": "Розыгрыш {n}"] as [String: String]
        d["spin"] = ["tr": "Kesme", "en": "Spin", "de": "Schnitt", "es": "Efecto", "fr": "Effet", "pt-BR": "Efeito", "ru": "Подкрутка"] as [String: String]
        d["smash"] = ["tr": "Smaç", "en": "Smash", "de": "Schmetterball", "es": "Remate", "fr": "Smash", "pt-BR": "Cortada", "ru": "Смэш"] as [String: String]
        d["toEleven"] = ["tr": "11'e kadar · ralli {n}", "en": "First to 11 · rally {n}", "de": "Bis 11 · Ballwechsel {n}", "es": "A 11 · peloteo {n}", "fr": "En 11 · échange {n}", "pt-BR": "Até 11 · rali {n}", "ru": "До 11 · розыгрыш {n}"] as [String: String]
        d["serveYou"] = ["tr": "servis sende", "en": "your serve", "de": "dein Aufschlag", "es": "sacas tú", "fr": "à toi de servir", "pt-BR": "seu saque", "ru": "ваша подача"] as [String: String]

        // Prizma
        d["power.wide"] = ["tr": "Geniş raket", "en": "Wide paddle", "de": "Breiter Schläger", "es": "Pala ancha", "fr": "Raquette large", "pt-BR": "Raquete larga", "ru": "Широкая ракетка"] as [String: String]
        d["power.multi"] = ["tr": "Çoklu top", "en": "Multi ball", "de": "Mehrere Bälle", "es": "Multibola", "fr": "Multi-balles", "pt-BR": "Várias bolas", "ru": "Мультишар"] as [String: String]
        d["power.slow"] = ["tr": "Yavaş top", "en": "Slow ball", "de": "Langsamer Ball", "es": "Bola lenta", "fr": "Balle lente", "pt-BR": "Bola lenta", "ru": "Медленный шар"] as [String: String]
        d["power.life"] = ["tr": "Ek can", "en": "Extra life", "de": "Extraleben", "es": "Vida extra", "fr": "Vie en plus", "pt-BR": "Vida extra", "ru": "Доп. жизнь"] as [String: String]
        d["power.pierce"] = ["tr": "Delici top", "en": "Piercing ball", "de": "Durchschlag", "es": "Bola perforante", "fr": "Balle perçante", "pt-BR": "Bola perfurante", "ru": "Пробивной шар"] as [String: String]
        d["power.sticky"] = ["tr": "Yapışkan raket", "en": "Sticky paddle", "de": "Klebeschläger", "es": "Pala pegajosa", "fr": "Raquette collante", "pt-BR": "Raquete grudenta", "ru": "Липкая ракетка"] as [String: String]
        d["power.shield"] = ["tr": "Kalkan", "en": "Shield", "de": "Schild", "es": "Escudo", "fr": "Bouclier", "pt-BR": "Escudo", "ru": "Щит"] as [String: String]
        d["lives"] = ["tr": "Can", "en": "Lives", "de": "Leben", "es": "Vidas", "fr": "Vies", "pt-BR": "Vidas", "ru": "Жизни"] as [String: String]
        d["powers"] = ["tr": "güç", "en": "power-ups", "de": "Extras", "es": "potenciadores", "fr": "bonus", "pt-BR": "poderes", "ru": "бонусов"] as [String: String]
        d["levels"] = ["tr": "seviye", "en": "levels", "de": "Level", "es": "niveles", "fr": "niveaux", "pt-BR": "níveis", "ru": "уровней"] as [String: String]

        // Katla
        d["biggest"] = ["tr": "En büyük {v}", "en": "Biggest {v}", "de": "Größte {v}", "es": "Mayor {v}", "fr": "Plus grande {v}", "pt-BR": "Maior {v}", "ru": "Максимум {v}"] as [String: String]
        d["keepGoing"] = ["tr": "Devam et", "en": "Keep going", "de": "Weitermachen", "es": "Seguir", "fr": "Continuer", "pt-BR": "Continuar", "ru": "Продолжить"] as [String: String]
        d["board"] = ["tr": "Tahta", "en": "Board", "de": "Feld", "es": "Tablero", "fr": "Grille", "pt-BR": "Tabuleiro", "ru": "Поле"] as [String: String]

        // Blokaj
        d["hold"] = ["tr": "Sakla", "en": "Hold", "de": "Halten", "es": "Guardar", "fr": "Réserve", "pt-BR": "Guardar", "ru": "Запас"] as [String: String]
        d["next"] = ["tr": "Sıradaki", "en": "Next", "de": "Nächste", "es": "Siguiente", "fr": "Suivante", "pt-BR": "Próxima", "ru": "Далее"] as [String: String]

        // Sonar
        d["minesLeft"] = ["tr": "{n} mayın", "en": "{n} mines", "de": "{n} Minen", "es": "{n} minas", "fr": "{n} mines", "pt-BR": "{n} minas", "ru": "мин: {n}"] as [String: String]
        d["flag"] = ["tr": "İşaret", "en": "Flag", "de": "Fahne", "es": "Bandera", "fr": "Drapeau", "pt-BR": "Bandeira", "ru": "Флажок"] as [String: String]

        // Dokuzlu
        d["notes"] = ["tr": "Not", "en": "Notes", "de": "Notizen", "es": "Notas", "fr": "Notes", "pt-BR": "Notas", "ru": "Заметки"] as [String: String]
        d["erase"] = ["tr": "Sil", "en": "Erase", "de": "Löschen", "es": "Borrar", "fr": "Effacer", "pt-BR": "Apagar", "ru": "Стереть"] as [String: String]
        d["fillNotes"] = ["tr": "Notları doldur", "en": "Fill notes", "de": "Notizen füllen", "es": "Rellenar notas", "fr": "Remplir les notes", "pt-BR": "Preencher notas", "ru": "Заполнить заметки"] as [String: String]
        d["mistakes"] = ["tr": "{n}/3 hata", "en": "{n}/3 mistakes", "de": "{n}/3 Fehler", "es": "{n}/3 errores", "fr": "{n}/3 erreurs", "pt-BR": "{n}/3 erros", "ru": "ошибок {n}/3"] as [String: String]

        // Hamle
        d["moveN"] = ["tr": "Hamle {n}", "en": "Move {n}", "de": "Zug {n}", "es": "Jugada {n}", "fr": "Coup {n}", "pt-BR": "Lance {n}", "ru": "Ход {n}"] as [String: String]
        d["thinking"] = ["tr": "YZ düşünüyor", "en": "AI is thinking", "de": "KI denkt nach", "es": "La IA piensa", "fr": "L'IA réfléchit", "pt-BR": "A IA está pensando", "ru": "ИИ думает"] as [String: String]
        d["check"] = ["tr": "Şah", "en": "Check", "de": "Schach", "es": "Jaque", "fr": "Échec", "pt-BR": "Xeque", "ru": "Шах"] as [String: String]
        d["squares"] = ["tr": "{n} kare", "en": "{n} squares", "de": "{n} Felder", "es": "{n} casillas", "fr": "{n} cases", "pt-BR": "{n} casas", "ru": "полей: {n}"] as [String: String]
        d["pickPiece"] = ["tr": "Taşını seç", "en": "Choose a piece", "de": "Figur wählen", "es": "Elige una pieza", "fr": "Choisis une pièce", "pt-BR": "Escolha uma peça", "ru": "Выберите фигуру"] as [String: String]
        d["resign"] = ["tr": "Teslim ol", "en": "Resign", "de": "Aufgeben", "es": "Rendirse", "fr": "Abandonner", "pt-BR": "Desistir", "ru": "Сдаться"] as [String: String]
        d["resignConfirm"] = ["tr": "Bu oyunu teslim et?", "en": "Resign this game?", "de": "Diese Partie aufgeben?", "es": "¿Rendirte en esta partida?", "fr": "Abandonner cette partie ?", "pt-BR": "Desistir desta partida?", "ru": "Сдать партию?"] as [String: String]
        d["aiLevel"] = ["tr": "YZ · {level}", "en": "AI · {level}", "de": "KI · {level}", "es": "IA · {level}", "fr": "IA · {level}", "pt-BR": "IA · {level}", "ru": "ИИ · {level}"] as [String: String]
        d["aiMoved"] = ["tr": "YZ: {move} · Sıra sende", "en": "AI: {move} · Your move", "de": "KI: {move} · Du bist dran", "es": "IA: {move} · Te toca", "fr": "IA : {move} · À toi", "pt-BR": "IA: {move} · Sua vez", "ru": "ИИ: {move} · Ваш ход"] as [String: String]
        d["unlocked"] = ["tr": "Usta seviyesi açıldı", "en": "Master level unlocked", "de": "Meister-Stufe freigeschaltet", "es": "Nivel maestro desbloqueado", "fr": "Niveau maître débloqué", "pt-BR": "Nível mestre liberado", "ru": "Уровень мастера открыт"] as [String: String]
        d["lockedHint"] = ["tr": "Orta seviyeyi bir kez yen", "en": "Beat Medium once to unlock", "de": "Einmal Mittel schlagen", "es": "Gana una vez en media", "fr": "Bats le niveau moyen une fois", "pt-BR": "Vença o médio uma vez", "ru": "Победите средний уровень"] as [String: String]
        d["playMaster"] = ["tr": "Usta'ya karşı oyna", "en": "Play the Master", "de": "Gegen den Meister", "es": "Jugar contra el maestro", "fr": "Jouer contre le maître", "pt-BR": "Jogar contra o mestre", "ru": "Сыграть с мастером"] as [String: String]
        d["colour"] = ["tr": "Renk", "en": "Colour", "de": "Farbe", "es": "Color", "fr": "Couleur", "pt-BR": "Cor", "ru": "Цвет"] as [String: String]
        d["white"] = ["tr": "Beyaz", "en": "White", "de": "Weiß", "es": "Blancas", "fr": "Blancs", "pt-BR": "Brancas", "ru": "Белые"] as [String: String]
        d["black"] = ["tr": "Siyah", "en": "Black", "de": "Schwarz", "es": "Negras", "fr": "Noirs", "pt-BR": "Pretas", "ru": "Чёрные"] as [String: String]
        d["bestMove"] = ["tr": "En iyi hamlen", "en": "Your best move", "de": "Dein bester Zug", "es": "Tu mejor jugada", "fr": "Ton meilleur coup", "pt-BR": "Seu melhor lance", "ru": "Ваш лучший ход"] as [String: String]
        d["promote"] = ["tr": "Terfi", "en": "Promote", "de": "Umwandeln", "es": "Promoción", "fr": "Promotion", "pt-BR": "Promoção", "ru": "Превращение"] as [String: String]
        d["chess.whiteMates"] = ["tr": "Mat", "en": "Checkmate", "de": "Schachmatt", "es": "Jaque mate", "fr": "Échec et mat", "pt-BR": "Xeque-mate", "ru": "Мат"] as [String: String]
        d["chess.blackMates"] = ["tr": "Mat", "en": "Checkmate", "de": "Schachmatt", "es": "Jaque mate", "fr": "Échec et mat", "pt-BR": "Xeque-mate", "ru": "Мат"] as [String: String]
        d["chess.stalemate"] = ["tr": "Pat", "en": "Stalemate", "de": "Patt", "es": "Ahogado", "fr": "Pat", "pt-BR": "Afogamento", "ru": "Пат"] as [String: String]
        d["chess.fiftyMoves"] = ["tr": "50 hamle kuralı", "en": "Fifty-move rule", "de": "50-Züge-Regel", "es": "Regla de 50 jugadas", "fr": "Règle des 50 coups", "pt-BR": "Regra dos 50 lances", "ru": "Правило 50 ходов"] as [String: String]
        d["chess.repetition"] = ["tr": "Üç kez tekrar", "en": "Threefold repetition", "de": "Dreifache Wiederholung", "es": "Triple repetición", "fr": "Triple répétition", "pt-BR": "Tripla repetição", "ru": "Троекратное повторение"] as [String: String]
        d["chess.material"] = ["tr": "Yetersiz taş", "en": "Not enough material", "de": "Zu wenig Material", "es": "Material insuficiente", "fr": "Matériel insuffisant", "pt-BR": "Material insuficiente", "ru": "Недостаточно материала"] as [String: String]
        d["chess.resigned"] = ["tr": "Teslim", "en": "Resigned", "de": "Aufgegeben", "es": "Abandono", "fr": "Abandon", "pt-BR": "Desistência", "ru": "Сдача"] as [String: String]
        d["chess.ongoing"] = ["tr": "Sürüyor", "en": "In play", "de": "Läuft", "es": "En juego", "fr": "En cours", "pt-BR": "Em jogo", "ru": "Идёт"] as [String: String]
        d["moveCount"] = ["tr": "{n}. hamle", "en": "move {n}", "de": "Zug {n}", "es": "jugada {n}", "fr": "coup {n}", "pt-BR": "lance {n}", "ru": "ход {n}"] as [String: String]

        // Işıltı
        d["tapToFly"] = ["tr": "Uçmak için dokun", "en": "Tap to fly", "de": "Zum Fliegen tippen", "es": "Toca para volar", "fr": "Touche pour voler", "pt-BR": "Toque para voar", "ru": "Коснитесь, чтобы лететь"] as [String: String]
        d["ghost"] = ["tr": "Bugünün en iyisi", "en": "Today's best", "de": "Bestwert von heute", "es": "Mejor de hoy", "fr": "Meilleur du jour", "pt-BR": "Melhor de hoje", "ru": "Лучший за сегодня"] as [String: String]
        d["medal.0"] = ["tr": "Madalya yok", "en": "No medal", "de": "Keine Medaille", "es": "Sin medalla", "fr": "Pas de médaille", "pt-BR": "Sem medalha", "ru": "Без медали"] as [String: String]
        d["medal.1"] = ["tr": "Bronz", "en": "Bronze", "de": "Bronze", "es": "Bronce", "fr": "Bronze", "pt-BR": "Bronze", "ru": "Бронза"] as [String: String]
        d["medal.2"] = ["tr": "Gümüş", "en": "Silver", "de": "Silber", "es": "Plata", "fr": "Argent", "pt-BR": "Prata", "ru": "Серебро"] as [String: String]
        d["medal.3"] = ["tr": "Altın", "en": "Gold", "de": "Gold", "es": "Oro", "fr": "Or", "pt-BR": "Ouro", "ru": "Золото"] as [String: String]
        d["medal.4"] = ["tr": "Kristal", "en": "Crystal", "de": "Kristall", "es": "Cristal", "fr": "Cristal", "pt-BR": "Cristal", "ru": "Кристалл"] as [String: String]
        d["nextMedal"] = ["tr": "{medal} için {n}", "en": "{n} to {medal}", "de": "{n} bis {medal}", "es": "{n} para {medal}", "fr": "{n} pour {medal}", "pt-BR": "{n} para {medal}", "ru": "{n} до «{medal}»"] as [String: String]

        // Yirmibir
        d["deal"] = ["tr": "Dağıt", "en": "Deal", "de": "Geben", "es": "Repartir", "fr": "Distribuer", "pt-BR": "Distribuir", "ru": "Раздать"] as [String: String]
        d["hit"] = ["tr": "Kart çek", "en": "Hit", "de": "Karte", "es": "Pedir", "fr": "Carte", "pt-BR": "Pedir", "ru": "Ещё"] as [String: String]
        d["stand"] = ["tr": "Dur", "en": "Stand", "de": "Halten", "es": "Plantarse", "fr": "Rester", "pt-BR": "Parar", "ru": "Хватит"] as [String: String]
        d["double"] = ["tr": "İkiye katla", "en": "Double", "de": "Verdoppeln", "es": "Doblar", "fr": "Doubler", "pt-BR": "Dobrar", "ru": "Удвоить"] as [String: String]
        d["split"] = ["tr": "Böl", "en": "Split", "de": "Teilen", "es": "Dividir", "fr": "Séparer", "pt-BR": "Dividir", "ru": "Разделить"] as [String: String]
        d["bet"] = ["tr": "Bahis", "en": "Bet", "de": "Einsatz", "es": "Apuesta", "fr": "Mise", "pt-BR": "Aposta", "ru": "Ставка"] as [String: String]
        d["pointsUnit"] = ["tr": "{n} puan", "en": "{n} points", "de": "{n} Punkte", "es": "{n} puntos", "fr": "{n} points", "pt-BR": "{n} pontos", "ru": "{n} очк."] as [String: String]
        d["dealer"] = ["tr": "Krupiye", "en": "Dealer", "de": "Croupier", "es": "Crupier", "fr": "Croupier", "pt-BR": "Crupiê", "ru": "Крупье"] as [String: String]
        d["pointsOnly"] = ["tr": "Yalnızca puan; para ya da DesCoin değil", "en": "Points only, never money or DesCoin", "de": "Nur Punkte, nie Geld oder DesCoin", "es": "Solo puntos, nunca dinero ni DesCoin", "fr": "Des points seulement, jamais d'argent ni de DesCoin", "pt-BR": "Só pontos, nunca dinheiro ou DesCoin", "ru": "Только очки, не деньги и не DesCoin"] as [String: String]
        d["refilled"] = ["tr": "Yeni yığın: 1.000 puan", "en": "New stack: 1,000 points", "de": "Neuer Stapel: 1.000 Punkte", "es": "Nueva pila: 1.000 puntos", "fr": "Nouvelle pile : 1 000 points", "pt-BR": "Nova pilha: 1.000 pontos", "ru": "Новый запас: 1000 очков"] as [String: String]
        d["streakBonus"] = ["tr": "Seri bonusu +{n}", "en": "Streak bonus +{n}", "de": "Serienbonus +{n}", "es": "Bono de racha +{n}", "fr": "Bonus de série +{n}", "pt-BR": "Bônus de sequência +{n}", "ru": "Бонус серии +{n}"] as [String: String]
        d["cashOut"] = ["tr": "Masadan kalk", "en": "Leave the table", "de": "Tisch verlassen", "es": "Dejar la mesa", "fr": "Quitter la table", "pt-BR": "Sair da mesa", "ru": "Встать из-за стола"] as [String: String]
        d["streakN"] = ["tr": "Seri {n}", "en": "Streak {n}", "de": "Serie {n}", "es": "Racha {n}", "fr": "Série {n}", "pt-BR": "Sequência {n}", "ru": "Серия {n}"] as [String: String]
        d["cards.natural"] = ["tr": "Yirmibir!", "en": "Twenty-one!", "de": "Einundzwanzig!", "es": "¡Veintiuno!", "fr": "Vingt-et-un !", "pt-BR": "Vinte e um!", "ru": "Двадцать одно!"] as [String: String]
        d["cards.win"] = ["tr": "Kazandın", "en": "You win", "de": "Gewonnen", "es": "Ganas", "fr": "Gagné", "pt-BR": "Você ganha", "ru": "Выигрыш"] as [String: String]
        d["cards.push"] = ["tr": "Berabere", "en": "Push", "de": "Unentschieden", "es": "Empate", "fr": "Égalité", "pt-BR": "Empate", "ru": "Ничья"] as [String: String]
        d["cards.lose"] = ["tr": "Kaybettin", "en": "You lose", "de": "Verloren", "es": "Pierdes", "fr": "Perdu", "pt-BR": "Você perde", "ru": "Проигрыш"] as [String: String]
        d["cards.bust"] = ["tr": "Battın", "en": "Bust", "de": "Überkauft", "es": "Te pasaste", "fr": "Dépassé", "pt-BR": "Estourou", "ru": "Перебор"] as [String: String]
        return d
    }
}
