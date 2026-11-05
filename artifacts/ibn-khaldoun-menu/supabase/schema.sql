-- Run this complete setup in the Supabase SQL Editor.
-- Safe to rerun after the first setup; starter menu rows are not overwritten.

create table if not exists public.menu_items (
  id text primary key,
  name text not null,
  category text not null,
  price bigint not null check (price >= 0),
  image_url text not null default '',
  ingredients text not null default '',
  is_drink boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_items
  add column if not exists image_url text not null default '',
  add column if not exists ingredients text not null default '',
  add column if not exists is_drink boolean not null default false,
  add column if not exists is_available boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null references public.menu_items(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  is_excludable boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (menu_item_id, name)
);

create table if not exists public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null references public.menu_items(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  price_override bigint check (price_override is null or price_override >= 0),
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (menu_item_id, name)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  table_number text not null
    check (char_length(btrim(table_number)) between 1 and 30),
  status text not null default 'received'
    check (status in ('received', 'preparing', 'ready', 'served', 'cancelled')),
  total bigint not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id text references public.menu_items(id) on delete set null,
  item_name text not null,
  unit_price bigint not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  sugar text check (sugar is null or sugar in ('بدون', 'قليل', 'عادي')),
  line_total bigint generated always as (unit_price * quantity) stored
);

alter table public.order_items
  add column if not exists variant_id uuid
    references public.menu_item_variants(id) on delete set null,
  add column if not exists variant_name text,
  add column if not exists excluded_ingredients text[] not null default '{}';

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);
create index if not exists order_items_order_id_idx
  on public.order_items (order_id);
create index if not exists menu_item_ingredients_item_sort_idx
  on public.menu_item_ingredients (menu_item_id, sort_order);
create index if not exists menu_item_variants_item_sort_idx
  on public.menu_item_variants (menu_item_id, sort_order);

alter table public.menu_items enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.menu_item_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;

grant usage on schema public to anon, authenticated;

create or replace function public.is_menu_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_menu_admin() from public;
grant execute on function public.is_menu_admin() to authenticated;

create or replace function public.menu_item_is_customer_visible(p_menu_item_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1
      from public.menu_item_variants
      where menu_item_id = p_menu_item_id
    )
    or exists (
      select 1
      from public.menu_item_variants
      where menu_item_id = p_menu_item_id and is_available = true
    );
$$;

revoke all on function public.menu_item_is_customer_visible(text) from public;
grant execute on function public.menu_item_is_customer_visible(text)
  to anon, authenticated;

drop policy if exists "Anyone can read available menu items"
  on public.menu_items;
drop policy if exists "Public can read available menu items"
  on public.menu_items;
drop policy if exists "Admins can read all menu items"
  on public.menu_items;
create policy "Public can read available menu items"
  on public.menu_items
  for select
  to anon, authenticated
  using (
    is_available = true
    and public.menu_item_is_customer_visible(id)
  );
create policy "Admins can read all menu items"
  on public.menu_items
  for select
  to authenticated
  using (public.is_menu_admin());

drop policy if exists "Public can read menu ingredients"
  on public.menu_item_ingredients;
drop policy if exists "Admins can read all menu ingredients"
  on public.menu_item_ingredients;
create policy "Public can read menu ingredients"
  on public.menu_item_ingredients
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.menu_items as item
      where item.id = menu_item_id and item.is_available = true
    )
  );
create policy "Admins can read all menu ingredients"
  on public.menu_item_ingredients
  for select
  to authenticated
  using (public.is_menu_admin());

drop policy if exists "Public can read menu variants"
  on public.menu_item_variants;
drop policy if exists "Admins can read all menu variants"
  on public.menu_item_variants;
create policy "Public can read menu variants"
  on public.menu_item_variants
  for select
  to anon, authenticated
  using (
    is_available = true
    and
    exists (
      select 1
      from public.menu_items as item
      where item.id = menu_item_id and item.is_available = true
    )
  );
create policy "Admins can read all menu variants"
  on public.menu_item_variants
  for select
  to authenticated
  using (public.is_menu_admin());

drop policy if exists "Admins can read own membership" on public.admin_users;
create policy "Admins can read own membership"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.menu_items from anon, authenticated;
revoke all on table public.menu_item_ingredients from anon, authenticated;
revoke all on table public.menu_item_variants from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;
grant select on table public.menu_items to anon, authenticated;
grant select on table public.menu_item_ingredients to anon, authenticated;
grant select on table public.menu_item_variants to anon, authenticated;
grant select on table public.admin_users to authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;

create or replace function public.save_menu_item(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(p_item ->> 'id'), '');
  v_name text := btrim(coalesce(p_item ->> 'name', ''));
  v_category text := btrim(coalesce(p_item ->> 'category', ''));
  v_price_text text := coalesce(p_item ->> 'price', '');
  v_price bigint;
  v_image_url text := btrim(coalesce(p_item ->> 'image_url', ''));
  v_is_drink boolean := coalesce((p_item ->> 'is_drink')::boolean, false);
  v_is_available boolean := coalesce((p_item ->> 'is_available')::boolean, true);
  v_sort_order integer := coalesce(nullif(p_item ->> 'sort_order', '')::integer, 0);
  v_legacy_ingredients text;
  v_ingredient jsonb;
  v_variant jsonb;
  v_ingredient_name text;
  v_variant_name text;
  v_variant_price_text text;
  v_variant_price bigint;
  v_variant_image text;
  v_index integer := 0;
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;

  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'Menu item data must be an object.';
  end if;
  if v_id is null or char_length(v_id) > 100 then
    raise exception 'A valid menu item ID is required.';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'A name between 1 and 120 characters is required.';
  end if;
  if v_category = '' or char_length(v_category) > 80 then
    raise exception 'A category between 1 and 80 characters is required.';
  end if;
  if v_price_text !~ '^[0-9]{1,12}$' then
    raise exception 'Price must be a non-negative whole number.';
  end if;
  v_price := v_price_text::bigint;
  if char_length(v_image_url) > 2048 then
    raise exception 'The image URL is too long.';
  end if;
  if jsonb_typeof(p_item -> 'ingredients') is distinct from 'array' then
    raise exception 'Ingredients must be an array.';
  end if;
  if jsonb_array_length(p_item -> 'ingredients') > 50 then
    raise exception 'Ingredients must be an array with at most 50 entries.';
  end if;
  if jsonb_typeof(p_item -> 'variants') is distinct from 'array' then
    raise exception 'Variants must be an array.';
  end if;
  if jsonb_array_length(p_item -> 'variants') > 30 then
    raise exception 'Variants must be an array with at most 30 entries.';
  end if;

  select coalesce(
    string_agg(btrim(entry.value ->> 'name'), '، ' order by entry.ordinality),
    ''
  )
  into v_legacy_ingredients
  from jsonb_array_elements(p_item -> 'ingredients')
    with ordinality as entry(value, ordinality);

  insert into public.menu_items (
    id, name, category, price, image_url, ingredients,
    is_drink, is_available, sort_order, updated_at
  )
  values (
    v_id, v_name, v_category, v_price, v_image_url, v_legacy_ingredients,
    v_is_drink, v_is_available, v_sort_order, now()
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    price = excluded.price,
    image_url = excluded.image_url,
    ingredients = excluded.ingredients,
    is_drink = excluded.is_drink,
    is_available = excluded.is_available,
    sort_order = excluded.sort_order,
    updated_at = now();

  delete from public.menu_item_ingredients where menu_item_id = v_id;
  delete from public.menu_item_variants where menu_item_id = v_id;

  for v_ingredient in
    select value from jsonb_array_elements(p_item -> 'ingredients')
  loop
    if jsonb_typeof(v_ingredient) is distinct from 'object' then
      raise exception 'Each ingredient must be an object.';
    end if;
    v_ingredient_name := btrim(coalesce(v_ingredient ->> 'name', ''));
    if v_ingredient_name = '' or char_length(v_ingredient_name) > 100 then
      raise exception 'Ingredient names must contain 1 to 100 characters.';
    end if;
    v_index := v_index + 1;
    insert into public.menu_item_ingredients (
      menu_item_id, name, is_excludable, sort_order
    )
    values (
      v_id,
      v_ingredient_name,
      coalesce((v_ingredient ->> 'is_excludable')::boolean, false),
      coalesce(nullif(v_ingredient ->> 'sort_order', '')::integer, v_index)
    );
  end loop;

  v_index := 0;
  for v_variant in
    select value from jsonb_array_elements(p_item -> 'variants')
  loop
    if jsonb_typeof(v_variant) is distinct from 'object' then
      raise exception 'Each variant must be an object.';
    end if;
    v_variant_name := btrim(coalesce(v_variant ->> 'name', ''));
    if v_variant_name = '' or char_length(v_variant_name) > 100 then
      raise exception 'Variant names must contain 1 to 100 characters.';
    end if;
    v_variant_price_text := nullif(v_variant ->> 'price_override', '');
    if v_variant_price_text is not null
      and v_variant_price_text !~ '^[0-9]{1,12}$' then
      raise exception 'Variant prices must be non-negative whole numbers.';
    end if;
    v_variant_price := v_variant_price_text::bigint;
    v_variant_image := nullif(btrim(coalesce(v_variant ->> 'image_url', '')), '');
    if char_length(coalesce(v_variant_image, '')) > 2048 then
      raise exception 'The variant image URL is too long.';
    end if;
    v_index := v_index + 1;
    insert into public.menu_item_variants (
      menu_item_id, name, price_override, image_url, is_available, sort_order
    )
    values (
      v_id,
      v_variant_name,
      v_variant_price,
      v_variant_image,
      coalesce((v_variant ->> 'is_available')::boolean, true),
      coalesce(nullif(v_variant ->> 'sort_order', '')::integer, v_index)
    );
  end loop;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.delete_menu_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;
  if p_item_id is null or btrim(p_item_id) = '' then
    raise exception 'A menu item ID is required.';
  end if;

  delete from public.menu_items where id = p_item_id;
  if not found then
    raise exception 'Menu item not found.';
  end if;

  return jsonb_build_object('deleted', true);
end;
$$;

create or replace function public.place_order(
  p_table_number text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_variant public.menu_item_variants%rowtype;
  v_item_id text;
  v_quantity_text text;
  v_quantity integer;
  v_sugar text;
  v_variant_id uuid;
  v_variant_count integer;
  v_variant_name text;
  v_unit_price bigint;
  v_excluded_ids uuid[];
  v_excluded_names text[];
  v_excluded_count integer;
  v_total bigint := 0;
  v_item_count integer;
begin
  if p_table_number is null
    or char_length(btrim(p_table_number)) not between 1 and 30 then
    raise exception 'A valid table number is required.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Order items must be an array.';
  end if;
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count < 1 or v_item_count > 20 then
    raise exception 'An order must contain between 1 and 20 items.';
  end if;

  insert into public.orders (id, table_number)
  values (v_order_id, btrim(p_table_number));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Each order item must be an object.';
    end if;

    v_item_id := nullif(btrim(v_item ->> 'id'), '');
    v_quantity_text := coalesce(v_item ->> 'quantity', '');
    v_sugar := nullif(btrim(v_item ->> 'sugar'), '');
    if v_item_id is null or v_quantity_text !~ '^[0-9]{1,2}$' then
      raise exception 'An order item is invalid.';
    end if;

    v_quantity := v_quantity_text::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Item quantity must be between 1 and 99.';
    end if;

    select * into v_menu_item
    from public.menu_items
    where id = v_item_id and is_available = true;
    if not found then
      raise exception 'An item is no longer available.';
    end if;

    v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;
    select count(*) into v_variant_count
    from public.menu_item_variants
    where menu_item_id = v_item_id;
    v_variant_name := null;
    v_unit_price := v_menu_item.price;

    if v_variant_id is null and v_variant_count > 0 then
      raise exception 'Choose an available variant for this item.';
    elsif v_variant_id is not null then
      select * into v_variant
      from public.menu_item_variants
      where id = v_variant_id
        and menu_item_id = v_item_id
        and is_available = true;
      if not found then
        raise exception 'The selected variant is no longer available.';
      end if;
      v_variant_name := v_variant.name;
      v_unit_price := coalesce(v_variant.price_override, v_menu_item.price);
    end if;

    if v_menu_item.is_drink then
      if v_sugar is null or v_sugar not in ('بدون', 'قليل', 'عادي') then
        raise exception 'Choose a valid sugar option for drinks.';
      end if;
    elsif v_sugar is not null then
      raise exception 'Sugar options are only valid for drinks.';
    end if;

    if jsonb_typeof(coalesce(v_item -> 'excluded_ingredient_ids', '[]'::jsonb))
      is distinct from 'array' then
      raise exception 'Excluded ingredients must be an array.';
    end if;
    select count(*) into v_excluded_count
    from jsonb_array_elements(
      coalesce(v_item -> 'excluded_ingredient_ids', '[]'::jsonb)
    );
    if v_excluded_count > 50 then
      raise exception 'Too many ingredient exclusions were selected.';
    end if;
    select coalesce(
      array_agg((entry.value #>> '{}')::uuid),
      '{}'::uuid[]
    )
    into v_excluded_ids
    from jsonb_array_elements(
      coalesce(v_item -> 'excluded_ingredient_ids', '[]'::jsonb)
    ) as entry(value);
    select coalesce(array_agg(ingredient.name order by ingredient.sort_order), '{}'::text[])
    into v_excluded_names
    from unnest(v_excluded_ids) as requested(id)
    join public.menu_item_ingredients as ingredient
      on ingredient.id = requested.id
      and ingredient.menu_item_id = v_item_id
      and ingredient.is_excludable = true;
    if cardinality(v_excluded_names) <> v_excluded_count then
      raise exception 'An ingredient cannot be excluded for this item.';
    end if;

    insert into public.order_items (
      order_id, menu_item_id, item_name, variant_id, variant_name,
      excluded_ingredients, unit_price, quantity, sugar
    )
    values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_variant_id, v_variant_name,
      v_excluded_names, v_unit_price, v_quantity, v_sugar
    );
    v_total := v_total + (v_unit_price * v_quantity);
  end loop;

  update public.orders set total = v_total where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'total', v_total);
end;
$$;

revoke all on function public.save_menu_item(jsonb) from public;
revoke all on function public.delete_menu_item(text) from public;
revoke all on function public.place_order(text, jsonb) from public;
grant execute on function public.save_menu_item(jsonb) to authenticated;
grant execute on function public.delete_menu_item(text) to authenticated;
grant execute on function public.place_order(text, jsonb) to anon, authenticated;

-- Menu photos are public for display in the customer menu; only allowlisted
-- admins can upload, replace, or remove files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Public can read menu images" on storage.objects;
drop policy if exists "Admins can upload menu images" on storage.objects;
drop policy if exists "Admins can update menu images" on storage.objects;
drop policy if exists "Admins can delete menu images" on storage.objects;
create policy "Public can read menu images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'menu-images');
create policy "Admins can upload menu images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'menu-images' and public.is_menu_admin());
create policy "Admins can update menu images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'menu-images' and public.is_menu_admin())
  with check (bucket_id = 'menu-images' and public.is_menu_admin());
create policy "Admins can delete menu images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'menu-images' and public.is_menu_admin());

insert into public.menu_items (
  id, name, category, price, image_url, ingredients, is_drink, sort_order
)
values
  ('mezze', 'صحن مقبلات', 'مقبلات', 165, '/dishes/mezze-board.jpg',
    'حمص، متبل، زيت زيتون، مخللات، خبز طازج', false, 10),
  ('falafel', 'فلافل شامية', 'مقبلات', 95, '/dishes/falafel.jpg',
    'حمص، بقدونس، كزبرة، سمسم، طحينة', false, 20),
  ('chicken', 'دجاج مشوي', 'أطباق رئيسية', 285, '/dishes/grilled-chicken.jpg',
    'دجاج متبل، أرز بالزعفران، طماطم مشوية، أعشاب', false, 30),
  ('maklouba', 'مقلوبة', 'أطباق رئيسية', 260, '/dishes/maklouba.jpg',
    'أرز، باذنجان، دجاج طري، لوز محمص، بقدونس', false, 40),
  ('kunafa', 'كنافة نابلسية', 'حلويات', 145, '/dishes/kunafa.jpg',
    'عجينة كنافة، جبنة، قطر خفيف، فستق حلبي', false, 50),
  ('coffee', 'قهوة عربية', 'مشروبات', 85, '/dishes/coffee.jpg',
    'بن عربي محمص، هيل، ماء', true, 60)
on conflict (id) do nothing;

-- Preserve ingredients from the original menu as core ingredients. Staff can
-- later mark specific ingredients as excludable in /admin.
insert into public.menu_item_ingredients (menu_item_id, name, is_excludable, sort_order)
select
  item.id,
  btrim(parts.name),
  false,
  parts.ordinality::integer
from public.menu_items as item
cross join lateral unnest(string_to_array(coalesce(item.ingredients, ''), '،'))
  with ordinality as parts(name, ordinality)
where btrim(parts.name) <> ''
on conflict (menu_item_id, name) do nothing;

-- After creating a user in Supabase Authentication, run this once with their
-- email to grant access to /admin:
-- insert into public.admin_users (user_id)
-- select id from auth.users where lower(email) = lower('admin@example.com')
-- on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Table sessions, customer cancellation, service requests, and staff workflow
-- This section is additive and can be pasted again to upgrade an existing DB.
-- ---------------------------------------------------------------------------

create table if not exists public.dining_sessions (
  id uuid primary key default gen_random_uuid(),
  table_number text not null
    check (char_length(btrim(table_number)) between 1 and 30),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  paid_at timestamptz,
  tip_amount bigint not null default 0 check (tip_amount >= 0),
  created_at timestamptz not null default now(),
  check (paid_at is null or closed_at is not null)
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  table_number text not null
    check (char_length(btrim(table_number)) between 1 and 30),
  session_id uuid references public.dining_sessions(id) on delete set null,
  request_type text not null check (request_type in ('waiter', 'bill')),
  status text not null default 'pending'
    check (status in ('pending', 'resolved')),
  bill_amount bigint check (bill_amount is null or bill_amount >= 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.orders
  add column if not exists session_id uuid;

alter table public.order_items
  add column if not exists status text not null default 'pending',
  add column if not exists served_at timestamptz,
  add column if not exists cancelled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_session_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_session_id_fkey
      foreign key (session_id) references public.dining_sessions(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_status_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_status_check
      check (status in ('pending', 'served', 'cancelled'));
  end if;
end;
$$;

-- Attach orders created by the old single-order flow to a session without
-- discarding order history. Any unfinished legacy order keeps its table open.
do $$
declare
  v_legacy record;
  v_session_id uuid;
begin
  for v_legacy in
    select
      table_number,
      min(created_at) as opened_at,
      max(created_at) as last_order_at,
      bool_and(status in ('served', 'cancelled')) as is_finished
    from public.orders
    where session_id is null
    group by table_number
  loop
    select id
      into v_session_id
    from public.dining_sessions
    where table_number = v_legacy.table_number
      and closed_at is null
    order by opened_at
    limit 1
    for update;

    if v_session_id is null then
      insert into public.dining_sessions (
        table_number, opened_at, closed_at
      )
      values (
        v_legacy.table_number,
        v_legacy.opened_at,
        case when v_legacy.is_finished then v_legacy.last_order_at else null end
      )
      returning id into v_session_id;
    end if;

    update public.orders
    set session_id = v_session_id
    where session_id is null
      and table_number = v_legacy.table_number;
  end loop;
end;
$$;

update public.order_items as item
set
  status = case
    when parent.status = 'served' then 'served'
    when parent.status = 'cancelled' then 'cancelled'
    else 'pending'
  end,
  served_at = case
    when parent.status = 'served' then parent.created_at
    else item.served_at
  end,
  cancelled_at = case
    when parent.status = 'cancelled' then parent.created_at
    else item.cancelled_at
  end
from public.orders as parent
where parent.id = item.order_id
  and item.status = 'pending'
  and parent.status in ('served', 'cancelled');

alter table public.orders
  alter column session_id set not null;

create unique index if not exists dining_sessions_one_open_per_table_idx
  on public.dining_sessions (table_number)
  where closed_at is null;
create index if not exists dining_sessions_opened_at_idx
  on public.dining_sessions (opened_at desc);
create index if not exists orders_session_created_idx
  on public.orders (session_id, created_at);
create index if not exists service_requests_session_created_idx
  on public.service_requests (session_id, created_at desc);
create unique index if not exists service_requests_one_pending_per_table_idx
  on public.service_requests (table_number, request_type)
  where status = 'pending';

alter table public.dining_sessions enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "Admins can read dining sessions"
  on public.dining_sessions;
create policy "Admins can read dining sessions"
  on public.dining_sessions
  for select
  to authenticated
  using (public.is_menu_admin());

drop policy if exists "Admins can read service requests"
  on public.service_requests;
create policy "Admins can read service requests"
  on public.service_requests
  for select
  to authenticated
  using (public.is_menu_admin());

drop policy if exists "Admins can read orders"
  on public.orders;
create policy "Admins can read orders"
  on public.orders
  for select
  to authenticated
  using (public.is_menu_admin());

drop policy if exists "Admins can read order items"
  on public.order_items;
create policy "Admins can read order items"
  on public.order_items
  for select
  to authenticated
  using (public.is_menu_admin());

revoke all on table public.dining_sessions from anon, authenticated;
revoke all on table public.service_requests from anon, authenticated;
grant select on table public.dining_sessions to authenticated;
grant select on table public.service_requests to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;

create or replace function public.get_active_table_session(
  p_table_number text,
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.dining_sessions%rowtype;
  v_food_total bigint;
begin
  if p_table_number is null
    or char_length(btrim(p_table_number)) not between 1 and 30
    or p_session_id is null then
    return null;
  end if;

  select *
  into v_session
  from public.dining_sessions
  where id = p_session_id
    and table_number = btrim(p_table_number)
    and closed_at is null;
  if not found then
    return null;
  end if;

  select coalesce(sum(item.line_total), 0)
  into v_food_total
  from public.orders as parent
  join public.order_items as item on item.order_id = parent.id
  where parent.session_id = v_session.id
    and item.status <> 'cancelled';

  return jsonb_build_object(
    'id', v_session.id,
    'table_number', v_session.table_number,
    'opened_at', v_session.opened_at,
    'closed_at', v_session.closed_at,
    'paid_at', v_session.paid_at,
    'tip_amount', v_session.tip_amount,
    'total', v_food_total + v_session.tip_amount,
    'waiter_requested', exists (
      select 1
      from public.service_requests
      where session_id = v_session.id
        and request_type = 'waiter'
        and status = 'pending'
    ),
    'bill_requested', exists (
      select 1
      from public.service_requests
      where session_id = v_session.id
        and request_type = 'bill'
        and status = 'pending'
    ),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', parent.id,
          'table_number', parent.table_number,
          'status', parent.status,
          'total', parent.total,
          'created_at', parent.created_at,
          'order_items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'item_name', item.item_name,
                'variant_name', item.variant_name,
                'sugar', item.sugar,
                'excluded_ingredients', item.excluded_ingredients,
                'quantity', item.quantity,
                'unit_price', item.unit_price,
                'line_total', item.line_total,
                'status', item.status,
                'served_at', item.served_at,
                'cancelled_at', item.cancelled_at
              )
              order by item.id
            )
            from public.order_items as item
            where item.order_id = parent.id
          ), '[]'::jsonb)
        )
        order by parent.created_at
      )
      from public.orders as parent
      where parent.session_id = v_session.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.place_order(
  p_table_number text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_session_id uuid;
  v_session_tip bigint;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_variant public.menu_item_variants%rowtype;
  v_item_id text;
  v_quantity_text text;
  v_quantity integer;
  v_sugar text;
  v_variant_id uuid;
  v_variant_count integer;
  v_variant_name text;
  v_unit_price bigint;
  v_excluded_ids uuid[];
  v_excluded_names text[];
  v_excluded_count integer;
  v_order_total bigint := 0;
  v_session_total bigint := 0;
  v_item_count integer;
begin
  if p_table_number is null
    or char_length(btrim(p_table_number)) not between 1 and 30 then
    raise exception 'A valid table number is required.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Order items must be an array.';
  end if;
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count < 1 or v_item_count > 20 then
    raise exception 'An order must contain between 1 and 20 items.';
  end if;

  select id
  into v_session_id
  from public.dining_sessions
  where table_number = btrim(p_table_number)
    and closed_at is null
  for update;

  if v_session_id is null then
    insert into public.dining_sessions (table_number)
    values (btrim(p_table_number))
    on conflict (table_number) where closed_at is null do nothing
    returning id into v_session_id;

    if v_session_id is null then
      select id
      into v_session_id
      from public.dining_sessions
      where table_number = btrim(p_table_number)
        and closed_at is null
      for update;
    end if;
  end if;

  insert into public.orders (id, session_id, table_number, status, total)
  values (v_order_id, v_session_id, btrim(p_table_number), 'received', 0);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Each order item must be an object.';
    end if;

    v_item_id := nullif(btrim(v_item ->> 'id'), '');
    v_quantity_text := coalesce(v_item ->> 'quantity', '');
    v_sugar := nullif(btrim(v_item ->> 'sugar'), '');
    if v_item_id is null or v_quantity_text !~ '^[0-9]{1,2}$' then
      raise exception 'An order item is invalid.';
    end if;

    v_quantity := v_quantity_text::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Item quantity must be between 1 and 99.';
    end if;

    select * into v_menu_item
    from public.menu_items
    where id = v_item_id and is_available = true;
    if not found then
      raise exception 'An item is no longer available.';
    end if;

    v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;
    select count(*) into v_variant_count
    from public.menu_item_variants
    where menu_item_id = v_item_id;
    v_variant_name := null;
    v_unit_price := v_menu_item.price;

    if v_variant_id is null and v_variant_count > 0 then
      raise exception 'Choose an available variant for this item.';
    elsif v_variant_id is not null then
      select * into v_variant
      from public.menu_item_variants
      where id = v_variant_id
        and menu_item_id = v_item_id
        and is_available = true;
      if not found then
        raise exception 'The selected variant is no longer available.';
      end if;
      v_variant_name := v_variant.name;
      v_unit_price := coalesce(v_variant.price_override, v_menu_item.price);
    end if;

    if v_menu_item.is_drink then
      if v_sugar is null or v_sugar not in ('بدون', 'قليل', 'عادي') then
        raise exception 'Choose a valid sugar option for drinks.';
      end if;
    elsif v_sugar is not null then
      raise exception 'Sugar options are only valid for drinks.';
    end if;

    if jsonb_typeof(coalesce(v_item -> 'excluded_ingredient_ids', '[]'::jsonb))
      is distinct from 'array' then
      raise exception 'Excluded ingredients must be an array.';
    end if;
    select count(*) into v_excluded_count
    from jsonb_array_elements(
      coalesce(v_item -> 'excluded_ingredient_ids', '[]'::jsonb)
    );
    if v_excluded_count > 50 then
      raise exception 'Too many ingredient exclusions were selected.';
    end if;
    select coalesce(
      array_agg((entry.value #>> '{}')::uuid),
      '{}'::uuid[]
    )
    into v_excluded_ids
    from jsonb_array_elements(
      coalesce(v_item -> 'excluded_ingredient_ids', '[]'::jsonb)
    ) as entry(value);
    select coalesce(
      array_agg(ingredient.name order by ingredient.sort_order),
      '{}'::text[]
    )
    into v_excluded_names
    from unnest(v_excluded_ids) as requested(id)
    join public.menu_item_ingredients as ingredient
      on ingredient.id = requested.id
      and ingredient.menu_item_id = v_item_id
      and ingredient.is_excludable = true;
    if cardinality(v_excluded_names) <> v_excluded_count then
      raise exception 'An ingredient cannot be excluded for this item.';
    end if;

    insert into public.order_items (
      order_id, menu_item_id, item_name, variant_id, variant_name,
      excluded_ingredients, unit_price, quantity, sugar
    )
    values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_variant_id, v_variant_name,
      v_excluded_names, v_unit_price, v_quantity, v_sugar
    );
    v_order_total := v_order_total + (v_unit_price * v_quantity);
  end loop;

  update public.orders
  set total = v_order_total
  where id = v_order_id;

  select tip_amount
  into v_session_tip
  from public.dining_sessions
  where id = v_session_id;

  select coalesce(sum(item.line_total), 0) + v_session_tip
  into v_session_total
  from public.orders as parent
  join public.order_items as item on item.order_id = parent.id
  where parent.session_id = v_session_id
    and item.status <> 'cancelled';

  update public.service_requests
  set bill_amount = v_session_total
  where session_id = v_session_id
    and request_type = 'bill'
    and status = 'pending';

  return jsonb_build_object(
    'order_id', v_order_id,
    'session_id', v_session_id,
    'order_total', v_order_total,
    'session_total', v_session_total
  );
end;
$$;

create or replace function public.cancel_session_order(
  p_session_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tip bigint;
  v_session_total bigint;
begin
  select session.tip_amount
  into v_tip
  from public.dining_sessions as session
  join public.orders as parent on parent.session_id = session.id
  where session.id = p_session_id
    and session.closed_at is null
    and parent.id = p_order_id
  for update of session;
  if not found then
    raise exception 'This table session is no longer open.';
  end if;

  if exists (
    select 1 from public.order_items
    where order_id = p_order_id and status = 'served'
  ) then
    raise exception 'A served item cannot be cancelled with its order.';
  end if;

  update public.order_items
  set status = 'cancelled', cancelled_at = now()
  where order_id = p_order_id and status = 'pending';

  update public.orders
  set status = 'cancelled', total = 0
  where id = p_order_id;

  select coalesce(sum(item.line_total), 0) + v_tip
  into v_session_total
  from public.orders as parent
  join public.order_items as item on item.order_id = parent.id
  where parent.session_id = p_session_id
    and item.status <> 'cancelled';

  update public.service_requests
  set bill_amount = v_session_total
  where session_id = p_session_id
    and request_type = 'bill'
    and status = 'pending';

  return jsonb_build_object(
    'cancelled', true,
    'session_total', v_session_total
  );
end;
$$;

create or replace function public.cancel_session_order_item(
  p_session_id uuid,
  p_order_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_tip bigint;
  v_session_total bigint;
begin
  select session.tip_amount, parent.id
  into v_tip, v_order_id
  from public.dining_sessions as session
  join public.orders as parent on parent.session_id = session.id
  join public.order_items as item on item.order_id = parent.id
  where session.id = p_session_id
    and session.closed_at is null
    and item.id = p_order_item_id
    and item.status = 'pending'
  for update of session, item;
  if not found then
    raise exception 'This item is already served or the table session is closed.';
  end if;

  update public.order_items
  set status = 'cancelled', cancelled_at = now()
  where id = p_order_item_id and status = 'pending';

  update public.orders as parent
  set
    total = coalesce((
      select sum(item.line_total)
      from public.order_items as item
      where item.order_id = parent.id
        and item.status <> 'cancelled'
    ), 0),
    status = case
      when exists (
        select 1 from public.order_items as item
        where item.order_id = parent.id and item.status = 'pending'
      ) then 'received'
      when exists (
        select 1 from public.order_items as item
        where item.order_id = parent.id and item.status = 'served'
      ) then 'served'
      else 'cancelled'
    end
  where parent.id = v_order_id;

  select coalesce(sum(item.line_total), 0) + v_tip
  into v_session_total
  from public.orders as parent
  join public.order_items as item on item.order_id = parent.id
  where parent.session_id = p_session_id
    and item.status <> 'cancelled';

  update public.service_requests
  set bill_amount = v_session_total
  where session_id = p_session_id
    and request_type = 'bill'
    and status = 'pending';

  return jsonb_build_object(
    'cancelled', true,
    'session_total', v_session_total
  );
end;
$$;

create or replace function public.request_waiter(
  p_table_number text,
  p_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_request_id uuid;
begin
  if p_table_number is null
    or char_length(btrim(p_table_number)) not between 1 and 30 then
    raise exception 'A valid table number is required.';
  end if;

  select id
  into v_session_id
  from public.dining_sessions
  where table_number = btrim(p_table_number)
    and closed_at is null
    and (p_session_id is null or id = p_session_id)
  order by opened_at desc
  limit 1;

  insert into public.service_requests (
    table_number, session_id, request_type, status
  )
  values (
    btrim(p_table_number), v_session_id, 'waiter', 'pending'
  )
  on conflict (table_number, request_type) where status = 'pending'
  do nothing
  returning id into v_request_id;

  if v_request_id is null then
    select id
    into v_request_id
    from public.service_requests
    where table_number = btrim(p_table_number)
      and request_type = 'waiter'
      and status = 'pending';
  end if;

  return jsonb_build_object('request_id', v_request_id);
end;
$$;

create or replace function public.request_session_bill(
  p_session_id uuid,
  p_tip_amount bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.dining_sessions%rowtype;
  v_food_total bigint;
  v_bill_amount bigint;
  v_request_id uuid;
begin
  if p_session_id is null
    or p_tip_amount is null
    or p_tip_amount < 0
    or p_tip_amount > 1000000000000 then
    raise exception 'Enter a valid, non-negative tip.';
  end if;

  select *
  into v_session
  from public.dining_sessions
  where id = p_session_id and closed_at is null
  for update;
  if not found then
    raise exception 'This table session is no longer open.';
  end if;

  update public.dining_sessions
  set tip_amount = p_tip_amount
  where id = p_session_id;

  select coalesce(sum(item.line_total), 0)
  into v_food_total
  from public.orders as parent
  join public.order_items as item on item.order_id = parent.id
  where parent.session_id = p_session_id
    and item.status <> 'cancelled';
  v_bill_amount := v_food_total + p_tip_amount;

  insert into public.service_requests (
    table_number, session_id, request_type, status, bill_amount
  )
  values (
    v_session.table_number, p_session_id, 'bill', 'pending', v_bill_amount
  )
  on conflict (table_number, request_type) where status = 'pending'
  do update set
    session_id = excluded.session_id,
    bill_amount = excluded.bill_amount,
    created_at = now()
  returning id into v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'bill_amount', v_bill_amount
  );
end;
$$;

create or replace function public.admin_mark_order_item_served(
  p_order_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_order_id uuid;
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;

  select session.id
  into v_session_id
  from public.dining_sessions as session
  join public.orders as parent on parent.session_id = session.id
  join public.order_items as item on item.order_id = parent.id
  where item.id = p_order_item_id
  for update of session;
  if not found then
    raise exception 'Order item not found.';
  end if;

  update public.order_items
  set status = 'served', served_at = now()
  where id = p_order_item_id and status = 'pending'
  returning order_id into v_order_id;
  if v_order_id is null then
    raise exception 'Order item is no longer pending.';
  end if;

  update public.orders as parent
  set status = case
    when exists (
      select 1 from public.order_items as item
      where item.order_id = parent.id and item.status = 'pending'
    ) then 'received'
    when exists (
      select 1 from public.order_items as item
      where item.order_id = parent.id and item.status = 'served'
    ) then 'served'
    else 'cancelled'
  end
  where parent.id = v_order_id;

  return jsonb_build_object('served', true);
end;
$$;

create or replace function public.admin_mark_order_served(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;

  select session.id
  into v_session_id
  from public.dining_sessions as session
  join public.orders as parent on parent.session_id = session.id
  where parent.id = p_order_id
  for update of session;
  if not found then
    raise exception 'Order not found.';
  end if;

  update public.order_items
  set status = 'served', served_at = now()
  where order_id = p_order_id and status = 'pending';

  update public.orders as parent
  set status = case
    when exists (
      select 1 from public.order_items as item
      where item.order_id = parent.id and item.status = 'pending'
    ) then 'received'
    when exists (
      select 1 from public.order_items as item
      where item.order_id = parent.id and item.status = 'served'
    ) then 'served'
    else 'cancelled'
  end
  where parent.id = p_order_id;

  return jsonb_build_object('served', true);
end;
$$;

create or replace function public.admin_close_dining_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.dining_sessions
  set closed_at = coalesce(closed_at, now())
  where id = p_session_id;
  if not found then
    raise exception 'Table session not found.';
  end if;

  update public.service_requests
  set status = 'resolved', resolved_at = coalesce(resolved_at, now())
  where session_id = p_session_id and status = 'pending';

  return jsonb_build_object('closed', true);
end;
$$;

create or replace function public.admin_mark_dining_session_paid(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_total bigint;
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;

  select id
  into v_session_id
  from public.dining_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'Table session not found.';
  end if;

  select
    coalesce(sum(item.line_total), 0) + session.tip_amount
  into v_total
  from public.dining_sessions as session
  left join public.orders as parent on parent.session_id = session.id
  left join public.order_items as item
    on item.order_id = parent.id and item.status <> 'cancelled'
  where session.id = p_session_id
  group by session.tip_amount;

  update public.dining_sessions
  set
    paid_at = coalesce(paid_at, now()),
    closed_at = coalesce(closed_at, now())
  where id = p_session_id;

  update public.service_requests
  set status = 'resolved', resolved_at = coalesce(resolved_at, now())
  where session_id = p_session_id and status = 'pending';

  return jsonb_build_object('paid', true, 'total', v_total);
end;
$$;

create or replace function public.admin_resolve_service_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_menu_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.service_requests
  set status = 'resolved', resolved_at = coalesce(resolved_at, now())
  where id = p_request_id;
  if not found then
    raise exception 'Service request not found.';
  end if;

  return jsonb_build_object('resolved', true);
end;
$$;

revoke all on function public.get_active_table_session(text, uuid) from public;
revoke all on function public.place_order(text, jsonb) from public;
revoke all on function public.cancel_session_order(uuid, uuid) from public;
revoke all on function public.cancel_session_order_item(uuid, uuid) from public;
revoke all on function public.request_waiter(text, uuid) from public;
revoke all on function public.request_session_bill(uuid, bigint) from public;
revoke all on function public.admin_mark_order_item_served(uuid) from public;
revoke all on function public.admin_mark_order_served(uuid) from public;
revoke all on function public.admin_close_dining_session(uuid) from public;
revoke all on function public.admin_mark_dining_session_paid(uuid) from public;
revoke all on function public.admin_resolve_service_request(uuid) from public;

grant execute on function public.get_active_table_session(text, uuid)
  to anon, authenticated;
grant execute on function public.place_order(text, jsonb)
  to anon, authenticated;
grant execute on function public.cancel_session_order(uuid, uuid)
  to anon, authenticated;
grant execute on function public.cancel_session_order_item(uuid, uuid)
  to anon, authenticated;
grant execute on function public.request_waiter(text, uuid)
  to anon, authenticated;
grant execute on function public.request_session_bill(uuid, bigint)
  to anon, authenticated;
grant execute on function public.admin_mark_order_item_served(uuid)
  to authenticated;
grant execute on function public.admin_mark_order_served(uuid)
  to authenticated;
grant execute on function public.admin_close_dining_session(uuid)
  to authenticated;
grant execute on function public.admin_mark_dining_session_paid(uuid)
  to authenticated;
grant execute on function public.admin_resolve_service_request(uuid)
  to authenticated;
