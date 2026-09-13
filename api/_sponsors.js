// api/_sponsors.js — партнёры: таблица sponsors в Supabase (если настроена) поверх файла _data/sponsors.json.
// Кэш 5 минут в памяти функции. Форма записи одна: {id, project, boost, label}.
const FILE = require("./_data/sponsors.json");
const URL_ = process.env.SUPABASE_URL || "", KEY = process.env.SUPABASE_SERVICE_KEY || "";
let cache = { t: 0, list: null };
async function sponsors() {
  if (cache.list && Date.now() - cache.t < 300000) return cache.list;
  let list = (FILE || []).map(s => ({ id: s.id, project: s.project || null, boost: s.boost || 1.3, label: s.label || "партнёр" }));
  if (URL_ && KEY) {
    try {
      const r = await fetch(`${URL_}/rest/v1/sponsors?active=eq.true&select=place_id,project,boost,label`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(4000) });
      if (r.ok) { const db = await r.json(); const seen = new Set(db.map(x => x.place_id));
        list = list.filter(s => !seen.has(s.id)).concat(db.map(x => ({ id: x.place_id, project: x.project || null, boost: +x.boost || 1.3, label: x.label || "партнёр" }))); }
    } catch {}
  }
  cache = { t: Date.now(), list };
  return list;
}
module.exports = { sponsors };
