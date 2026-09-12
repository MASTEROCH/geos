# ГЕО · Глобус

Каждый город Земли на одном WebGL-глобусе — без библиотек, одним файлом, работает офлайн.
235 747 городов (GeoNames, CC BY 4.0) + заведения собранных городов по 13 нишам CityHUB (© OpenStreetMap contributors, ODbL).

Генерируется скиллом **ГЕО** (`world.py` → `globe.py` → `deploy.py`). Это сборка `dist/`, руками не править.

- `index.html` — глобус
- `world.html` — плоская карта мира (без WebGL)
- `cities/<CC>/<slug>/map.html` — карта покрытия города, `city.json` — карточка
