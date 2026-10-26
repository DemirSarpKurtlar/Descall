import UIKit

/// 3.0.0 (A4, native glass #07): the in-app notification capsule. A wide glass
/// capsule that drops in under the Dynamic Island (spring 1.0 / 0.35, blurred →
/// sharp), fades upward after 3 s, is thrown away with a swipe up (momentum),
/// expands when pulled down, and opens the chat on a double tap or "Mesaj".
/// Lives on top of the Capacitor web view, independent of the web layer.
final class DescallToastCapsule: UIView {
    enum Event: String { case tap, double, message, dismiss, timeout, expand }

    let args: DescallToast.Args
    var onEvent: ((Event) -> Void)?
    var onGone: (() -> Void)?

    private let shadowHost = UIView()
    private let surface: UIVisualEffectView
    private let tint = UIView()
    private let content = UIView()
    private let blurIn = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let avatarView = UIImageView()
    private let letterLabel = UILabel()
    private let dot = UIView()
    private let titleLabel = UILabel()
    private let subLabel = UILabel()
    private let pill = UIButton(type: .custom)
    private var widthConstraint: NSLayoutConstraint?
    private var heightConstraint: NSLayoutConstraint?
    private var timer: Timer?
    private var expanded = false
    private var leaving = false
    private var animator: UIViewPropertyAnimator?

    static let height: CGFloat = 58
    static let base = UIColor(red: 0.11, green: 0.12, blue: 0.17, alpha: 1)

    init(args: DescallToast.Args) {
        self.args = args
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .regular)
            glass.isInteractive = true
            glass.tintColor = UIColor(red: 0.08, green: 0.09, blue: 0.14, alpha: 0.62)
            surface = UIVisualEffectView(effect: glass)
        } else {
            surface = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark))
        }
        super.init(frame: .zero)
        overrideUserInterfaceStyle = .dark
        build()
    }

    required init?(coder: NSCoder) { return nil }

    // MARK: Build

    private func build() {
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .clear

        shadowHost.translatesAutoresizingMaskIntoConstraints = false
        shadowHost.layer.shadowColor = UIColor.black.cgColor
        shadowHost.layer.shadowOpacity = 0.38
        shadowHost.layer.shadowRadius = 18
        shadowHost.layer.shadowOffset = CGSize(width: 0, height: 8)
        addSubview(shadowHost)

        surface.translatesAutoresizingMaskIntoConstraints = false
        surface.clipsToBounds = true
        surface.layer.cornerCurve = .continuous
        surface.layer.borderWidth = 1
        surface.layer.borderColor = UIColor(white: 1, alpha: 0.13).cgColor
        shadowHost.addSubview(surface)
        if #unavailable(iOS 26.0) {
            tint.backgroundColor = UIColor(red: 0.08, green: 0.09, blue: 0.14, alpha: 0.55)
            tint.translatesAutoresizingMaskIntoConstraints = false
            surface.contentView.addSubview(tint)
            pin(tint, to: surface.contentView)
        }
        content.translatesAutoresizingMaskIntoConstraints = false
        surface.contentView.addSubview(content)
        pin(content, to: surface.contentView)

        // Avatar: photo, or the app's letter avatar (palette by user id).
        avatarView.translatesAutoresizingMaskIntoConstraints = false
        avatarView.layer.cornerRadius = 20.5
        avatarView.clipsToBounds = true
        avatarView.contentMode = .scaleAspectFill
        avatarView.backgroundColor = Self.color(args.colorHex)
        letterLabel.translatesAutoresizingMaskIntoConstraints = false
        letterLabel.text = args.letter
        letterLabel.textColor = .white
        letterLabel.textAlignment = .center
        letterLabel.font = .systemFont(ofSize: args.letter.count > 1 ? 15.5 : 18, weight: .semibold)
        avatarView.addSubview(letterLabel)
        content.addSubview(avatarView)

        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.backgroundColor = UIColor(red: 0.19, green: 0.82, blue: 0.35, alpha: 1)
        dot.layer.cornerRadius = 7
        dot.layer.borderWidth = 2.5
        dot.layer.borderColor = Self.base.cgColor
        dot.isHidden = !args.online
        content.addSubview(dot)

        titleLabel.text = args.title
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.lineBreakMode = .byTruncatingTail
        subLabel.text = args.sub
        subLabel.font = .systemFont(ofSize: 13.5)
        subLabel.textColor = UIColor(white: 1, alpha: 0.62)
        subLabel.lineBreakMode = .byTruncatingTail
        subLabel.isHidden = args.sub.isEmpty
        let texts = UIStackView(arrangedSubviews: [titleLabel, subLabel])
        texts.axis = .vertical
        texts.spacing = 1
        texts.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(texts)

        pill.translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 17, bottom: 0, trailing: 17)
        config.attributedTitle = AttributedString(args.action ?? "", attributes: AttributeContainer([
            .font: UIFont.systemFont(ofSize: 15, weight: .bold), .foregroundColor: UIColor.white,
        ]))
        pill.configuration = config
        pill.backgroundColor = UIColor(white: 1, alpha: 0.17)
        pill.layer.cornerRadius = 19.5
        pill.layer.cornerCurve = .continuous
        pill.layer.borderWidth = 1
        pill.layer.borderColor = UIColor(white: 1, alpha: 0.14).cgColor
        pill.isHidden = args.action == nil
        pill.addTarget(self, action: #selector(pillTapped), for: .touchUpInside)
        content.addSubview(pill)

        blurIn.translatesAutoresizingMaskIntoConstraints = false
        blurIn.isUserInteractionEnabled = false
        surface.contentView.addSubview(blurIn)
        pin(blurIn, to: surface.contentView)

        let width = shadowHost.widthAnchor.constraint(equalToConstant: 296)
        let height = shadowHost.heightAnchor.constraint(equalToConstant: Self.height)
        widthConstraint = width
        heightConstraint = height
        NSLayoutConstraint.activate([
            shadowHost.topAnchor.constraint(equalTo: topAnchor),
            shadowHost.bottomAnchor.constraint(equalTo: bottomAnchor),
            shadowHost.centerXAnchor.constraint(equalTo: centerXAnchor),
            shadowHost.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor),
            width, height,
            surface.topAnchor.constraint(equalTo: shadowHost.topAnchor),
            surface.bottomAnchor.constraint(equalTo: shadowHost.bottomAnchor),
            surface.leadingAnchor.constraint(equalTo: shadowHost.leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: shadowHost.trailingAnchor),

            avatarView.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 9),
            avatarView.topAnchor.constraint(equalTo: content.topAnchor, constant: 8.5),
            avatarView.widthAnchor.constraint(equalToConstant: 41),
            avatarView.heightAnchor.constraint(equalToConstant: 41),
            letterLabel.centerXAnchor.constraint(equalTo: avatarView.centerXAnchor),
            letterLabel.centerYAnchor.constraint(equalTo: avatarView.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 14),
            dot.heightAnchor.constraint(equalToConstant: 14),
            dot.trailingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 3),
            dot.bottomAnchor.constraint(equalTo: avatarView.bottomAnchor, constant: 2),

            texts.leadingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 11),
            texts.centerYAnchor.constraint(equalTo: avatarView.centerYAnchor),
            texts.trailingAnchor.constraint(lessThanOrEqualTo: pill.isHidden ? content.trailingAnchor : pill.leadingAnchor, constant: -10),

            pill.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -9),
            pill.centerYAnchor.constraint(equalTo: avatarView.centerYAnchor),
            pill.heightAnchor.constraint(equalToConstant: 39),
        ])
        pill.setContentCompressionResistancePriority(.required, for: .horizontal)
        // Labels keep their natural width (the stack is otherwise only as wide as
        // its widest *resistant* label and the title truncated); the pill wins
        // when space runs out.
        titleLabel.setContentCompressionResistancePriority(.defaultHigh - 1, for: .horizontal)
        subLabel.setContentCompressionResistancePriority(.defaultHigh - 2, for: .horizontal)

        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        shadowHost.addGestureRecognizer(pan)
        let double = UITapGestureRecognizer(target: self, action: #selector(doubleTapped))
        double.numberOfTapsRequired = 2
        shadowHost.addGestureRecognizer(double)
        let single = UITapGestureRecognizer(target: self, action: #selector(singleTapped))
        single.require(toFail: double)
        shadowHost.addGestureRecognizer(single)

        shadowHost.isAccessibilityElement = true
        shadowHost.accessibilityTraits = .button
        shadowHost.accessibilityLabel = [args.title, args.sub].filter { !$0.isEmpty }.joined(separator: ", ")
        if let action = args.action {
            shadowHost.accessibilityCustomActions = [UIAccessibilityCustomAction(name: action) { [weak self] _ in
                self?.pillTapped()
                return true
            }]
        }
    }

    private func pin(_ v: UIView, to host: UIView) {
        NSLayoutConstraint.activate([
            v.topAnchor.constraint(equalTo: host.topAnchor),
            v.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            v.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            v.trailingAnchor.constraint(equalTo: host.trailingAnchor),
        ])
    }

    static func color(_ hex: String) -> UIColor {
        let v = UInt32(hex.dropFirst(), radix: 16) ?? 0x2868FF
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    func setAvatar(_ image: UIImage?) {
        guard let image else { return }
        avatarView.image = image
        letterLabel.isHidden = true
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        surface.layer.cornerRadius = min(shadowHost.bounds.height / 2, expanded ? 26 : 999)
        shadowHost.layer.shadowPath = UIBezierPath(roundedRect: shadowHost.bounds, cornerRadius: surface.layer.cornerRadius).cgPath
    }

    // MARK: Placement + motion

    private var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    /// Wide capsule centred under the Dynamic Island (or the status bar).
    func attach(to host: UIView) {
        host.addSubview(self)
        let top = host.safeAreaInsets.top
        let y: CGFloat = top >= 44 ? top - 2 : top + 6
        widthConstraint?.constant = Self.width(for: host.bounds.width)
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: host.topAnchor, constant: y),
            leadingAnchor.constraint(equalTo: host.leadingAnchor, constant: 12),
            trailingAnchor.constraint(equalTo: host.trailingAnchor, constant: -12),
        ])
        host.layoutIfNeeded()
    }

    static func width(for hostWidth: CGFloat) -> CGFloat {
        min(380, max(min(280, hostWidth - 24), (hostWidth * 0.74).rounded()))
    }

    private func spring(velocity: CGVector = .zero) -> UIViewPropertyAnimator {
        let params = UISpringTimingParameters(mass: 1, stiffness: CGFloat(DescallToast.springStiffness),
                                              damping: CGFloat(DescallToast.springDamping), initialVelocity: velocity)
        return UIViewPropertyAnimator(duration: 0.6, timingParameters: params)
    }

    func present() {
        let voiceOver = UIAccessibility.isVoiceOverRunning
        if reduceMotion {
            blurIn.effect = nil
            alpha = 0
            UIView.animate(withDuration: 0.25) { self.alpha = 1 }
        } else {
            let lift = frame.maxY + 12
            shadowHost.transform = CGAffineTransform(translationX: 0, y: -lift).scaledBy(x: 0.96, y: 0.96)
            alpha = 0.4
            let a = spring()
            a.addAnimations {
                self.shadowHost.transform = .identity
                self.alpha = 1
                self.blurIn.effect = nil
            }
            a.startAnimation()
            animator = a
        }
        if voiceOver {
            UIAccessibility.post(notification: .announcement, argument: shadowHost.accessibilityLabel)
        }
        schedule(voiceOver ? max(args.duration, 8) : args.duration)
    }

    private func schedule(_ seconds: TimeInterval) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.leave(.timeout)
        }
    }

    /// Fades upward and goes away. `velocity` (pt/s, negative = up) keeps a throw's momentum.
    func leave(_ event: Event?, velocity: CGFloat = 0) {
        guard !leaving else { return }
        leaving = true
        timer?.invalidate()
        animator?.stopAnimation(true)
        if let event { onEvent?(event) }
        let finish: (Any) -> Void = { [weak self] _ in
            self?.removeFromSuperview()
            self?.onGone?()
        }
        if reduceMotion {
            UIView.animate(withDuration: 0.2, animations: { self.alpha = 0 }, completion: finish)
            return
        }
        let current = shadowHost.transform.ty
        let distance = frame.maxY + 20 + current
        let duration = DescallToast.throwDuration(distance: Double(distance), velocityY: Double(velocity))
        UIView.animate(withDuration: velocity < 0 ? duration : 0.32, delay: 0,
                       options: [velocity < 0 ? .curveLinear : .curveEaseIn, .beginFromCurrentState, .allowUserInteraction],
                       animations: {
                           let dy: CGFloat = velocity < 0 ? -distance : current - 22
                           self.shadowHost.transform = CGAffineTransform(translationX: 0, y: dy).scaledBy(x: 0.97, y: 0.97)
                           self.alpha = 0
                       }, completion: finish)
    }

    private func setExpanded() {
        guard !expanded else { return }
        expanded = true
        onEvent?(.expand)
        subLabel.numberOfLines = 3
        titleLabel.numberOfLines = 2
        heightConstraint?.isActive = false
        let grow = shadowHost.heightAnchor.constraint(greaterThanOrEqualToConstant: Self.height + 14)
        grow.isActive = true
        heightConstraint = grow
        if let host = superview {
            widthConstraint?.constant = min(host.bounds.width - 24, 420)
        }
        let bottom = content.bottomAnchor.constraint(greaterThanOrEqualTo: subLabel.bottomAnchor, constant: 12)
        bottom.isActive = true
        schedule(max(args.duration * 2, 6))
    }

    // MARK: Gestures

    @objc private func panned(_ g: UIPanGestureRecognizer) {
        guard !leaving, let host = superview else { return }
        let t = g.translation(in: host).y
        let v = g.velocity(in: host).y
        switch g.state {
        case .began:
            timer?.invalidate()
            animator?.stopAnimation(true)
        case .changed:
            let y = CGFloat(DescallToast.dragOffset(Double(t)))
            let s: CGFloat = y > 0 ? 1 + y / 500 : 1
            shadowHost.transform = CGAffineTransform(translationX: 0, y: y).scaledBy(x: s, y: s)
        case .ended, .cancelled, .failed:
            switch DescallToast.release(translationY: Double(t), velocityY: Double(v), expanded: expanded) {
            case .dismiss:
                leave(.dismiss, velocity: min(v, -900))
            case .expand:
                let a = spring(velocity: CGVector(dx: 0, dy: 0))
                a.addAnimations {
                    self.setExpanded()
                    self.shadowHost.transform = .identity
                    host.layoutIfNeeded()
                    self.setNeedsLayout()
                    self.layoutIfNeeded()
                }
                a.startAnimation()
                animator = a
            case .settle:
                let a = spring()
                a.addAnimations { self.shadowHost.transform = .identity }
                a.startAnimation()
                animator = a
                schedule(expanded ? max(args.duration * 2, 6) : args.duration)
            }
        default:
            break
        }
    }

    @objc private func singleTapped() {
        guard !leaving else { return }
        onEvent?(.tap)
        schedule(expanded ? max(args.duration * 2, 6) : args.duration)
    }

    @objc private func doubleTapped() {
        guard !leaving else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        leave(.double)
    }

    @objc private func pillTapped() {
        guard !leaving else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        leave(.message)
    }

    // Touches outside the capsule fall through to the web view.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        shadowHost.frame.contains(point)
    }
}
