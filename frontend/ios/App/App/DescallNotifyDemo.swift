#if DEBUG
import UIKit

/// `-DescallNotifyDemo` (Debug builds only): the expanded message notification
/// (content extension view, mockup 28) with sample data, over a dark backdrop,
/// so CI can screenshot it on the simulator without a push or a sign-in.
enum DescallNotifyDemo {
    private static var shown = false

    static func showIfAsked(in host: UIView) {
        guard !shown, ProcessInfo.processInfo.arguments.contains("-DescallNotifyDemo"), host.window != nil else { return }
        shown = true
        let strings = DescallNotifyStrings(lang: .tr)

        let backdrop = UIView(frame: host.bounds)
        backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backdrop.backgroundColor = UIColor(red: 0.10, green: 0.09, blue: 0.24, alpha: 1)
        backdrop.overrideUserInterfaceStyle = .dark
        host.addSubview(backdrop)

        let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark))
        card.translatesAutoresizingMaskIntoConstraints = false
        card.layer.cornerRadius = 22
        card.clipsToBounds = true
        backdrop.addSubview(card)

        let thread = DescallNotifyThreadView()
        thread.translatesAutoresizingMaskIntoConstraints = false
        card.contentView.addSubview(thread)
        thread.setHeader(
            name: "Mert",
            line: "👥 Hafta Sonu Ekibi · \(strings.members(4))",
            time: strings.now,
            avatar: DescallNotifyImages.letterAvatar(name: "Mert", seed: "u-mert")
        )
        thread.setMessages([
            .init(id: "1", fromName: "Ayşe", text: "Kim geliyor bu akşam?", mine: false),
            .init(id: "2", fromName: "", text: "Ben varım 👋", mine: true),
            .init(id: "3", fromName: "Mert", text: "Bu akşam 21:00'de sesli kanalda buluşuyoruz, gelen?", mine: false),
        ], strings: strings, senderNames: true)
        thread.setSelectedReaction("😂")
        thread.setReplyPlaceholder(strings.replyPlaceholder(to: "Hafta Sonu Ekibi"))

        let menu = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark))
        menu.translatesAutoresizingMaskIntoConstraints = false
        menu.layer.cornerRadius = 14
        menu.clipsToBounds = true
        backdrop.addSubview(menu)
        let rows = UIStackView()
        rows.axis = .vertical
        rows.translatesAutoresizingMaskIntoConstraints = false
        menu.contentView.addSubview(rows)
        let items = [(strings.markRead, "checkmark.message"), (strings.mute, "bell.slash"), (strings.openChat, "bubble.left")]
        for (index, item) in items.enumerated() {
            let row = UIView()
            let label = UILabel()
            label.text = item.0
            label.font = .systemFont(ofSize: 15)
            label.textColor = .label
            let icon = UIImageView(image: UIImage(systemName: item.1))
            icon.tintColor = .label
            [label, icon].forEach {
                $0.translatesAutoresizingMaskIntoConstraints = false
                row.addSubview($0)
            }
            NSLayoutConstraint.activate([
                row.heightAnchor.constraint(equalToConstant: 44),
                label.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 16),
                label.centerYAnchor.constraint(equalTo: row.centerYAnchor),
                icon.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -16),
                icon.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            ])
            rows.addArrangedSubview(row)
            if index < items.count - 1 {
                let line = UIView()
                line.backgroundColor = UIColor(white: 1, alpha: 0.12)
                line.heightAnchor.constraint(equalToConstant: 0.5).isActive = true
                rows.addArrangedSubview(line)
            }
        }

        let guide = backdrop.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            card.topAnchor.constraint(equalTo: guide.topAnchor, constant: 40),
            card.leadingAnchor.constraint(equalTo: backdrop.leadingAnchor, constant: 10),
            card.trailingAnchor.constraint(equalTo: backdrop.trailingAnchor, constant: -10),
            thread.topAnchor.constraint(equalTo: card.contentView.topAnchor),
            thread.leadingAnchor.constraint(equalTo: card.contentView.leadingAnchor),
            thread.trailingAnchor.constraint(equalTo: card.contentView.trailingAnchor),
            thread.bottomAnchor.constraint(equalTo: card.contentView.bottomAnchor),
            menu.topAnchor.constraint(equalTo: card.bottomAnchor, constant: 10),
            menu.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            menu.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            rows.topAnchor.constraint(equalTo: menu.contentView.topAnchor),
            rows.leadingAnchor.constraint(equalTo: menu.contentView.leadingAnchor),
            rows.trailingAnchor.constraint(equalTo: menu.contentView.trailingAnchor),
            rows.bottomAnchor.constraint(equalTo: menu.contentView.bottomAnchor),
        ])
    }
}
#endif
