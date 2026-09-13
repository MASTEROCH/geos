// api/street.js — вид улицы у входа: открытые снимки Mapillary (Meta, CC BY-SA) в радиусе ~50 м от точки.
//
//   GET /api/street?lat=41.65&lon=41.63&n=3  →  {ok, images:[{url, when, angle}], credit}
//   Без MAPILLARY_TOKEN → {needKey:true}. Токен клиентский, бесплатный, без карты: mapillary.com/dashboard/developers.
//   Ссылки на снимки временные (Mapillary выдаёт их на часы) — ответ не кэшируем.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, no-store");
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return res.status(200).json({ ok: false, needKey: true });
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon), n = Math.min(5, Math.max(1, parseInt(req.query.n || "3", 10)));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: "lat, lon" });
  const dl = 0.0008, dn = dl / Math.cos(lat * Math.PI / 180);   // ≈90 м: 50 м давали пусто даже на площади Пьяцца в Батуми
  const bbox = `${(lon - dn).toFixed(6)},${(lat - dl).toFixed(6)},${(lon + dn).toFixed(6)},${(lat + dl).toFixed(6)}`;
  try {
    const r = await fetch(`https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,thumb_1024_url,captured_at,compass_angle,is_pano&bbox=${bbox}&limit=${n * 3}`,
                          { signal: AbortSignal.timeout(8500) });
    if (!r.ok) return res.status(200).json({ ok: false, error: String(r.status) });
    const j = await r.json();
    const imgs = (j.data || []).filter(x => x.thumb_1024_url && !x.is_pano)
      .sort((a, b) => (b.captured_at || 0) - (a.captured_at || 0)).slice(0, n)
      .map(x => ({ url: x.thumb_1024_url, when: x.captured_at ? new Date(x.captured_at).toISOString().slice(0, 10) : "", angle: x.compass_angle || null, id: x.id }));
    return res.status(200).json({ ok: true, images: imgs, credit: "Mapillary · вид улицы", license: "CC BY-SA 4.0" });
  } catch (x) { return res.status(200).json({ ok: false, error: String(x && x.message || x) }); }
};
