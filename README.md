# GeoTour Uzbekistan

O‘zbekiston turizm salohiyati xaritasi. VS Code uchun frontend va backend manbalari bir papkada.

## Ishga tushirish

Node.js 20 yoki yangiroq versiya kerak. Loyihada npm orqali o‘rnatiladigan qo‘shimcha paket yo‘q.

1. VS Code → File → Open Folder → `geotour-project` papkasini tanlang.
2. Terminal → New Terminal oching.
3. `npm start` buyrug‘ini bajaring.
4. Brauzerda http://localhost:3000 manzilini oching.

Windows’da `start.bat` orqali ham ishga tushadi. VS Code’da F5 backend debuggerini ishga tushiradi. Serverni Ctrl+C bilan to‘xtating. `index.html`ni ikki marta bosib yoki Live Server bilan ochmang: API uchun Node serveri kerak.

`npm run dev` backend o‘zgarganda serverni qayta ishga tushiradi. Frontendni o‘zgartirgandan so‘ng brauzerni yangilang. `npm test` API tekshiruvlarini bajaradi.

Boshqa port (PowerShell): `$env:PORT=4000; npm start`.

## Papkalar

```text
frontend/
  index.html         Sahifa tuzilmasi
  styles.css         Moslashuvchan dizayn
  app.js             Xarita, filtrlash, qidiruv, reyting, saqlash
  vendor/            Lokal Leaflet 1.9.4 va litsenziyasi
  rasters/           12 ta tayyor xarita qatlami
backend/
  server.cjs         HTTP server, REST API, saqlash, validatsiya
  server.test.cjs    API integratsion tekshiruvlari
  data/
    catalog.json     14 hudud va 5 indeks
    tourism-poi.json Turizm obyektlari
.vscode/launch.json  VS Code F5 konfiguratsiyasi
package.json         Ishga tushirish buyruqlari
start.bat            Windows ishga tushirish fayli
```

## Funksiyalar

- ESI, TSI, TPI, TRSI, ETSI va qo‘shimcha NDVI, NDWI, LULC, DEM, qiyalik, iqlim, aholi qatlamlari.
- Raster shaffofligi, qatlamlarni yoqish/o‘chirish, OSM / Esri / OpenTopoMap fonlari.
- Hududlar reytingi, hudud yoki obyekt nomi bo‘yicha qidiruv, tur bo‘yicha filtr.
- Mamlakat masshtabida nuqtalarni guruhlash; yaqinlashganda alohida obyektlar.
- Joylarni diskda saqlash va o‘chirish; Google Maps havolalari; CSV eksport.
- Telefon, planshet va desktop uchun moslashuvchan sahifa.

## API

| Metod va yo‘l | Natija |
| --- | --- |
| GET /api/health | Server holati |
| GET /api/catalog | Indekslar, qatlamlar, hududlar, obyekt turlari |
| GET /api/regions?index=ESI&q=Toshkent | Saralangan hududlar |
| GET /api/points?q=Registon&type=museum&limit=200&offset=0 | Filtrlangan obyektlar va jami soni |
| GET /api/points?bbox=69,41,70,42 | west,south,east,north chegarasidagi obyektlar |
| GET /api/favorites | Saqlangan joylar |
| POST /api/favorites | JSON: `{"pointId":"node-..."}` |
| DELETE /api/favorites/:id | Saqlangan joyni o‘chirish |

`limit`: 1–20000, standart 200. Frontend barcha mavjud nuqtalarni (20000 gacha) oladi, ro‘yxatni 60 tadan chiqaradi.

Saqlangan joylar `backend/data/favorites.json` faylida avtomatik yaratiladi. Bu lokal ilova: foydalanuvchi hisobi yo‘q, bitta serverdagi sevimli joylar umumiy. Server faqat 127.0.0.1 manzilida ishlaydi.

## Manba va chegaralar

Bu https://uzbekistan-map-delta.vercel.app/ sayti asosida qayta yozilgan loyiha. Asl saytning React/Next.js repozitoriysi yoki backend manbalari emas. Frontend va backendning tahrirlanadigan kodlari ushbu papkada yangidan yozilgan.

Hudud ballari, turizm obyektlari va PNG rasterlar avval saytda ochiq tarqatilgan fayllardan olingan. Ballarning ilmiy metodikasi yoki raster aniqligi bu loyihada tasdiqlanmagan. Asl GEE hisoblash formulalari, autentifikatsiya va jonli hisoblash servisi havoladan olinmagan. Backend tayyor rasterlarni uzatadi; GEE indekslarini qayta hisoblamaydi. Asl ko‘rinishdagi “ROAD_DISTANCE” va “POI_DENSITY” mustaqil hisoblanadigan rasterlari mavjud bo‘lmagan: ushbu loyihada fon xaritasi va guruhlangan turizm nuqtalari mavjud.

Leaflet lokal papkaga joylangan (BSD-2-Clause, `frontend/vendor/LEAFLET-LICENSE.txt`). OSM ma’lumotlari va xarita atributsiyasi saqlangan; OSM ma’lumotlari ODbL shartlariga tegishli. Boshqa raster va ballarning litsenziyasi asl sayt tomonidan ushbu yuklamada ko‘rsatilmagan.

Internet fon xaritalari hamda Google Maps uchun kerak. Frontend, API, tayyor rasterlar va turizm ma’lumotlari lokal ishlaydi. Maxfiy kalit yoki GEE akkaunti kerak emas.
