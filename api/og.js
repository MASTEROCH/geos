// api/og.js — Vercel serverless: фото и описание места с его сайта (Open Graph).
//
// Зачем: у OSM нет фотографий и почти нет описаний, а у большинства заведений
// с сайтом есть og:image и og:description. Браузер сам сайт прочитать не может
// (CORS), поэтому читает эта функция: один GET, 6 секунд, только <head>.
// Ничего не хранит — отдаёт ссылку на картинку и текст, кэш на CDN сутки.
//
//   GET /api/og?u=https://example.ge  →  {image, description, title, site}

const TIMEOUT = 6000;
const MAX = 256 * 1024;                 // <head> целиком всегда меньше

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const u = String(req.query.u || "");
  if (!/^https?:\/\/[^\s/]+/i.test(u)) return res.status(400).json({ error: "bad url" });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(u, {
      signal: ctl.signal, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ROCH-GEO-globe/1.0; +https://geo-globe-tau.vercel.app)",
                 "Accept": "text/html,*/*;q=0.5", "Accept-Language": "ru,en;q=0.8,ka;q=0.6" },
    });
    const reader = r.body.getReader();
    let html = "", got = 0;
    const dec = new TextDecoder("utf-8", { fatal: false });
    while (got < MAX) {
      const { value, done } = await reader.read();
      if (done) break;
      got += value.length; html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const meta = (names) => {
      for (const n of names) {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`, "i"))
              || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, "i"));
        if (m) return m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      }
      return "";
    };
    const abs = (x) => { try { return x ? new URL(x, r.url || u).href : ""; } catch { return ""; } };
    const title = meta(["og:title", "twitter:title"]) || (html.match(/<title[^>]*>([^<]{1,200})/i) || [])[1] || "";
    const out = {
      image: abs(meta(["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"])),
      description: meta(["og:description", "twitter:description", "description"]).slice(0, 600),
      title: title.trim().slice(0, 160),
      site: meta(["og:site_name"]),
      url: r.url || u,
    };
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=3600");
    return res.status(200).json({ image: "", description: "", title: "", error: String(e && e.name || e) });
  } finally { clearTimeout(t); }
};
