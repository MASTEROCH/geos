// api/venue.js — Vercel serverless для глобуса: НАСТОЯЩЕЕ состояние места по Google Places (New).
// (api/place.js рядом — другой файл: рантайм-резолвер CityHUB по place_id с Supabase.)
//
// Зачем: у OSM нет фото, а телефон и часы там «как записали когда-то». Google
// знает место таким, какое оно сейчас: до 5 фото, рейтинг и число отзывов,
// телефон, сайт, часы на эту неделю, статус «работает/закрыто навсегда»,
// 5 отзывов. Ничего не храним (ToS 3.2.3): ответ уходит клиенту с no-store,
// на диске и в CDN не остаётся ничего.
//
//   GET /api/venue?name=Синево&lat=41.639&lon=42.987&photos=3
//
// Стоимость одного открытия карточки (после бесплатных лимитов месяца):
//   Text Search (IDs Only)        $0        — найти place_id по имени и точке
//   Place Details (Enterprise+A)  ~$0.025   — контакты, часы, рейтинг, отзывы
//   Place Photo × N               $0.007×N  — фото
// Бесплатно в месяц: Details ~1 000 карточек, Photo ~10 000 снимков.
// Ключ — переменная окружения GOOGLE_MAPS_API_KEY в настройках проекта Vercel.

const KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const BASE = "https://places.googleapis.com/v1";
const DETAILS_MASK = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "internationalPhoneNumber",
  "websiteUri", "googleMapsUri", "regularOpeningHours", "currentOpeningHours", "businessStatus",
  "rating", "userRatingCount", "priceLevel", "photos", "editorialSummary", "reviews", "primaryTypeDisplayName",
].join(",");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, no-store");            // ToS: не кэшировать содержимое Google
  const { name = "", lat, lon } = req.query;
  const nPhotos = Math.max(0, Math.min(5, parseInt(req.query.photos || "3", 10) || 0));
  if (!KEY) return res.status(200).json({ ok: false, needKey: true });
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!name || Number.isNaN(la) || Number.isNaN(lo)) return res.status(400).json({ ok: false, error: "name, lat, lon" });

  const call = (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  try {
    // 1. place_id по имени и точке — IDs Only, бесплатно
    const s = await call(`${BASE}/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id" },
      body: JSON.stringify({ textQuery: name, languageCode: "ru", maxResultCount: 1,
                             locationBias: { circle: { center: { latitude: la, longitude: lo }, radius: 150.0 } } }),
    });
    const sj = await s.json();
    const id = sj.places && sj.places[0] && sj.places[0].id;
    if (!id) return res.status(200).json({ ok: true, found: false });

    // 2. карточка — один вызов Details
    const d = await call(`${BASE}/places/${id}?languageCode=ru`, {
      headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": DETAILS_MASK },
    });
    const p = await d.json();
    if (!p.id) return res.status(200).json({ ok: true, found: false, error: p.error && p.error.message });

    // 3. фото — каждая ссылка отдельный вызов SKU Photo; берём не больше, чем просили
    const photos = [];
    for (const ph of (p.photos || []).slice(0, nPhotos)) {
      try {
        const r = await call(`${BASE}/${ph.name}/media?maxWidthPx=1000&skipHttpRedirect=true`,
                             { headers: { "X-Goog-Api-Key": KEY } });
        const j = await r.json();
        if (j.photoUri) photos.push({ url: j.photoUri, w: ph.widthPx, h: ph.heightPx,
                                      by: (ph.authorAttributions || []).map(a => a.displayName).filter(Boolean).join(", ") });
      } catch (e) { /* одно фото не пришло — остальные важнее */ }
    }
    const t = (x) => (x && x.text) || "";
    return res.status(200).json({
      ok: true, found: true, id, name: t(p.displayName), type: t(p.primaryTypeDisplayName),
      address: p.formattedAddress || "", phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
      website: p.websiteUri || "", maps: p.googleMapsUri || "", status: p.businessStatus || "",
      rating: p.rating || null, ratings: p.userRatingCount || 0, price: p.priceLevel || "",
      openNow: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : null,
      hours: (p.currentOpeningHours || p.regularOpeningHours || {}).weekdayDescriptions || [],
      summary: t(p.editorialSummary), photos,
      reviews: (p.reviews || []).slice(0, 5).map(r => ({
        author: (r.authorAttribution || {}).displayName || "", rating: r.rating || null,
        when: r.relativePublishTimeDescription || "", text: t(r.text) || t(r.originalText) })),
      photosTotal: (p.photos || []).length, fetched: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
};
