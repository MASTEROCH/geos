// api/event.js — GEOS L5: событие на карточке = лид. Ничего не выдумывает: пишет, что человек сделал.
//
//   POST /api/event   {place_id, kind: open|call|route|site|share|checkin|dislike, project, user, sponsored}
//   → {ok, stored}    stored=false, если хранилище не настроено (видимая деградация, не тихая)
//
// Хранилище — Supabase REST (таблица events из world_index.sql), ключи в переменных окружения
// SUPABASE_URL и SUPABASE_SERVICE_KEY. Без них событие принимается, но честно не сохраняется.

const KINDS = new Set(["open", "call", "route", "site", "share", "checkin", "dislike", "photo"]);
const URL_ = process.env.SUPABASE_URL || "", KEY = process.env.SUPABASE_SERVICE_KEY || "";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const ev = {
    place_id: String(b.place_id || "").slice(0, 64), kind: KINDS.has(b.kind) ? b.kind : "open",
    project: String(b.project || "geos").slice(0, 32), user_id: String(b.user || "").slice(0, 64) || null,
    sponsored: !!b.sponsored, ua: String(req.headers["user-agent"] || "").slice(0, 160), ts: new Date().toISOString(),
  };
  if (!ev.place_id) return res.status(400).json({ ok: false, error: "place_id" });
  if (!URL_ || !KEY) return res.status(200).json({ ok: true, stored: false, reason: "no storage configured" });
  try {
    const r = await fetch(`${URL_}/rest/v1/events`, { method: "POST", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
      body: JSON.stringify(ev) });
    return res.status(200).json({ ok: r.ok, stored: r.ok, status: r.status });
  } catch (e) { return res.status(200).json({ ok: false, stored: false, error: String(e && e.message || e) }); }
};
