/* Standalone server sheets: 01 create, 02 join, 17 rules gate, 20 leave alert, 21 delete, 22 owner leave. */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ActionSheet, AlertBox, Av, Btn, Field, Foot, FormPanel, Group, I, Large, Nav, NavText, PageStack, Row, Scroll, Sec, Sheet, Sq, Spinner } from "./kit";
import { Rich } from "./hubCore";
import { useSvh } from "./useSvh";
import { useHubMode } from "./useHubMode";
import Cropper from "./Cropper";
import { confirmNameMatches, countServerChannels, inviteCodeFromInput, rulesList } from "./hubData";
import { useToast } from "../../../context/ToastContext";
import { uploadFile } from "../../../api/media";
import { readFileAsDataUrl } from "../../../lib/cropImage";
import {
  acceptServerRules, discoverPublicServers, joinPublicServer, joinServerByInvite, joinServerByVanity, previewServerInvite, previewServerVanity,
} from "../../../api/servers";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const numFmt = (n, locale) => { try { return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US").format(n); } catch { return String(n); } };

/** iPhone sheet or iPad centred form, both with the same body. */
function Shell({ mode, onClose, phone = {}, pad = {}, label, children }) {
  if (mode === "tablet") return <FormPanel onClose={onClose} w={pad.w || 560} h={pad.h || 560} label={label}>{children}</FormPanel>;
  return <Sheet onClose={onClose} medium={Boolean(phone.medium)} h={phone.medium || undefined} label={label}>{children}</Sheet>;
}

/* ───────────────────────── 01 Sunucu oluştur ───────────────────────── */
export const CREATE_TEMPLATES = [
  { id: "gaming", ico: "game", c: "brand", t: "tplGaming", sub: "tplGamingSub" },
  { id: "friends", ico: "heart", c: "pink", t: "tplFriends", sub: "tplFriendsSub" },
  { id: "study", ico: "school", c: "teal", t: "tplSchool", sub: "tplSchoolSub" },
  { id: "community", ico: "globe", c: "green", t: "tplCommunity", sub: "tplCommunitySub" },
  { id: "default", ico: "sparkle", c: "gray", t: "tplBlank", sub: "tplBlankSub" },
];

export function CreateServerSheet({ mode, me, ownedCount = 0, maxOwned = 10, onClose, onCreate, onOpenJoin }) {
  const { s, f, locale, gen } = useSvh();
  const { toast } = useToast();
  const [step, setStep] = useState(null); // template id when on the details page
  const [dir, setDir] = useState(0);
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [crop, setCrop] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const canCreate = ownedCount < maxOwned;
  const tablet = mode === "tablet";
  const myName = me?.displayName || me?.username || "";
  const placeholder = myName ? f("serverNamePh", { name: locale === "tr" ? gen(myName) : myName }) : "";

  const pick = (id) => {
    if (!canCreate) { toast(f("ownedFull", { max: maxOwned }), "error"); return; }
    setDir(1); setStep(id);
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) { toast(s.imageType, "error"); return; }
    if (file.size > 8 * 1024 * 1024) { toast(s.imageSize, "error"); return; }
    if (file.type === "image/gif") { upload(file); return; }
    try { setCrop(await readFileAsDataUrl(file)); } catch { toast(s.failed, "error"); }
  };
  const upload = async (file) => {
    setCrop(null);
    setUploading(true);
    try {
      const up = await uploadFile(file);
      const url = up?.url || up?.mediaUrl;
      if (!url) throw new Error(s.failed);
      setIconUrl(url);
    } catch (err) {
      toast(err?.message || s.failed, "error");
    } finally {
      setUploading(false);
    }
  };
  const create = async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 2) { toast(s.nameTooShort, "error"); return; }
    if (busy) return;
    setBusy(true);
    try {
      await onCreate?.({ name: n, iconUrl: iconUrl || undefined, templateId: step, ...(step === "default" ? { starterLocale: locale } : null) });
      toast(s.created, "success");
      onClose?.();
    } catch (err) {
      toast(err?.message || s.failed, "error");
      setBusy(false);
    }
  };

  const pickPage = (
    <>
      <Nav left={<NavText onClick={onClose}>{s.cancel}</NavText>} />
      <Scroll form={tablet}>
        <Large style={{ marginTop: 0 }}>{s.createTitle}</Large>
        <Foot style={{ margin: "-6px 4px 6px", fontSize: 15 }}>{s.createIntro}</Foot>
        <Sec>{s.pickTemplate}</Sec>
        <Group>
          {CREATE_TEMPLATES.map((tp) => (
            <Row key={tp.id} ico={tp.ico} c={tp.c} t={s[tp.t]} sub={s[tp.sub]} chev onClick={() => pick(tp.id)} disabled={!canCreate} />
          ))}
        </Group>
        <Sec>{s.haveInvite}</Sec>
        <Group><Row ico="link" c="blue" t={s.joinServer} sub={s.joinServerSub} chev onClick={onOpenJoin} /></Group>
        <Foot>{canCreate ? f("ownedFoot", { n: ownedCount, max: maxOwned }) : f("ownedFull", { max: maxOwned })}</Foot>
      </Scroll>
    </>
  );
  const tpl = CREATE_TEMPLATES.find((x) => x.id === step);
  const detailsPage = tpl ? (
    <>
      <Nav left={<NavText onClick={() => { setDir(-1); setStep(null); }}><I n="chevl" s={20} w={2.4} /> {s.createTitle}</NavText>}
        title={s.createDetails} right={<NavText onClick={create} disabled={busy || uploading || name.trim().length < 2}>{s.create}</NavText>} />
      <Scroll form={tablet}>
        <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={onFile} />
        <div className="svh-hero" style={{ paddingTop: 8 }}>
          <button type="button" className="svh-tap" data-press-scale="0.96" onClick={() => fileRef.current?.click()} aria-label={iconUrl ? s.changeIcon : s.addIcon}
            style={{ position: "relative", borderRadius: 24 }}>
            {iconUrl
              ? <Sq server={{ iconUrl, name }} s={84} />
              : <span className="svh-sq" style={{ width: 84, height: 84, background: "rgba(255,255,255,.08)", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.22)", borderRadius: 24 }}>{uploading ? <Spinner /> : <I n="cam" s={30} />}</span>}
            <span style={{ position: "absolute", right: -4, bottom: -4, width: 28, height: 28, borderRadius: 14, background: "#587AF6", display: "grid", placeItems: "center", boxShadow: "0 0 0 3px rgba(20,21,32,.95)" }}><I n="plus" s={16} w={2.6} /></span>
          </button>
          <div className="m" style={{ marginTop: 4 }}>{s[tpl.t]}</div>
        </div>
        <Sec>{s.serverNameSec}</Sec>
        <Field value={name} onChange={setName} placeholder={placeholder || s.serverNameSec} autoFocus maxLength={100} onEnter={create} autoCapitalize="words" />
        <Foot>{s.createFoot}</Foot>
        <Btn style={{ marginTop: 22 }} onClick={create} disabled={busy || uploading || name.trim().length < 2}>{busy ? <Spinner /> : s.create}</Btn>
        {iconUrl ? <div style={{ textAlign: "center", marginTop: 14 }}><button type="button" className="svh-tap" style={{ color: "#8FA6FF", fontSize: 16 }} onClick={() => setIconUrl("")}>{s.removeIcon}</button></div> : null}
      </Scroll>
    </>
  ) : null;

  return (
    <>
      <Shell mode={mode} onClose={onClose} pad={{ w: 620, h: 720 }} label={s.createTitle}>
        <PageStack pages={tpl ? [{ key: "pick", node: pickPage }, { key: `d-${tpl.id}`, node: detailsPage }] : [{ key: "pick", node: pickPage }]} dir={dir} keepMounted />
      </Shell>
      <AnimatePresence>{crop ? <Cropper key="crop" src={crop} kind="icon" onCancel={() => setCrop(null)} onConfirm={upload} /> : null}</AnimatePresence>
    </>
  );
}

/* ───────────────────────── 02 Sunucuya katıl ───────────────────────── */
function validLabel(invite, s, f, now = Date.now()) {
  if (!invite?.expiresAt) return invite ? s.validForever : "";
  const ms = new Date(invite.expiresAt).getTime() - now;
  if (ms <= 0) return "";
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return f("validFor", { n: days });
  return f("validForHours", { n: Math.max(1, Math.round(ms / 3600000)) });
}

export function JoinServerSheet({ mode, initialCode = "", onClose, onJoined }) {
  const { s, f, locale } = useSvh();
  const { toast } = useToast();
  const tablet = mode === "tablet";
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState(null); // { kind, value, server, invite }
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discover, setDiscover] = useState(false);
  const [dir, setDir] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const parsed = inviteCodeFromInput(code);
    setError("");
    if (!parsed.value) { setPreview(null); setLooking(false); return undefined; }
    const my = ++seq.current;
    setLooking(true);
    const timer = setTimeout(async () => {
      const tryInvite = async () => { const r = await previewServerInvite(parsed.value); return { kind: "invite", value: parsed.value, server: r?.server, invite: r?.invite }; };
      const tryVanity = async () => { const r = await previewServerVanity(parsed.value); return { kind: "vanity", value: parsed.value, server: r?.server, invite: null }; };
      try {
        let res;
        if (parsed.kind === "vanity") res = await tryVanity();
        else if (parsed.kind === "either") { try { res = await tryInvite(); } catch { res = await tryVanity(); } }
        else res = await tryInvite();
        if (my !== seq.current) return;
        setPreview(res?.server ? res : null);
        if (!res?.server) setError(s.notFound);
      } catch {
        if (my !== seq.current) return;
        setPreview(null);
        setError(s.notFound);
      } finally {
        if (my === seq.current) setLooking(false);
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    if (!preview?.server || busy) return;
    if (preview.server.isMember) { onJoined?.(preview.server); onClose?.(); return; }
    setBusy(true);
    try {
      const r = preview.kind === "vanity" ? await joinServerByVanity(preview.value) : await joinServerByInvite(preview.value);
      toast(s.joined, "success");
      onJoined?.(r?.server || preview.server);
      onClose?.();
    } catch (err) {
      setError(err?.code === "BANNED" || err?.status === 403 ? (err?.message || s.banned) : err?.message || s.joinFailed);
      setBusy(false);
    }
  };

  const sv = preview?.server;
  const inviter = preview?.invite?.inviter;
  const inviterName = inviter ? inviter.displayName || inviter.username : "";
  const valid = preview?.invite ? validLabel(preview.invite, s, f) : "";
  const joinPage = (
    <>
      <Nav left={<NavText onClick={onClose}>{s.cancel}</NavText>} />
      <Scroll form={tablet}>
        <Large style={{ marginTop: 0 }}>{s.joinServer}</Large>
        <Sec first>{s.inviteLink}</Sec>
        <Field value={code} onChange={setCode} placeholder={s.invitePh} autoFocus label={s.inviteLink} inputMode="url" onEnter={join}
          right={looking ? <span style={{ marginLeft: "auto" }}><Spinner /></span> : null} />
        <Foot>{error ? <span style={{ color: "#FF6B63" }}>{error}</span> : f("inviteFoot", { code: "K7QM2XRD" })}</Foot>
        {sv ? (
          <>
            <div className="svh-group" style={{ marginTop: 18, padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
              <Sq server={sv} s={58} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sv.name}</div>
                <div style={{ fontSize: 13.5, color: "rgba(235,238,255,.55)", marginTop: 3 }}>
                  {f("listMetaNoOnline", { members: numFmt(sv.memberCount || 1, locale) })}
                  {sv.onlineCount != null ? <> · <span style={{ color: "#30D158" }}>●</span> {f("onlineCount", { n: numFmt(sv.onlineCount, locale) })}</> : null}
                </div>
                {sv.description ? <div style={{ fontSize: 13.5, color: "rgba(235,238,255,.7)", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sv.description}</div> : null}
              </div>
            </div>
            {inviterName || valid ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 4px 0", fontSize: 13.5, color: "rgba(235,238,255,.55)" }}>
                {inviter ? <Av user={inviter} s={22} /> : null}
                <span>
                  {inviterName ? <Rich text={f("inviterLine", { name: inviterName })} bStyle={{ color: "#fff", fontWeight: 600 }} /> : null}
                  {inviterName && valid ? " · " : null}{valid}
                </span>
              </div>
            ) : null}
            <Btn style={{ marginTop: 24 }} onClick={join} disabled={busy}>{busy ? <Spinner /> : sv.isMember ? s.openServer : s.joinServer}</Btn>
          </>
        ) : !code.trim() ? (
          <Group style={{ marginTop: 18 }}>
            <Row ico="globe" c="green" t={s.discoverRow} sub={s.discoverSub} chev onClick={() => { setDir(1); setDiscover(true); }} />
          </Group>
        ) : null}
      </Scroll>
    </>
  );
  const discoverPage = discover ? (
    <DiscoverPage onBack={() => { setDir(-1); setDiscover(false); }} onJoined={(server) => { onJoined?.(server); onClose?.(); }} tablet={tablet} />
  ) : null;
  return (
    <Shell mode={mode} onClose={onClose} phone={{ medium: discover ? null : 560 }} pad={{ w: 560, h: discover ? 720 : 560 }} label={s.joinServer}>
      <PageStack pages={discover ? [{ key: "join", node: joinPage }, { key: "disc", node: discoverPage }] : [{ key: "join", node: joinPage }]} dir={dir} keepMounted />
    </Shell>
  );
}

function DiscoverPage({ onBack, onJoined, tablet }) {
  const { s, f, locale } = useSvh();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const r = await discoverPublicServers({ q: q.trim() || undefined, limit: 24 });
        if (live) setList(r?.servers || []);
      } catch (err) {
        if (live) { setList([]); toast(err?.message || s.failed, "error"); }
      }
    }, q ? 280 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const join = async (sv) => {
    if (busyId) return;
    if (sv.isMember) { onJoined?.(sv); return; }
    setBusyId(sv.id);
    try {
      const r = await joinPublicServer(sv.id);
      toast(s.joined, "success");
      onJoined?.(r?.server || sv);
    } catch (err) {
      toast(err?.message || s.joinFailed, "error");
      setBusyId(null);
    }
  };
  return (
    <>
      <Nav left={<NavText onClick={onBack}><I n="chevl" s={20} w={2.4} /> {s.joinServer}</NavText>} title={s.discoverTitle} />
      <Scroll form={tablet}>
        <Field value={q} onChange={setQ} placeholder={s.searchServers} icon="search" style={{ marginBottom: 8 }} />
        {list == null ? <div style={{ display: "grid", placeItems: "center", height: 120 }}><Spinner /></div> : list.length === 0 ? <Foot>{s.noPublic}</Foot> : (
          <Group>
            {list.map((sv) => (
              <Row key={sv.id} av={<Sq server={sv} s={40} />} t={sv.name} inset={66}
                sub={sv.description || f("listMetaNoOnline", { members: numFmt(sv.memberCount || 1, locale) })}
                tail={<Btn sm variant="gray" style={{ height: 30, fontSize: 14, padding: "0 14px", color: "#8FA6FF" }} onClick={() => join(sv)} disabled={busyId === sv.id}>{sv.isMember ? s.openServer : s.joinServer}</Btn>} />
            ))}
          </Group>
        )}
      </Scroll>
    </>
  );
}

/* ───────────────────────── 17 Kurallar kapısı ───────────────────────── */
export function RulesGateSheet({ mode, server, onAccepted, onClose }) {
  const { s, f, dat } = useSvh();
  const { toast } = useToast();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const rules = useMemo(() => rulesList(server?.rulesText), [server?.rulesText]);
  const tablet = mode === "tablet";
  const accept = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const r = await acceptServerRules(server.id);
      toast(s.rulesAccepted, "success");
      onAccepted?.(r?.rulesAcceptedAt || new Date().toISOString());
    } catch (err) {
      toast(err?.message || s.failed, "error");
      setBusy(false);
    }
  };
  const body = (
    <>
      <Nav style={tablet ? undefined : { height: 14 }} />
      <Scroll form={tablet}>
        <div className="svh-hero" style={{ paddingTop: 8 }}>
          <Sq server={server} s={70} />
          <div className="n" style={{ textAlign: "center" }}>{f("welcomeTo", { serverDat: dat(server?.name || "") })}</div>
          <div className="m" style={{ textAlign: "center", maxWidth: 300 }}>{s.gateMsg}</div>
        </div>
        <Sec>{s.serverRules}</Sec>
        <Group>
          {rules.map((r, i) => (
            <Row key={`${i}-${r}`} wrap inset={52} style={{ minHeight: 52 }} t={r}
              lead={<span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(88,122,246,.24)", color: "#8FA6FF", display: "grid", placeItems: "center", fontSize: 13.5, fontWeight: 700, flex: "none" }}>{i + 1}</span>} />
          ))}
        </Group>
        <button type="button" role="checkbox" aria-checked={ok} className="svh-tap" data-press-scale="0.98" onClick={() => setOk((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 6px", fontSize: 15, textAlign: "left", width: "calc(100% - 12px)" }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", flex: "none", transition: "background .15s", ...(ok ? { background: "#587AF6" } : { boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.35)" }) }}>
            {ok ? <I n="check" s={16} w={3} /> : null}
          </span>
          <span>{s.iAccept}</span>
        </button>
        <Btn onClick={accept} disabled={!ok || busy}>{busy ? <Spinner /> : s.acceptJoin}</Btn>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="svh-tap" style={{ color: "rgba(235,238,255,.5)", fontSize: 14 }} onClick={onClose}>{s.notNow}</button>
        </div>
      </Scroll>
    </>
  );
  if (tablet) return <FormPanel onClose={onClose} w={560} h={760} label={s.serverRules}>{body}</FormPanel>;
  return <Sheet onClose={onClose} label={s.serverRules}>{body}</Sheet>;
}

/* ───────────────────────── 20 / 22 Ayrıl ───────────────────────── */
export function LeaveAlert({ server, onCancel, onConfirm }) {
  const { s, f, abl } = useSvh();
  const [busy, setBusy] = useState(false);
  return (
    <AlertBox title={f("leaveTitle", { serverAbl: abl(server?.name || "") })} msg={s.leaveMsg} cancel={s.giveUp} confirm={s.leaveBtn} busy={busy}
      onCancel={onCancel}
      onConfirm={async () => { if (busy) return; setBusy(true); try { await onConfirm?.(); } finally { setBusy(false); } }} />
  );
}

export function OwnerLeaveSheet({ server, onCancel, onTransfer, onDelete }) {
  const { s, f, gen } = useSvh();
  return (
    <ActionSheet title={f("ownerSheetTitle", { serverGen: gen(server?.name || "") })} sub={s.ownerSheetSub} cancel={s.giveUp} onCancel={onCancel}
      actions={[{ t: s.delTransferFirst, onClick: onTransfer }, { t: s.ownerDelLeave, color: "#FF453A", onClick: onDelete }]} />
  );
}

/* ───────────────────────── 21 Sunucuyu sil ───────────────────────── */
export function DeleteServerSheet({ mode, server, onCancel, onConfirm, onTransfer }) {
  const { s, f } = useSvh();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = confirmNameMatches(name, server?.name);
  const tablet = mode === "tablet";
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await onConfirm?.(name.trim().replace(/\s+/g, " "));
    } catch (err) {
      toast(err?.message || s.failed, "error");
      setBusy(false);
    }
  };
  const body = (
    <>
      <Nav left={<NavText onClick={onCancel}>{s.giveUp}</NavText>} />
      <Scroll form={tablet}>
        <div className="svh-hero" style={{ paddingTop: 10 }}>
          <span className="svh-ico c-red" style={{ width: 64, height: 64, borderRadius: 20 }}><I n="trash" s={30} w={2} /></span>
          <div className="n" style={{ marginTop: 6, textAlign: "center" }}>{f("delTitle", { server: server?.name || "" })}</div>
          <div className="m" style={{ textAlign: "center", maxWidth: 320, lineHeight: 1.4 }}>{f("delMsg", { channels: countServerChannels(server), members: server?.memberCount || 1 })}</div>
        </div>
        <Sec>{s.delTypeName}</Sec>
        <Field value={name} onChange={setName} placeholder={server?.name} autoFocus onEnter={submit} label={s.delTypeName}
          right={ok ? <span style={{ marginLeft: "auto", color: "#30D158", display: "flex" }}><I n="check" s={18} w={2.6} /></span> : null} />
        <Btn variant="red" style={{ marginTop: 22 }} onClick={submit} disabled={!ok || busy}>{busy ? <Spinner /> : s.delBtn}</Btn>
        {onTransfer ? (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button type="button" className="svh-tap" style={{ color: "#8FA6FF", fontSize: 16 }} onClick={onTransfer}>{s.delTransferFirst}</button>
          </div>
        ) : null}
      </Scroll>
    </>
  );
  return <Shell mode={mode} onClose={onCancel} phone={{ medium: 540 }} pad={{ w: 540, h: 540 }} label={f("delTitle", { server: server?.name || "" })}>{body}</Shell>;
}

export { useHubMode };
