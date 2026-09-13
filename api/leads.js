// api/leads.js — что видит владелец места: сколько людей открыли карточку, построили маршрут, позвонили, поделились.
//
//   GET /api/leads?place=node/123&days=30  →  {ok, stored, days, total:{open,route,call,site,share,checkin,dislike}, leads, sponsored, series:[{d,open,leads}], contact}
//   Агрегаты, без user_id: это отчёт бизнесу, а не слежка. Без Supabase — {stored:false}.
//   contact — куда писать за продвижением: env PARTNER_CONTACT (ссылка или почта), задаёт Роч.
const URL_ = process.env.SUPABASE_URL || "", KEY = process.env.SUPABASE_SERVICE_KEY || "";
const LEAD = new Set(["call", "route", "checkin"]);
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, no-store");
  const place = String(req.query.place || "").slice(0, 64), days = Math.min(365, Math.max(1, parseInt(req.query.days || "30", 10) || 30));
  const contact = process.env.PARTNER_CONTACT || "";
  if (!place) return res.status(400).json({ error: "place" });
  if (!URL_ || !KEY) return res.status(200).json({ ok: true, stored: false, days, contact });
  const since = new Date(Date.now() - days * 864e5).toISOString();
  try {
    const r = await fetch(`${URL_}/rest/v1/events?place_id=eq.${encodeURIComponent(place)}&ts=gte.${since}&select=kind,ts,sponsored&order=ts.desc&limit=5000`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return res.status(200).json({ ok: false, stored: true, error: String(r.status) });
    const ev = await r.json();
    const total = { open: 0, route: 0, call: 0, site: 0, share: 0, checkin: 0, dislike: 0, save: 0 }, byDay = new Map();
    let leads = 0, sponsored = 0;
    for (const e of ev) { if (e.kind in total) total[e.kind]++; const d = String(e.ts).slice(0, 10); const row = byDay.get(d) || { d, open: 0, leads: 0 };
      if (e.kind === "open") row.open++; if (LEAD.has(e.kind)) { row.leads++; leads++; if (e.sponsored) sponsored++; } byDay.set(d, row); }
    const series = []; for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); series.push(byDay.get(d) || { d, open: 0, leads: 0 }); }
    return res.status(200).json({ ok: true, stored: true, days, total, leads, sponsored, events: ev.length, series, contact });
  } catch (x) { return res.status(200).json({ ok: false, stored: true, error: String(x && x.message || x) }); }
};
