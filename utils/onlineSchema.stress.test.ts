import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import MIGRATION from "../supabase/migrations/20261104_001_online_chess.sql?raw";

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
const CARA = "00000000-0000-0000-0000-00000000000c";

// What Supabase provides, reduced to what the migration needs.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`;

let db: PGlite;

async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('test.uid', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

interface Game {
  id: string;
  room_code: string;
  status: string;
  white_id: string | null;
  black_id: string | null;
  ply_count: number;
  result: string | null;
  end_reason: string | null;
}

const create = async (uid: string, color = "white", mode = "mobius") => (await as<Game>(uid, "select * from public.create_chess_game($1, $2)", [mode, color]))[0];
const join = async (uid: string, code: string) => (await as<Game>(uid, "select * from public.join_chess_game($1)", [code]))[0];
const move = (uid: string, game: string, ply: number) => as(uid, "select public.play_chess_move($1, $2, 3, 1, 5, 1, null)", [game, ply]);
const started = async () => {
  const game = await create(ALICE, "white");
  await join(BOB, game.room_code);
  return game.id;
};

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(MIGRATION);
});

describe("rooms", () => {
  it("creates a waiting room with a readable six letter code", async () => {
    const game = await create(ALICE);
    expect(game.status).toBe("waiting");
    expect(game.white_id).toBe(ALICE);
    expect(game.room_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("gives the guest the free color and starts the game, whatever the case of the code", async () => {
    const game = await create(ALICE, "black");
    const joined = await join(BOB, game.room_code.toLowerCase());
    expect(joined).toMatchObject({ status: "active", white_id: BOB, black_id: ALICE });
  });

  it("gives a random color to the creator", async () => {
    const game = await create(ALICE, "random");
    expect([game.white_id, game.black_id]).toContain(ALICE);
    expect([game.white_id, game.black_id]).toContain(null);
  });

  it("refuses a third player and a wrong code", async () => {
    const id = await started();
    const [{ room_code: code }] = await as<Game>(ALICE, "select * from public.chess_games where id = $1", [id]);
    await expect(join(CARA, code)).rejects.toThrow("room_full");
    await expect(join(CARA, "ZZZZZZ")).rejects.toThrow("room_not_found");
  });

  it("lets a player come back into their own room", async () => {
    const id = await started();
    const [{ room_code: code }] = await as<Game>(ALICE, "select * from public.chess_games where id = $1", [id]);
    expect((await join(BOB, code)).id).toBe(id);
  });

  it("replaces a player's own unjoined room instead of piling them up", async () => {
    const first = await create(ALICE);
    await create(ALICE);
    expect(await as<Game>(ALICE, "select * from public.chess_games where id = $1", [first.id])).toEqual([]);
  });

  it("lets only the creator cancel, and only while waiting", async () => {
    const game = await create(ALICE);
    await as(BOB, "select public.cancel_chess_game($1)", [game.id]);
    expect(await as(ALICE, "select id from public.chess_games where id = $1", [game.id])).toHaveLength(1);
    await as(ALICE, "select public.cancel_chess_game($1)", [game.id]);
    expect(await as(ALICE, "select id from public.chess_games where id = $1", [game.id])).toHaveLength(0);
  });
});

describe("quick match", () => {
  const quick = async (uid: string, mode = "mobius") => (await as<Game>(uid, "select * from public.quick_match_chess($1)", [mode]))[0];

  it("pairs two strangers in the same mode", async () => {
    const first = await quick(ALICE);
    expect(first.status).toBe("waiting");
    const second = await quick(BOB);
    expect(second).toMatchObject({ id: first.id, status: "active" });
  });

  it("does not pair a player with themselves or across modes", async () => {
    const first = await quick(ALICE);
    const again = await quick(ALICE);
    expect(again.status).toBe("waiting");
    expect(again.id).not.toBe(first.id);
    const classic = await quick(BOB, "classic");
    expect(classic.status).toBe("waiting");
  });

  it("does not hand out private rooms", async () => {
    const privateRoom = await create(ALICE);
    expect((await quick(BOB)).id).not.toBe(privateRoom.id);
  });
});

describe("moves", () => {
  it("takes turns: white, then black", async () => {
    const id = await started();
    await move(ALICE, id, 0);
    await move(BOB, id, 1);
    const [game] = await as<Game>(ALICE, "select * from public.chess_games where id = $1", [id]);
    expect(game.ply_count).toBe(2);
    expect(await as(BOB, "select ply from public.chess_moves where game_id = $1 order by ply", [id])).toEqual([{ ply: 0 }, { ply: 1 }]);
  });

  it("refuses a move out of turn, from a stranger, or sent twice", async () => {
    const id = await started();
    await expect(move(BOB, id, 0)).rejects.toThrow("not_your_turn");
    await expect(move(CARA, id, 0)).rejects.toThrow("not_your_turn");
    await move(ALICE, id, 0);
    await expect(move(ALICE, id, 0)).rejects.toThrow("not_your_turn");
    await expect(move(BOB, id, 0)).rejects.toThrow("stale_move");
  });

  it("refuses moves before the guest arrives and after the end", async () => {
    const game = await create(ALICE);
    await expect(move(ALICE, game.id, 0)).rejects.toThrow("game_not_active");
    await join(BOB, game.room_code);
    await as(ALICE, "select public.resign_chess_game($1)", [game.id]);
    await expect(move(ALICE, game.id, 0)).rejects.toThrow("game_not_active");
  });
});

describe("ending", () => {
  it("makes the resigning player lose", async () => {
    const id = await started();
    await as(ALICE, "select public.resign_chess_game($1)", [id]);
    const [game] = await as<Game>(BOB, "select * from public.chess_games where id = $1", [id]);
    expect(game).toMatchObject({ status: "finished", result: "black-wins", end_reason: "resignation" });
  });

  it("only lets checkmate be claimed for the player who just moved", async () => {
    const id = await started();
    await move(ALICE, id, 0);
    await expect(as(BOB, "select public.finish_chess_game($1, 'black-wins', 'checkmate')", [id])).rejects.toThrow("bad_result");
    await as(ALICE, "select public.finish_chess_game($1, 'white-wins', 'checkmate')", [id]);
    const [game] = await as<Game>(BOB, "select * from public.chess_games where id = $1", [id]);
    expect(game).toMatchObject({ status: "finished", result: "white-wins" });
  });

  it("makes a draw reason give a draw, and the first ending stand", async () => {
    const id = await started();
    await move(ALICE, id, 0);
    await expect(as(ALICE, "select public.finish_chess_game($1, 'white-wins', 'repetition')", [id])).rejects.toThrow("bad_result");
    await as(ALICE, "select public.finish_chess_game($1, 'draw', 'repetition')", [id]);
    await as(BOB, "select public.resign_chess_game($1)", [id]);
    const [game] = await as<Game>(ALICE, "select * from public.chess_games where id = $1", [id]);
    expect(game.end_reason).toBe("repetition");
  });

  it("refuses endings from strangers", async () => {
    const id = await started();
    await expect(as(CARA, "select public.resign_chess_game($1)", [id])).rejects.toThrow("not_a_player");
    await expect(as(CARA, "select public.finish_chess_game($1, 'draw', 'stalemate')", [id])).rejects.toThrow("not_a_player");
  });
});

describe("privacy and access", () => {
  it("hides games and moves from anyone who is not playing", async () => {
    const id = await started();
    await move(ALICE, id, 0);
    expect(await as(CARA, "select id from public.chess_games")).toEqual([]);
    expect(await as(CARA, "select ply from public.chess_moves")).toEqual([]);
  });

  it("refuses direct writes", async () => {
    const id = await started();
    await expect(as(ALICE, "update public.chess_games set result = 'white-wins' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, "insert into public.chess_moves (game_id, ply, player_id, from_x, from_y, to_x, to_y) values ($1, 0, $2, 0, 0, 0, 0)", [id, ALICE])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, "delete from public.chess_games where id = $1", [id])).rejects.toThrow(/permission denied/);
  });

  it("refuses the internal helper and everything to the signed out", async () => {
    await expect(as(ALICE, `select public.chess_new_game('${ALICE}', 'mobius', 'white', false)`)).rejects.toThrow(/permission denied/);
    await expect(as(null, "select public.create_chess_game('mobius', 'white')")).rejects.toThrow(/permission denied/);
    await expect(as(null, "select id from public.chess_games")).rejects.toThrow(/permission denied/);
  });

  it("allows the keepalive ping without signing in, and streams both tables", async () => {
    expect(await as(null, "select public.chess_keepalive() as ok")).toEqual([{ ok: true }]);
    const { rows } = await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename");
    expect(rows.map((row) => row.tablename)).toEqual(["chess_games", "chess_moves"]);
  });

  it("can be applied twice without failing", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });
});
