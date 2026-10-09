module.exports = function sockets(io, D, log) {
  const { ME, FRIENDS } = D;
  io.on("connection", (socket) => {
    log("SOCKET connect");
    socket.onAny((ev, ...args) => log(`SOCK<- ${ev} ${JSON.stringify(args).slice(0, 200)}`));
    socket.emit("connected", { user: ME, message: "Socket connected successfully." });
    socket.emit("status:current", { status: "online" });
    const lastMessage = { [D.AYSE.id]: "Olur, müsait olunca ara 📞", [D.MERT.id]: "Takım listesini attım 👍", [D.ZEYNEP.id]: "Yarın kütüphanede misin?", [D.CAN.id]: "📷 Fotoğraf", [D.ELIF.id]: "Teşekkürler!" };
    const lastAct = { [D.AYSE.id]: D.iso(12), [D.MERT.id]: D.iso(44), [D.ZEYNEP.id]: D.iso(120), [D.CAN.id]: D.iso(300), [D.ELIF.id]: D.iso(1440) };
    socket.emit("friend:list", FRIENDS.map((f) => ({ ...f, lastMessage: lastMessage[f.id] || null, lastActivity: lastAct[f.id] || null })));
    if (process.env.MOCK_BADGES) {
      // Stage-2 compare: mockup tab badges (Sohbetler 5, Arkadaşlar 1).
      socket.emit("friend:requests", [D.U("00000000-0000-4000-8000-000000000099", "kaan", "Kaan")]);
      socket.emit("sync:state", { dmUnreadByPeer: { [D.AYSE.id]: 3, [D.MERT.id]: 2 } });
    } else {
      socket.emit("friend:requests", []);
    }
    const online = [ME, ...FRIENDS].filter((u) => u.status !== "offline").map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, status: u.status, avatarUrl: null }));
    socket.emit("users:update", online);
    socket.emit("presence:list", online);
    const vp = (u, extra = {}) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, avatarUrl: null, avatar_url: null, muted: false, deafened: false, cameraOn: false, ...extra });
    const LOBI = "20000000-0000-4000-8000-000000000004";
    const lobiMembers = () => [vp(D.AYSE), vp(D.MERT), vp(D.ZEYNEP, { muted: true }), vp(D.ELIF)];
    socket.on("server:voice:subscribe", ({ serverId } = {}) => {
      socket.emit("server:voice:states", { serverId, states: [{ channelId: LOBI, members: lobiMembers(), memberCount: 4 }] });
    });
    socket.on("server:voice:check", ({ channelId } = {}) => {
      if (channelId === LOBI) socket.emit("server:voice:channel-state", { serverId: "10000000-0000-4000-8000-000000000001", channelId, members: lobiMembers(), memberCount: 4 });
    });
    socket.on("server:voice:join", ({ serverId, channelId } = {}) => {
      const parts = [vp(D.AYSE), vp(D.MERT), vp(D.ZEYNEP, { muted: true }), vp(D.ELIF)];
      setTimeout(() => {
        socket.emit("server:voice:joined", { channelId, serverId, channelName: "Lobi", channelType: "voice", participants: parts, canSpeak: true, canStream: true, canRequestToSpeak: false, stageRole: null, requestedToSpeak: false, serverMuted: false });
        socket.emit("server:voice:channel-state", { serverId, channelId, members: [vp(ME), ...parts], memberCount: 5 });
      }, 300);
    });
    socket.emit("online:users", online);
  });
};
