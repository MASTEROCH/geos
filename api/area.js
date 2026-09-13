// api/area.js — схема района для глобуса: дороги, вода, здания из OpenStreetMap, компактно и с кэшем.
//
// Зачем не напрямую в Overpass с клиента: (1) в некоторых встроенных браузерах
// кросс-доменный fetch режется, (2) сырой ответ на экран центра — 6 МБ, а нам
// нужны только координаты, (3) плитку района можно кэшировать на CDN сутки —
// Overpass это публичный сервер, его берегут.
//
//   GET /api/area?s=41.63&w=41.62&n=41.65&e=41.65&tier=r|b
//   → {r:[[lat,lon,lat,lon,…],…], m:[…], w:[…], b:[…]}   (r дороги, m главные, w вода, b здания)
//   GET /api/area?tier=p&s=…&w=…&n=…&e=…   → {p:[строка места, …]}  — все места плитки (формат — _osm.js)
//   GET /api/area?tier=q&…                  → {p:[…]}  — «главное» плитки ≤0.1°: еда, бары, что посмотреть, пляжи (для масштаба города)
//   GET /api/area?id=node/123               → {p:[строка]}          — одно место по id (deep-link, открытка)
//
// © OpenStreetMap contributors, ODbL. Плитка ≤ 0.03° по стороне — дальше отказ.
// Живой слой мест: клиент режет мир на плитки 0.03°×0.04° с выровненными границами — URL повторяются,
// CDN отдаёт плитку неделю, Overpass видит каждую плитку один раз.

const osm = require("./_osm.js");
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.query.id) { // одно место по id
    try { const p = await osm.byId(req.query.id); res.setHeader("Cache-Control", p ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=600");
      return res.status(p ? 200 : 404).json({ p: p ? [p] : [] }); }
    catch (x) { return res.status(200).json({ error: String(x && x.message || x), p: [] }); }
  }
  const f = (k) => parseFloat(req.query[k]);
  const s = f("s"), w = f("w"), n = f("n"), e = f("e"), tier = ["b", "p", "q"].includes(req.query.tier) ? req.query.tier : "r";
  const maxLat = tier === "q" ? 0.101 : 0.031, maxLon = tier === "q" ? 0.141 : 0.041;
  if ([s, w, n, e].some(Number.isNaN) || n - s > maxLat || e - w > maxLon || n <= s || e <= w)
    return res.status(400).json({ error: `bbox s,w,n,e ≤ ${maxLat}°` });
  const bb = `(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`;
  const q = tier === "q"
    ? `[out:json][timeout:25];(nwr["name"]["amenity"~"^(cafe|restaurant|bar|pub|fast_food|nightclub|ice_cream|pharmacy|theatre|cinema|marketplace)$"]${bb};` +
      `nwr["name"]["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|aquarium|theme_park)$"]${bb};nwr["name"]["leisure"~"^(fitness_centre|beach_resort|water_park|park)$"]${bb};` +
      `nwr["name"]["shop"~"^(mall|beauty|hairdresser|bakery)$"]${bb};nwr["natural"="beach"]${bb};);out center;`
    : tier === "p"
    ? `[out:json][timeout:25];(` + ["amenity", "shop", "tourism", "leisure", "craft", "healthcare", "office"].map(k => `nwr["name"]["${k}"]${bb};`).join("") +
      `nwr["natural"="beach"]${bb};nwr["leisure"~"^(playground|beach_resort)$"]${bb};nwr["tourism"~"^(viewpoint|attraction|artwork)$"]${bb};);out center;`
    : `[out:json][timeout:20];(` +
    `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"]${bb};` +
    `way["natural"="coastline"]${bb};way["waterway"~"^(river|canal)$"]${bb};` +
    (tier === "b" ? `way["building"]${bb};way["highway"~"^(service|footway)$"]${bb};` : "") + `);out geom;`;
  let data = null, err = "";
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": "GEOS/1.0 (+https://geos-six.vercel.app)" },
                                   body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(26000) });
      if (!r.ok) { err = String(r.status); continue; }
      data = await r.json(); break;
    } catch (x) { err = String(x && x.message || x); }
  }
  if (!data) { res.setHeader("Cache-Control", "public, s-maxage=60"); return res.status(200).json({ error: err || "overpass", r: [], m: [], w: [], b: [], p: [] }); }
  if (tier === "p" || tier === "q") {
    const seen = new Set(), p = [];
    for (const el of data.elements || []) { const r = osm.row(el); if (!r || seen.has(r[9])) continue; seen.add(r[9]); p.push(r); }
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
    return res.status(200).json({ p });
  }
  const out = { r: [], m: [], w: [], b: [] };
  for (const el of data.elements || []) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const t = el.tags || {};
    const kind = t.building ? "b" : (t.natural === "coastline" || t.waterway) ? "w" : /^(motorway|trunk|primary|secondary)$/.test(t.highway) ? "m" : "r";
    const flat = [];
    for (const g of el.geometry) flat.push(+g.lat.toFixed(5), +g.lon.toFixed(5));
    out[kind].push(flat);
  }
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(out);
};
