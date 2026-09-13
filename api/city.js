// api/city.js — страница города: /c/<CC>/<slug>. Оглавление мест по категориям со ссылками на карточки; JSON-LD City + ItemList.
const PLACES = require("./_data/places.json");
const CITIES = require("./_data/cities.json");
const { CAT, CATS, esc, page } = require("./_place.js");
let byCity = null;
function prep() { if (byCity) return; byCity = new Map(); for (const p of PLACES) { const k = p.cc + "/" + p.cs; if (!byCity.has(k)) byCity.set(k, []); byCity.get(k).push(p); } }
module.exports = async (req, res) => {
  prep();
  const cc = String(req.query.cc || "").toUpperCase(), slug = String(req.query.slug || "").toLowerCase();
  const host = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const c = CITIES.find((x) => x.cc === cc && x.cs === slug);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!c) { res.setHeader("Cache-Control", "public, s-maxage=600"); return res.status(404).send(page({ title: "Город не найден — GEOS", desc: "", canonical: `${host}/c/${cc}/${slug}`, jsonld: [], body: `<h1>Город не найден</h1><p><a href="/">Открыть глобус</a></p>` })); }
  const url = `${host}/c/${c.cc}/${c.cs}`, all = (byCity.get(c.cc + "/" + c.cs) || []).filter((p) => p.n);
  const groups = CATS.map((k) => [k, all.filter((p) => p.c === k)]).filter(([, a]) => a.length);
  const full = (p) => !!(p.h && (p.p || p.s));
  const desc = `${c.n}${c.co ? ", " + c.co : ""}: ${all.length} мест из OpenStreetMap по категориям — ${groups.slice(0, 5).map(([k, a]) => `${CAT[k].toLowerCase()} (${a.length})`).join(", ")}. Контакты, часы, координаты, карта.`;
  const ld = { "@context": "https://schema.org", "@type": "City", "@id": url, name: c.n, alternateName: c.en, url, geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon },
    containedInPlace: { "@type": "Country", name: c.co, identifier: c.cc }, description: desc };
  const list = { "@context": "https://schema.org", "@type": "ItemList", name: `Места в городе ${c.n}`, numberOfItems: all.length,
    itemListElement: groups.flatMap(([k, a]) => a.sort((x, y) => full(y) - full(x)).slice(0, 12)).slice(0, 100).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${host}/p/${encodeURIComponent(p.i)}`, name: p.n })) };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "GEOS", item: `${host}/` }, { "@type": "ListItem", position: 2, name: c.n, item: url }] };
  const body = `<p class="crumbs"><a href="/">GEOS</a> › ${esc(c.co || c.cc)}</p><h1>${esc(c.n)}</h1><p class="meta">${esc(c.co || "")}${c.pop ? ` · ${Number(c.pop).toLocaleString("ru-RU")} чел` : ""} · ${all.length} мест · часовой пояс ${esc(c.tz || "")}</p>
<a class="btn" href="${host}/#p=${encodeURIComponent((all[0] || {}).i || "")}">Открыть на глобусе</a><a class="btn sec" href="/${esc(c.map || "")}">Карта покрытия</a>
${groups.map(([k, a]) => `<h2>${esc(CAT[k])} · ${a.length}</h2><ul class="list">${a.sort((x, y) => full(y) - full(x)).slice(0, 12).map((p) => `<li><a href="/p/${encodeURIComponent(p.i)}">${esc(p.n)}</a><small>${[p.a, p.h ? "часы известны" : "", p.p ? "телефон" : ""].filter(Boolean).map(esc).join(" · ")}</small></li>`).join("")}</ul>`).join("")}
<p class="src">Места — © участники <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> (ODbL), снимок ${esc((c.when || "").slice(0, 10))}. Город — GeoNames (CC BY 4.0). В каждой категории показаны первые 12 мест, полнее — на глобусе.</p>`;
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).send(page({ title: `${c.n}: ${all.length} мест — кафе, рестораны, что посмотреть · GEOS`, desc, canonical: url, jsonld: [ld, list, crumbs], body }));
};
