import AVFoundation
import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Shared items in the extension: copied out of the item providers into the App Group inbox
/// (streamed by the system, never read into memory), thumbnails and exact sizes per quality
/// with ImageIO (downsampled decode: a 48 MP photo never becomes a full bitmap), and the file
/// that really goes up:
///  - images: high = 2560 px JPEG 0.82, saver = 1280 px JPEG 0.70, original = full size
///    (HEIC becomes JPEG 0.92: the upload takes JPEG / PNG / WebP / GIF). "Konum bilgisini
///    kaldır" drops GPS (kCGImageMetadataShouldExcludeGPS) and the camera owner / serial tags.
///  - videos: AVAssetExportSession to MP4 (original = passthrough, high = 1080p, saver = 720p),
///    location metadata removed with AVMetadataItemFilter.forSharing().
///  - files: as they are.
enum ShareMedia {
    static let thumbEdge: CGFloat = 240

    // MARK: Loading

    static func load(_ items: [NSExtensionItem], inbox: URL) async -> [ShareInputItem] {
        var out: [ShareInputItem] = []
        var n = 0
        for ext in items {
            for provider in ext.attachments ?? [] {
                if out.filter({ $0.isUpload }).count >= ShareRules.maxItems + 2 { break }
                if let item = await loadOne(provider, index: n, inbox: inbox, title: ext.attributedContentText?.string) {
                    out.append(item)
                    n += 1
                }
            }
        }
        // A web page shared from Safari often comes with its title as text: keep one link.
        if out.contains(where: { $0.kind == "link" }) { out.removeAll { $0.kind == "text" && ($0.text ?? "").count < 200 } }
        return out
    }

    static func loadOne(_ p: NSItemProvider, index: Int, inbox: URL, title: String?) async -> ShareInputItem? {
        let types: [UTType] = [.movie, .image, .pdf, .data]
        if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) && !p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            if let url = await loadURL(p), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" {
                return ShareInputItem(id: "l\(index)", kind: "link", url: url.absoluteString, title: title)
            }
        }
        for t in types where p.hasItemConformingToTypeIdentifier(t.identifier) {
            if let item = await loadFile(p, type: t, index: index, inbox: inbox) { return item }
        }
        if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier), let text = await loadText(p), !text.isEmpty {
            if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), !text.contains(" ") {
                return ShareInputItem(id: "l\(index)", kind: "link", url: url.absoluteString, title: title)
            }
            return ShareInputItem(id: "t\(index)", kind: "text", text: String(text.prefix(ShareRules.maxText)))
        }
        return nil
    }

    static func loadURL(_ p: NSItemProvider) async -> URL? {
        await withCheckedContinuation { c in
            p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { obj, _ in
                c.resume(returning: (obj as? URL) ?? (obj as? NSURL).map { $0 as URL } ?? (obj as? String).flatMap(URL.init(string:)))
            }
        }
    }

    static func loadText(_ p: NSItemProvider) async -> String? {
        await withCheckedContinuation { c in
            p.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { obj, _ in
                c.resume(returning: (obj as? String) ?? (obj as? NSAttributedString)?.string)
            }
        }
    }

    /// Copies the provider's file representation (valid only inside the callback) to the inbox.
    static func loadFile(_ p: NSItemProvider, type: UTType, index: Int, inbox: URL) async -> ShareInputItem? {
        await withCheckedContinuation { c in
            _ = p.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                guard let url else { return c.resume(returning: nil) }
                let name = sanitize(p.suggestedName.map { n in url.pathExtension.isEmpty || n.hasSuffix(".\(url.pathExtension)") ? n : "\(n).\(url.pathExtension)" } ?? url.lastPathComponent)
                let dst = inbox.appendingPathComponent("\(index)-\(name)")
                try? FileManager.default.removeItem(at: dst)
                do {
                    try FileManager.default.copyItem(at: url, to: dst)
                } catch {
                    return c.resume(returning: nil)
                }
                let ut = UTType(filenameExtension: dst.pathExtension) ?? type
                let mime = ut.preferredMIMEType ?? (type == .pdf ? "application/pdf" : "application/octet-stream")
                let kind = ut.conforms(to: .image) ? "image" : (ut.conforms(to: .movie) ? "video" : "file")
                let size = Int64((try? dst.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
                c.resume(returning: ShareInputItem(id: "a\(index)", kind: kind, mime: mime.lowercased(), name: name, size: size,
                                                   path: ShareTransport.relative(dst), estimates: ["original": size]))
            }
        }
    }

    static func sanitize(_ name: String) -> String {
        let bad = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
        let s = String(name.unicodeScalars.map { bad.contains($0) ? "_" : Character($0) })
        return s.isEmpty ? "file" : String(s.suffix(120))
    }

    // MARK: Thumbnails and sizes

    static func source(_ url: URL) -> CGImageSource? {
        CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary)
    }

    static func downsampled(_ url: URL, maxEdge: CGFloat) -> CGImage? {
        guard let src = source(url) else { return nil }
        var opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        if maxEdge > 0 {
            opts[kCGImageSourceThumbnailMaxPixelSize] = maxEdge
        } else if let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] {
            let w = (props[kCGImagePropertyPixelWidth] as? CGFloat) ?? 4096
            let h = (props[kCGImagePropertyPixelHeight] as? CGFloat) ?? 4096
            opts[kCGImageSourceThumbnailMaxPixelSize] = max(w, h)
        }
        return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }

    static func thumbnail(_ item: ShareInputItem) async -> UIImage? {
        guard let rel = item.path else { return nil }
        let url = ShareTransport.url(forRelative: rel)
        if item.kind == "image" {
            return autoreleasepool { downsampled(url, maxEdge: thumbEdge * 3).map { UIImage(cgImage: $0) } }
        }
        if item.kind == "video" {
            let gen = AVAssetImageGenerator(asset: AVURLAsset(url: url))
            gen.appliesPreferredTrackTransform = true
            gen.maximumSize = CGSize(width: thumbEdge * 2, height: thumbEdge * 2)
            return await withCheckedContinuation { c in
                gen.generateCGImagesAsynchronously(forTimes: [NSValue(time: .zero)]) { _, img, _, _, _ in
                    c.resume(returning: img.map { UIImage(cgImage: $0) })
                }
            }
        }
        return nil
    }

    static func hasAlpha(_ img: CGImage) -> Bool {
        switch img.alphaInfo {
        case .first, .last, .premultipliedFirst, .premultipliedLast: return true
        default: return false
        }
    }

    /// JPEG (or PNG for transparent images) at a size, written to `dst` (or only measured).
    @discardableResult
    static func encode(_ url: URL, quality: String, strip: Bool, to dst: URL?) -> (bytes: Int64, png: Bool)? {
        autoreleasepool {
            let spec = ShareRules.spec(quality)
            guard let img = downsampled(url, maxEdge: CGFloat(spec.maxEdge)) else { return nil }
            let png = hasAlpha(img)
            let data = NSMutableData()
            let type = (png ? UTType.png : UTType.jpeg).identifier as CFString
            guard let dest = CGImageDestinationCreateWithData(data as CFMutableData, type, 1, nil) else { return nil }
            var props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: spec.jpeg]
            // Re-encoded images keep no metadata at all unless location is kept on purpose.
            if !strip, let src = source(url), let meta = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any], let gps = meta[kCGImagePropertyGPSDictionary] {
                props[kCGImagePropertyGPSDictionary] = gps
            }
            CGImageDestinationAddImage(dest, img, props as CFDictionary)
            guard CGImageDestinationFinalize(dest) else { return nil }
            if let dst { guard (try? (data as Data).write(to: dst, options: [.atomic])) != nil else { return nil } }
            return (Int64(data.length), png)
        }
    }

    static let uploadableImages: Set<String> = ["image/jpeg", "image/png", "image/webp", "image/gif"]

    /// Exact bytes per quality (images) or an estimate from the duration (videos).
    static func estimates(_ item: ShareInputItem) async -> [String: Int64] {
        guard let rel = item.path else { return item.estimates }
        let url = ShareTransport.url(forRelative: rel)
        var e = item.estimates
        let original = item.size
        if item.kind == "image" {
            if item.mime == "image/gif" { return ["original": original, "high": original, "saver": original] }
            if !uploadableImages.contains(item.mime) { e["original"] = encode(url, quality: "original", strip: true, to: nil)?.bytes ?? original }
            e["high"] = encode(url, quality: "high", strip: true, to: nil)?.bytes ?? original
            e["saver"] = encode(url, quality: "saver", strip: true, to: nil)?.bytes ?? original
        } else if item.kind == "video" {
            let secs = CMTimeGetSeconds(AVURLAsset(url: url).duration)
            let s = secs.isFinite && secs > 0 ? secs : 0
            e["high"] = min(original, Int64(s * 1_000_000))   // about 8 Mbit/s at 1080p
            e["saver"] = min(original, Int64(s * 450_000))    // about 3.6 Mbit/s at 720p
            if e["high"] == 0 { e["high"] = original }
            if e["saver"] == 0 { e["saver"] = original }
        }
        return e
    }

    static func durationMs(_ item: ShareInputItem) -> Int {
        guard item.kind == "video", let rel = item.path else { return 0 }
        let secs = CMTimeGetSeconds(AVURLAsset(url: ShareTransport.url(forRelative: rel)).duration)
        return secs.isFinite ? Int(secs * 1000) : 0
    }

    // MARK: The file that goes up

    /// → (relative path, mime, name) of the prepared upload for this quality.
    static func prepare(_ item: ShareInputItem, jobId: String, index: Int, quality: String, strip: Bool) async -> (path: String, mime: String, name: String)? {
        guard let rel = item.path else { return nil }
        let src = ShareTransport.url(forRelative: rel)
        let dir = ShareTransport.dir("files").appendingPathComponent(ShareTransport.safe(jobId), isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let base = (item.name as NSString).deletingPathExtension
        switch item.kind {
        case "image":
            if item.mime == "image/gif" { return (rel, item.mime, item.name) }
            if quality == "original" && uploadableImages.contains(item.mime) {
                guard strip else { return (rel, item.mime, item.name) }
                let dst = dir.appendingPathComponent("\(index)-\(ShareTransport.safe(base)).\(src.pathExtension)")
                if copyStrippingLocation(src, to: dst) { return (ShareTransport.relative(dst), item.mime, item.name) }
                return (rel, item.mime, item.name)
            }
            let tmp = dir.appendingPathComponent("\(index).img")
            guard let r = encode(src, quality: quality, strip: strip, to: tmp) else { return nil }
            let ext = r.png ? "png" : "jpg"
            let dst = dir.appendingPathComponent("\(index).\(ext)")
            try? FileManager.default.removeItem(at: dst)
            try? FileManager.default.moveItem(at: tmp, to: dst)
            return (ShareTransport.relative(dst), r.png ? "image/png" : "image/jpeg", "\(base).\(ext)")
        case "video":
            let dst = dir.appendingPathComponent("\(index).mp4")
            guard await exportVideo(src, quality: quality, strip: strip, to: dst) else { return nil }
            return (ShareTransport.relative(dst), "video/mp4", "\(base).mp4")
        default:
            return (rel, item.mime, item.name)
        }
    }

    /// Same pixels, no GPS / owner / serial metadata (no re-encode).
    static func copyStrippingLocation(_ src: URL, to dst: URL) -> Bool {
        guard let source = source(src), let type = CGImageSourceGetType(source),
              let dest = CGImageDestinationCreateWithURL(dst as CFURL, type, 1, nil) else { return false }
        let opts: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: true]
        var error: Unmanaged<CFError>?
        if CGImageDestinationCopyImageSource(dest, source, opts as CFDictionary, &error) { return true }
        return false
    }

    static func exportVideo(_ src: URL, quality: String, strip: Bool, to dst: URL) async -> Bool {
        let asset = AVURLAsset(url: src)
        let preset = quality == "saver" ? AVAssetExportPreset1280x720 : quality == "high" ? AVAssetExportPreset1920x1080 : AVAssetExportPresetPassthrough
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) ?? AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else { return false }
        try? FileManager.default.removeItem(at: dst)
        session.outputURL = dst
        session.outputFileType = session.supportedFileTypes.contains(.mp4) ? .mp4 : .mov
        session.shouldOptimizeForNetworkUse = true
        if strip { session.metadataItemFilter = AVMetadataItemFilter.forSharing() }
        return await withCheckedContinuation { c in
            session.exportAsynchronously {
                c.resume(returning: session.status == .completed)
            }
        }
    }
}
