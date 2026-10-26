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
        avatarView.layer.cornerRadius = 18
        avatarView.clipsToBounds = true
        avatarView.contentMode = .scaleAspectFill

        badgeView.translatesAutoresizingMaskIntoConstraints = false
        badgeView.backgroundColor = UIColor(red: 0.12, green: 0.13, blue: 0.25, alpha: 1)
        badgeView.layer.cornerRadius = 4
        badgeView.layer.borderWidth = 1
        badgeView.layer.borderColor = UIColor(white: 0, alpha: 0.35).cgColor
        let link = UIImageView(image: UIImage(systemName: "link", withConfiguration: UIImage.SymbolConfiguration(pointSize: 8, weight: .bold)))
        link.tintColor = UIColor(red: 0.45, green: 0.55, blue: 1, alpha: 1)
        link.translatesAutoresizingMaskIntoConstraints = false
        badgeView.addSubview(link)

        nameLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        nameLabel.textColor = .label
        lineLabel.font = .systemFont(ofSize: 12)
        lineLabel.textColor = .secondaryLabel
        timeLabel.font = .systemFont(ofSize: 12)
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
        bubbles.spacing = 6

        reactionBar.backgroundColor = Self.barFill
        reactionBar.layer.cornerRadius = 18
        reactionStack.axis = .horizontal
        reactionStack.distribution = .fillEqually
        reactionStack.translatesAutoresizingMaskIntoConstraints = false
        reactionBar.addSubview(reactionStack)
        for emoji in DescallNotify.quickReactions {
            let button = UIButton(type: .custom)
            button.setTitle(emoji, for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 21)
            button.layer.cornerRadius = 15
            button.accessibilityLabel = emoji
            button.addTarget(self, action: #selector(reactionTapped(_:)), for: .touchUpInside)
            reactionButtons.append(button)
            reactionStack.addArrangedSubview(button)
        }

        replyField.backgroundColor = Self.fieldFill
        replyField.layer.cornerRadius = 15
        replyField.addTarget(self, action: #selector(replyTapped), for: .touchUpInside)
        replyPlaceholder.font = .systemFont(ofSize: 13)
        replyPlaceholder.textColor = .tertiaryLabel
        replyPlaceholder.translatesAutoresizingMaskIntoConstraints = false
        replyPlaceholder.isUserInteractionEnabled = false
        replyField.addSubview(replyPlaceholder)

        sendButton.backgroundColor = Self.accent
        sendButton.tintColor = .white
        sendButton.layer.cornerRadius = 14
        sendButton.setImage(UIImage(systemName: "paperplane.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold)), for: .normal)
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
        column.spacing = 10
        column.setCustomSpacing(12, after: header)
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)

        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),

            avatarView.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            avatarView.topAnchor.constraint(equalTo: header.topAnchor),
            avatarView.bottomAnchor.constraint(lessThanOrEqualTo: header.bottomAnchor),
            avatarView.widthAnchor.constraint(equalToConstant: 36),
            avatarView.heightAnchor.constraint(equalToConstant: 36),
            badgeView.widthAnchor.constraint(equalToConstant: 14),
            badgeView.heightAnchor.constraint(equalToConstant: 14),
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
            header.heightAnchor.constraint(greaterThanOrEqualToConstant: 38),

            reactionBar.heightAnchor.constraint(equalToConstant: 38),
            reactionStack.leadingAnchor.constraint(equalTo: reactionBar.leadingAnchor, constant: 6),
            reactionStack.trailingAnchor.constraint(equalTo: reactionBar.trailingAnchor, constant: -6),
            reactionStack.topAnchor.constraint(equalTo: reactionBar.topAnchor, constant: 4),
            reactionStack.bottomAnchor.constraint(equalTo: reactionBar.bottomAnchor, constant: -4),

            replyRow.heightAnchor.constraint(equalToConstant: 30),
            replyField.leadingAnchor.constraint(equalTo: replyRow.leadingAnchor),
            replyField.topAnchor.constraint(equalTo: replyRow.topAnchor),
            replyField.bottomAnchor.constraint(equalTo: replyRow.bottomAnchor),
            replyField.trailingAnchor.constraint(equalTo: sendButton.leadingAnchor, constant: -8),
            replyPlaceholder.leadingAnchor.constraint(equalTo: replyField.leadingAnchor, constant: 12),
            replyPlaceholder.trailingAnchor.constraint(lessThanOrEqualTo: replyField.trailingAnchor, constant: -12),
            replyPlaceholder.centerYAnchor.constraint(equalTo: replyField.centerYAnchor),
            sendButton.trailingAnchor.constraint(equalTo: replyRow.trailingAnchor),
            sendButton.centerYAnchor.constraint(equalTo: replyRow.centerYAnchor),
            sendButton.widthAnchor.constraint(equalToConstant: 28),
            sendButton.heightAnchor.constraint(equalToConstant: 28),
        ])
        for button in reactionButtons {
            button.widthAnchor.constraint(lessThanOrEqualToConstant: 60).isActive = true
        }
    }

    // MARK: Content

    func setHeader(name: String, line: String?, time: String, avatar: UIImage?) {
        nameLabel.text = name
        lineLabel.text = line
        lineLabel.isHidden = (line ?? "").isEmpty
        timeLabel.text = time
        avatarView.image = avatar
    }

    func setHeaderLine(_ line: String?) {
        lineLabel.text = line
        lineLabel.isHidden = (line ?? "").isEmpty
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
        bubbles.addArrangedSubview(bubble(message, strings: DescallNotifyStrings(lang: .tr)))
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
        box.layer.cornerRadius = 12
        box.backgroundColor = message.mine ? Self.accent : Self.incomingFill
        row.addSubview(box)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 1
        stack.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(stack)
        if !message.mine, showsSenderNames, !message.fromName.isEmpty {
            let name = UILabel()
            name.font = .systemFont(ofSize: 10, weight: .medium)
            name.textColor = .secondaryLabel
            name.text = message.fromName
            stack.addArrangedSubview(name)
        }
        let text = UILabel()
        text.font = .systemFont(ofSize: 13)
        text.numberOfLines = 3
        text.textColor = message.mine ? .white : .label
        text.text = message.display(strings)
        stack.addArrangedSubview(text)

        NSLayoutConstraint.activate([
            box.topAnchor.constraint(equalTo: row.topAnchor),
            box.bottomAnchor.constraint(equalTo: row.bottomAnchor),
            box.widthAnchor.constraint(lessThanOrEqualTo: row.widthAnchor, multiplier: 0.72),
            stack.topAnchor.constraint(equalTo: box.topAnchor, constant: 6),
            stack.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -6),
            stack.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 10),
            stack.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -10),
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
        send.setImage(UIImage(systemName: "paperplane.fill"), for: .normal)
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
