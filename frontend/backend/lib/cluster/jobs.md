# Scheduled work in a cluster (Render + the owner's PC)

Every `setInterval` / cron-like loop the backend starts, and where it runs once
the node is clustered (`REDIS_URL` set). "Leader" = only the node holding
`dc:leader` (Render by default; the PC only while Render is down) runs it, via
`cluster.isLeader()` / `cluster.leaderOnly(name, fn)`. "Every node" = each
node keeps doing it for its own sockets / memory. On a single node (no
`REDIS_URL`) `isLeader()` is always true, so nothing changes there. While the
Key Value is unreachable the primary keeps leading and a secondary does not,
so leader jobs never run twice.

| #  | Job (file) | What it does | Decision | Why |
|----|------------|--------------|----------|-----|
| 1  | Edge bridge ping (`lib/edgeBridge.js`) | WebSocket keepalive to the Cloudflare hub | Every node | Per connection |
| 2  | Call coin sweep (`lib/callCoinSessions.js`) | Drops stale node-local call sessions / pending summaries | Every node | Node-local map |
| 3  | Admin token sweep (`lib/adminTokens/auth.js`) | Closes this node's live token connections after revoke / expiry | Every node | Each node closes its own connections; the token cache clear is linked through `dc:inval` |
| 4  | MCP SSE ping (`lib/adminTokens/mcp.js`) | Keepalive on an open stream | Every node | Per stream |
| 5  | Server invite cleanup (`lib/serverInviteCleanup.js`) | Prunes expired invites (DB) | Leader | Shared DB rows |
| 6  | Maintenance ticker (`lib/maintenanceService.js`) | Window status to sockets; end notice + DB mark | Every node for `maintenance:state` (local emit, `io.local`); leader for `finishIfDue` | Each node tells its own sockets; the end notice and DB write happen once. Window edits reload the other nodes (`dc:inval` "maintenance") |
| 7  | Temporary member sweep (`lib/serverMemberJoin.js`) | Expires temporary server members who left | Leader | DB + emits; the "still online" check now sees users on the other node |
| 8  | Live popup engine (`lib/livePopup/engine.js`) | Stats sample, scheduled sends, expiry, receipt confirm | Every node; scheduled sends leader only | Both nodes load the same scheduled rows at boot; a schedule made on another node reaches the leader through `dc:inval` "livePopupScheduled". Live delivery is still to the sending node's sockets (see risks) |
| 9  | DesCoin anti-bot risk job (`lib/descoinAntibot/index.js`) | Flushes buffered signals, scores risk | Flush on every node; risk job leader | The buffer is per node; the scoring reads the DB |
| 10 | DesCoin anti-bot retention | Deletes old rows (daily) | Leader | DB |
| 11 | Scheduled messages (`lib/scheduledMessages.js`) | Sends due scheduled messages | Leader | Must send once |
| 12 | Boot heartbeat (`lib/systemBoot.js`) | Boot history row + `last_beat_at` | Primary only | The Sistem page history is Render's; the PC keeps its own in memory |
| 13 | Market 2.0 scheduler (`lib/shop2/scheduler.js`) | Rotations, night market | Leader | DB + global emits |
| 14 | DesCoin reconcile (`lib/descoinReconcile.js`) | Daily balance vs ledger check | Leader | DB guard stays as a second guard |
| 15 | System health sampler (`lib/systemHealth.js`) | CPU / lag / sockets tiles; daily peaks row | Every node samples; daily peaks DB write primary only | Local process numbers; the PC must not overwrite Render's peaks |
| 16 | Account deletion purge (`lib/accountDeletion.js`) | Anonymizes due accounts | Leader | DB |
| 17 | iOS push context prune (`lib/iosPushContext.js`) | Node-local foreground map | Every node | Node-local |
| 18 | Premium scheduler (`lib/premium/service.js`) | Expires memberships, pays gifts | Leader | Advisory lock stays as a second guard |
| 19 | Moderation sync (`lib/moderation.js`) | Reloads bans / timeouts from the DB every 60 s | Every node | Each node refreshes its own cache; the bulk reload is not replicated (`withoutReplication`), single bans are |
| 20 | Security lock sweep (`lib/securityLocks.js`) | Lifts expired emergency locks | Leader | Writes the config (other nodes reload via `dc:inval` "sysconfig") |
| 21 | Signup stats retention (`lib/signupStats.js`) | Deletes old rows (daily) | Leader | DB |
| 22 | Feature flag guard (`lib/systemFlags.js`) | 15 min auto-rollback watch after a flag change | Node that made the change | One-off guard; reads this node's error log |
| 23 | Announcements ticker (`lib/announcements/service.js`) | Publishes scheduled / ends expired rows | Leader | DB + global emits; the list cache clear is linked |
| 24 | Poll sweeper (`lib/polls.js`) | Closes expired polls | Leader | DB + emits |
| 25 | Admin agent scheduler (`lib/adminAgent/scheduler.js`) | Approved plans, scheduled tasks | Leader | Must run once; "run now" on another node asks the leader (`dc:agent:kick`) |
| 26 | Re-engagement emails (`lib/reengage.js`) | Lifecycle emails | Leader | Must send once |
| 27 | Admin agent SSE ping (`routes/adminAgent.js`) | Keepalive on an open stream | Every node | Per stream |
| 28 | AFK scan + LiveKit sweep (`socket/serverVoiceHandlers.js`) | Moves idle voice users, removes ghost LiveKit identities | Leader | Call state is shared; moves go through the adapter |
| 29 | 3D world snapshots (`socket/worldHandlers.js`) | Flushes position batches to rooms | Every node | Node-local rooms |
| 30 | 3D world access recheck | Re-checks members against call state | Every node | Its own members; reads the replicated call maps |
| 31 | Cluster heartbeat / leader lock / metrics ring / replica watch (`lib/cluster/*`) | Node registry, `dc:leader`, `dc:metrics:<id>`, dirty check | Every node | Per node by design |

Boot-time one-shots in `server.js` `runBoot()`: settings and bans load on every
node; the catalog upkeep (`retireSoundPacks`, `ensure*Catalog`,
`seedShop2Catalog`) runs on the primary only.

Per-socket / per-call timers (ring timeouts, disconnect grace, presence fan-out
flush, seat grace) stay on the node that holds the socket.
