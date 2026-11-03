/*
 * Vercel Cron calls this once a day. A free Supabase project pauses after 7 idle days,
 * which would take online play down, so this sends one harmless query.
 */
export default async function keepalive(request, response) {
  response.setHeader("Cache-Control", "no-store");

  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.authorization !== `Bearer ${secret}`) {
    response.status(401).json({ ok: false });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    response.status(200).json({ ok: false, reason: "online is not configured" });
    return;
  }

  try {
    const ping = await fetch(`${url}/rest/v1/rpc/chess_keepalive`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: "{}",
    });
    response.status(ping.ok ? 200 : 502).json({ ok: ping.ok });
  } catch {
    response.status(502).json({ ok: false });
  }
}
