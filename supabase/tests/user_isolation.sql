-- Execute after migrations in a disposable local database as postgres. All fixture writes roll back.
begin;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.ensure_app_user();
do $$
declare owner uuid := public.ensure_app_user(); item jsonb; rejected boolean := false; page jsonb; candidate jsonb;
begin
  if owner = auth.uid() then raise exception 'Application UUID must differ from auth UUID'; end if;
  item := jsonb_build_object('id','test-operation','ownerId',owner,'deviceId','test-device',
    'entityKind','favorite','entityId','book-1','payload',jsonb_build_object('active',true),
    'createdAt','2026-11-12T00:00:00.000Z');
  perform public.push_operations(jsonb_build_array(item));
  perform public.push_operations(jsonb_build_array(item));
  page := public.pull_operations(0);
  if jsonb_array_length(page->'operations') <> 1 or (page->>'cursor')::int <> 1 then
    raise exception 'Retry was not idempotent';
  end if;
  if jsonb_array_length(public.pull_operations(1)->'operations') <> 0 then
    raise exception 'Cursor repeated acknowledged data';
  end if;
  begin
    perform public.push_operations(jsonb_build_array(jsonb_set(item,'{payload}','{"active":false}')));
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Conflicting duplicate was accepted'; end if;
  rejected := false;
  begin
    perform public.push_operations(jsonb_build_array(jsonb_set(item,'{ownerId}',
      '"22222222-2222-4222-8222-222222222222"')));
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Owner impersonation was accepted'; end if;
  rejected := false;
  begin
    perform public.push_operations(jsonb_build_array(jsonb_set(item,'{entityKind}','"admin"')));
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Invalid entity kind was accepted'; end if;
  for candidate in select value from jsonb_array_elements('[
    {"kind":"favorite","payload":{"favorite":true}},
    {"kind":"favorite","payload":{"active":true,"extra":1}},
    {"kind":"reading","payload":{"sentenceId":"sentence","position":-1}},
    {"kind":"reading","payload":{"sentenceId":"sentence","position":1.5}},
    {"kind":"reading","payload":{"sentenceId":"sentence","position":0,"bookId":null}},
    {"kind":"learning","payload":{"status":"admin"}},
    {"kind":"preferences","payload":{"fontSize":10000}},
    {"kind":"preferences","payload":{"syncEnabled":"true"}},
    {"kind":"preferences","payload":{"dailyReviewLimit":1.5}},
    {"kind":"preferences","payload":{"unknown":true}},
    {"kind":"review","payload":{"rating":null}},
    {"kind":"review","payload":{"rating":""}},
    {"kind":"review","payload":{"rating":1}},
    {"kind":"review","payload":{"rating":"good","repetitions":-1}},
    {"kind":"review","payload":{"rating":"good","dueAt":1.5}},
    {"kind":"review","payload":{"rating":"good","extra":true}},
    {"kind":"learning","payload":{"status":"known","extra":true}},
    {"kind":"learning","payload":{"status":"known","automatic":true}},
    {"kind":"review","payload":{"rating":"good","reviewedAt":"2026-02-30T00:00:00Z"}}
  ]'::jsonb) loop
    rejected := false;
    begin
      perform public.push_operations(jsonb_build_array(
        item || jsonb_build_object('id','invalid-fixture','entityKind',candidate->>'kind','payload',candidate->'payload')));
    exception when others then rejected := true; end;
    if not rejected then raise exception 'Invalid payload accepted: %', candidate; end if;
  end loop;
  rejected := false;
  begin
    perform public.push_operations(jsonb_build_array(item ||
      jsonb_build_object('id','bad-date','createdAt','2026-02-30T00:00:00Z')));
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Invalid calendar date accepted'; end if;
  if has_function_privilege('authenticated', 'public.operation_payload_valid(text,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.operation_timestamp_valid(text,boolean)', 'execute') then
    raise exception 'Internal helper execute permission leaked';
  end if;
  rejected := false;
  begin
    update public.user_operations set operation = '{}'::jsonb;
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Direct ledger mutation was permitted'; end if;
  rejected := false;
  begin
    update public.app_users set auth_user_id = '22222222-2222-4222-8222-222222222222';
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Identity remapping was permitted'; end if;
  item := jsonb_set(jsonb_set(item,'{id}','"competing-operation"'),'{payload}','{"active":false}');
  item := jsonb_set(item,'{createdAt}','"2026-11-12T05:00:00+05:00"');
  perform public.push_operations(jsonb_build_array(item));
  page := public.pull_operations(0);
  if jsonb_array_length(page->'operations') <> 2 or (page->>'cursor')::int <> 2 then
    raise exception 'Competing operation was not retained';
  end if;
  perform public.push_operations(jsonb_build_array(item || jsonb_build_object(
    'id','valid-review','entityKind','review','payload',jsonb_build_object(
      'rating','good','correct',true,'taskId','task','repetitions',1,'intervalDays',1.5,'dueAt',1794484800000,
      'reviewedAt','2026-11-12T05:00:00+05:00'))));
  perform public.push_operations(jsonb_build_array(item || jsonb_build_object(
    'id','automatic-encounter','entityKind','learning','payload',jsonb_build_object(
      'status','encountered','automatic',true))));
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.ensure_app_user();
do $$
begin
  if (select count(*) from public.app_users) <> 1 then raise exception 'Application user RLS leak'; end if;
  if exists (select 1 from public.user_operations) then raise exception 'Operation RLS leak'; end if;
  if jsonb_array_length(public.pull_operations(0)->'operations') <> 0 then raise exception 'RPC data leak'; end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare rejected boolean := false;
begin
  if not public.heartbeat() then raise exception 'Heartbeat failed'; end if;
  begin
    perform public.ensure_app_user();
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anonymous identity RPC was permitted'; end if;
end;
$$;
reset role;
rollback;
