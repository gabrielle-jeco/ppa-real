# YoDaily

YoDaily adalah aplikasi operasional dan pemantauan kinerja berbasis Laravel 9, React 19 (TypeScript + Vite), PostgreSQL 15+, dan Web Push.

## Prasyarat Lokal

- **PHP 8.2+** dengan ekstensi `pdo_pgsql`, `pdo_sqlite`, `gd`, `zip`, `mbstring`, `xml`, `bcmath`, `intl`, dan `fileinfo`.
- **Composer 2**
- **Node.js 22+** dan npm
- **PostgreSQL 15+**

> Catatan: File `docker-compose.yml` lokal sudah tidak digunakan di repository ini. Konfigurasi Compose yang tersedia hanyalah [docker-compose.prod.yml](docker-compose.prod.yml) untuk deployment produksi menggunakan image GHCR.

## Menjalankan Secara Lokal (Native Development)

### 1. Backend (`backend/`)

```powershell
cd backend
Copy-Item .env.example .env
composer install
php artisan key:generate
```

Sesuaikan `backend/.env` untuk PostgreSQL lokal Anda (`DB_CONNECTION=pgsql`, `DB_HOST=127.0.0.1`, `DB_PORT=5432`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`). Untuk pengembangan lokal tanpa integrasi server YoJadwal, set `YOJADWAL_ENABLED=false`.

Jalankan migrasi (dan seeder opsional untuk data dummy development):

```powershell
php artisan migrate
php artisan db:seed
php artisan serve
```

Backend berjalan di `http://127.0.0.1:8000`.
Jika menjalankan `php artisan db:seed`, akun demo dev menggunakan NIK numerik (contoh: `000001` superadmin, `900001` manager, `800001` supervisor, `700001` crew) dengan password default `password`. Jangan jalankan seeder di environment produksi.

### 2. Frontend (`frontend/`)

```powershell
cd frontend
npm ci
npm run dev
```

Frontend dev server berjalan di `http://localhost:5173`. Proxy di [frontend/vite.config.ts](frontend/vite.config.ts) otomatis meneruskan `/api` dan `/storage` ke `http://127.0.0.1:8000`.

## Konfigurasi Penting

- **Dua `.env.example`:**
  - `backend/.env.example`: template konfigurasi aplikasi Laravel untuk development lokal.
  - `.env.example` (root): template tambahan untuk deployment Compose/GHCR (`GHCR_IMAGE_PREFIX`, `IMAGE_TAG`, `COMPOSE_PROJECT_NAME`, `DB_VOLUME_NAME`, `LARAVEL_STORAGE_PATH`, serta `VITE_*`).
- **Produksi:** set `APP_ENV=production`, `APP_DEBUG=false`, `LOG_LEVEL=warning`, dan `SANCTUM_EXPIRATION=1440` (token 24 jam).
- **Web Push & Feature Flags:** isi `WEB_PUSH_PUBLIC_KEY` dan `WEB_PUSH_PRIVATE_KEY` (`WEB_PUSH_ENABLED=true`) di backend, serta build arg / variabel frontend `VITE_WEB_PUSH_PUBLIC_KEY`, `VITE_ENABLE_BULK_ASSIGNMENT`, dan `VITE_ENABLE_TASK_WEIGHT`.
- **Keamanan:** batasi `CORS_ALLOWED_ORIGINS` ke origin resmi YoDaily dan jangan pernah menyimpan secret produksi di Git.

Panduan deploy lengkap tersedia di [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) dan [DEPLOYMENT_GHCR.md](DEPLOYMENT_GHCR.md).

## Verifikasi & CI

```powershell
# Frontend (lint, unit test Node, typecheck & build)
cd frontend
npm run lint
npm test
npm run build

# Backend (PHPUnit)
cd ../backend
php artisan test
```

Pipeline [`.github/workflows/ci.yml`](.github/workflows/ci.yml) menjalankan `backend-tests`, `backend-postgres-smoke` (migrasi & verifikasi constraint pada PostgreSQL 15 disposable), dan `frontend-build` (`npm run lint`, `npm test`, `npm run build`) sebelum mem-publish image ke GHCR pada branch `main`.
