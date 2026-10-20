# Call quality bench (2.13.8)

Two Chrome peer connections, fake mic, UDP relay in Node dropping RTP/RTCP at N% each way with 40-70 ms random delay. 20 s per run, getStats on the receiver. MOS = simplified E-model from concealed-sample ratio and jitter-buffer delay (relative comparison only).

Run: `node bench.mjs <label> "<opus fmtp>" <loss%> <red 1|0> <jitterBufferTarget ms>` (needs a STUN server on 172.30.0.2:3478).

| loss | no RED (old native-style) | prod web (RED, 48k) | 2.13.8 fmtp (RED) | + jitter target 100 ms |
|---|---|---|---|---|
| 0%  | conceal 0.38%, MOS 4.30 | 0.37%, 4.30 | 0.30%, 4.31 | – |
| 5%  | 4.18%, 3.78 | 0.65%, 4.26 | 0.66%, 4.25 | – |
| 10% | 6.81%, 3.41 | 1.22-1.45%, 4.15-4.19 | 1.32%, 4.17 | 1.04%, 4.21 |
| 20% | 16.20%, 2.47 | 2.81-3.57%, 3.85-3.97 | 4.60%, 3.70 | 3.24%, 3.90 |

Findings: RED is the big lever (5-6× less concealment); it was already preferred on web. The fmtp change (fullband 48 kHz explicit, ptime 20) is neutral within noise. Adaptive jitter target (80/120 ms on fair/poor links) cuts concealment ~25% at 10-20% loss; at 160 ms delay cost outweighs the gain. Small n (1-2 runs per cell): noisy.
