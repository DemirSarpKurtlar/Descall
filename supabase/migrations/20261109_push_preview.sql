-- Messaging phase 5: "Mesaj önizlemesi" for server-sent pushes. Additive only.
--
-- users.push_preview: Settings > Bildirimler > "Mesaj önizlemesi". Default on.
-- Off: web push, Android (FCM) and iOS alert pushes for messages carry no
-- message text, no picture thumbnail and no thread preview; they read
-- "Yeni mesaj" (backend/lib/pushPreview.js, lib/webPush.js).
-- The backend works before this runs: everyone counts as "on" and saving the
-- switch answers 503 not_ready (the app keeps its device-only behaviour).

alter table public.users
  add column if not exists push_preview boolean not null default true;
