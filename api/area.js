// api/area.js — схема района для глобуса: дороги, вода, здания из OpenStreetMap, компактно и с кэшем.
//
// Зачем не напрямую в Overpass с клиента: (1) в некоторых встроенных браузерах
// кросс-доменный fetch режется, (2) сырой ответ на экран центра — 6 МБ, а нам
// нужны только координаты, (3) плитку района можно кэшировать на CDN сутки —
// Overpass это публичный сервер, его берегут.
//
//   GET /api/area?s=41.63&w=41.62&n=41.65&e=41.65&tier=r|b
//   → {r:[[lat,lon,lat,lon,…],…], m:[…], w:[…], b:[…]}   (r дороги, m главные, w вода, b здания)
//
// © OpenStreetMap contributors, ODbL. Плитка ≤ 0.03° по стороне — дальше отказ.

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const f = (k) => parseFloat(req.query[k]);
  const s = f("s"), w = f("w"), n = f("n"), e = f("e"), tier = req.query.tier === "b" ? "b" : "r";
  if ([s, w, n, e].some(Number.isNaN) || n - s > 0.03 || e - w > 0.04 || n <= s || e <= w)
    return res.status(400).json({ error: "bbox s,w,n,e ≤ 0.03°" });
  const bb = `(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`;
  const q = `[out:json][timeout:20];(` +
    `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"]${bb};` +
    `way["natural"="coastline"]${bb};way["waterway"~"^(river|canal)$"]${bb};` +
    (tier === "b" ? `way["building"]${bb};way["highway"~"^(service|footway)$"]${bb};` : "") + `);out geom;`;
  let data = null, err = "";
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": "GEOS/1.0 (+https://geos-six.vercel.app)" },
                                   body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(22000) });
      if (!r.ok) { err = String(r.status); continue; }
      data = await r.json(); break;
    } catch (x) { err = String(x && x.message || x); }
  }
  if (!data) { res.setHeader("Cache-Control", "public, s-maxage=60"); return res.status(200).json({ error: err || "overpass", r: [], m: [], w: [], b: [] }); }
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
