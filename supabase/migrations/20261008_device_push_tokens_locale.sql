-- iOS alert push text language per device ("tr" / "en"), sent by the iOS app
-- with its APNs token (backend lib/iosAlertPush.js). Additive and nullable:
-- existing rows and older clients keep working, NULL falls back to users.language.
ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS locale TEXT;
