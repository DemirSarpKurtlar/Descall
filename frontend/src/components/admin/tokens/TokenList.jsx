/**
 * Left column of Draft B: the token list (search, Tümü / Çalışan / Pasif, row sparkline,
 * status pill, last use, open-alert dot) and the Uyarılar panel (automatic pause switch
 * and rules, open alerts with their actions, tokens about to expire).
 */
import { Activity, Check, Clock, Globe, Pause, Plus, RefreshCw, Search, Zap } from "../../ui/Icon.jsx";
import { LiveBadge, Pill, Skel, Spark, Toggle, TokenIcon, useFmt } from "./TokenUi.jsx";
import { allowIpMode, AUTO_PAUSE_RULES, FILTERS, agoLabel, alertCopy, countByFilter, expiryKey, filterTokens, isLive, leftLabel, maskToken, openAlerts, colorOf } from "./tokenModel.js";

export function TokenList({ tokens, loading, selectedId, filter, query, onFilter, onQuery, onSelect, onCreate, now, limited = false }) {
  const f = useFmt();
  const { t } = f;
  const list = filterTokens(tokens, { filter, query });
  const counts = countByFilter(tokens);
  return (
    <section className="atk-glass atk-list" aria-label={t("atok.list.title")} data-testid="atk-list">
      <div className="atk-list-h">
        <h3>
          {t("atok.list.title")} <span className="atk-sub tnum">{loading ? "" : f.n(tokens.length)}</span>
        </h3>
        <button type="button" className="atk-btn is-sm is-pri" onClick={onCreate} disabled={limited} title={limited ? t("atok.tokenSession.blocked") : undefined} data-testid="atk-list-new">
          <Plus size={13} />
          {t("atok.new")}
        </button>
      </div>
      <label className="atk-search">
        <Search size={14} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t("atok.list.search")} aria-label={t("atok.list.searchLabel")} data-testid="atk-search" />
      </label>
      <div className="atk-seg" role="tablist" aria-label={t("atok.list.title")}>
        {FILTERS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "is-on" : ""} onClick={() => onFilter(k)} data-testid={`atk-filter-${k}`}>
            {t(`atok.list.${k}`)}
            {counts[k] && k !== "all" ? <em className="tnum">{f.n(counts[k])}</em> : null}
          </button>
        ))}
      </div>
      <div className="atk-items">
        {loading
          ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="atk-item is-skel" aria-hidden="true">
                <Skel w={30} h={30} r={9} />
                <div>
                  <Skel w="70%" h={11} />
                  <Skel w="55%" h={9} />
                  <Skel w="40%" h={9} />
                </div>
                <Skel w={54} h={26} />
              </div>
            ))
          : null}
        {!loading && !list.length ? <p className="atk-empty-s">{t("atok.list.noMatch")}</p> : null}
        {!loading
          ? list.map((tok) => {
              const on = tok.id === selectedId;
              return (
                <button
                  key={tok.id}
                  type="button"
                  className={`atk-item${on ? " is-on" : ""}${isLive(tok) ? "" : " is-dead"}`}
                  aria-current={on ? "true" : undefined}
                  onClick={() => onSelect(tok.id)}
                  data-testid={`atk-item-${tok.id}`}
                >
                  <TokenIcon token={tok} />
                  <div className="atk-item-m">
                    <b>
                      <span className="atk-ell">{tok.name}</span>
                      {tok.hasOpenAlert ? <span className="atk-dot-new" role="img" aria-label={t("atok.list.openAlert")} /> : null}
                    </b>
                    <span className="atk-mask">{maskToken(tok)}</span>
                    <span className="atk-item-s">
                      <Pill status={tok.status} small />
                      <span className="atk-ell">
                        {f.label(agoLabel(tok.lastUsedAt, now))}
                        {tok.lastUsedCountry ? ` · ${String(tok.lastUsedCountry).toUpperCase()}` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="atk-item-r">
                    <span className="tnum">{f.n(tok.requests24h || 0)}</span>
                    <small>{t("atok.list.req24")}</small>
                    <Spark values={tok.spark24h} color={isLive(tok) ? colorOf(tok) : "rgba(150,160,190,0.6)"} h={16} fill={false} className="atk-item-sp" />
                  </div>
                </button>
              );
            })
          : null}
      </div>
    </section>
  );
}

function AlertItem({ alert, token, busy, onAction, onInspect, limited }) {
  const f = useFmt();
  const { t } = f;
  const copy = alertCopy({ ...alert, country: f.country(alert.country) || alert.country, detail: { ...(alert.detail || {}), previousCountry: f.country(alert.detail?.previousCountry) || alert.detail?.previousCountry } });
  const live = token && isLive(token);
  return (
    <div className={`atk-alert sev-${copy.tone}`} data-testid={`atk-alert-${alert.id}`}>
      <span className="atk-al-ic" aria-hidden="true">
        {copy.icon === "burst" ? <Zap size={15} /> : <Globe size={15} />}
      </span>
      <div className="atk-al-b">
        <div className="atk-al-t">
          <b>{t(copy.title.key, copy.title.vars)}</b>
          <span className="atk-al-time">{f.label(agoLabel(alert.createdAt, Date.now()))}</span>
        </div>
        <p className="atk-al-d">
          {t(copy.body.key, { ...copy.body.vars, prevCount: f.n(copy.body.vars.prevCount || 0), count: f.n(copy.body.vars.count || 0) })}
          {copy.reason ? ` ${t(copy.reason.key, copy.reason.vars)}` : ""}
          {alert.autoPaused ? ` ${t("atok.alerts.autoPaused")}` : ""}
        </p>
        {token ? (
          <div className="atk-al-tok">
            <TokenIcon token={token} size="xs" />
            <span className="atk-ell">{token.name}</span>
            <span className="atk-mask atk-ell">{maskToken(token)}</span>
          </div>
        ) : null}
        <div className="atk-al-a">
          {live && token.status === "active" ? (
            <button type="button" className="atk-btn is-sm is-dan" disabled={busy} onClick={() => onAction(alert, "pause")} data-testid="atk-alert-pause">
              <Pause size={13} />
              {t("atok.alerts.pauseToken")}
            </button>
          ) : null}
          {alert.kind !== "burst" && alert.ip && live && !limited ? (
            <button type="button" className="atk-btn is-sm" disabled={busy} onClick={() => onAction(alert, "allow_ip")} data-testid="atk-alert-allow">
              <Check size={13} />
              {allowIpMode(token) === "add" ? t("atok.alerts.allowIp") : t("atok.alerts.trustIp")}
            </button>
          ) : null}
          {alert.kind === "burst" && token ? (
            <button type="button" className="atk-btn is-sm" onClick={() => onInspect(token.id)}>
              <Activity size={13} />
              {t("atok.alerts.inspect")}
            </button>
          ) : null}
          {limited ? null : (
            <button type="button" className="atk-btn is-sm is-ghost" disabled={busy} onClick={() => onAction(alert, "dismiss")} data-testid="atk-alert-dismiss">
              {t("atok.dismiss")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AlertsPanel({ alerts, tokens, autoPause, expiring, busyAlert, autoBusy, onAction, onInspect, onAutoPause, onRotate, now, loading, panelRef, limited = false }) {
  const f = useFmt();
  const { t } = f;
  const open = openAlerts(alerts);
  const byId = new Map((tokens || []).map((x) => [x.id, x]));
  const ap = autoPause || { enabled: false, rules: {} };
  return (
    <section ref={panelRef} className="atk-glass atk-card atk-alerts" aria-label={t("atok.alerts.title")} data-testid="atk-alerts" tabIndex={-1}>
      <div className="atk-card-h">
        <div>
          <h3>
            {t("atok.alerts.title")} {open.length ? <span className="atk-cnt tnum">{f.n(open.length)}</span> : null}
          </h3>
          <span className="atk-sub">{t("atok.alerts.sub")}</span>
        </div>
        <LiveBadge>{t("atok.watching")}</LiveBadge>
      </div>
      <div className="atk-autop">
        <div className="atk-autop-t">
          <b>{t("atok.alerts.autoTitle")}</b>
          <span className="atk-sub">{t("atok.alerts.autoSub")}</span>
          <div className="atk-rules">
            {AUTO_PAUSE_RULES.map((r) => {
              const on = Boolean(ap.rules?.[r]);
              return (
                <button
                  key={r}
                  type="button"
                  className={`atk-rule${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  disabled={autoBusy || loading || limited}
                  title={limited ? t("atok.tokenSession.blocked") : undefined}
                  onClick={() => onAutoPause({ enabled: ap.enabled, rules: { ...ap.rules, [r]: !on } }, "rules")}
                  data-testid={`atk-rule-${r}`}
                >
                  {on ? <Check size={11} /> : null}
                  {t(`atok.alerts.rule.${r}`)}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle checked={Boolean(ap.enabled)} disabled={autoBusy || loading || limited} label={t("atok.alerts.autoLabel")} onChange={(v) => onAutoPause({ enabled: v, rules: ap.rules || {} }, "switch")} testId="atk-autopause" />
      </div>
      {loading ? (
        <div className="atk-alert" aria-hidden="true">
          <Skel w={30} h={30} r={9} />
          <div className="atk-al-b">
            <Skel w="60%" />
            <Skel w="90%" h={9} />
            <Skel w="70%" h={9} />
          </div>
        </div>
      ) : open.length ? (
        open.map((a) => <AlertItem key={a.id} alert={a} token={byId.get(a.tokenId)} busy={busyAlert === a.id} onAction={onAction} onInspect={onInspect} limited={limited} />)
      ) : (
        <div className="atk-empty-ok">
          <Check size={15} />
          {t("atok.alerts.none")}
        </div>
      )}
      {(expiring || []).map((tok) => (
        <div key={`exp-${tok.id}`} className="atk-alert sev-low" data-testid={`atk-expiring-${tok.id}`}>
          <span className="atk-al-ic" aria-hidden="true">
            <Clock size={15} />
          </span>
          <div className="atk-al-b">
            <div className="atk-al-t">
              <b>{t("atok.alerts.expTitle", { name: tok.name })}</b>
              <span className="atk-al-time">{f.label(leftLabel(tok.expiresAt, now))}</span>
            </div>
            <p className="atk-al-d">{t("atok.alerts.expBody", { exp: t(expiryKey(tok.expiresIn)), time: f.time(tok.expiresAt) })}</p>
            {limited ? null : (
              <div className="atk-al-a">
                <button type="button" className="atk-btn is-sm" onClick={() => onRotate(tok)}>
                  <RefreshCw size={13} />
                  {t("atok.alerts.rotate")}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
