// api/card.js — «Открытка» GEOS: карточку для шаринга собирает СЕРВЕР по одному id (закон POSTCARD №3).
//
//   /p/<osmId>  →  rewrite  →  /api/card?id=node/123
//   Мессенджер получает OG-превью (имя, категория · город, фото), человек — редирект в глобус с #p=<id>.
//   Клиент шлёт только id: ни названия, ни картинки, ни цены — подменить карточку нельзя.

const PLACES = require("./_data/places.json");
const CAT = {coffee:"Кофе и десерты",food:"Еда",bar:"Бары и ночь",gym:"Спорт",beauty:"Красота",spa:"СПА и бани",shop:"Магазины",sea:"Пляжи и вода",art:"Музеи и искусство",music:"Музыка и сцена",travel:"Что посмотреть",med:"Здоровье и аптеки",kids:"Детям",_unmapped:"Место"};
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let byId = null;

module.exports = async (req, res) => {
  if (!byId) { byId = new Map(); for (const p of PLACES) byId.set(p.i, p); }
  const id = String(req.query.id || "");
  const p = byId.get(id);
  const host = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  if (!p) { res.setHeader("Cache-Control", "public, s-maxage=600"); return res.status(404).send("Нет такого места"); }
  const ua = String(req.headers["user-agent"] || "");
  const bot = /Telegram|facebookexternalhit|WhatsApp|Twitterbot|Slackbot|Discordbot|LinkedIn|vkShare|bot|preview/i.test(ua);
  const title = p.n || "Место", sub = `${CAT[p.c] || "Место"} · ${p.ci}`;
  // фото: с сайта места (og:image через наш api/og), иначе фирменная заглушка GEOS
  let image = `${host}/share.png`;
  if (p.s) { try { const r = await fetch(`${host}/api/og?u=${encodeURIComponent(p.s)}`, { signal: AbortSignal.timeout(4000) }); const j = await r.json(); if (j && j.image) image = j.image; } catch {} }
  const desc = [sub, p.h ? `часы: ${p.h}` : "", p.p ? `тел. ${p.p}` : ""].filter(Boolean).join(" · ");
  const url = `${host}/p/${encodeURIComponent(id)}`, app = `${host}/#p=${encodeURIComponent(id)}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(title)} — GEOS</title>
<meta property="og:type" content="place"><meta property="og:site_name" content="GEOS">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta property="place:location:latitude" content="${p.la}"><meta property="place:location:longitude" content="${p.lo}">
<meta name="viewport" content="width=device-width,initial-scale=1">
${bot ? "" : `<meta http-equiv="refresh" content="0;url=${esc(app)}">`}
<style>body{margin:0;background:#000;color:#fff;font:16px -apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh}a{color:#0A84FF}</style>
</head><body><p>${esc(title)} · ${esc(sub)} — <a href="${esc(app)}">открыть в GEOS</a></p></body></html>`);
};
