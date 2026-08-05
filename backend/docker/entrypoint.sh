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

echo "Postgres is ready."

prepare_laravel_writable_dirs() {
  mkdir -p \
    /var/www/storage/app/public \
    /var/www/storage/framework/cache/data \
    /var/www/storage/framework/sessions \
    /var/www/storage/framework/testing \
    /var/www/storage/framework/views \
    /var/www/storage/logs \
    /var/www/bootstrap/cache

  chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache || true
  chmod -R ug+rwX /var/www/storage /var/www/bootstrap/cache || true
}

sync_composer_vendor() {
  [ -f /var/www/composer.lock ] || return 0

  CURRENT_LOCK=$(sha256sum /var/www/composer.lock | cut -d ' ' -f 1)
  BUNDLED_LOCK=$(cat /opt/yodaily-vendor.lock 2>/dev/null || true)
  INSTALLED_LOCK=$(cat /var/www/vendor/.yodaily-composer-lock 2>/dev/null || true)

  if [ "$CURRENT_LOCK" = "$INSTALLED_LOCK" ] && [ -f /var/www/vendor/autoload.php ]; then
    return 0
  fi

  if [ -d /opt/yodaily-vendor ] && [ "$CURRENT_LOCK" = "$BUNDLED_LOCK" ]; then
    echo "Synchronizing Composer dependencies from rebuilt image..."
    mkdir -p /var/www/vendor
    cp -a /opt/yodaily-vendor/. /var/www/vendor/
    echo "$CURRENT_LOCK" > /var/www/vendor/.yodaily-composer-lock
    return 0
  fi

  echo "composer.lock differs from the image; installing runtime dependencies..."
  composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
  echo "$CURRENT_LOCK" > /var/www/vendor/.yodaily-composer-lock
}

PHP_MEMORY_LIMIT="${PHP_MEMORY_LIMIT:-1024M}"
echo "memory_limit=${PHP_MEMORY_LIMIT}" > /usr/local/etc/php/conf.d/zz-yodaily-memory.ini
echo "PHP memory_limit set to ${PHP_MEMORY_LIMIT}"

prepare_laravel_writable_dirs
sync_composer_vendor

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

prepare_laravel_writable_dirs
exec php-fpm
