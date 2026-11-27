/**
 * Where the "Başla panosu" plugs into the app shell. Each slot reads the onboarding context
 * and renders nothing (or its fallback) for accounts outside their first five days, so the
 * shell files only gain one line each. The screens are lazy: older accounts never download them.
 */
import { lazy, Suspense } from "react";
import { useOnboarding } from "./OnboardingContext";

const StartDashboard = lazy(() => import("./StartDashboard"));
const StartSidebar = lazy(() => import("./StartSidebar"));
const PhoneStart = lazy(() => import("./PhoneStart"));
const FriendsFinder = lazy(() => import("./FriendsCard").then((m) => ({ default: m.FriendsFinder })));
const JoinedBanner = lazy(() => import("./JoinedBanner"));

/** Desktop Chats home with nothing open: the dashboard instead of the empty state. */
export function OnbMainSlot({ isMobile, fallback = null }) {
  const o = useOnboarding();
  if (!o?.active || isMobile) return fallback;
  return (
    <Suspense fallback={fallback}>
      <StartDashboard />
    </Suspense>
  );
}

/** Chats list: the checklist block (desktop) or the phone dashboard above the conversations. */
export function OnbListSlot({ isMobile }) {
  const o = useOnboarding();
  if (!o?.inWindow || (!o.active && !o.hidden)) return null;
  if (isMobile && o.active) {
    return (
      <Suspense fallback={null}>
        <PhoneStart withTitle={false} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <StartSidebar />
    </Suspense>
  );
}

/** Friends tab on the phone: inviter, same invite, invite link. */
export function OnbFriendsSlot({ isMobile }) {
  const o = useOnboarding();
  if (!o?.active || !isMobile) return null;
  return (
    <Suspense fallback={null}>
      <FriendsFinder />
    </Suspense>
  );
}

/** Phone, inside a server channel right after "Katıl ve gönder" (desktop follows up in the panel). */
export function OnbJoinedSlot({ channelId }) {
  const o = useOnboarding();
  if (!o || !o.isMobile || o.send?.phase !== "sent" || !channelId || String(o.send.channelId) !== String(channelId)) return null;
  return (
    <Suspense fallback={null}>
      <JoinedBanner channelId={channelId} />
    </Suspense>
  );
}
