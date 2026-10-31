import UIKit
import Capacitor
import UserNotifications
import Intents

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        registerNotificationCategories()
        // PushKit + CallKit must exist before the first VoIP push is delivered,
        // which can be right after a background launch, before any web JS runs.
        DescallCallManager.shared.start()
        // 3.7.17: the Apple Watch app asks the API through this phone's session.
        DescallWatchBridge.shared.start()
        return true
    }

    /// INCOMING_CALL: Accept / Decline match the action ids handled by nativePush.js.
    /// MESSAGE (3.0.0, A4): rich message notifications. The content extension
    /// draws the thread, reactions and reply field; these are the menu actions
    /// under it. Lock-screen previews follow the iOS setting only.
    private func registerNotificationCategories() {
        let accept = UNNotificationAction(identifier: "accept", title: "Accept", options: [.foreground])
        let decline = UNNotificationAction(identifier: "decline", title: "Decline", options: [.destructive, .foreground])
        let call = UNNotificationCategory(
            identifier: DescallNotify.callCategory,
            actions: [accept, decline],
            intentIdentifiers: [],
            options: []
        )
        let strings = DescallNotifyStrings(lang: DescallNotifyLang.current())
        let actions: [UNNotificationAction]
        if #available(iOS 15.0, *) {
            actions = [
                UNNotificationAction(identifier: DescallNotify.Action.read, title: strings.markRead, options: [],
                                     icon: UNNotificationActionIcon(templateImageName: "NotifyRead")),
                UNNotificationAction(identifier: DescallNotify.Action.mute, title: strings.mute, options: [],
                                     icon: UNNotificationActionIcon(systemImageName: "bell.slash")),
                UNNotificationAction(identifier: DescallNotify.Action.open, title: strings.openChat, options: [.foreground],
                                     icon: UNNotificationActionIcon(systemImageName: "message")),
            ]
        } else {
            actions = [
                UNNotificationAction(identifier: DescallNotify.Action.read, title: strings.markRead, options: []),
                UNNotificationAction(identifier: DescallNotify.Action.mute, title: strings.mute, options: []),
                UNNotificationAction(identifier: DescallNotify.Action.open, title: strings.openChat, options: [.foreground]),
            ]
        }
        let message = UNNotificationCategory(
            identifier: DescallNotify.messageCategory,
            actions: actions,
            intentIdentifiers: [INSendMessageIntentIdentifier],
            hiddenPreviewsBodyPlaceholder: strings.hiddenPreview,
            categorySummaryFormat: strings.summaryFormat,
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([call, message])
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
