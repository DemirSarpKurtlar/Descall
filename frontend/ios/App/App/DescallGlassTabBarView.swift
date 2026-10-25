import UIKit

/// A real UIKit tab bar that floats over any view, for screens whose content is
/// not a UITabBarController (here: the Capacitor WKWebView).
///
/// On iOS 26 a UITabBar is drawn by the system in Liquid Glass, including the
/// press / drag lens that magnifies the selected item. That lens has no public
/// API of its own, so the only way to get Apple's lens is to host a real
/// UITabBar, which this view does. It knows nothing about Capacitor, so any
/// UIKit screen can reuse it:
///
///     let bar = DescallGlassTabBarView()
///     bar.onSelect = { id in ... }
///     bar.setItems([.init(id: "chat", title: "Sohbetler", symbol: "bubble.left.and.bubble.right")], selected: "chat")
///     bar.attach(to: someView)           // pinned to the bottom safe area
///
/// `onLayout` reports the height the bar occupies above the bottom edge
/// (bar + safe-area inset), so overlapping content can pad itself.
@available(iOS 26.0, *)
public final class DescallGlassTabBarView: UIView, UITabBarDelegate {
    public struct Item: Equatable {
        public let id: String
        public let title: String
        public let symbol: String
        public var badge: String?

        public init(id: String, title: String, symbol: String, badge: String? = nil) {
            self.id = id
            self.title = title
            self.symbol = symbol
            self.badge = badge
        }
    }

    public var onSelect: ((String) -> Void)?
    public var onLayout: ((CGFloat) -> Void)?

    public let tabBar = UITabBar()
    private(set) public var items: [Item] = []
    private var lastReportedHeight: CGFloat = -1

    public override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        tabBar.delegate = self
        // System glass, no custom background: iOS 26 renders the bar in Liquid
        // Glass with the selection lens. A custom appearance background would
        // replace the glass, so only the item colours are left to the system.
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        addSubview(tabBar)
        accessibilityIdentifier = "DescallGlassTabBar"
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// Pins the bar to the bottom of `host`, full width. UITabBar extends its
    /// own glass into the home-indicator area and keeps the items above it.
    /// Call `relayout()` from the host's layout pass (viewDidLayoutSubviews).
    public func attach(to host: UIView) {
        if superview !== host {
            removeFromSuperview()
            translatesAutoresizingMaskIntoConstraints = true
            autoresizingMask = [.flexibleWidth, .flexibleTopMargin]
            host.addSubview(self)
        }
        host.bringSubviewToFront(self)
        relayout()
    }

    /// Height comes from UITabBar itself (sizeThatFits adds the bottom safe
    /// area once it is in a window), so the bar matches the system one.
    public func relayout() {
        guard let host = superview else { return }
        let width = host.bounds.width
        var height = tabBar.sizeThatFits(CGSize(width: width, height: 0)).height
        let safeBottom = host.safeAreaInsets.bottom
        if height < 44 { height = 49 }
        if window != nil, height < safeBottom + 44 { height += safeBottom }
        frame = CGRect(x: 0, y: host.bounds.height - height, width: width, height: height)
        tabBar.frame = bounds
        reportHeight()
    }

    private func reportHeight() {
        let height = isHidden || superview == nil ? 0 : bounds.height
        if abs(height - lastReportedHeight) > 0.5 {
            lastReportedHeight = height
            onLayout?(height)
        }
    }

    /// Replaces the tabs (only when they changed, so the lens is not reset) and
    /// selects `selected`. Unknown `selected` leaves nothing selected.
    public func setItems(_ newItems: [Item], selected: String?) {
        if newItems.map({ [$0.id, $0.title, $0.symbol] }) != items.map({ [$0.id, $0.title, $0.symbol] }) {
            tabBar.setItems(newItems.enumerated().map { index, item in
                let tab = UITabBarItem(title: item.title, image: UIImage(systemName: item.symbol), tag: index)
                tab.accessibilityIdentifier = "tab-\(item.id)"
                return tab
            }, animated: false)
        }
        items = newItems
        applyBadges()
        select(selected)
    }

    public func select(_ id: String?) {
        guard let id, let index = items.firstIndex(where: { $0.id == id }),
              let tab = tabBar.items?[index] else {
            tabBar.selectedItem = nil
            return
        }
        if tabBar.selectedItem !== tab { tabBar.selectedItem = tab }
    }

    /// `badges[id]`: nil / "" / "0" clears, anything else is shown as is.
    public func setBadges(_ badges: [String: String?]) {
        for (id, value) in badges {
            if let index = items.firstIndex(where: { $0.id == id }) { items[index].badge = value }
        }
        applyBadges()
    }

    private func applyBadges() {
        guard let tabs = tabBar.items else { return }
        for (index, item) in items.enumerated() where index < tabs.count {
            let value = item.badge.flatMap { $0.isEmpty || $0 == "0" ? nil : $0 }
            if tabs[index].badgeValue != value { tabs[index].badgeValue = value }
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.tag >= 0, item.tag < items.count else { return }
        onSelect?(items[item.tag].id)
    }

    public override var isHidden: Bool {
        didSet { if oldValue != isHidden { reportHeight() } }
    }
}

/// Reusable Liquid Glass surface with Apple's interactive press response
/// (UIGlassEffect.isInteractive), for custom controls that are not bars.
@available(iOS 26.0, *)
public final class DescallGlassSurface: UIVisualEffectView {
    public init(interactive: Bool = true, tint: UIColor? = nil) {
        let glass = UIGlassEffect(style: .regular)
        glass.isInteractive = interactive
        glass.tintColor = tint
        super.init(effect: glass)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
}
