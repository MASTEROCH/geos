// api/_place.js — общее для страниц мест и городов: категории, типы schema.org, часы → openingHoursSpecification, HTML-обвязка.
// Страницы читают и люди из поиска, и ИИ-агенты: текст на странице и JSON-LD говорят одно и то же.
const CAT = { coffee: "Кофе и десерты", food: "Еда", bar: "Бары и ночь", gym: "Спорт", beauty: "Красота", spa: "СПА и бани", shop: "Магазины", sea: "Пляжи и вода",
  art: "Музеи и искусство", music: "Музыка и сцена", travel: "Что посмотреть", med: "Здоровье и аптеки", kids: "Детям", _unmapped: "Место" };
const SCHEMA = { coffee: "CafeOrCoffeeShop", food: "Restaurant", bar: "BarOrPub", gym: "SportsActivityLocation", beauty: "BeautySalon", spa: "DaySpa", shop: "Store",
  sea: "Beach", art: "Museum", music: "MusicVenue", travel: "TouristAttraction", med: "MedicalBusiness", kids: "ChildCare", _unmapped: "LocalBusiness" };
const CATS = Object.keys(CAT).filter(k => k !== "_unmapped");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], DAY_S = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday", Su: "Sunday" };
const DAY_RU = { Mo: "пн", Tu: "вт", We: "ср", Th: "чт", Fr: "пт", Sa: "сб", Su: "вс" };

// частые формы OSM opening_hours → [{days:[Mo..], open:"09:00", close:"18:00"}]; сложное (праздники, сезоны) честно не разбираем
function hours(raw) {
  if (!raw) return [];
  const s = raw.trim();
  if (/^24\s*\/\s*7$/.test(s)) return [{ days: DAYS.slice(), open: "00:00", close: "23:59" }];
  const out = [];
  for (let seg of s.split(";")) {
    seg = seg.trim(); if (!seg || /^(PH|SH)/.test(seg)) continue;
    const m = seg.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)?\s*(.*)$/); if (!m) continue;
    let days = [];
    if (m[1]) { for (const part of m[1].split(",")) { const [a, b] = part.split("-"); const i = DAYS.indexOf(a); if (i < 0) continue;
      if (!b) days.push(a); else { const j = DAYS.indexOf(b); for (let k = i; ; k = (k + 1) % 7) { days.push(DAYS[k]); if (k === j) break; } } } }
    else days = DAYS.slice();
    const t = m[2].trim(); if (/^(off|closed)/i.test(t)) continue;
    for (const iv of t.split(",")) { const r = iv.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/); if (r) out.push({ days, open: r[1], close: r[2] }); }
  }
  return out;
}
const ohSpec = (raw) => hours(raw).map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.days.map((d) => DAY_S[d]), opens: h.open, closes: h.close }));
const hoursText = (raw) => hours(raw).map((h) => `${h.days.length === 7 ? "ежедневно" : h.days.map((d) => DAY_RU[d]).join(", ")} ${h.open}–${h.close}`).join("; ");
const socials = (so) => (so || "").split(";").map((kv) => kv.split(/=(.*)/)).filter((x) => x[1]).map(([k, v]) => /^https?:/.test(v) ? v :
  ({ instagram: "https://instagram.com/", facebook: "https://facebook.com/", telegram: "https://t.me/", vk: "https://vk.com/", youtube: "https://youtube.com/", tiktok: "https://tiktok.com/@", twitter: "https://x.com/", whatsapp: "https://wa.me/" }[k] || "") + v.replace(/^@/, ""));
const hav = (a1, o1, a2, o2) => { const R = 6371, p1 = a1 * Math.PI / 180, p2 = a2 * Math.PI / 180, dl = (o2 - o1) * Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };
const dist = (km) => km < 1 ? `${Math.round(km * 1000)} м` : `${km.toFixed(1)} км`;

// одна обвязка на все статические страницы: тёмная, лёгкая, без JS — читается всеми
function page({ title, desc, canonical, jsonld, body, image }) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="GEOS"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png"><meta name="theme-color" content="#000000">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
<style>:root{color-scheme:dark}body{margin:0;background:#000;color:#fff;font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:640px;margin:0 auto;padding:20px 16px 48px}a{color:#0A84FF;text-decoration:none}h1{font-size:30px;line-height:1.1;letter-spacing:-.02em;margin:8px 0 6px;text-wrap:balance}h2{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:rgba(235,235,245,.62);margin:22px 0 8px}
.top{display:flex;align-items:center;gap:8px;font-weight:700;height:44px}.top i{width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#9be0ff,#0A84FF 60%,#003c7a)}.top small{font-weight:500;color:rgba(235,235,245,.62);font-size:12.5px}
.meta{color:rgba(235,235,245,.62);margin:0 0 14px}.crumbs{font-size:13px;color:rgba(235,235,245,.5);margin:0 0 4px}.crumbs a{color:rgba(235,235,245,.7)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:48px;padding:0 20px;border-radius:14px;background:#0A84FF;color:#fff;font-weight:600;margin:6px 8px 12px 0}.btn.sec{background:rgba(44,44,46,.7)}
dl{margin:0;background:rgba(44,44,46,.6);border-radius:20px;padding:6px 14px}dl div{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid rgba(84,84,88,.5)}dl div:last-child{border:0}dt{flex:0 0 96px;color:rgba(235,235,245,.62);font-size:13px;padding-top:2px}dd{margin:0;flex:1;word-break:break-word}
ul.list{list-style:none;margin:0;padding:0;background:rgba(44,44,46,.6);border-radius:20px;overflow:hidden}ul.list li{padding:10px 14px;border-bottom:1px solid rgba(84,84,88,.5)}ul.list li:last-child{border:0}ul.list small{display:block;color:rgba(235,235,245,.62);font-size:13px}
.hero{border-radius:20px;overflow:hidden;margin:0 0 14px;background:#111}.hero img{width:100%;display:block;max-height:340px;object-fit:cover}
.src{font-size:12px;color:rgba(235,235,245,.38);margin-top:24px;line-height:1.45}.src a{color:rgba(235,235,245,.62)}.num{font-variant-numeric:tabular-nums}</style></head><body><main>
<div class="top"><i></i>GEOS<small>база мест планеты</small></div>
${body}
</main></body></html>`;
}
module.exports = { CAT, SCHEMA, CATS, esc, hours, ohSpec, hoursText, socials, hav, dist, page };
