// Minimal stand-in for DurableObjectState's hibernation API, for node tests.
export function fakeCtx() {
  const sockets = [];
  let alarm = null;
  return {
    sockets,
    get alarm() { return alarm; },
    acceptWebSocket(ws, tags) { ws.__tags = tags; sockets.push(ws); },
    getWebSockets(tag) { return sockets.filter((w) => !w.__closed && (!tag || w.__tags.includes(tag))); },
    setAlarm(ms) { alarm = ms; },
  };
}
export function fakeWs(name = "ws") {
  let att = null;
  const ws = {
    name, sent: [], __closed: false, closeInfo: null,
    send(m) { if (ws.__closed) throw new Error("closed"); ws.sent.push(m); },
    close(code, reason) { ws.__closed = true; ws.closeInfo = { code, reason }; },
    serializeAttachment(a) { att = structuredClone(a); },
    deserializeAttachment() { return att; },
  };
  return ws;
}
