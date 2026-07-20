# YoDaily Production Hardening

Checklist singkat sebelum deploy production/internal office network.

## Laravel env

- Set `APP_ENV=production`.
- Set `APP_DEBUG=false`.
- Set `LOG_LEVEL=warning` atau `error`.
- Set `SANCTUM_EXPIRATION=1440` untuk auto logout 24 jam.
- Set `YOJADWAL_ENABLED=true` jika login user sudah wajib lewat YoJadwal.
- Set `YOJADWAL_ALLOW_LOCAL_SUPERADMIN_FALLBACK=false` jika superadmin lokal tidak boleh fallback selain database aplikasi.
- Gunakan `APP_KEY`, DB password, dan secret lain yang kuat dan berbeda dari local/dev.
- Isi `YODAILY_USER_MONITORING_PASSWORD` hanya jika admin perlu membuka akun operasional untuk pemantauan. Kosongkan untuk menonaktifkannya, batasi distribusinya, dan audit entri log `monitoring_token`.

## Docker/network

- Jangan expose PostgreSQL ke publik. Untuk server internal, prefer hapus mapping `5432:5432` atau bind ke localhost/VPN-only.
- Jangan expose backend PHP-FPM langsung ke publik; akses normal lewat frontend Nginx.
- Rebuild image setelah perubahan frontend/backend code: `docker compose up -d --build`.
- Migrasi tidak hilang selama volume database `db-data` tidak dihapus.

## Nginx

- Gunakan HTTPS jika domain dapat sertifikat internal/official.
- Block hidden files seperti `.env`.
- Batasi body upload minimal sesuai aplikasi: evidence image max 10 MB, Nginx disarankan `client_max_body_size 12m`.
- Batasi `/storage` hanya untuk `GET`, `HEAD`, dan `OPTIONS`.
- Rate limit login/API harus didefinisikan di level `http`, bukan di `server`/`location`.

Contoh rate limit di main nginx config:

```nginx
http {
    limit_req_zone $binary_remote_addr zone=yodaily_login:10m rate=10r/m;
    limit_req_zone $binary_remote_addr zone=yodaily_api:10m rate=120r/m;

    server {
        location = /api/login {
            limit_req zone=yodaily_login burst=5 nodelay;
            fastcgi_pass backend:9000;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME /var/www/public/index.php;
        }

        location /api/ {
            limit_req zone=yodaily_api burst=60 nodelay;
            fastcgi_pass backend:9000;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME /var/www/public/index.php;
        }
    }
}
```

## Evidence files

Saat ini evidence dilayani lewat `/storage`, jadi siapa pun yang punya URL file bisa mencoba membuka file tersebut. Jika evidence dianggap sensitif, next hardening yang lebih kuat adalah membuat endpoint authenticated untuk file evidence dan tidak membuka `/storage/tasks` langsung.
