#!/usr/bin/env node
"use strict";

/**
 * Writes supabase/migrations/20261128a_server_content_l10n.sql: the two tables of
 * localized server content (draft C) and the seed of the official community server
 * from backend/content/descallCommunityL10n.js.
 *
 *   node backend/scripts/genServerL10nSeed.cjs [--check]
 *
 * --check exits 1 when the file on disk differs from what would be written (selftest).
 */

const fs = require("fs");
const path = require("path");
const data = require("../content/descallCommunityL10n");

const OUT = path.join(__dirname, "../../../supabase/migrations/20261128a_server_content_l10n.sql");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const SCHEMA = `-- Draft C (owner pick, 28 Nov 2026): the static content of a server shows in each
-- reader's app language. Additive only: two new tables, no change to existing tables.
--   server_content_l10n           per-server opt-in (only opted-in servers are localized)
--   server_content_translations   one row per item x locale: server name / description,
--                                 channel (and category) name / topic, official message
-- Written and read by the backend (service role) only, like the neighbouring server
-- tables: RLS on with no policies, no anon / authenticated access.
-- Channel mentions inside text are stored as <#channel-id> and resolved per reader.
-- source_text is the original the translation was written against (stale check).
-- Reverse: drop table public.server_content_translations; drop table public.server_content_l10n;
create table if not exists public.server_content_l10n (
  server_id uuid primary key references public.servers (id) on delete cascade,
  enabled boolean not null default false,
  source_locale text not null default 'tr' check (source_locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  updated_by uuid,
  updated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_content_translations (
  id bigint generated always as identity primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  kind text not null check (kind in ('server_name', 'server_description', 'channel_name', 'channel_topic', 'message')),
  ref_id uuid not null,
  locale text not null check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  text text not null check (char_length(text) between 1 and 4000),
  source_text text,
  updated_by uuid,
  updated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_content_translations_item_key unique (server_id, kind, ref_id, locale)
);

create index if not exists server_content_translations_server_idx on public.server_content_translations (server_id, kind);

alter table public.server_content_l10n enable row level security;
alter table public.server_content_translations enable row level security;
revoke all on table public.server_content_l10n from anon, authenticated;
revoke all on table public.server_content_translations from anon, authenticated;
grant all on table public.server_content_l10n to service_role;
grant all on table public.server_content_translations to service_role;
`;

const DOLLAR = "$seed$";

/** { kind: { ref_id: { locale: text } } } as JSON (dollar-quoted in the SQL). */
function seedDoc() {
  const doc = {};
  for (const r of data.seedRows()) {
    if (!doc[r.kind]) doc[r.kind] = {};
    if (!doc[r.kind][r.refId]) doc[r.kind][r.refId] = {};
    doc[r.kind][r.refId][r.locale] = r.text;
  }
  const json = JSON.stringify(doc);
  if (json.includes(DOLLAR)) throw new Error("seed text must not contain the dollar quote tag");
  return json;
}

function seedSql() {
  return `
-- Seed: the official community server "Descall Topluluk" (no-op where it does not exist).
insert into public.server_content_l10n (server_id, enabled, source_locale, updated_by_username)
select s.id, true, ${q(data.SOURCE_LOCALE)}, 'seed'
from public.servers s
where s.id = ${q(data.SERVER_ID)}::uuid
on conflict (server_id) do nothing;

-- Document: { kind: { ref_id: { locale: text } } } from backend/content/descallCommunityL10n.js.
-- source_text is read from the live rows, so a later edit of the original marks these stale.
with doc (d) as (values (${DOLLAR}${seedDoc()}${DOLLAR}::jsonb))
insert into public.server_content_translations (server_id, kind, ref_id, locale, text, source_text, updated_by_username)
select s.id, k.key, r.key::uuid, l.key, l.value #>> '{}',
  case k.key
    when 'server_name' then s.name
    when 'server_description' then s.description
    when 'channel_name' then (select c.name from public.server_channels c where c.id = r.key::uuid and c.server_id = s.id)
    when 'channel_topic' then (select c.topic from public.server_channels c where c.id = r.key::uuid and c.server_id = s.id)
    when 'message' then (select m.content from public.server_messages m where m.id = r.key::uuid and m.server_id = s.id)
  end,
  'seed'
from doc
cross join lateral jsonb_each(doc.d) k
cross join lateral jsonb_each(k.value) r
cross join lateral jsonb_each(r.value) l
join public.servers s on s.id = ${q(data.SERVER_ID)}::uuid
on conflict (server_id, kind, ref_id, locale) do nothing;
`;
}

function build() {
  return `${SCHEMA}${seedSql()}`;
}

if (require.main === module) {
  const next = build();
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (cur !== next) {
      console.error("supabase/migrations/20261128a_server_content_l10n.sql is out of date: run node backend/scripts/genServerL10nSeed.cjs");
      process.exit(1);
    }
    console.log("seed migration up to date");
  } else {
    fs.writeFileSync(OUT, next);
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${data.seedRows().length} rows)`);
  }
}

module.exports = { build, OUT };
