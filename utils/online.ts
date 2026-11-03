import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { EndReason, GameMode, GameResult, Move, PieceColor, PieceType } from "../types";

export type RoomColor = PieceColor | "random";

export interface OnlineGame {
  id: string;
  roomCode: string;
  mode: GameMode;
  isPublic: boolean;
  status: "waiting" | "active" | "finished";
  whiteId: string | null;
  blackId: string | null;
  result: GameResult;
  endReason: EndReason | null;
}

export interface OnlineListeners {
  /** Something changed on the server. The game fetches it again, so nothing depends on event order. */
  onChange: () => void;
  onPresence: (opponentConnected: boolean) => void;
}

export interface OnlineBackend {
  signIn(): Promise<string>;
  createGame(mode: GameMode, color: RoomColor): Promise<OnlineGame>;
  joinGame(roomCode: string): Promise<OnlineGame>;
  quickMatch(mode: GameMode): Promise<OnlineGame>;
  cancelGame(gameId: string): Promise<void>;
  fetchGame(gameId: string): Promise<{ game: OnlineGame; moves: Move[] }>;
  playMove(gameId: string, ply: number, move: Move): Promise<void>;
  finishGame(gameId: string, result: GameResult, reason: EndReason): Promise<void>;
  resign(gameId: string): Promise<void>;
  subscribe(gameId: string, myId: string, listeners: OnlineListeners): () => void;
}

interface GameRow {
  id: string;
  room_code: string;
  mode: GameMode;
  is_public: boolean;
  status: OnlineGame["status"];
  white_id: string | null;
  black_id: string | null;
  result: GameResult;
  end_reason: EndReason | null;
}

interface MoveRow {
  ply: number;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  promotion: PieceType | null;
}

function toGame(row: GameRow): OnlineGame {
  return {
    id: row.id,
    roomCode: row.room_code,
    mode: row.mode,
    isPublic: row.is_public,
    status: row.status,
    whiteId: row.white_id,
    blackId: row.black_id,
    result: row.result,
    endReason: row.end_reason,
  };
}

function toMove(row: MoveRow): Move {
  return {
    from: { x: row.from_x, y: row.from_y },
    to: { x: row.to_x, y: row.to_y },
    ...(row.promotion ? { promotion: row.promotion } : {}),
  };
}

export function colorOf(game: OnlineGame, playerId: string): PieceColor | null {
  if (game.whiteId === playerId) return "white";
  if (game.blackId === playerId) return "black";
  return null;
}

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export function isOnlineConfigured(): boolean {
  return Boolean(URL && KEY);
}

let client: Promise<SupabaseClient> | null = null;

/** Loaded only when someone goes online, so the game itself stays small. */
function getClient(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(URL!, KEY!, {
    auth: { persistSession: true, autoRefreshToken: true },
  }));
  return client;
}

async function callGame(name: string, args: Record<string, unknown>): Promise<OnlineGame> {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return toGame(data as GameRow);
}

async function call(name: string, args: Record<string, unknown>): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
}

const supabaseBackend: OnlineBackend = {
  async signIn() {
    const supabase = await getClient();
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user.id) return session.session.user.id;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) throw new Error(error?.message ?? "not_signed_in");
    return data.user.id;
  },
  createGame: (mode, color) => callGame("create_chess_game", { p_mode: mode, p_color: color }),
  joinGame: (roomCode) => callGame("join_chess_game", { p_room_code: roomCode }),
  quickMatch: (mode) => callGame("quick_match_chess", { p_mode: mode }),
  cancelGame: (gameId) => call("cancel_chess_game", { p_game: gameId }),
  async fetchGame(gameId) {
    const supabase = await getClient();
    const [game, moves] = await Promise.all([
      supabase.from("chess_games").select("*").eq("id", gameId).single(),
      supabase.from("chess_moves").select("ply, from_x, from_y, to_x, to_y, promotion").eq("game_id", gameId).order("ply"),
    ]);
    if (game.error) throw new Error(game.error.message);
    if (moves.error) throw new Error(moves.error.message);
    return { game: toGame(game.data as GameRow), moves: (moves.data as MoveRow[]).map(toMove) };
  },
  playMove: (gameId, ply, { from, to, promotion }) => call("play_chess_move", {
    p_game: gameId,
    p_ply: ply,
    p_from_x: from.x,
    p_from_y: from.y,
    p_to_x: to.x,
    p_to_y: to.y,
    p_promotion: promotion ?? null,
  }),
  finishGame: (gameId, result, reason) => call("finish_chess_game", { p_game: gameId, p_result: result, p_reason: reason }),
  resign: (gameId) => call("resign_chess_game", { p_game: gameId }),
  subscribe(gameId, myId, { onChange, onPresence }) {
    let channel: RealtimeChannel | null = null;
    let stopped = false;
    void getClient().then((supabase) => {
      if (stopped) return;
      channel = supabase.channel(`chess-${gameId}`, { config: { presence: { key: myId } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "chess_games", filter: `id=eq.${gameId}` }, onChange)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chess_moves", filter: `game_id=eq.${gameId}` }, onChange)
        .on("presence", { event: "sync" }, () => {
          const players = Object.keys(channel?.presenceState() ?? {});
          onPresence(players.some((id) => id !== myId));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void channel?.track({ at: Date.now() });
            onChange();
          }
        });
    });
    return () => {
      stopped = true;
      if (channel) void getClient().then((supabase) => supabase.removeChannel(channel!));
    };
  },
};

export function getOnlineBackend(): OnlineBackend {
  return supabaseBackend;
}

const ERROR_MESSAGES: Record<string, string> = {
  room_not_found: "Bu kodla bir oda bulunamadı.",
  room_full: "Bu oda dolu ya da oyun bitmiş.",
  not_your_turn: "Sıra sende değil.",
  stale_move: "Tahta güncellendi, hamleni yeniden dene.",
  game_not_active: "Bu oyun artık sürmüyor.",
};

export function onlineErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const known = Object.keys(ERROR_MESSAGES).find((code) => text.includes(code));
  return known ? ERROR_MESSAGES[known] : "Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene.";
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
