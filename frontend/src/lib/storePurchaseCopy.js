// Copy for the store purchase modal (approved mockups, 2026-10-19). The text lives in the
// i18n catalogs under `shop.buy` (i18n/locales/shop.*.js); this builds the helper object
// the modal and its previews read. Item names/descriptions come from shopItemI18n.js.
import { translate } from "../i18n/index.js";

const CATEGORIES = [
  "banner", "avatar_effect", "profile_background", "theme", "name_effect", "chat_bubble",
  "presence_flare", "profile_aura", "typing_flare", "reaction_burst", "call_overlay", "profile_color",
];
// Categories whose items come in a named series (sku infix) with their own meta line.
const SERIES = { name_effect: "-sigil-", chat_bubble: "-atelier-" };
const RARITIES = ["common", "rare", "epic", "legendary", "mythic"];
const LINES = ["ae", "bgAbout", "theme1", "theme2", "theme3", "name", "bub1", "bub2", "bub3", "ty1", "ty2", "rx", "today"];

/** "<b>12 DesCoin</b> more needed" -> ["", "12 DesCoin", " more needed"]. */
function splitBold(text) {
  const m = /^([\s\S]*?)<b>([\s\S]*?)<\/b>([\s\S]*)$/.exec(String(text || ""));
  return m ? [m[1], m[2], m[3]] : ["", "", String(text || "")];
}

export function purchaseCopy(locale) {
  const tt = (key, vars) => translate(locale, `shop.buy.${key}`, vars);
  const cat = {};
  for (const id of CATEGORIES) {
    const k = (f) => tt(`cat.${id}.${f}`);
    cat[id] = {
      eyebrow: k("eyebrow"),
      label: k("label"),
      noun: k("noun"),
      acc: k("acc"),
      foot: k("foot"),
      meta: (motion, item) => {
        const series = SERIES[id] && String(item?.sku || "").includes(SERIES[id]);
        return tt(`cat.${id}.${series ? "metaSeries" : "meta"}`, { motion });
      },
    };
  }
  const lines = Object.fromEntries(LINES.map((k) => [k, tt(`lines.${k}`)]));
  return {
    locale,
    cat,
    lines,
    animated: tt("animated"), still: tt("still"), owned: tt("owned"), live: tt("live"),
    rarity: Object.fromEntries(RARITIES.map((r) => [r, tt(`rarity.${r}`)])),
    looks: (label) => tt("looks", { label }),
    now: tt("now"), withThis: tt("withThis"), worn: tt("worn"),
    price: tt("price"), balance: tt("balance"), after: tt("after"), missing: tt("missing"), notEnough: tt("notEnough"),
    balanceValue: (balance) => tt("balanceValue", { balance }),
    paid: tt("paid"), prevBalance: tt("prevBalance"), newBalance: tt("newBalance"),
    wearNow: tt("wearNow"),
    wearSub: (current) => (current ? tt("wearSubCurrent", { current }) : tt("wearSubNone")),
    cancel: tt("cancel"), close: tt("close"),
    buyFor: (amount) => tt("buyFor", { amount }), buying: tt("buying"),
    /** [before, bold, after] */
    needMore: (amount) => splitBold(tt("needMore", { amount })),
    ready: (percent) => tt("ready", { percent }),
    daily: tt("daily"), invite: tt("invite"), talk: tt("talk"),
    shortBtn: (amount) => tt("shortBtn", { amount }),
    shortFoot: tt("shortFoot"),
    ownTitle: (noun) => tt("ownTitle", { noun }),
    ownSub: (date, paid, balance, via) => tt("ownSub", { date, paid, balance, via: via || "purchase" }),
    inInventory: tt("inInventory"), remove: tt("remove"), wear: tt("wear"), working: tt("working"),
    ownFootEq: tt("ownFootEq"),
    ownFootInv: (current) => (current ? tt("ownFootInvCurrent", { current }) : tt("ownFootInvNone")),
    doneTitle: (name) => tt("doneTitle", { name }),
    doneSub: (previous, wore) => (!wore ? tt("doneSubStowed") : previous ? tt("doneSubSwapped", { previous }) : tt("doneSubWorn")),
    undo: tt("undo"),
    undoneSub: (previous) => (previous ? tt("undoneSubSwapped", { previous }) : tt("undoneSubNone")),
    openInventory: tt("openInventory"), done: tt("done"),
    doneFoot: (thing) => tt("doneFoot", { thing }),
    closeLabel: tt("closeLabel"), defaultTheme: tt("defaultTheme"),
    online: tt("online"), idle: tt("idle"), dnd: tt("dnd"),
    inMessages: tt("inMessages"), inMembers: tt("inMembers"), inChat: tt("inChat"), inDms: tt("inDms"), statesStay: tt("statesStay"),
    chat15: tt("chat15"), members13: tt("members13"), clickMoment: tt("clickMoment"), dms: tt("dms"),
    typing: tt("typing"), sendTo: (name) => tt("sendTo", { name }), eveningGroup: tt("eveningGroup"),
    admin: tt("admin"), sampleName: tt("sampleName"), sampleBubble: tt("sampleBubble"),
    people: { selin: tt("people.selin"), ece: tt("people.ece"), kaan: tt("people.kaan") },
  };
}
