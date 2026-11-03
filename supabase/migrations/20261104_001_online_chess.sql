-- Möbius Chess: online games.
--
-- The tables are only read directly, and only by the two players. Every write goes
-- through the functions below, which check who is playing and whose turn it is.
-- Chess legality itself is checked by both players' games when they replay the moves.

create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  mode text not null check (mode in ('classic', 'mobius')),
  is_public boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  creator_id uuid not null,
  white_id uuid,
  black_id uuid,
  ply_count integer not null default 0,
  result text check (result in ('white-wins', 'black-wins', 'draw')),
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chess_moves (
  game_id uuid not null references public.chess_games(id) on delete cascade,
  ply integer not null,
  player_id uuid not null,
  from_x smallint not null check (from_x between 0 and 15),
  from_y smallint not null check (from_y between 0 and 7),
  to_x smallint not null check (to_x between 0 and 15),
  to_y smallint not null check (to_y between 0 and 7),
  promotion text check (promotion in ('queen', 'rook', 'bishop', 'knight')),
  created_at timestamptz not null default now(),
  primary key (game_id, ply)
);

create index if not exists chess_games_quick_match_idx
  on public.chess_games (mode, created_at)
  where status = 'waiting' and is_public;

alter table public.chess_games enable row level security;
alter table public.chess_moves enable row level security;

revoke all on public.chess_games, public.chess_moves from public, anon, authenticated;
grant select on public.chess_games, public.chess_moves to authenticated;

drop policy if exists "players read their games" on public.chess_games;
create policy "players read their games" on public.chess_games
  for select to authenticated
  using ((select auth.uid()) in (white_id, black_id, creator_id));

drop policy if exists "players read their moves" on public.chess_moves;
create policy "players read their moves" on public.chess_moves
  for select to authenticated
  using (exists (
    select 1 from public.chess_games g
    where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)
  ));

create or replace function public.chess_require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  return uid;
end $$;

create or replace function public.chess_new_game(p_uid uuid, p_mode text, p_color text, p_public boolean)
returns public.chess_games
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  color text := p_color;
  game public.chess_games;
begin
  if p_mode not in ('classic', 'mobius') then raise exception 'bad_mode'; end if;
  if color = 'random' then color := case when random() < 0.5 then 'white' else 'black' end; end if;
  if color not in ('white', 'black') then raise exception 'bad_color'; end if;

  -- Rooms nobody joined, and games nobody has touched for a long time, do not pile up.
  delete from public.chess_games where status = 'waiting' and (creator_id = p_uid or updated_at < now() - interval '1 day');
  delete from public.chess_games where updated_at < now() - interval '30 days';

  for attempt in 1..8 loop
    code := '';
    for position in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.chess_games (room_code, mode, is_public, creator_id, white_id, black_id)
      values (code, p_mode, p_public, p_uid,
              case when color = 'white' then p_uid end,
              case when color = 'black' then p_uid end)
      returning * into game;
      return game;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'no_room_code';
end $$;

create or replace function public.create_chess_game(p_mode text, p_color text)
returns public.chess_games
language plpgsql security definer set search_path = '' as $$
begin
  return public.chess_new_game(public.chess_require_user(), p_mode, p_color, false);
end $$;

create or replace function public.join_chess_game(p_room_code text)
returns public.chess_games
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.chess_require_user();
  game public.chess_games;
begin
  select * into game from public.chess_games where room_code = upper(trim(p_room_code)) for update;
  if not found then raise exception 'room_not_found'; end if;
  if uid in (game.white_id, game.black_id) then return game; end if;
  if game.status <> 'waiting' then raise exception 'room_full'; end if;

  update public.chess_games
  set white_id = coalesce(white_id, uid), black_id = coalesce(black_id, uid), status = 'active', updated_at = now()
  where id = game.id
  returning * into game;
  return game;
end $$;

create or replace function public.quick_match_chess(p_mode text)
returns public.chess_games
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.chess_require_user();
  game public.chess_games;
begin
  select * into game from public.chess_games
  where status = 'waiting' and is_public and mode = p_mode and creator_id <> uid
    and created_at > now() - interval '10 minutes'
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    return public.chess_new_game(uid, p_mode, 'random', true);
  end if;

  update public.chess_games
  set white_id = coalesce(white_id, uid), black_id = coalesce(black_id, uid), status = 'active', updated_at = now()
  where id = game.id
  returning * into game;
  return game;
end $$;

create or replace function public.cancel_chess_game(p_game uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.chess_games
  where id = p_game and status = 'waiting' and creator_id = public.chess_require_user();
end $$;

create or replace function public.play_chess_move(
  p_game uuid, p_ply integer, p_from_x integer, p_from_y integer, p_to_x integer, p_to_y integer, p_promotion text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.chess_require_user();
  game public.chess_games;
begin
  select * into game from public.chess_games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if game.status <> 'active' then raise exception 'game_not_active'; end if;
  if uid is distinct from (case when game.ply_count % 2 = 0 then game.white_id else game.black_id end) then
    raise exception 'not_your_turn';
  end if;
  if p_ply <> game.ply_count then raise exception 'stale_move'; end if;

  insert into public.chess_moves (game_id, ply, player_id, from_x, from_y, to_x, to_y, promotion)
  values (p_game, p_ply, uid, p_from_x, p_from_y, p_to_x, p_to_y, p_promotion);

  update public.chess_games set ply_count = ply_count + 1, updated_at = now() where id = p_game;
end $$;

-- Checkmate can only be claimed by the player who just moved, and only in that player's favour.
create or replace function public.finish_chess_game(p_game uuid, p_result text, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.chess_require_user();
  game public.chess_games;
  last_mover_wins text;
begin
  select * into game from public.chess_games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if uid not in (game.white_id, game.black_id) then raise exception 'not_a_player'; end if;
  if game.status = 'finished' then return; end if;
  if game.status <> 'active' then raise exception 'game_not_active'; end if;
  if p_reason not in ('checkmate', 'stalemate', 'insufficient', 'repetition', 'fifty-moves', 'invalid-move') then
    raise exception 'bad_reason';
  end if;

  last_mover_wins := case when game.ply_count % 2 = 1 then 'white-wins' else 'black-wins' end;
  if p_reason = 'checkmate' and (game.ply_count = 0 or p_result <> last_mover_wins) then raise exception 'bad_result'; end if;
  if p_reason = 'invalid-move' and p_result not in ('white-wins', 'black-wins') then raise exception 'bad_result'; end if;
  if p_reason not in ('checkmate', 'invalid-move') and p_result <> 'draw' then raise exception 'bad_result'; end if;

  update public.chess_games
  set status = 'finished', result = p_result, end_reason = p_reason, updated_at = now()
  where id = p_game;
end $$;

create or replace function public.resign_chess_game(p_game uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.chess_require_user();
  game public.chess_games;
begin
  select * into game from public.chess_games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if uid not in (game.white_id, game.black_id) then raise exception 'not_a_player'; end if;
  if game.status <> 'active' then return; end if;

  update public.chess_games
  set status = 'finished', end_reason = 'resignation', updated_at = now(),
      result = case when uid = game.white_id then 'black-wins' else 'white-wins' end
  where id = p_game;
end $$;

-- A harmless query for the daily Vercel cron, because a free project pauses when idle.
create or replace function public.chess_keepalive()
returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.chess_games limit 1) or true;
$$;

revoke all on function public.chess_require_user() from public, anon;
revoke all on function public.chess_new_game(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.create_chess_game(text, text) from public, anon;
revoke all on function public.join_chess_game(text) from public, anon;
revoke all on function public.quick_match_chess(text) from public, anon;
revoke all on function public.cancel_chess_game(uuid) from public, anon;
revoke all on function public.play_chess_move(uuid, integer, integer, integer, integer, integer, text) from public, anon;
revoke all on function public.finish_chess_game(uuid, text, text) from public, anon;
revoke all on function public.resign_chess_game(uuid) from public, anon;

grant execute on function public.chess_require_user() to authenticated;
grant execute on function public.create_chess_game(text, text) to authenticated;
grant execute on function public.join_chess_game(text) to authenticated;
grant execute on function public.quick_match_chess(text) to authenticated;
grant execute on function public.cancel_chess_game(uuid) to authenticated;
grant execute on function public.play_chess_move(uuid, integer, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.finish_chess_game(uuid, text, text) to authenticated;
grant execute on function public.resign_chess_game(uuid) to authenticated;
grant execute on function public.chess_keepalive() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chess_games') then
      alter publication supabase_realtime add table public.chess_games;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chess_moves') then
      alter publication supabase_realtime add table public.chess_moves;
    end if;
  end if;
end $$;
