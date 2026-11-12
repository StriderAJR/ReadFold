begin;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  next_cursor bigint not null default 0 check (next_cursor between 0 and 9007199254740991)
);

create table public.user_operations (
  owner_id uuid not null references public.app_users(id) on delete cascade,
  operation_id text not null,
  cursor bigint not null,
  operation jsonb not null,
  primary key (owner_id, operation_id),
  unique (owner_id, cursor)
);

alter table public.app_users enable row level security;
alter table public.user_operations enable row level security;
revoke all on public.app_users, public.user_operations from anon, authenticated;
grant select on public.app_users, public.user_operations to authenticated;
create policy own_app_user on public.app_users for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy own_operations on public.user_operations for select to authenticated
  using (owner_id in (select id from public.app_users where auth_user_id = (select auth.uid())));

create function public.operation_timestamp_valid(value text, allow_offset boolean default true) returns boolean
language plpgsql immutable set search_path = '' as $$
declare year_value integer; month_value integer; day_value integer; max_day integer;
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?(Z|[+-][0-9]{2}:?[0-9]{2})$'
    or (not allow_offset and right(value, 1) <> 'Z') then return false; end if;
  year_value := substring(value from 1 for 4)::integer;
  month_value := substring(value from 6 for 2)::integer;
  day_value := substring(value from 9 for 2)::integer;
  if month_value not between 1 and 12 then return false; end if;
  max_day := case when month_value in (4,6,9,11) then 30 when month_value = 2 then 28 else 31 end;
  if month_value = 2 and year_value % 4 = 0 and (year_value % 100 <> 0 or year_value % 400 = 0) then
    max_day := 29;
  end if;
  return day_value between 1 and max_day;
exception when others then return false;
end;
$$;

create function public.operation_payload_valid(kind text, payload jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare key text; value jsonb; number_value numeric;
begin
  if jsonb_typeof(payload) is distinct from 'object' then return false; end if;
  case kind
    when 'reading' then
      if not (payload ?& array['sentenceId','position'])
        or jsonb_typeof(payload->'sentenceId') is distinct from 'string'
        or length(payload->>'sentenceId') not between 1 and 512
        or jsonb_typeof(payload->'position') is distinct from 'number' then return false; end if;
      number_value := (payload->>'position')::numeric;
      if number_value < 0 or number_value > 9007199254740991
        or trunc(number_value) <> number_value then return false; end if;
      for key, value in select * from jsonb_each(payload) loop
        if key not in ('sentenceId','position','bookId','chapterId') then return false; end if;
        if key in ('bookId','chapterId') and (jsonb_typeof(value) <> 'string'
          or length(value #>> '{}') > 512) then return false; end if;
      end loop;
    when 'learning' then
      if jsonb_typeof(payload->'status') is distinct from 'string'
        or payload->>'status' not in ('encountered','learning','known','mastered') then return false; end if;
      for key, value in select * from jsonb_each(payload) loop
        if key not in ('status','automatic') then return false; end if;
        if key = 'automatic' and (jsonb_typeof(value) <> 'boolean'
          or (value = 'true'::jsonb and payload->>'status' <> 'encountered')) then return false; end if;
      end loop;
    when 'favorite' then
      if (select count(*) from jsonb_object_keys(payload)) <> 1
        or jsonb_typeof(payload->'active') is distinct from 'boolean' then return false; end if;
    when 'review' then
      if jsonb_typeof(payload->'rating') is distinct from 'string'
        or payload->>'rating' not in ('again','hard','good','easy') then return false; end if;
      if payload ? 'reviewedAt' then
        if jsonb_typeof(payload->'reviewedAt') is distinct from 'string'
          or not public.operation_timestamp_valid(payload->>'reviewedAt') then return false; end if;
      end if;
      for key, value in select * from jsonb_each(payload) loop
        if key in ('rating','reviewedAt') then continue;
        elsif key = 'correct' then
          if jsonb_typeof(value) <> 'boolean' then return false; end if;
        elsif key = 'taskId' then
          if jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 512 then return false; end if;
        elsif key in ('repetitions','intervalDays','dueAt') then
          if jsonb_typeof(value) <> 'number' then return false; end if;
          number_value := value::text::numeric;
          if number_value < 0 or number_value > 9007199254740991
            or (key <> 'intervalDays' and trunc(number_value) <> number_value) then return false; end if;
        else return false;
        end if;
      end loop;
    when 'preferences' then
      for key, value in select * from jsonb_each(payload) loop
        if key in ('furigana','hiragana','romaji','literal','natural','words','kanji','grammar',
          'adaptiveHideKnown','syncEnabled') then
          if jsonb_typeof(value) <> 'boolean' then return false; end if;
        elsif key in ('fontSize','lineHeight','width','dailyReviewLimit') then
          if jsonb_typeof(value) <> 'number' then return false; end if;
          number_value := value::text::numeric;
          if (key = 'fontSize' and (number_value < 10 or number_value > 80))
            or (key = 'lineHeight' and (number_value < 1 or number_value > 4))
            or (key = 'width' and (number_value < 200 or number_value > 2000))
            or (key = 'dailyReviewLimit' and (number_value < 1 or number_value > 1000
              or trunc(number_value) <> number_value)) then return false; end if;
        elsif key = 'language' then
          if value not in ('"ru"'::jsonb,'"en"'::jsonb) then return false; end if;
        elsif key = 'theme' then
          if value not in ('"light"'::jsonb,'"dark"'::jsonb,'"system"'::jsonb) then return false; end if;
        elsif key = 'mode' then
          if value not in ('"detailed"'::jsonb,'"adaptive"'::jsonb,'"continuous"'::jsonb) then return false; end if;
        else return false;
        end if;
      end loop;
    else return false;
  end case;
  return true;
exception when others then return false;
end;
$$;

create function public.ensure_app_user() returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.app_users(auth_user_id) values (auth.uid())
    on conflict (auth_user_id) do nothing;
  select id into strict result from public.app_users where auth_user_id = auth.uid();
  return result;
end;
$$;

create function public.push_operations(p_operations jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  item jsonb;
  previous jsonb;
  sequence_value bigint;
begin
  owner := public.ensure_app_user();
  if jsonb_typeof(p_operations) is distinct from 'array' then raise exception 'Expected operation array'; end if;
  if jsonb_array_length(p_operations) > 100 or octet_length(p_operations::text) > 1048576 then
    raise exception 'Operation batch too large';
  end if;
  -- Lock per owner before assigning cursors. Later transactions cannot commit higher cursors first.
  select next_cursor into strict sequence_value from public.app_users where id = owner for update;
  for item in select value from jsonb_array_elements(p_operations) loop
    if jsonb_typeof(item) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 7
      or not (item ?& array['id','ownerId','deviceId','entityKind','entityId','payload','createdAt'])
      or jsonb_typeof(item->'id') is distinct from 'string'
      or length(item->>'id') not between 1 and 128
      or item->>'ownerId' is distinct from owner::text
      or jsonb_typeof(item->'deviceId') is distinct from 'string'
      or length(item->>'deviceId') not between 1 and 128
      or jsonb_typeof(item->'entityId') is distinct from 'string'
      or length(item->>'entityId') not between 1 and 512
      or (item->>'entityKind') not in ('reading','learning','preferences','favorite','review')
      or jsonb_typeof(item->'entityKind') is distinct from 'string'
      or jsonb_typeof(item->'payload') is distinct from 'object'
      or octet_length((item->'payload')::text) > 65536
      or jsonb_typeof(item->'createdAt') is distinct from 'string'
      or length(item->>'createdAt') > 64
      or not public.operation_timestamp_valid(item->>'createdAt')
      or not public.operation_payload_valid(item->>'entityKind', item->'payload') then
      raise exception 'Invalid operation';
    end if;
    -- Retain the validated ISO timestamp verbatim for exact retry comparison.
    select operation into previous from public.user_operations
      where owner_id = owner and operation_id = item->>'id';
    if found then
      if previous is distinct from item then
        raise exception 'Operation ID reused with different contents' using errcode = '23505';
      end if;
    else
      sequence_value := sequence_value + 1;
      insert into public.user_operations(owner_id, operation_id, cursor, operation)
        values (owner, item->>'id', sequence_value, item);
    end if;
  end loop;
  update public.app_users set next_cursor = sequence_value where id = owner;
end;
$$;

create function public.pull_operations(p_cursor bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid; result jsonb;
begin
  owner := public.ensure_app_user();
  if p_cursor is null or p_cursor < 0 or p_cursor > 9007199254740991 then raise exception 'Invalid cursor'; end if;
  select jsonb_build_object(
    'operations', coalesce(jsonb_agg(operation order by cursor), '[]'::jsonb),
    'cursor', coalesce(max(cursor), p_cursor)
  ) into result from (
    select operation, cursor from public.user_operations
      where owner_id = owner and cursor > p_cursor order by cursor limit 100
  ) page;
  return result;
end;
$$;

create function public.heartbeat() returns boolean
language sql stable set search_path = '' as $$ select true; $$;

revoke all on function public.ensure_app_user() from public, anon;
revoke all on function public.push_operations(jsonb) from public, anon;
revoke all on function public.pull_operations(bigint) from public, anon;
revoke all on function public.heartbeat() from public;
revoke all on function public.operation_timestamp_valid(text, boolean) from public, anon, authenticated;
revoke all on function public.operation_payload_valid(text, jsonb) from public, anon, authenticated;
grant execute on function public.ensure_app_user(), public.push_operations(jsonb), public.pull_operations(bigint)
  to authenticated;
grant execute on function public.heartbeat() to anon, authenticated;

commit;
