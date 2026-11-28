#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env"

FRONTEND_ONLY=false
SKIP_MIGRATE=false
TAG_OVERRIDE=""

usage() {
  cat <<'EOF'
Penggunaan:
  ./deploy-prod.sh                    Update penuh (pull -> stop app -> migrate --force -> up -> status).
  ./deploy-prod.sh --frontend-only    Pull & update container frontend saja (tanpa restart backend).
  ./deploy-prod.sh --skip-migrate     Pull semua image lalu update container tanpa downtime migrasi (hanya rilis tanpa perubahan schema).
  ./deploy-prod.sh --tag <tag>        Deploy / rollback memakai tag spesifik (contoh: sha-abc1234).
  ./deploy-prod.sh -h | --help        Tampilkan bantuan ini.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend-only)
      FRONTEND_ONLY=true
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=true
      shift
      ;;
    --tag)
      [[ $# -ge 2 && -n "$2" ]] || { echo "Error: --tag membutuhkan nilai (contoh: --tag sha-abc123)." >&2; exit 1; }
      TAG_OVERRIDE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opsi tidak dikenal: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$FRONTEND_ONLY" == true && "$SKIP_MIGRATE" == true ]]; then
  echo "Error: --frontend-only dan --skip-migrate tidak dapat digabungkan." >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Error: docker tidak ditemukan di PATH." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Error: docker compose v2+ tidak tersedia." >&2; exit 1; }

cd "$SCRIPT_DIR"

[[ -f "$COMPOSE_FILE" ]] || { echo "Error: $COMPOSE_FILE tidak ditemukan." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Error: $ENV_FILE tidak ditemukan." >&2; exit 1; }

read_env_var() {
  local key="$1"
  local line value
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$value"
}

DB_VOLUME_NAME="$(read_env_var DB_VOLUME_NAME)"
LARAVEL_STORAGE_PATH="$(read_env_var LARAVEL_STORAGE_PATH)"

[[ -n "$DB_VOLUME_NAME" ]] || { echo "Error: DB_VOLUME_NAME kosong di $ENV_FILE." >&2; exit 1; }
[[ -n "$LARAVEL_STORAGE_PATH" && -d "$LARAVEL_STORAGE_PATH/app/public" ]] || {
  echo "Error: Direktori '$LARAVEL_STORAGE_PATH/app/public' tidak ditemukan." >&2
  exit 1
}

docker volume inspect "$DB_VOLUME_NAME" >/dev/null 2>&1 || {
  echo "Error: Docker volume '$DB_VOLUME_NAME' tidak ditemukan." >&2
  exit 1
}

if [[ -n "$TAG_OVERRIDE" ]]; then
  export IMAGE_TAG="$TAG_OVERRIDE"
  echo "Menggunakan IMAGE_TAG=$IMAGE_TAG (catatan: rollback image tidak membatalkan migrasi database)."
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet

if [[ "$FRONTEND_ONLY" == true ]]; then
  echo "[1/2] Mengunduh image frontend..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull frontend
  echo "[2/2] Memperbarui container frontend..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps frontend
elif [[ "$SKIP_MIGRATE" == true ]]; then
  echo "[1/3] Mengunduh image backend, scheduler, dan frontend..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull backend scheduler frontend
  echo "[2/3] Memastikan DB sehat dan memperbarui backend..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --wait db
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps --wait backend
  echo "[3/3] Memperbarui frontend dan scheduler..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps frontend scheduler
else
  echo "[1/5] Mengunduh image terbaru (tanpa menghentikan layanan)..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull backend scheduler frontend
  echo "[2/5] Menghentikan sementara scheduler, frontend, dan backend..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop scheduler frontend backend
  echo "[3/5] Menjalankan migrasi database..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --wait db
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps backend php artisan migrate --force
  echo "[4/5] Menyalakan kembali backend..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps --wait backend
  echo "[5/5] Menyalakan kembali frontend dan scheduler..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps frontend scheduler
fi

echo "=== Status Container ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
echo "=== Log Terbaru (25 baris) ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=25 backend scheduler frontend
