// api/_osm.js — общее для area.js и card.js: объект OpenStreetMap → строка места GEOS.
//
// Формат строки — ровно POI_INFO глобуса, чтобы клиент дописывал живые места в те же массивы:
//   [name, lat, lon, addr, phone, site, hours, socials, extra, osmId, email, image, wikidata, commons, description, niche, nativeName]
// Правила ниш — те же, что в emit_cityhub.py (OSM_RULES); порядок ниш — как NICHES в globe.py.

const { displayName, toRu } = require("./_translit.js");
const NICHE_KEYS = ["coffee", "food", "bar", "gym", "beauty", "spa", "shop", "sea", "art", "music", "travel", "med", "kids", "_unmapped"];
const RULES = [
  ["coffee", [["amenity", ["cafe", "ice_cream"]], ["shop", ["bakery", "pastry", "coffee", "confectionery"]], ["cuisine", ["coffee_shop"]]]],
  ["bar", [["amenity", ["bar", "pub", "nightclub", "biergarten"]]]],
  ["food", [["amenity", ["restaurant", "fast_food", "food_court"]]]],
  ["gym", [["leisure", ["fitness_centre", "sports_centre", "sports_hall"]]]],
  ["spa", [["amenity", ["spa", "public_bath", "sauna"]], ["leisure", ["spa"]], ["shop", ["massage"]]]],
  ["beauty", [["shop", ["beauty", "hairdresser", "cosmetics", "nails", "tattoo", "perfumery"]]]],
  ["med", [["amenity", ["clinic", "doctors", "dentist", "hospital", "pharmacy", "veterinary"]], ["healthcare", null]]],
  ["sea", [["natural", ["beach"]], ["leisure", ["beach_resort", "marina", "water_park", "swimming_pool"]]]],
  ["art", [["tourism", ["museum", "gallery", "artwork"]], ["amenity", ["arts_centre", "exhibition_centre"]]]],
  ["music", [["amenity", ["theatre", "music_venue", "concert_hall"]]]],
  ["travel", [["office", ["travel_agent"]], ["tourism", ["attraction", "information", "viewpoint", "theme_park"]]]],
  ["kids", [["leisure", ["playground", "amusement_arcade"]], ["tourism", ["zoo", "aquarium"]], ["amenity", ["kindergarten"]]]],
  ["shop", [["shop", null]]],
];
// уличная мебель — не «место»: у неё нет клиента и нет карточки
const NOISE = new Set(["parking", "parking_space", "parking_entrance", "motorcycle_parking", "bicycle_parking", "bench", "waste_basket",
  "waste_disposal", "recycling", "toilets", "vending_machine", "atm", "shelter", "drinking_water", "post_box", "telephone",
  "charging_station", "bicycle_repair_station", "loading_dock", "hunting_stand", "clock", "letter_box", "grit_bin", "grave_yard"]);

function niche(t) {
  for (const [k, rules] of RULES) for (const [key, vals] of rules) { const v = t[key]; if (v == null) continue; if (!vals || vals.includes(v)) return NICHE_KEYS.indexOf(k); }
  return NICHE_KEYS.length - 1;
}

function row(el) {
  const t = el.tags || {};
  const lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lon == null) return null;
  if (t.amenity && NOISE.has(t.amenity)) return null;
  const soc = [];
  for (const k of ["instagram", "facebook", "telegram", "whatsapp", "tiktok", "vk", "youtube", "twitter"]) { const v = t["contact:" + k] || t[k]; if (v) soc.push(k + "=" + v); }
  const addr = t["addr:full"] || [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || "";
  const [name, native] = displayName(t);
  return [name, +(+lat).toFixed(6), +(+lon).toFixed(6), addr,
    t.phone || t["contact:phone"] || t["contact:mobile"] || "", t.website || t["contact:website"] || t.url || "",
    t.opening_hours || "", soc.join(";"), toRu(t.cuisine || t.brand || ""), `${el.type}/${el.id}`,
    t.email || t["contact:email"] || "", t.image || "", t.wikidata || "", t.wikimedia_commons || "",
    t.description || t["description:ru"] || t["description:en"] || "", niche(t),
    native];   // [16] родное имя — в meta и поиск
}

// один объект по id через API OSM (для открыток и deep-link на место, которого нет в собранных городах)
async function byId(id) {
  const m = /^(node|way|relation)\/(\d+)$/.exec(String(id || ""));
  if (!m) return null;
  const [, type, num] = m;
  const url = `https://api.openstreetmap.org/api/0.6/${type}/${num}${type === "node" ? "" : "/full"}.json`;
  const r = await fetch(url, { headers: { "User-Agent": "GEOS/1.0 (+https://geos-six.vercel.app)" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const els = (await r.json()).elements || [];
  const el = els.find(e => e.type === type && String(e.id) === num);
  if (!el) return null;
  if (type !== "node") { // центр — среднее по узлам
    const nodes = els.filter(e => e.type === "node" && e.lat != null);
    if (!nodes.length) return null;
    el.center = { lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length, lon: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length };
  }
  return row(el);
}

module.exports = { NICHE_KEYS, niche, row, byId };
