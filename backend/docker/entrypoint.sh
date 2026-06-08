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

PHP_MEMORY_LIMIT="${PHP_MEMORY_LIMIT:-1024M}"
echo "memory_limit=${PHP_MEMORY_LIMIT}" > /usr/local/etc/php/conf.d/zz-yodaily-memory.ini
echo "PHP memory_limit set to ${PHP_MEMORY_LIMIT}"

php artisan config:clear || true
php artisan cache:clear || true
php artisan route:clear || true

php artisan migrate --force


# Seed only if there are no operational users yet. The CMS superadmin can be
# created by migrations, so it should not mark the demo/initial data as seeded.
USER_COUNT=$(php artisan tinker --execute="echo \App\Models\User::where('username', '!=', '000001')->count();" 2>/dev/null | tail -1)
if [ "$USER_COUNT" = "0" ]; then
  php artisan db:seed --force
else
  echo "Database already seeded, skipping..."
fi

chmod -R 777 /var/www/storage /var/www/bootstrap/cache
exec php-fpm
