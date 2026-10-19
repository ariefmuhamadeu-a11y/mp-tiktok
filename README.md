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

## Katalog produk dan mapping marketplace

Kontrak katalog memakai tiga entitas utama:

- `products`: master produk internal, scoped ke `user_id` melalui `internal_code`.
- `product_variants`: unit jual internal di bawah produk, dengan `internal_sku`, barcode, nama, dan atribut JSON.
- `marketplace_product_mappings`: alias SKU marketplace per `store_id` dan `platform` yang menunjuk ke satu variant internal.

Nilai `product_name`, `variation`, `sku_id`, dan `seller_sku` pada `order_items` tetap menjadi snapshot hasil import. Mapping hanya menambah relasi dan tidak menimpa histori tersebut.

Status mapping yang tersedia: `mapped`, `ignored`, dan `conflict`. Item `unmatched` dihitung dari order item yang belum memiliki mapping, bukan disimpan sebagai row palsu.

Migration katalog dijalankan bersama migration Node dan diterapkan ke database API Node serta database commerce yang dipakai workspace:

```bash
cd backend-node
npm run db:migrate
```

Endpoint katalog:

```text
GET    /api/products?userId=:id
POST   /api/products
GET    /api/products/:id?userId=:id
PATCH  /api/products/:id
GET    /api/products/:id/variants?userId=:id
POST   /api/products/:id/variants

GET    /api/variants?userId=:id&productId=:id
GET    /api/variants/:id?userId=:id
PATCH  /api/variants/:id

GET    /api/marketplace-mappings?storeId=:id&platform=tiktok&status=mapped
POST   /api/marketplace-mappings
PATCH  /api/marketplace-mappings/:id
GET    /api/marketplace-mappings/unmatched-order-items?storeId=:id&status=unmatched
```

Produk dan variant dinonaktifkan melalui `isActive`; mapping yang tidak dipakai ditandai `ignored` agar histori perubahan tetap dapat diaudit.

## Build production

```bash
npm run build
npm run preview
```

Hasil production frontend berada di folder `dist/`. Backend Node.js dijalankan terpisah dari frontend.
