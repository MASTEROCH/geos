// api/own.js — своя база GEOS поверх OSM: заявки владельцев, правки, фото, оценки, модерация. Одна функция, ветвление по op.
//
//   GET  /api/own?op=extra&id=node/123        → {edits, photos:[url], up, down, leads}     — для карточки и страницы места
//   GET  /api/own?op=owner&id=…&t=<token>     → {ok, place, edits, photos}                   — кабинет владельца по токену
//   POST {op:"claim", place_id, name, contact, note}          → {ok, pending:true}          — «это моё место»
//   POST {op:"rate", place_id, user, v:1|-1}                  → {ok, up, down}
//   POST {op:"photo", place_id, data(base64 webp), user?, t?} → {ok, url, status}           — владелец (t) сразу approved, человек — pending
//   POST {op:"edit", place_id, t, fields{...}}                → {ok}                        — только с токеном одобренной заявки
//   GET/POST /api/own?op=admin&key=<ADMIN_TOKEN> …            → списки pending и решения
//   Без Supabase — {stored:false}; ничего не выдумывается.
const URL_ = process.env.SUPABASE_URL || "", KEY = process.env.SUPABASE_SERVICE_KEY || "", ADMIN = process.env.ADMIN_TOKEN || "";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const sb = async (path, init = {}) => { const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) }, signal: AbortSignal.timeout(6000) }); const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {} return { ok: r.ok, status: r.status, j }; };
const clean = (s, n) => String(s ?? "").trim().slice(0, n);
const PID = /^(node|way|relation)\/\d+$/;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "content-type"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  let b = req.method === "POST" ? req.body : req.query; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const op = String(b.op || req.query.op || "");
  if (!URL_ || !KEY) return res.status(200).json({ ok: true, stored: false, reason: "no storage configured" });
  const place = clean(b.place_id || b.id, 64);

  if (op === "extra") {
    if (!PID.test(place)) return res.status(400).json({ error: "id" });
    const q = `place_id=eq.${encodeURIComponent(place)}`;
    const [e, p, s, l] = await Promise.all([sb(`place_edits?${q}&select=name,phone,website,hours,description,socials,email,updated_at`), sb(`photos?${q}&status=eq.approved&select=url,by&order=by.asc,created_at.desc&limit=8`),
      sb(`place_score?${q}`), sb(`leads?${q}&select=kind`)]);
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json({ ok: true, stored: true, edits: (e.j || [])[0] || null, photos: (p.j || []).map((x) => x.url), up: +((s.j || [])[0] || {}).up || 0, down: +((s.j || [])[0] || {}).down || 0, leads: (l.j || []).length });
  }
  if (op === "owner") {
    const t = clean(b.t, 40); if (!PID.test(place) || !t) return res.status(400).json({ error: "id, t" });
    const c = await sb(`claims?place_id=eq.${encodeURIComponent(place)}&token=eq.${encodeURIComponent(t)}&status=eq.approved&select=id,name`);
    if (!(c.j || []).length) return res.status(403).json({ ok: false, error: "нет одобренной заявки с таким токеном" });
    const q = `place_id=eq.${encodeURIComponent(place)}`;
    const [e, p] = await Promise.all([sb(`place_edits?${q}`), sb(`photos?${q}&by=eq.owner&select=id,url,status&order=created_at.desc`)]);
    return res.status(200).json({ ok: true, owner: c.j[0].name, edits: (e.j || [])[0] || null, photos: p.j || [] });
  }
  if (op === "claim") {
    if (!PID.test(place)) return res.status(400).json({ error: "place_id" });
    const contact = clean(b.contact, 120); if (!contact) return res.status(400).json({ error: "contact" });
    const r = await sb("claims", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ place_id: place, name: clean(b.name, 120), contact, note: clean(b.note, 500) }) });
    return res.status(200).json({ ok: r.ok, pending: true, status: r.status });
  }
  if (op === "rate") {
    const user = clean(b.user, 64), v = +b.v; if (!PID.test(place) || !user || ![1, -1].includes(v)) return res.status(400).json({ error: "place_id, user, v" });
    await sb("ratings?on_conflict=place_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ place_id: place, user_id: user, v }) });
    const s = await sb(`place_score?place_id=eq.${encodeURIComponent(place)}`);
    return res.status(200).json({ ok: true, up: +((s.j || [])[0] || {}).up || 0, down: +((s.j || [])[0] || {}).down || 0 });
  }
  if (op === "photo") {
    if (!PID.test(place)) return res.status(400).json({ error: "place_id" });
    const data = String(b.data || ""); const m = data.match(/^data:image\/(webp|jpeg|png);base64,(.+)$/); if (!m) return res.status(400).json({ error: "data: image/webp base64" });
    const buf = Buffer.from(m[2], "base64"); if (buf.length > 1_800_000) return res.status(413).json({ error: "≤1.8 МБ — сожмите до 1400 px" });
    let by = "user", status = "pending";
    if (b.t) { const c = await sb(`claims?place_id=eq.${encodeURIComponent(place)}&token=eq.${encodeURIComponent(clean(b.t, 40))}&status=eq.approved&select=id`); if ((c.j || []).length) { by = "owner"; status = "approved"; } }
    const path = `${place.replace("/", "-")}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    const up = await fetch(`${URL_}/storage/v1/object/photos/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": `image/${m[1]}`, "x-upsert": "false" }, body: buf, signal: AbortSignal.timeout(15000) });
    if (!up.ok) return res.status(200).json({ ok: false, error: "storage " + up.status, detail: (await up.text()).slice(0, 200) });
    const url = `${URL_}/storage/v1/object/public/photos/${path}`;
    const r = await sb("photos", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ place_id: place, url, by, user_id: clean(b.user, 64) || null, status }) });
    return res.status(200).json({ ok: r.ok, url, status, by });
  }
  if (op === "edit") {
    const t = clean(b.t, 40); if (!PID.test(place) || !t) return res.status(400).json({ error: "place_id, t" });
    const c = await sb(`claims?place_id=eq.${encodeURIComponent(place)}&token=eq.${encodeURIComponent(t)}&status=eq.approved&select=id`);
    if (!(c.j || []).length) return res.status(403).json({ ok: false, error: "нет одобренной заявки" });
    const f = b.fields || {}; const row = { place_id: place, updated_at: new Date().toISOString() };
    for (const k of ["name", "phone", "website", "hours", "description", "socials", "email"]) if (k in f) row[k] = clean(f[k], k === "description" ? 1200 : 300) || null;
    const r = await sb("place_edits?on_conflict=place_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
    return res.status(200).json({ ok: r.ok, status: r.status });
  }
  if (op === "admin") {
    const key = clean(b.key || req.query.key, 80); if (!ADMIN) return res.status(200).json({ ok: false, error: "ADMIN_TOKEN не задан в Vercel" }); if (key !== ADMIN) return res.status(403).json({ ok: false, error: "ключ" });
    const action = String(b.action || "list");
    if (action === "list") { const [c, p] = await Promise.all([sb("claims?status=eq.pending&select=id,place_id,name,contact,note,created_at&order=created_at.desc&limit=100"), sb("photos?status=eq.pending&select=id,place_id,url,by,created_at&order=created_at.desc&limit=100")]);
      const [ac, ap] = await Promise.all([sb("claims?status=eq.approved&select=id,place_id,name,contact,token,decided_at&order=decided_at.desc&limit=50"), sb("photos?status=eq.approved&select=id&limit=1000")]);
      return res.status(200).json({ ok: true, claims: c.j || [], photos: p.j || [], approved: ac.j || [], photosApproved: (ap.j || []).length }); }
    if (action === "claim") { const id = +b.id, st = b.status === "approved" ? "approved" : "rejected";
      const r = await sb(`claims?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: st, decided_at: new Date().toISOString() }) });
      return res.status(200).json({ ok: r.ok, claim: (r.j || [])[0] || null }); }
    if (action === "photo") { const id = +b.id, st = b.status === "approved" ? "approved" : "rejected";
      const r = await sb(`photos?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: st }) }); return res.status(200).json({ ok: r.ok }); }
    return res.status(400).json({ error: "action" });
  }
  return res.status(400).json({ error: "op" });
};
