# MP-TikTok

Workspace operasional TikTok Shop dengan backend Laravel, Blade, dan SQLite.

## Menjalankan aplikasi

Aplikasi aktif berada di folder `backend/`. Tidak diperlukan `npm install`, Vite, atau Node.js untuk menjalankan dashboard.

### macOS/Linux

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
php artisan serve
```

### Windows PowerShell

```powershell
cd backend
composer install
Copy-Item .env.example .env
php artisan key:generate
if (!(Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan migrate --seed
php artisan serve
```

Buka `http://127.0.0.1:8000`.

## Fitur Blade

- Ringkasan jumlah order, paket, transaksi, settlement, pendapatan, dan biaya.
- Pemilihan toko aktif serta pembuatan toko baru.
- Import shipment CSV ke tabel order, paket, dan item.
- Import income XLSX ke tabel transaksi dan transfer.
- Riwayat batch import dan daftar order terbaru.
- Navigasi multi-halaman Blade untuk Pesanan, Pengiriman, Transaksi, Toko, dan Import.
- Route halaman untuk Promosi, Penentuan Harga, Produk, Variant, dan Mapping Pesanan.

File import diproses server-side oleh `CommerceFileImporter`, sehingga tidak membutuhkan library JavaScript atau proses Vite.

## Struktur Laravel

```text
backend/
├── app/Http/Controllers/
│   ├── DashboardController.php
│   └── WorkspacePageController.php
├── app/Services/CommerceFileImporter.php
├── app/Services/WorkspacePageService.php
├── database/migrations/
├── public/css/app.css
├── resources/views/layouts/app.blade.php
├── resources/views/pages/
└── routes/web.php
```

Route utama yang tersedia:

```text
/                  Dashboard
/pesanan           Pesanan
/pengiriman        Pengiriman
/transaksi         Transaksi
/promosi           Promosi
/penentuan-harga   Penentuan Harga
/import-keuangan   Import Keuangan
/import-pengiriman Import Pengiriman
/toko              Toko
/produk            Produk
/produk-variant    Produk Variant
/mapping-pesanan   Mapping Pesanan
```

## Database

SQLite digunakan sebagai database default. Jalankan migration dan seed dari folder `backend/`:

```bash
php artisan migrate --seed
```

Migration mencakup user, toko, order, paket, item, transaksi, transfer, import batch, katalog, dan promosi.

## Implementasi lama

Folder `backend-node/`, `src/`, `index.html`, dan konfigurasi Vite masih disimpan sebagai backup selama migrasi fitur lanjutan. Folder tersebut tidak diperlukan untuk menjalankan aplikasi Laravel Blade.

## Test

```bash
cd backend
php artisan test
```
