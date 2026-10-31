import UIKit

/// 3.0.0 (A4, mockup 28): the expanded message notification. Header (avatar
/// + Descall badge, sender, "👥 group · N üye", time), the last three messages
/// as bubbles, the five quick reactions and the reply field. Used by the
/// Notification Content Extension; Debug builds of the app also show it for
/// the simulator screenshot (-DescallNotifyDemo).
final class DescallNotifyThreadView: UIView {
    static let accent = UIColor(red: 0.36, green: 0.42, blue: 0.95, alpha: 1)

    var onReact: ((String) -> Void)?
    var onReplyTap: (() -> Void)?
    var onSend: (() -> Void)?

    private let avatarView = UIImageView()
    private let badgeView = UIView()
    private let nameLabel = UILabel()
    private let lineLabel = UILabel()
    private let timeLabel = UILabel()
    private let bubbles = UIStackView()
    private let reactionBar = UIView()
    private let reactionStack = UIStackView()
    private var reactionButtons: [UIButton] = []
    private let replyField = UIControl()
    private let replyPlaceholder = UILabel()
    private let sendButton = UIButton(type: .system)
    private let statusLabel = UILabel()
    private let divider = UIView()
    private var showsSenderNames = true

    override init(frame: CGRect) {
        super.init(frame: frame)
        build()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        build()
    }

    private static func dynamic(dark: UIColor, light: UIColor) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? dark : light }
    }

    static let incomingFill = dynamic(dark: UIColor(white: 1, alpha: 0.12), light: UIColor(white: 0, alpha: 0.06))
    static let barFill = dynamic(dark: UIColor(white: 1, alpha: 0.08), light: UIColor(white: 0, alpha: 0.05))
    static let selectedFill = dynamic(dark: UIColor(white: 1, alpha: 0.2), light: UIColor(white: 0, alpha: 0.1))
    static let fieldFill = dynamic(dark: UIColor(white: 1, alpha: 0.1), light: UIColor(white: 0, alpha: 0.06))

    private func build() {
        backgroundColor = .clear

        avatarView.translatesAutoresizingMaskIntoConstraints = false
        avatarView.layer.cornerRadius = 20
        avatarView.clipsToBounds = true
        avatarView.contentMode = .scaleAspectFill

        badgeView.translatesAutoresizingMaskIntoConstraints = false
        badgeView.backgroundColor = UIColor(red: 0.12, green: 0.13, blue: 0.25, alpha: 1)
        badgeView.layer.cornerRadius = 5
        badgeView.layer.borderWidth = 1
        badgeView.layer.borderColor = UIColor(white: 0, alpha: 0.35).cgColor
        let link = UIImageView(image: UIImage(systemName: "link", withConfiguration: UIImage.SymbolConfiguration(pointSize: 9, weight: .bold)))
        link.tintColor = UIColor(red: 0.45, green: 0.55, blue: 1, alpha: 1)
        link.translatesAutoresizingMaskIntoConstraints = false
        badgeView.addSubview(link)

        nameLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        nameLabel.textColor = .label
        lineLabel.font = .systemFont(ofSize: 13)
        lineLabel.textColor = .secondaryLabel
        timeLabel.font = .systemFont(ofSize: 13)
        timeLabel.textColor = .secondaryLabel
        timeLabel.setContentHuggingPriority(.required, for: .horizontal)
        timeLabel.setContentCompressionResistancePriority(.required, for: .horizontal)

        let titles = UIStackView(arrangedSubviews: [nameLabel, lineLabel])
        titles.axis = .vertical
        titles.spacing = 1

        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        [avatarView, badgeView, titles, timeLabel].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            header.addSubview($0)
        }

        bubbles.axis = .vertical
        bubbles.spacing = 7

        reactionBar.backgroundColor = Self.barFill
        reactionBar.layer.cornerRadius = 25
        reactionStack.axis = .horizontal
        reactionStack.distribution = .fillEqually
        reactionStack.translatesAutoresizingMaskIntoConstraints = false
        reactionBar.addSubview(reactionStack)
        for emoji in DescallNotify.quickReactions {
            // Each emoji sits in a 42pt circle (the selected one is filled), centred in an equal slot.
            let slot = UIView()
            let button = UIButton(type: .custom)
            button.setTitle(emoji, for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 25)
            button.layer.cornerRadius = 21
            button.accessibilityLabel = emoji
            button.addTarget(self, action: #selector(reactionTapped(_:)), for: .touchUpInside)
            button.translatesAutoresizingMaskIntoConstraints = false
            slot.addSubview(button)
            NSLayoutConstraint.activate([
                button.centerXAnchor.constraint(equalTo: slot.centerXAnchor),
                button.centerYAnchor.constraint(equalTo: slot.centerYAnchor),
                button.widthAnchor.constraint(equalToConstant: 42),
                button.heightAnchor.constraint(equalToConstant: 42),
            ])
            reactionButtons.append(button)
            reactionStack.addArrangedSubview(slot)
        }

        replyField.backgroundColor = Self.fieldFill
        replyField.layer.cornerRadius = 18.5
        replyField.addTarget(self, action: #selector(replyTapped), for: .touchUpInside)
        replyPlaceholder.font = .systemFont(ofSize: 15)
        replyPlaceholder.textColor = .tertiaryLabel
        replyPlaceholder.translatesAutoresizingMaskIntoConstraints = false
        replyPlaceholder.isUserInteractionEnabled = false
        replyField.addSubview(replyPlaceholder)

        sendButton.backgroundColor = Self.accent
        sendButton.tintColor = .white
        sendButton.layer.cornerRadius = 17
        sendButton.setImage(UIImage(systemName: "paperplane", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)), for: .normal)
        sendButton.addTarget(self, action: #selector(sendTapped), for: .touchUpInside)

        let replyRow = UIView()
        [replyField, sendButton].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            replyRow.addSubview($0)
        }

        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.textColor = .secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 2
        statusLabel.isHidden = true

        let column = UIStackView(arrangedSubviews: [header, bubbles, reactionBar, replyRow, statusLabel])
        column.axis = .vertical
        column.spacing = 12
        column.setCustomSpacing(27, after: header)  // hairline sits in the middle of this gap
        column.setCustomSpacing(16, after: bubbles)
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        // Full-width hairline under the header (mockup 28).
        divider.backgroundColor = UIColor.separator
        divider.translatesAutoresizingMaskIntoConstraints = false
        addSubview(divider)

        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
            divider.leadingAnchor.constraint(equalTo: leadingAnchor),
            divider.trailingAnchor.constraint(equalTo: trailingAnchor),
            divider.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 13),
            divider.heightAnchor.constraint(equalToConstant: 0.5),

            avatarView.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            avatarView.topAnchor.constraint(equalTo: header.topAnchor),
            avatarView.bottomAnchor.constraint(lessThanOrEqualTo: header.bottomAnchor),
            avatarView.widthAnchor.constraint(equalToConstant: 40),
            avatarView.heightAnchor.constraint(equalToConstant: 40),
            badgeView.widthAnchor.constraint(equalToConstant: 18),
            badgeView.heightAnchor.constraint(equalToConstant: 18),
            badgeView.trailingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 3),
            badgeView.bottomAnchor.constraint(equalTo: avatarView.bottomAnchor, constant: 3),
            link.centerXAnchor.constraint(equalTo: badgeView.centerXAnchor),
            link.centerYAnchor.constraint(equalTo: badgeView.centerYAnchor),
            titles.leadingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 10),
            titles.centerYAnchor.constraint(equalTo: avatarView.centerYAnchor),
            titles.topAnchor.constraint(greaterThanOrEqualTo: header.topAnchor),
            titles.bottomAnchor.constraint(lessThanOrEqualTo: header.bottomAnchor),
            titles.trailingAnchor.constraint(lessThanOrEqualTo: timeLabel.leadingAnchor, constant: -8),
            timeLabel.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            timeLabel.topAnchor.constraint(equalTo: header.topAnchor, constant: 2),
            header.heightAnchor.constraint(greaterThanOrEqualToConstant: 42),

            reactionBar.heightAnchor.constraint(equalToConstant: 50),
            reactionStack.leadingAnchor.constraint(equalTo: reactionBar.leadingAnchor, constant: 6),
            reactionStack.trailingAnchor.constraint(equalTo: reactionBar.trailingAnchor, constant: -6),
            reactionStack.topAnchor.constraint(equalTo: reactionBar.topAnchor),
            reactionStack.bottomAnchor.constraint(equalTo: reactionBar.bottomAnchor),

            replyRow.heightAnchor.constraint(equalToConstant: 37),
            replyField.leadingAnchor.constraint(equalTo: replyRow.leadingAnchor),
            replyField.topAnchor.constraint(equalTo: replyRow.topAnchor),
            replyField.bottomAnchor.constraint(equalTo: replyRow.bottomAnchor),
            replyField.trailingAnchor.constraint(equalTo: sendButton.leadingAnchor, constant: -10),
            replyPlaceholder.leadingAnchor.constraint(equalTo: replyField.leadingAnchor, constant: 14),
            replyPlaceholder.trailingAnchor.constraint(lessThanOrEqualTo: replyField.trailingAnchor, constant: -12),
            replyPlaceholder.centerYAnchor.constraint(equalTo: replyField.centerYAnchor),
            sendButton.trailingAnchor.constraint(equalTo: replyRow.trailingAnchor),
            sendButton.centerYAnchor.constraint(equalTo: replyRow.centerYAnchor),
            sendButton.widthAnchor.constraint(equalToConstant: 34),
            sendButton.heightAnchor.constraint(equalToConstant: 34),
        ])
    }

    // MARK: Content

    func setHeader(name: String, line: String?, time: String, avatar: UIImage?) {
        nameLabel.text = name
        setHeaderLine(line)
        timeLabel.text = time
        avatarView.image = avatar
    }

    /// The group line comes as "👥 Hafta Sonu Ekibi · 4 üye"; draw the people
    /// glyph as the outline SF Symbol (mockup 28) instead of the emoji.
    func setHeaderLine(_ line: String?) {
        let text = line ?? ""
        lineLabel.isHidden = text.isEmpty
        let groupPrefix = "👥 "
        guard text.hasPrefix(groupPrefix),
              let people = UIImage(systemName: "person.2", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .regular))?
                .withTintColor(.secondaryLabel, renderingMode: .alwaysOriginal) else {
            lineLabel.attributedText = nil
            lineLabel.text = text
            return
        }
        let attachment = NSTextAttachment()
        attachment.image = people
        attachment.bounds = CGRect(x: 0, y: -1.5, width: people.size.width, height: people.size.height)
        let result = NSMutableAttributedString(attachment: attachment)
        result.append(NSAttributedString(string: "  " + String(text.dropFirst(groupPrefix.count))))
        result.addAttributes([.font: lineLabel.font as Any, .foregroundColor: UIColor.secondaryLabel], range: NSRange(location: 0, length: result.length))
        lineLabel.attributedText = result
        lineLabel.accessibilityLabel = String(text.dropFirst(groupPrefix.count))
    }

    func setReplyPlaceholder(_ text: String) {
        replyPlaceholder.text = text
        replyField.accessibilityLabel = text
    }

    /// Bubbles for the last messages (oldest first). Names show in groups and channels.
    func setMessages(_ messages: [DescallNotifyThread.Message], strings: DescallNotifyStrings, senderNames: Bool) {
        showsSenderNames = senderNames
        bubbles.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for message in messages.suffix(3) {
            bubbles.addArrangedSubview(bubble(message, strings: strings))
        }
    }

    func appendMine(_ text: String) {
        let message = DescallNotifyThread.Message(id: UUID().uuidString, fromName: "", text: text, mine: true)
        bubbles.addArrangedSubview(bubble(message, strings: DescallNotifyStrings(lang: .current())))
        while bubbles.arrangedSubviews.count > 3 { bubbles.arrangedSubviews.first?.removeFromSuperview() }
    }

    func setSelectedReaction(_ emoji: String?) {
        for button in reactionButtons {
            let on = button.title(for: .normal) == emoji
            button.backgroundColor = on ? Self.selectedFill : .clear
            button.accessibilityTraits = on ? [.button, .selected] : [.button]
        }
    }

    func setStatus(_ text: String?) {
        statusLabel.text = text
        statusLabel.isHidden = (text ?? "").isEmpty
    }

    func setBusy(_ busy: Bool) {
        reactionButtons.forEach { $0.isEnabled = !busy }
        sendButton.isEnabled = !busy
        replyField.isEnabled = !busy
    }

    private func bubble(_ message: DescallNotifyThread.Message, strings: DescallNotifyStrings) -> UIView {
        let row = UIView()
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        box.layer.cornerRadius = 14
        box.backgroundColor = message.mine ? Self.accent : Self.incomingFill
        row.addSubview(box)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(stack)
        if !message.mine, showsSenderNames, !message.fromName.isEmpty {
            let name = UILabel()
            name.font = .systemFont(ofSize: 11, weight: .semibold)
            name.textColor = .secondaryLabel
            name.text = message.fromName
            stack.addArrangedSubview(name)
        }
        let text = UILabel()
        text.font = .systemFont(ofSize: 15)
        text.numberOfLines = 3
        text.textColor = message.mine ? .white : .label
        text.text = message.display(strings)
        stack.addArrangedSubview(text)

        NSLayoutConstraint.activate([
            box.topAnchor.constraint(equalTo: row.topAnchor),
            box.bottomAnchor.constraint(equalTo: row.bottomAnchor),
            box.widthAnchor.constraint(lessThanOrEqualTo: row.widthAnchor, multiplier: 0.72),
            stack.topAnchor.constraint(equalTo: box.topAnchor, constant: 7),
            stack.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -7),
            stack.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -12),
            message.mine
                ? box.trailingAnchor.constraint(equalTo: row.trailingAnchor)
                : box.leadingAnchor.constraint(equalTo: row.leadingAnchor),
        ])
        return row
    }

    // MARK: Actions

    @objc private func reactionTapped(_ sender: UIButton) {
        guard let emoji = sender.title(for: .normal) else { return }
        onReact?(emoji)
    }

    @objc private func replyTapped() { onReplyTap?() }

    @objc private func sendTapped() {
        if let onSend { onSend() } else { onReplyTap?() }
    }
}

/// Keyboard bar for the reply (shown as the content extension's inputAccessoryView).
final class DescallNotifyReplyBar: UIView, UITextFieldDelegate {
    let field = UITextField()
    private let send = UIButton(type: .system)
    var onSend: ((String) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: CGRect(x: 0, y: 0, width: frame.width, height: 52))
        autoresizingMask = .flexibleHeight
        backgroundColor = .secondarySystemBackground
        field.translatesAutoresizingMaskIntoConstraints = false
        field.backgroundColor = .tertiarySystemBackground
        field.layer.cornerRadius = 17
        field.font = .systemFont(ofSize: 15)
        field.returnKeyType = .send
        field.delegate = self
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.leftViewMode = .always
        send.translatesAutoresizingMaskIntoConstraints = false
        send.backgroundColor = DescallNotifyThreadView.accent
        send.tintColor = .white
        send.layer.cornerRadius = 16
        send.setImage(UIImage(systemName: "paperplane", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold)), for: .normal)
        send.addTarget(self, action: #selector(sendTapped), for: .touchUpInside)
        addSubview(field)
        addSubview(send)
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            field.centerYAnchor.constraint(equalTo: centerYAnchor),
            field.heightAnchor.constraint(equalToConstant: 34),
            field.trailingAnchor.constraint(equalTo: send.leadingAnchor, constant: -8),
            send.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            send.centerYAnchor.constraint(equalTo: centerYAnchor),
            send.widthAnchor.constraint(equalToConstant: 32),
            send.heightAnchor.constraint(equalToConstant: 32),
        ])
    }

    required init?(coder: NSCoder) { return nil }

    override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: 52) }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        sendTapped()
        return false
    }

    @objc private func sendTapped() {
        let text = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        onSend?(String(text.prefix(DescallNotify.maxReplyLength)))
    }
}
