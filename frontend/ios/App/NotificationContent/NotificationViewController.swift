import UIKit
import UserNotifications
import UserNotificationsUI

/// 3.0.0 (A4, mockup 28): long-press view of a MESSAGE notification. Last
/// messages, five quick reactions and a reply field; "Okundu olarak işaretle"
/// and "1 saat sessize al" run here without opening the app, "Sohbeti aç"
/// opens the chat. All network calls use the scoped notification token.
final class NotificationViewController: UIViewController, UNNotificationContentExtension {
    private let threadView = DescallNotifyThreadView()
    private let replyBar = DescallNotifyReplyBar(frame: .zero)
    private var payload: DescallNotifyPayload?
    private var receivedAt = Date()
    private let strings = DescallNotifyStrings(lang: DescallNotifyLang.current())
    private var replying = false

    override func viewDidLoad() {
        super.viewDidLoad()
        threadView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(threadView)
        NSLayoutConstraint.activate([
            threadView.topAnchor.constraint(equalTo: view.topAnchor),
            threadView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            threadView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            threadView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        threadView.onReact = { [weak self] emoji in self?.react(emoji) }
        threadView.onReplyTap = { [weak self] in self?.beginReply() }
        replyBar.onSend = { [weak self] text in self?.sendReply(text) }
    }

    // MARK: Keyboard (the reply bar rides on the keyboard)

    override var canBecomeFirstResponder: Bool { replying }
    override var inputAccessoryView: UIView? { replying ? replyBar : nil }

    private func beginReply() {
        guard payload != nil else { return }
        replying = true
        replyBar.field.placeholder = threadView.accessibilityHint
        becomeFirstResponder()
        DispatchQueue.main.async { self.replyBar.field.becomeFirstResponder() }
    }

    private func endReply() {
        replyBar.field.resignFirstResponder()
        resignFirstResponder()
        replying = false
    }

    // MARK: UNNotificationContentExtension

    func didReceive(_ notification: UNNotification) {
        receivedAt = notification.date
        let content = notification.request.content
        guard let payload = DescallNotifyPayload(userInfo: content.userInfo) else {
            threadView.setHeader(name: content.title, line: content.subtitle, time: strings.now, avatar: nil)
            threadView.setMessages([.init(id: "", fromName: "", text: content.body, mine: false)], strings: strings, senderNames: false)
            resize()
            return
        }
        self.payload = payload
        let name = payload.senderName.isEmpty ? content.title : payload.senderName
        let placeholder = strings.replyPlaceholder(to: payload.conversationTitle)
        threadView.setReplyPlaceholder(placeholder)
        threadView.accessibilityHint = placeholder
        threadView.setHeader(
            name: name,
            line: DescallNotifyThread.headerLine(payload: payload, memberCount: nil, strings: strings),
            time: strings.relative(seconds: Date().timeIntervalSince(receivedAt)),
            avatar: DescallNotifyImages.letterAvatar(name: name, seed: payload.senderId)
        )
        if let url = payload.senderAvatar {
            DescallNotifyImages.avatar(url) { [weak self] data in
                guard let data, let image = UIImage(data: data) else { return }
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.threadView.setHeader(
                        name: name,
                        line: DescallNotifyThread.headerLine(payload: payload, memberCount: self.memberCount, strings: self.strings),
                        time: self.strings.relative(seconds: Date().timeIntervalSince(self.receivedAt)),
                        avatar: image
                    )
                }
            }
        }
        // What the push already carries, until the thread loads.
        threadView.setMessages(
            [.init(id: payload.messageId ?? "", fromName: name, text: content.body, mine: false)],
            strings: strings,
            senderNames: payload.kind != .dm
        )
        resize()
        loadThread(name: name)
    }

    private var memberCount: Int?

    private func loadThread(name: String) {
        guard let payload else { return }
        guard let api = DescallNotifyAPI() else {
            threadView.setStatus(strings.signedOut)
            resize()
            return
        }
        api.thread(conversation: payload.conversation, messageId: payload.messageId) { [weak self] result in
            guard let self, case .success(let json) = result, let thread = DescallNotifyThread(json: json) else { return }
            self.memberCount = thread.memberCount
            if !thread.messages.isEmpty {
                self.threadView.setMessages(thread.messages, strings: self.strings, senderNames: payload.kind != .dm)
            }
            if let count = thread.memberCount, payload.kind == .group {
                self.threadView.setHeaderLine(DescallNotifyThread.headerLine(payload: payload, memberCount: count, strings: self.strings))
            }
            self.resize()
        }
    }

    func didReceive(_ response: UNNotificationResponse, completionHandler completion: @escaping (UNNotificationContentExtensionResponseOption) -> Void) {
        guard let payload else {
            completion(.dismissAndForwardAction)
            return
        }
        switch response.actionIdentifier {
        case DescallNotify.Action.read:
            guard let api = DescallNotifyAPI() else {
                completion(.dismissAndForwardAction)
                return
            }
            api.markRead(conversation: payload.conversation) { _ in
                Self.removeDelivered(thread: payload.conversation)
                completion(.dismiss)
            }
        case DescallNotify.Action.mute:
            DescallNotifyDefaults.muteForAnHour(payload.conversation)
            completion(.dismiss)
        default:
            completion(.dismissAndForwardAction)
        }
    }

    static func removeDelivered(thread: String) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { notes in
            let ids = notes.filter { $0.request.content.threadIdentifier == thread }.map(\.request.identifier)
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
    }

    // MARK: Quick actions

    private func react(_ emoji: String) {
        guard let payload, let messageId = payload.messageId else { return }
        guard let api = DescallNotifyAPI() else {
            threadView.setStatus(strings.signedOut)
            resize()
            return
        }
        threadView.setSelectedReaction(emoji)
        threadView.setBusy(true)
        api.react(conversation: payload.conversation, messageId: messageId, emoji: emoji) { [weak self] result in
            guard let self else { return }
            self.threadView.setBusy(false)
            switch result {
            case .success:
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    self.extensionContext?.dismissNotificationContentExtension()
                }
            case .failure:
                self.threadView.setSelectedReaction(nil)
                self.threadView.setStatus(self.strings.sendFailed)
                self.resize()
            }
        }
    }

    private func sendReply(_ text: String) {
        guard let payload else { return }
        guard let api = DescallNotifyAPI() else {
            endReply()
            threadView.setStatus(strings.signedOut)
            resize()
            return
        }
        threadView.setBusy(true)
        api.reply(conversation: payload.conversation, text: text) { [weak self] result in
            guard let self else { return }
            self.threadView.setBusy(false)
            switch result {
            case .success:
                self.replyBar.field.text = ""
                self.endReply()
                self.threadView.appendMine(text)
                self.resize()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    self.extensionContext?.dismissNotificationContentExtension()
                }
            case .failure:
                self.threadView.setStatus(self.strings.sendFailed)
                self.resize()
            }
        }
    }

    private func resize() {
        let width = view.bounds.width > 0 ? view.bounds.width : UIScreen.main.bounds.width - 16
        let size = threadView.systemLayoutSizeFitting(
            CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required,
            verticalFittingPriority: .fittingSizeLevel
        )
        preferredContentSize = CGSize(width: width, height: ceil(size.height))
    }
}
