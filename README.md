# GEOS

База мест планеты и навигация «куда пойти именно тебе». Ядро для CityHUB, PromOS, LinkOS, BuildOS.

Слой данных: 235 747 городов (GeoNames, CC BY 4.0) + заведения собранных городов (© OpenStreetMap, ODbL) + настоящее состояние места в рантайме (Google Places, не хранится).
Витрина: глобус на голом WebGL, одним файлом, офлайн.

Генерируется скиллом **ГЕО**: `world.py` → `globe.py` → `deploy.py`. Это сборка `dist/`, руками не править.

- `index.html` — глобус · `world.html` — плоская карта
- `cities/<CC>/<slug>/map.html` — карта покрытия города, `city.json` — карточка
- `api/venue.js` — место по Google (нужен `GOOGLE_MAPS_API_KEY`) · `api/og.js` — фото и описание с сайта
