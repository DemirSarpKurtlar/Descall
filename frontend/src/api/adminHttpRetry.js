const TRANSIENT_STATUS = new Set([502, 503, 504]);

export function isTransientAdminStatus(status) {
  return TRANSIENT_STATUS.has(Number(status));
}

export function isRetryableAdminError(err) {
  if (isTransientAdminStatus(err?.status)) return true;
  const msg = String(err?.message || "");
  return /unreachable|failed to fetch|networkerror|load failed|HTTP 502|HTTP 503|HTTP 504/i.test(msg);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
