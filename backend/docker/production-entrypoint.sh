#!/bin/sh
set -eu

: "${APP_KEY:?APP_KEY must be supplied at runtime}"
: "${DB_HOST:?DB_HOST must be supplied at runtime}"
: "${DB_DATABASE:?DB_DATABASE must be supplied at runtime}"
: "${DB_USERNAME:?DB_USERNAME must be supplied at runtime}"
: "${DB_PASSWORD:?DB_PASSWORD must be supplied at runtime}"

echo "memory_limit=${PHP_MEMORY_LIMIT:-1024M}" > /usr/local/etc/php/conf.d/zz-yodaily-memory.ini
mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions \
    storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R ug+rwX storage bootstrap/cache

# Check authentication too, rather than treating an open DB port as readiness.
attempt=0
until php -r '
    try {
        new PDO("pgsql:host=".getenv("DB_HOST").";port=".(getenv("DB_PORT") ?: "5432").";dbname=".getenv("DB_DATABASE"), getenv("DB_USERNAME"), getenv("DB_PASSWORD"), [PDO::ATTR_TIMEOUT => 3]);
    } catch (Throwable $e) { exit(1); }
'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo 'Database connection failed; check DB configuration and PostgreSQL credentials.' >&2
        exit 1
    fi
    sleep 2
done

exec "$@"
