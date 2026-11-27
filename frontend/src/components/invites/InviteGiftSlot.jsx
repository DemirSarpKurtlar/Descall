/**
 * Davet Merkezi gift progress inside the Başla panosu's inviter corner (growth 2A, embedded
 * per the owner's decision): the invited friend's "Hediyen" card (50 D + Davetli badge,
 * three steps), under the corner's greeting. Renders nothing for accounts that did not come
 * with a personal invite link, or once the gift is settled for a while.
 */
import { useEffect, useState } from "react";
import { getInviteWelcome } from "../../api/invites.js";
import { INVITES_UPDATE_EVENT } from "../../lib/inviteShare.js";
import { InviteGiftCard } from "./InviteWelcome.jsx";
import "../../styles/invites.css";

export default function InviteGiftSlot({ compact = true }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      getInviteWelcome()
        .then((w) => live && setData(w))
        .catch(() => {});
    load();
    window.addEventListener(INVITES_UPDATE_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(INVITES_UPDATE_EVENT, load);
    };
  }, []);
  if (!data?.invited || !data.gift) return null;
  if (!["waiting_message", "waiting_return", "reviewing", "paid"].includes(data.gift.status)) return null;
  return (
    <div className="dvt-center dvt-giftslot" data-testid="dvt-gift-slot">
      <InviteGiftCard data={data} compact={compact} />
    </div>
  );
}
