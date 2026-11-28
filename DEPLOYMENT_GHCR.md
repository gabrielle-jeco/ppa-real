# Deployment YoDaily dari GHCR

## Alur rilis

Workflow `.github/workflows/ci.yml` menjalankan `backend-tests`, `backend-postgres-smoke`,
dan `frontend-build` (ESLint strict tanpa `continue-on-error`, unit test frontend, serta
build produksi) pada PR/push ke `main` dan `develop`. Hanya push ke `main` (termasuk
merge PR) yang mem-publish image setelah seluruh job pemeriksaan tersebut sukses.

Image Linux AMD64 dipublish dengan tag commit `sha-<40 karakter commit SHA>` dan
tag tetap `production` untuk update rutin:

| Repository | GHCR_IMAGE_PREFIX |
| --- | --- |
| personal-performance-app | ghcr.io/gabrielle-jeco/personal-performance-app |
| ppa-real (folder Copy) | ghcr.io/gabrielle-jeco/ppa-real |

Nama image adalah `<prefix>-frontend:<tag>` dan `<prefix>-backend:<tag>`.
Scheduler memakai image backend yang sama. Tag `production` baru diperbarui setelah
kedua image bertag commit berhasil dipublish. Deployment harus menunggu seluruh
workflow sukses. Pembaruan dua tag registry dilakukan berurutan, bukan transaksi
atomik; jika promosi tag gagal di tengah, jangan deploy sampai workflow berhasil
diulang. Tag commit tetap tersedia untuk memilih versi atau rollback.

Workflow hanya mem-publish image, tidak mengakses atau men-deploy server kantor.
Build tidak membutuhkan `.env` production atau database production. Migrations dan
seed tidak dijalankan selama build. Entrypoint production juga tidak otomatis
melakukan migrations/seed; operator menjalankan migrations secara eksplisit.

## Setup GitHub (kedua repository)

Di Settings > Secrets and variables > Actions > Variables, isi:

- `VITE_WEB_PUSH_PUBLIC_KEY`: public key yang cocok dengan pasangan VAPID server.
- `VITE_ENABLE_BULK_ASSIGNMENT`: `true` atau `false`.
- `VITE_ENABLE_TASK_WEIGHT`: `true` atau `false`.

Publish menggunakan `GITHUB_TOKEN` otomatis dengan permission `packages: write`.
Tidak perlu menyimpan PAT server sebagai Actions secret. Setelah publish pertama,
periksa kedua package di GitHub Packages: pertahankan visibility **Private** dan
pastikan repository workflow memiliki akses. Jangan memakai kembali nama package
lama milik repository lain tanpa mengatur permission package tersebut.

Nilai `VITE_*` masuk ke JavaScript saat build dan dapat dibaca pengguna browser.
Jangan menaruh DB password, APP_KEY, atau VAPID private key di sana. Mengubah
repository variables baru memengaruhi image hasil build berikutnya.

## Persiapan server dan perpindahan pertama

Gunakan Docker Compose v2+ dan server Linux AMD64 (`uname -m`: `x86_64`).
Jalankan Docker dengan user Linux yang sama untuk login dan deployment:

```bash
docker login ghcr.io -u gabrielle-jeco
```

Masukkan PAT classic dengan scope `read:packages` saat diminta password. Token tidak
ditulis di Compose, `.env`, command history, atau source.

Sebelum mengubah container, backup PostgreSQL, `.env`, dan seluruh storage dengan
prosedur backup server yang berlaku. Catat project dan mount yang sedang dipakai:

```bash
docker inspect perf-app-db --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect perf-app-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}} {{.Name}} {{.Source}}{{end}}{{end}}'
docker inspect perf-app-backend --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
```

Compose prod mengharapkan PostgreSQL lama menggunakan **named volume**. Bila DB lama
memakai bind mount, sesuaikan mount DB sebelum melanjutkan; jangan menebak nama
volume. `DB_VOLUME_NAME` harus nama persis hasil inspect, termasuk prefix project.
Deklarasi `external: true` sengaja menolak jika volume tersebut tidak ada.

Simpan `docker-compose.prod.yml` dan `.env` di folder deployment. File prod berdiri
sendiri: jangan digabung dengan `-f docker-compose.yml`. Pertahankan seluruh nilai
`.env` production lama, terutama APP_KEY dan kredensial DB yang sudah sesuai role
PostgreSQL. Tambahkan/isi berikut (contoh path, bukan nilai universal):

```dotenv
APP_ENV=production
APP_DEBUG=false
DB_HOST=db
DB_PORT=5432
GHCR_IMAGE_PREFIX=ghcr.io/gabrielle-jeco/ppa-real
IMAGE_TAG=production
COMPOSE_PROJECT_NAME=PASTE_EXISTING_PROJECT_NAME
DB_VOLUME_NAME=PASTE_EXISTING_DB_VOLUME_NAME
LARAVEL_STORAGE_PATH=/home/deployer/ppa-real/backend/storage
```

`LARAVEL_STORAGE_PATH` harus **path absolut ke storage lama yang benar**. Jika mount
backend lama adalah `/home/deployer/ppa-real/backend -> /var/www`, maka tambahkan
`/storage` pada source tersebut. Jangan membuat storage kosong sebagai pengganti.
Pastikan juga `storage/app/public` sudah ada. Compose sengaja tidak membuat source
bind mount yang hilang. Backend/scheduler dapat menulis storage; frontend hanya
membaca `app/public`. Folder source backend lainnya dan volume vendor tidak dipakai
di production. Jangan hapus folder storage meski source nanti dipindahkan.

Pertahankan `FRONTEND_PORT` dan `DB_FORWARD_PORT` sesuai server. Reverse proxy HTTPS
harus mengarah ke port frontend (default 8081). PHP-FPM backend hanya internal di
port 9000; `BACKEND_PORT` tidak dipakai pada Compose prod. Batasi akses port DB
melalui konfigurasi jaringan/firewall server.

Periksa konfigurasi tanpa mencetak secret, lalu download image sebelum maintenance:

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker volume inspect "$DB_VOLUME_NAME" >/dev/null
docker compose -f docker-compose.prod.yml pull backend scheduler frontend
```

Untuk command `docker volume inspect` di atas, isi/export variabel shell
`DB_VOLUME_NAME` sesuai hasil inspect; `.env` tidak otomatis menjadi variabel shell.
Alternatifnya pakai nama literal volume hasil inspect.

Setelah backup siap dan image tersedia, jadwalkan jeda akses pengguna. Pastikan
`COMPOSE_PROJECT_NAME` sama dengan project lama supaya tidak ada scheduler ganda.
Jalankan urutan perpindahan/update di bawah. Database lama boleh direcreate oleh
Compose saat menambahkan healthcheck, tetapi named volume yang sama tetap dipakai.
Startup tidak mengganti password role DB yang sudah ada hanya karena `.env` berubah.

## Menjalankan rilis / update berikutnya

Tunggu workflow `main` sukses. `IMAGE_TAG=production` cukup diset sekali; jika
variabel tidak diisi, Compose juga menggunakan `production`. Server yang sebelumnya
memakai `IMAGE_TAG=sha-...` perlu menggantinya ke `production` sekali saja.
Perubahan Compose/config pada rilis baru tetap harus disalin ke server. Tidak perlu
`git pull` source aplikasi atau mengedit tag untuk update kode biasa.

Untuk rilis tanpa perubahan schema, update rutin cukup:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Jika ada migration, gunakan urutan maintenance berikut. Catat tag commit rilis
sebelumnya dari riwayat Actions sebelum update untuk kebutuhan rollback.

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml pull backend scheduler frontend

# Hentikan penulisan dan pekerjaan terjadwal selama migrasi.
docker compose -f docker-compose.prod.yml stop scheduler frontend backend
docker compose -f docker-compose.prod.yml up -d --wait db
docker compose -f docker-compose.prod.yml run --rm --no-deps backend php artisan migrate --force
docker compose -f docker-compose.prod.yml up -d --no-deps --wait backend
docker compose -f docker-compose.prod.yml up -d --no-deps frontend scheduler

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend scheduler frontend
```

Jika suatu langkah gagal, berhenti dan periksa log sebelum menjalankan langkah
berikutnya. Jangan menyalakan frontend/scheduler setelah migration gagal. Verifikasi
login, laporan, evidence upload/download lama dan baru, serta jadwal scheduler.
Pada perpindahan awal, jalankan juga sinkronisasi backup relasi yang idempotent:

```bash
docker compose -f docker-compose.prod.yml exec backend php artisan backup:sync
```

`db:seed` tidak otomatis dijalankan di production, termasuk pada DB kosong. Panduan
ini untuk migrasi server dengan data lama, bukan pembuatan demo baru.

Untuk rilis frontend saja yang memang tidak membutuhkan perubahan backend/schema,
jalankan hanya:

```bash
docker compose -f docker-compose.prod.yml pull frontend
docker compose -f docker-compose.prod.yml up -d --no-deps frontend
```

Backend/scheduler yang belum direcreate masih memakai image lamanya sampai operator
meng-updatenya. Jangan menjalankan update bersamaan dengan proses publish/promosi
tag `production`.

## Rollback

Untuk rollback saja, ubah `IMAGE_TAG` ke `sha-...` rilis sebelumnya dan deploy ulang
image yang sesuai. Setelah siap mengikuti rilis rutin lagi, kembalikan nilainya ke
`production`. Rollback
image tidak membatalkan migrations atau mengembalikan data. Pastikan schema tetap
kompatibel atau gunakan prosedur pemulihan backup yang telah diuji. Jangan menjalankan
`down -v` atau prune volume untuk update/rollback.

Rujukan: [GitHub publish images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images),
[Docker external volumes](https://docs.docker.com/reference/compose-file/volumes/).
