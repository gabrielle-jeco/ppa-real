#!/bin/sh
set -e

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until php -r "
  \$host=getenv('DB_HOST'); \$port=getenv('DB_PORT');
  \$fp=@fsockopen(\$host, \$port, \$errno, \$errstr, 1);
  if (\$fp) { fclose(\$fp); exit(0); }
  exit(1);
" ; do
  sleep 1
done

echo "Postgres is up ✅"

php artisan config:clear || true
php artisan cache:clear || true
php artisan route:clear || true

php artisan migrate --force

# Seed only if table is empty
USER_COUNT=$(php artisan tinker --execute="echo \App\Models\User::count();" 2>/dev/null | tail -1)
if [ "$USER_COUNT" = "0" ]; then
  php artisan db:seed --force
else
  echo "Database already seeded, skipping..."
fi

chmod -R 777 /var/www/storage /var/www/bootstrap/cache
exec php-fpm
