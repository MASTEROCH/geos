// api/mcp.js — удалённый MCP-сервер GEOS (Streamable HTTP, JSON-ответы): агент подключается по URL, без установки.
//
//   POST https://geos-six.vercel.app/api/mcp   — JSON-RPC 2.0: initialize · tools/list · tools/call · ping
//   GET  — краткая справка. Без авторизации: данные открытые (ODbL), запись — только события (лиды), без персон.
//   Те же инструменты, что у stdio-сервера (templates/mcp/geos-mcp.js): правда одна — HTTP API прода.
const TOOLS = [
  { name: "geos_recommend", description: "Куда пойти именно этому человеку рядом с точкой: ранжированные настоящие места (OpenStreetMap) с причинами why. taste — веса категорий 0..1 (coffee, food, bar, gym, beauty, spa, shop, sea, art, music, travel, med, kids).",
    inputSchema: { type: "object", required: ["lat", "lon"], properties: { lat: { type: "number" }, lon: { type: "number" }, n: { type: "integer", default: 10 }, cat: { type: "string" }, taste: { type: "string", description: "например coffee:1,bar:0.6" }, radius: { type: "number", default: 6 }, project: { type: "string", default: "geos" } } } },
  { name: "geos_places_near", description: "ВСЕ настоящие места вокруг точки в любом городе планеты (живой слой OpenStreetMap). radius в км ≤ 1.5. Строка: [name, lat, lon, addr, phone, site, hours, socials, extra, osmId, email, image, wikidata, commons, description, niche, nativeName].",
    inputSchema: { type: "object", required: ["lat", "lon"], properties: { lat: { type: "number" }, lon: { type: "number" }, radius: { type: "number", default: 1 } } } },
  { name: "geos_place_by_id", description: "Одно место по id OpenStreetMap (node/123, way/45) — та же строка, что в geos_places_near.", inputSchema: { type: "object", required: ["place_id"], properties: { place_id: { type: "string" } } } },
  { name: "geos_street_view", description: "Вид улицы у входа (Mapillary, CC BY-SA): ссылки на снимки в радиусе ~90 м.", inputSchema: { type: "object", required: ["lat", "lon"], properties: { lat: { type: "number" }, lon: { type: "number" }, n: { type: "integer", default: 3 } } } },
  { name: "geos_event", description: "Записать действие человека по месту (open, call, route, site, share, checkin, dislike) — лид для бизнеса и сигнал вкуса.", inputSchema: { type: "object", required: ["place_id", "kind"], properties: { place_id: { type: "string" }, kind: { type: "string" }, project: { type: "string", default: "geos" }, user: { type: "string" } } } },
  { name: "geos_card_url", description: "Ссылка на страницу места (для цитирования и отправки человеку): превью и JSON-LD собирает сервер.", inputSchema: { type: "object", required: ["place_id"], properties: { place_id: { type: "string" } } } },
];
const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
async function call(base, name, a) {
  const j = async (u, init) => (await fetch(u, init)).json();
  if (name === "geos_recommend") return j(`${base}/api/recommend?${q(a)}`);
  if (name === "geos_places_near") { const r = Math.min(1.5, Math.max(0.1, +a.radius || 1)), dl = r / 111, dn = dl / Math.cos(a.lat * Math.PI / 180);
    return j(`${base}/api/area?tier=p&s=${(a.lat - dl).toFixed(4)}&w=${(a.lon - dn).toFixed(4)}&n=${(a.lat + dl).toFixed(4)}&e=${(a.lon + dn).toFixed(4)}`); }
  if (name === "geos_place_by_id") return j(`${base}/api/area?id=${encodeURIComponent(a.place_id)}`);
  if (name === "geos_street_view") return j(`${base}/api/street?${q(a)}`);
  if (name === "geos_event") return j(`${base}/api/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) });
  if (name === "geos_card_url") return { url: `${base}/p/${encodeURIComponent(a.place_id)}` };
  throw new Error("unknown tool " + name);
}
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const base = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  if (req.method !== "POST") return res.status(200).json({ name: "geos", transport: "streamable-http", endpoint: `${base}/api/mcp`, tools: TOOLS.map((t) => t.name), docs: `${base}/llms.txt`, openapi: `${base}/openapi.json` });
  let m = req.body; if (typeof m === "string") { try { m = JSON.parse(m); } catch { return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); } }
  const one = async ({ id, method, params }) => {
    try {
      if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "geos", version: "0.3.0" } } };
      if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
      if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      if (method === "tools/call") { const r = await call(base, params.name, params.arguments || {}); return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(r) }] } }; }
      if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
    } catch (e) { return { jsonrpc: "2.0", id, error: { code: -32000, message: String(e && e.message || e) } }; }
  };
  if (Array.isArray(m)) { const out = (await Promise.all(m.map(one))).filter(Boolean); return res.status(200).json(out); }
  const r = await one(m || {}); if (!r) return res.status(202).end(); return res.status(200).json(r);
};
