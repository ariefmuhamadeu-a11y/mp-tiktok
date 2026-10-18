# MP-TikTok

Project frontend standalone untuk Pricing & ROAS Calculator.

## Menjalankan server

Dari folder ini:

```bash
npm install
npm run server
```

Buka URL localhost yang ditampilkan Vite. Untuk development biasa, `npm run dev` juga tetap tersedia.

## Struktur MVC

```text
src/
├── controllers/
│   └── appController.js   # event, navigasi, dan update tampilan
├── services/
│   ├── pricingService.js  # kalkulasi harga, ROAS, dan simulasi HPP
│   └── shipmentService.js # parsing file, deduplikasi, dan penyimpanan data
├── models/
│   └── appModel.js        # route dan metadata halaman
├── views/
│   └── appView.js         # update tampilan shell aplikasi
└── main.js                # entry point Vite
```

`index.html` berisi view/layout dasar, `services` berisi business logic, dan JavaScript aplikasi dimulai dari `src/main.js`.

## Backend dan database

Backend Laravel lama masih berada di folder `backend/` sebagai cadangan. Backend aktif Node.js berada di folder `backend-node/` dan memakai SQLite.

```bash
cd backend-node
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Dari root project, backend juga bisa dijalankan dengan `npm run backend:dev`.

API tersedia di `http://localhost:3001`. Migration menyediakan tabel `users` dan `stores` yang terhubung melalui `user_id`. Satu user tidak dapat memiliki dua store dengan slug yang sama.

Endpoint awal:

```text
GET  /api/health
POST /api/users
GET  /api/users/:id
GET  /api/stores?userId=:id
POST /api/stores
GET  /api/stores/:id
```

## Build production

```bash
npm run build
npm run preview
```

Hasil production frontend berada di folder `dist/`. Backend Node.js dijalankan terpisah dari frontend.
