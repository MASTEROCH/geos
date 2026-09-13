// api/card.js — страница места: /p/<osmId>. Одна страница для людей из поиска и для ИИ-агентов.
//
//   Текст и JSON-LD (schema.org LocalBusiness-подтип, openingHoursSpecification, geo, address, sameAs, BreadcrumbList) говорят одно и то же.
//   Место из собранных городов — из индекса; любое другое — по id из OpenStreetMap на лету (закон POSTCARD №3: карточку собирает сервер).
//   Нет meta refresh: поисковик видит настоящую страницу, человек — кнопку «Открыть на глобусе».
const PLACES = require("./_data/places.json");
const CITIES = require("./_data/cities.json");
const osm = require("./_osm.js");
const { CAT, SCHEMA, esc, ohSpec, hoursText, socials, hav, dist, page } = require("./_place.js");
let byId = null, byCity = null, cityBy = null;
function prep() { if (byId) return; byId = new Map(); byCity = new Map(); cityBy = new Map();
  for (const p of PLACES) { byId.set(p.i, p); const k = p.cc + "/" + p.cs; if (!byCity.has(k)) byCity.set(k, []); byCity.get(k).push(p); }
  for (const c of CITIES) cityBy.set(c.cc + "/" + c.cs, c); }

module.exports = async (req, res) => {
  prep();
  const id = String(req.query.id || "");
  const host = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  let p = byId.get(id), live = false;
  if (!p) { try { const r = await osm.byId(id); if (r) { live = true; p = { i: id, n: r[0], nn: r[16] || "", c: osm.NICHE_KEYS[r[15]], la: r[1], lo: r[2], ci: "", tz: "", p: r[4], s: r[5], h: r[6], so: r[7], a: r[3], em: r[10], im: r[11], d: r[14] }; } } catch {} }
  if (!p) { res.setHeader("Cache-Control", "public, s-maxage=600"); res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(404).send(page({ title: "Место не найдено — GEOS", desc: "Такого места нет в GEOS", canonical: `${host}/p/${encodeURIComponent(id)}`, jsonld: [], body: `<h1>Место не найдено</h1><p>Проверьте ссылку или <a href="/">откройте глобус</a>.</p>` })); }
  const city = p.cc ? cityBy.get(p.cc + "/" + p.cs) : null;
  const cat = CAT[p.c] || "Место", name = p.n || "Без названия", url = `${host}/p/${encodeURIComponent(id)}`, app = `${host}/#p=${encodeURIComponent(id)}`;
  let own = null; try { const r = await fetch(`${host}/api/own?op=extra&id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(2500) }); const j = await r.json(); if (j && j.stored) own = j; } catch {}
  if (own && own.edits) { const e = own.edits; p = { ...p, n: e.name || p.n, p: e.phone || p.p, s: e.website || p.s, h: e.hours || p.h, so: e.socials || p.so, em: e.email || p.em, d: e.description || p.d }; }
  let image = (own && own.photos && own.photos[0]) || p.im || "";
  if (!image && p.s) { try { const r = await fetch(`${host}/api/og?u=${encodeURIComponent(p.s)}`, { signal: AbortSignal.timeout(4000) }); const j = await r.json(); if (j && j.image) image = j.image; } catch {} }
  const near = city ? (byCity.get(p.cc + "/" + p.cs) || []).filter((q) => q.i !== p.i && q.n).map((q) => [hav(p.la, p.lo, q.la, q.lo), q]).sort((a, b) => a[0] - b[0]).slice(0, 8) : [];
  const same = city ? (byCity.get(p.cc + "/" + p.cs) || []).filter((q) => q.i !== p.i && q.c === p.c && q.n).map((q) => [hav(p.la, p.lo, q.la, q.lo), q]).sort((a, b) => a[0] - b[0]).slice(0, 6) : [];
  const ht = hoursText(p.h), soc = socials(p.so);
  const where = [p.a, city ? city.n : p.ci, city ? city.co : ""].filter(Boolean).join(", ");
  const desc = [`${cat}${p.nn ? ` (${p.nn})` : ""}${where ? " — " + where : ""}.`, ht ? `Часы: ${ht}.` : "", p.p ? `Телефон ${p.p}.` : "", p.s ? "Есть сайт." : ""].filter(Boolean).join(" ");
  const ld = { "@context": "https://schema.org", "@type": SCHEMA[p.c] || "LocalBusiness", "@id": url, name, alternateName: p.nn || undefined, description: p.d || desc, url: p.s || url, image: image || undefined,
    telephone: p.p || undefined, email: p.em || undefined, address: { "@type": "PostalAddress", streetAddress: p.a || undefined, addressLocality: city ? city.n : p.ci || undefined, addressCountry: p.cc || undefined },
    geo: { "@type": "GeoCoordinates", latitude: p.la, longitude: p.lo }, hasMap: `https://www.openstreetmap.org/${id}`, openingHoursSpecification: ohSpec(p.h).length ? ohSpec(p.h) : undefined,
    sameAs: [`https://www.openstreetmap.org/${id}`, ...soc], isAccessibleForFree: true, identifier: id,
    subjectOf: { "@type": "Dataset", name: "GEOS — база мест планеты", url: `${host}/`, license: "https://opendatacommons.org/licenses/odbl/", creator: { "@type": "Organization", name: "OpenStreetMap contributors" } } };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "GEOS", item: `${host}/` },
    ...(city ? [{ "@type": "ListItem", position: 2, name: city.n, item: `${host}/c/${city.cc}/${city.cs}` }] : []), { "@type": "ListItem", position: city ? 3 : 2, name, item: url }] };
  const body = `<p class="crumbs"><a href="/">GEOS</a> › ${city ? `<a href="/c/${city.cc}/${city.cs}">${esc(city.n)}</a> › ` : ""}${esc(cat)}</p>
<h1>${esc(name)}</h1><p class="meta">${esc(cat)}${p.nn ? " · " + esc(p.nn) : ""}${city ? " · " + esc(city.n) + ", " + esc(city.co) : p.ci ? " · " + esc(p.ci) : ""}</p>
${image ? `<div class="hero"><img src="${esc(image)}" alt="${esc(name)}" loading="lazy"></div>` : ""}${own && (own.up || own.down || own.leads) ? `<p class="meta">${own.up || own.down ? `👍 ${own.up} · 👎 ${own.down} · ` : ""}${own.leads ? `${own.leads} собирались прийти` : ""}</p>` : ""}
<a class="btn" href="${esc(app)}">Открыть на глобусе</a><a class="btn sec" href="https://www.google.com/maps/dir/?api=1&destination=${p.la},${p.lo}" rel="noopener">Маршрут</a>
${p.d ? `<p>${esc(p.d)}</p>` : ""}
<h2>Контакты и часы</h2><dl>${p.a ? `<div><dt>Адрес</dt><dd>${esc(p.a)}</dd></div>` : ""}${p.p ? `<div><dt>Телефон</dt><dd><a href="tel:${esc(p.p.replace(/[^\d+]/g, ""))}">${esc(p.p)}</a></dd></div>` : ""}${p.em ? `<div><dt>Почта</dt><dd><a href="mailto:${esc(p.em)}">${esc(p.em)}</a></dd></div>` : ""}${p.s ? `<div><dt>Сайт</dt><dd><a href="${esc(p.s)}" rel="noopener nofollow">${esc(p.s.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></dd></div>` : ""}${soc.length ? `<div><dt>Соцсети</dt><dd>${soc.map((u) => `<a href="${esc(u)}" rel="noopener nofollow">${esc(u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])}</a>`).join(" · ")}</dd></div>` : ""}${ht ? `<div><dt>Часы</dt><dd>${esc(ht)}</dd></div>` : p.h ? `<div><dt>Часы</dt><dd>${esc(p.h)}</dd></div>` : ""}<div><dt>Координаты</dt><dd class="num">${p.la}, ${p.lo} · <a href="https://www.openstreetmap.org/${esc(id)}" rel="noopener">OpenStreetMap</a></dd></div></dl>
${same.length ? `<h2>Ещё ${esc(cat.toLowerCase())} рядом</h2><ul class="list">${same.map(([d, q]) => `<li><a href="/p/${encodeURIComponent(q.i)}">${esc(q.n)}</a><small>${dist(d)}${q.a ? " · " + esc(q.a) : ""}</small></li>`).join("")}</ul>` : ""}
${near.length ? `<h2>Рядом</h2><ul class="list">${near.map(([d, q]) => `<li><a href="/p/${encodeURIComponent(q.i)}">${esc(q.n)}</a><small>${esc(CAT[q.c] || "Место")} · ${dist(d)}</small></li>`).join("")}</ul>` : ""}
<p class="src">${own && own.edits ? "Данные и фото — от владельца места. " : ""}Данные — © участники <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> (ODbL)${city && city.when ? `, снимок ${esc(city.when.slice(0, 10))}` : live ? ", запрошено сейчас" : ""}. GEOS не выдумывает: если поля нет в OSM, его нет и здесь. Владельцу места: <a href="/partner.html#${encodeURIComponent(id)}">статистика и продвижение</a>.</p>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", live ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).send(page({ title: `${name} — ${cat}${city ? ", " + city.n : ""} · GEOS`, desc, canonical: url, jsonld: [ld, crumbs], body, image }));
};
