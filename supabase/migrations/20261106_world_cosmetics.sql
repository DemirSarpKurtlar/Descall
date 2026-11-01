-- 3D world, phase 5: "Karakterini oluştur" (docs/design/3d-world/approved-ui-5.png).
-- Character cosmetics bought with DesCoin: owned items, the saved look per user, and an
-- atomic purchase function with idempotency and a receipt row (audit log).
--
-- NOT APPLIED YET. Additive only: three new tables and two new functions, nothing in an
-- existing table changes. The catalog (ids, slots, prices, free flag) is defined on the
-- server in frontend/backend/lib/world3d/cosmetics.js; the backend prices every purchase
-- from it and passes the priced list to world_cosmetics_purchase (service role only).
--
-- RLS stays on with no anon / authenticated grants, like the other world tables: the
-- backend (service role) is the only reader and writer.
--
-- Money path: the same columns and ledger as every DesCoin purchase
-- (users.descoin_balance, descoin_ledger with reason 'shop_purchase'), inside one
-- transaction with the user's row locked, so the balance, the ledger row, the owned items
-- and the receipt land together or not at all.

create table if not exists public.world_cosmetic_inventory (
  user_id uuid not null references public.users (id) on delete cascade,
  item_id text not null,
  acquired_via text not null default 'purchase',
  price_paid integer not null default 0,
  purchase_id uuid,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint world_cosmetic_inventory_item_check check (item_id ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint world_cosmetic_inventory_via_check check (acquired_via in ('purchase', 'gift', 'promo', 'grant')),
  constraint world_cosmetic_inventory_price_check check (price_paid >= 0)
);

create table if not exists public.world_avatar_looks (
  user_id uuid primary key references public.users (id) on delete cascade,
  look jsonb not null,
  updated_at timestamptz not null default now(),
  constraint world_avatar_looks_shape_check check (jsonb_typeof(look) = 'object' and pg_column_size(look) <= 2048)
);

-- One row per successful purchase: the receipt and the idempotency key (request_id).
create table if not exists public.world_cosmetic_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  request_id text not null,
  items jsonb not null,
  already_owned jsonb not null default '[]'::jsonb,
  total integer not null,
  balance_after integer not null,
  ledger_id uuid,
  created_at timestamptz not null default now(),
  constraint world_cosmetic_purchases_request_check check (request_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint world_cosmetic_purchases_total_check check (total >= 0),
  constraint world_cosmetic_purchases_request_unique unique (user_id, request_id)
);

create index if not exists world_cosmetic_purchases_user_idx
  on public.world_cosmetic_purchases (user_id, created_at desc);

alter table public.world_cosmetic_inventory enable row level security;
alter table public.world_avatar_looks enable row level security;
alter table public.world_cosmetic_purchases enable row level security;
revoke all on table public.world_cosmetic_inventory, public.world_avatar_looks, public.world_cosmetic_purchases
  from anon, authenticated;

-- Buy cosmetics. p_items = [{"id": "top_bomber", "price": 150}, ...] priced by the backend.
-- Returns jsonb:
--   { ok: true, purchaseId, charged: [{id, price}], alreadyOwned: [ids], total, balance, replayed }
--   { ok: false, error: 'invalid' | 'insufficient' | 'wallet_frozen', balance?, total? }
-- Items already owned are not charged. The same p_request_id twice returns the first
-- result (replayed: true) and never charges again; failures are not stored, so a retry
-- with the same id after earning DesCoin can still succeed.
create or replace function public.world_cosmetics_purchase(
  p_user_id uuid,
  p_request_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_prev public.world_cosmetic_purchases%rowtype;
  v_item jsonb;
  v_id text;
  v_price integer;
  v_num numeric;
  v_seen text[] := array[]::text[];
  v_charge jsonb := '[]'::jsonb;
  v_owned jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_balance integer;
  v_purchase_id uuid := gen_random_uuid();
  v_ledger_id uuid;
begin
  if p_user_id is null or p_request_id is null or p_request_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- One purchase at a time per account; also orders us with every other balance write.
  select id, coalesce(descoin_balance, 0) as balance, coalesce(descoin_frozen, false) as frozen,
         coalesce(is_banned, false) as banned, deleted_at
    into v_user
    from public.users where id = p_user_id
     for update;
  if not found or v_user.banned or v_user.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_prev from public.world_cosmetic_purchases
   where user_id = p_user_id and request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'purchaseId', v_prev.id,
      'charged', v_prev.items, 'alreadyOwned', v_prev.already_owned,
      'total', v_prev.total, 'balance', v_user.balance);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'id') <> 'string'
       or jsonb_typeof(v_item -> 'price') <> 'number' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_id := v_item ->> 'id';
    if v_id !~ '^[a-z][a-z0-9_]{2,39}$' or v_id = any (v_seen) then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_seen := v_seen || v_id;
    v_num := (v_item ->> 'price')::numeric;
    if v_num is null or v_num <= 0 or v_num > 100000 or v_num <> trunc(v_num) then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_price := v_num::integer;
    if exists (select 1 from public.world_cosmetic_inventory where user_id = p_user_id and item_id = v_id) then
      v_owned := v_owned || to_jsonb(v_id);
    else
      v_charge := v_charge || jsonb_build_object('id', v_id, 'price', v_price);
      v_total := v_total + v_price;
    end if;
  end loop;

  if v_total > 0 and v_user.frozen then
    return jsonb_build_object('ok', false, 'error', 'wallet_frozen', 'balance', v_user.balance);
  end if;
  if v_total > v_user.balance then
    return jsonb_build_object('ok', false, 'error', 'insufficient', 'balance', v_user.balance, 'total', v_total);
  end if;

  v_balance := v_user.balance;
  if v_total > 0 then
    update public.users set descoin_balance = coalesce(descoin_balance, 0) - v_total
     where id = p_user_id
     returning descoin_balance into v_balance;
    insert into public.descoin_ledger (user_id, amount, reason, meta, balance_after)
    values (p_user_id, -v_total, 'shop_purchase',
      jsonb_build_object('kind', 'world_cosmetic', 'purchase_id', v_purchase_id,
        'request_id', p_request_id, 'items', v_charge),
      v_balance)
    returning id into v_ledger_id;
    insert into public.world_cosmetic_inventory (user_id, item_id, acquired_via, price_paid, purchase_id)
    select p_user_id, x ->> 'id', 'purchase', (x ->> 'price')::integer, v_purchase_id
      from jsonb_array_elements(v_charge) as x;
  end if;

  insert into public.world_cosmetic_purchases (id, user_id, request_id, items, already_owned, total, balance_after, ledger_id)
  values (v_purchase_id, p_user_id, p_request_id, v_charge, v_owned, v_total, v_balance, v_ledger_id);

  return jsonb_build_object('ok', true, 'replayed', false, 'purchaseId', v_purchase_id,
    'charged', v_charge, 'alreadyOwned', v_owned, 'total', v_total, 'balance', v_balance);
end;
$$;

-- Save a look. The backend validates the shape and ownership first (lib/world3d/cosmetics.js);
-- this only upserts, so a save never touches money.
create or replace function public.world_look_save(p_user_id uuid, p_look jsonb)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.world_avatar_looks (user_id, look, updated_at)
  values (p_user_id, p_look, now())
  on conflict (user_id) do update set look = excluded.look, updated_at = excluded.updated_at
  returning jsonb_build_object('ok', true, 'look', look, 'updatedAt', updated_at);
$$;

revoke all on function public.world_cosmetics_purchase(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.world_look_save(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.world_cosmetics_purchase(uuid, text, jsonb) to service_role;
grant execute on function public.world_look_save(uuid, jsonb) to service_role;
