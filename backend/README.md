# MP-TikTok Laravel

Backend utama MP-TikTok menggunakan Laravel, Blade, dan SQLite. Frontend tidak memakai Vite sehingga project dapat dijalankan tanpa `npm install`.

## Menjalankan di Windows

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
if (!(Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan migrate --seed
php artisan serve
```

Buka `http://127.0.0.1:8000`.

## Struktur penting

- `app/Http/Controllers/DashboardController.php`: halaman dashboard, toko, dan upload import.
- `app/Services/CommerceFileImporter.php`: import shipment CSV dan income XLSX.
- `resources/views/dashboard.blade.php`: halaman utama Blade.
- `public/css/app.css`: stylesheet tanpa bundler.
- `routes/web.php`: route halaman dan form.

## Import data

Dashboard menyediakan form server-side untuk:

- Shipment `.csv`.
- Income `.xlsx`.

Data diproses langsung oleh PHP dan disimpan ke SQLite. Import yang sama aman diulang karena batch file memiliki hash unik.
