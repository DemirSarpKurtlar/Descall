/**
 * 3.0.0 (A2 §4.6): what the report sheet shows after a report was sent.
 * "offer"  → "Bu kişiyi engellemek ister misin?" [Engelle] [Şimdi değil]
 * "thanks" → the short thank-you, then it closes (already blocked / opted out).
 */
export function reportDoneStep({ offerBlock = true, alreadyBlocked = false } = {}) {
  return offerBlock && !alreadyBlocked ? "offer" : "thanks";
}
