import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { OPEN_FORWARD_EVENT } from "../../lib/forwardMessage";
import { useToast } from "../../context/ToastContext";
import { useT } from "../../context/LocaleContext";

// Sheets load on first use (messaging phase 4): none of this is in the first paint.
const ForwardSheet = lazy(() => import("./ForwardSheet.jsx"));

/**
 * App-level host for the messaging phase 4 sheets. Message menus and
 * keyboard shortcuts open them with window events, so the deep bubble tree
 * needs no new props. A sheet stays mounted after it closes so its exit
 * spring can play.
 */
export default function ChatSheetsHost({ getSocket, friends, groups, activeServer }) {
  const t = useT();
  const { toast } = useToast();
  const [forward, setForward] = useState({ open: false, message: null });

  useEffect(() => {
    const onForward = (e) => {
      const message = e?.detail?.message;
      if (message) setForward({ open: true, message });
    };
    window.addEventListener(OPEN_FORWARD_EVENT, onForward);
    return () => window.removeEventListener(OPEN_FORWARD_EVENT, onForward);
  }, []);

  const channels = useMemo(() => {
    if (!activeServer?.id) return [];
    return (activeServer.channels || [])
      .filter((c) => c && c.type === "text")
      .map((c) => ({ id: c.id, name: c.name, serverId: activeServer.id, serverName: activeServer.name }));
  }, [activeServer]);

  return (
    <Suspense fallback={null}>
      {forward.message ? (
        <ForwardSheet
          open={forward.open}
          message={forward.message}
          friends={friends}
          groups={groups}
          channels={channels}
          emit={(event, data) => getSocket?.()?.emit(event, data)}
          onClose={() => setForward((f) => ({ ...f, open: false }))}
          onDone={(count) => toast(t("msg4.forward.done", { count }), "success")}
        />
      ) : null}
    </Suspense>
  );
}
