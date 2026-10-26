import Intents
import UIKit
import UserNotifications

/// 3.0.0 (A4): rich message notifications.
///
/// - Communication Notification (INSendMessageIntent): the sender's photo
///   (or a letter avatar) with the small Descall badge; title = sender,
///   subtitle = "👥 group" / "# channel · server" (set by the backend).
/// - Photo / video messages get a thumbnail (≤ 10 MB, 8 s); on any failure the
///   text ("📷 Fotoğraf · …") is delivered unchanged.
/// - "1 saat sessize al" on this device: the alert arrives silently (passive).
/// - Calls never come through here (no mutable-content on call pushes).
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?
    private var delivered = false
    private let lock = NSLock()

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttempt = content
        guard let payload = DescallNotifyPayload(userInfo: content.userInfo) else {
            deliver(content)
            return
        }

        content.categoryIdentifier = DescallNotify.messageCategory
        if content.threadIdentifier.isEmpty { content.threadIdentifier = payload.conversation }
        content.summaryArgument = payload.conversationTitle
        if DescallNotifyDefaults.isMuted(payload.conversation) {
            content.sound = nil
            if #available(iOS 15.0, *) { content.interruptionLevel = .passive }
        }

        let group = DispatchGroup()
        var avatarData: Data?
        group.enter()
        DescallNotifyImages.avatar(payload.senderAvatar) { data in
            avatarData = data
            group.leave()
        }
        if let thumb = payload.mediaThumb {
            group.enter()
            Self.downloadAttachment(thumb, kind: payload.mediaKind) { attachment in
                if let attachment { content.attachments = [attachment] }
                group.leave()
            }
        }
        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            let final = Self.communicationContent(content, payload: payload, avatarData: avatarData) ?? content
            self.deliver(final)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        // Out of time: the plain text alert is the fallback.
        if let bestAttempt { deliver(bestAttempt) }
    }

    private func deliver(_ content: UNNotificationContent) {
        lock.lock()
        defer { lock.unlock() }
        guard !delivered, let handler = contentHandler else { return }
        delivered = true
        handler(content)
    }

    // MARK: Communication Notification

    static func communicationContent(_ content: UNMutableNotificationContent, payload: DescallNotifyPayload, avatarData: Data?) -> UNNotificationContent? {
        guard payload.communication, #available(iOS 15.0, *) else { return nil }
        let name = payload.senderName.isEmpty ? content.title : payload.senderName
        let imageData = avatarData ?? DescallNotifyImages.letterAvatar(name: name, seed: payload.senderId).pngData()
        let image = imageData.map { INImage(imageData: $0) }
        let handle = INPersonHandle(value: payload.senderId.isEmpty ? name : payload.senderId, type: .unknown)
        let sender = INPerson(
            personHandle: handle,
            nameComponents: nil,
            displayName: name,
            image: image,
            contactIdentifier: nil,
            customIdentifier: payload.senderId.isEmpty ? nil : payload.senderId
        )
        // One person to one reader keeps the sender as the title; the group /
        // channel stays on the subtitle line ("👥 Hafta Sonu Ekibi").
        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: nil,
            conversationIdentifier: payload.conversation,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )
        if let image { intent.setImage(image, forParameterNamed: \.sender) }
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)
        do {
            let updated = try content.updating(from: intent)
            guard let mutable = updated.mutableCopy() as? UNMutableNotificationContent else { return updated }
            // Keep what the backend wrote (subtitle, thread, category, sound).
            mutable.subtitle = content.subtitle
            mutable.threadIdentifier = content.threadIdentifier
            mutable.categoryIdentifier = content.categoryIdentifier
            mutable.summaryArgument = content.summaryArgument
            mutable.attachments = content.attachments
            mutable.sound = content.sound
            mutable.interruptionLevel = content.interruptionLevel
            return mutable
        } catch {
            return nil
        }
    }

    // MARK: Thumbnail

    static func downloadAttachment(_ url: URL, kind: String?, completion: @escaping (UNNotificationAttachment?) -> Void) {
        var request = URLRequest(url: url)
        request.timeoutInterval = DescallNotify.downloadTimeout
        URLSession.shared.downloadTask(with: request) { location, response, _ in
            guard let location,
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let ext = DescallNotifyMedia.fileExtension(mime: http.mimeType, url: url, kind: kind) else {
                completion(nil)
                return
            }
            let size = (try? FileManager.default.attributesOfItem(atPath: location.path)[.size] as? NSNumber)?.int64Value ?? 0
            guard DescallNotifyMedia.acceptable(byteCount: size) else {
                completion(nil)
                return
            }
            let target = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(ext)")
            do {
                try FileManager.default.moveItem(at: location, to: target)
                completion(try UNNotificationAttachment(identifier: "media", url: target, options: nil))
            } catch {
                completion(nil)
            }
        }.resume()
    }
}
