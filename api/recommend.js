// api/recommend.js — GEOS L4: «куда пойти именно тебе» — ранжирование мест по вкусу и контексту.
//
//   GET /api/recommend?lat=41.64&lon=41.63&n=10&taste=coffee:1,bar:.6&cat=coffee&project=cityhub
//        &sponsored_only=1   (CityHUB: только партнёры)   &hour=19&wd=5 (иначе — время сервера в поясе места)
//
//   → [{id, name, cat, lat, lon, dist_km, score, why:[…], sponsored, open, city, phone, site, hours}]
//
// score = relevance(taste·cat) × context(open_now, distance) × quality(полнота записи) × sponsor_boost
// Три закона: буст умножает только релевантное · партнёр всегда помечен · у каждой рекомендации есть why.
// База — api/_data/places.json (слой 1, OSM, легально навсегда). Настоящее состояние места — api/venue.js.

const PLACES = require("./_data/places.json");            // [{i,n,c,la,lo,ci,tz,p,s,h,so}]
const { sponsors } = require("./_sponsors.js");          // [{id, boost, label, project}] — Supabase поверх файла
const CATS = ["coffee","food","bar","gym","beauty","spa","shop","sea","art","music","travel","med","kids","_unmapped"];
const CAT_RU = {coffee:"кофе и десерты",food:"еду",bar:"бары и ночь",gym:"спорт",beauty:"красоту",spa:"спа",shop:"магазины",sea:"пляжи и воду",art:"музеи и искусство",music:"музыку и сцену",travel:"что посмотреть",med:"здоровье",kids:"детское"};
const DAYS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

const hav = (a1, o1, a2, o2) => { const R = 6371, p1 = a1 * Math.PI / 180, p2 = a2 * Math.PI / 180, dl = (o2 - o1) * Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };

// opening_hours → открыто ли в (wd, minutes); частые формы, как в globe.html
function openAt(oh, wd, now) {
  if (!oh) return null; oh = oh.trim(); if (/^24\s*\/\s*7$/.test(oh)) return true;
  const week = Array(7).fill(null); let any = false;
  for (let seg of oh.split(";")) { seg = seg.trim(); if (!seg || /^PH|^SH/.test(seg)) continue;
    const m = seg.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH))*)?\s*(.*)$/i); if (!m) continue;
    let days = [];
    if (m[1]) { for (const part of m[1].split(",")) { const [a, b] = part.split("-").map(x => DAYS.findIndex(d => d.toLowerCase() === x.toLowerCase())); if (a < 0) continue;
      if (b === undefined || b < 0) days.push(a); else for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break; } } } else days = [0, 1, 2, 3, 4, 5, 6];
    const times = m[2].trim(); let iv = [];
    if (!/^off|closed/i.test(times)) for (const t of times.split(",")) { const r = t.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/) || t.trim().match(/^(\d{1,2}):(\d{2})\+$/); if (!r) continue;
      const a = +r[1] * 60 + +r[2]; let b = r[3] !== undefined ? +r[3] * 60 + +r[4] : a + 480; if (b <= a) b += 1440; iv.push([a, b]); }
    for (const d of days) week[d] = iv; any = true; }
  if (!any) return null;
  for (const [a, b] of (week[(wd + 6) % 7] || [])) if (b > 1440 && now < b - 1440) return true;
  for (const [a, b] of (week[wd] || [])) if (now >= a && now < b) return true;
  return false;
}
function localNow(tz) { try { const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = k => p.find(x => x.type === k).value; return [["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(g("weekday")), (+g("hour") % 24) * 60 + +g("minute")]; } catch { const d = new Date(); return [(d.getDay() + 6) % 7, d.getHours() * 60 + d.getMinutes()]; } }

function parseTaste(s) { const t = {}; for (const kv of String(s || "").split(",")) { const [k, v] = kv.split(":"); if (CATS.includes(k)) t[k] = Math.max(0, Math.min(1, parseFloat(v) || 0)); } return t; }

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, no-store");
  const q = req.query, lat = parseFloat(q.lat), lon = parseFloat(q.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: "lat, lon" });
  const n = Math.max(1, Math.min(50, parseInt(q.n || "10", 10) || 10)), radius = Math.max(0.3, Math.min(30, parseFloat(q.radius || "6") || 6));
  const taste = parseTaste(q.taste), hasTaste = Object.keys(taste).length > 0, cat = q.cat && CATS.includes(q.cat) ? q.cat : null;
  const project = String(q.project || "geos"), sponsoredOnly = q.sponsored_only === "1";
  const spons = new Map((await sponsors()).filter(s => !s.project || s.project === project).map(s => [s.id, s]));
  const out = [];
  for (const p of PLACES) {
    if (cat && p.c !== cat) continue;
    const d = hav(lat, lon, p.la, p.lo); if (d > radius) continue;
    const sp = spons.get(p.i); if (sponsoredOnly && !sp) continue;
    const why = [];
    // релевантность: вкус к категории (без вкуса — все равны, тогда решает контекст)
    let rel = hasTaste ? 0.15 + 0.85 * (taste[p.c] || 0) : 0.6;
    if (hasTaste && (taste[p.c] || 0) >= 0.5) why.push(`любишь ${CAT_RU[p.c] || p.c}`);
    if (hasTaste && (taste[p.c] || 0) < 0.15) continue;                     // нерелевантное не показываем даже партнёру
    // контекст: открыто сейчас и расстояние
    const [wd, now] = q.hour ? [parseInt(q.wd || "0", 10), parseInt(q.hour, 10) * 60] : localNow(p.tz);
    const open = openAt(p.h, wd, now);
    const ctx = (open === true ? 1.0 : open === false ? 0.45 : 0.8) * Math.exp(-d / 2.5);
    if (open === true) why.push("открыто сейчас"); if (d < 0.6) why.push(`${Math.round(d * 1000)} м`); else why.push(`${d.toFixed(1)} км`);
    // качество записи: чем полнее, тем надёжнее (настоящий рейтинг — через api/venue)
    const qual = 0.7 + 0.1 * (!!p.h + !!p.s + !!p.p);
    // партнёр: умножает, никогда не подменяет
    const boost = sp ? Math.max(1, Math.min(2.5, sp.boost || 1.3)) : 1; if (sp) why.push(sp.label || "партнёр");
    if (!p.n) continue;                                                       // безымянное не советуем
    out.push({ id: p.i, name: p.n, cat: p.c, lat: p.la, lon: p.lo, dist_km: +d.toFixed(3), score: +(rel * ctx * qual * boost).toFixed(4), why,
               sponsored: !!sp, open, city: p.ci, phone: p.p || "", site: p.s || "", hours: p.h || "", socials: p.so || "" });
  }
  out.sort((a, b) => b.score - a.score);
  return res.status(200).json({ ok: true, project, taste: hasTaste ? taste : null, total: out.length, items: out.slice(0, n) });
};
