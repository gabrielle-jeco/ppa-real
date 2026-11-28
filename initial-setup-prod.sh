#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env"

INSPECT_ONLY=false
PREPARE_ENV_ONLY=false
SKIP_BACKUP=false
FORCE_ENV=false
PREFIX_OVERRIDE=""

DETECTED_PROJECT=""
DETECTED_DB_MOUNT_TYPE=""
DETECTED_VOLUME=""
DETECTED_DB_SOURCE=""
DETECTED_STORAGE=""
DETECTED_PREFIX=""
DETECTED_TAG="production"

usage() {
  cat <<'EOF'
Penggunaan:
  ./initial-setup-prod.sh                   Auto-isi .env dari container lama, backup DB, pull image GHCR, migrasi, backup:sync, lalu nyalakan stack.
  ./initial-setup-prod.sh --inspect         Tampilkan nilai terdeteksi tanpa mengubah .env atau container (read-only).
  ./initial-setup-prod.sh --prepare-env     Deteksi dan isi otomatis variabel GHCR yang masih kosong/placeholder ke .env, lalu berhenti.
  ./initial-setup-prod.sh --prefix <prefix> Isi GHCR_IMAGE_PREFIX secara eksplisit (berguna jika folder deploy bukan git repo).
  ./initial-setup-prod.sh --force-env       Timpa nilai variabel GHCR di .env walaupun sudah terisi.
  ./initial-setup-prod.sh --skip-backup     Lewati pg_dump otomatis (hanya jika backup terverifikasi sudah dibuat manual).
  ./initial-setup-prod.sh -h | --help       Tampilkan bantuan ini.
EOF
}

require_docker() {
  command -v docker >/dev/null 2>&1 || { echo "Error: docker tidak ditemukan di PATH." >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "Error: docker compose v2+ tidak tersedia." >&2; exit 1; }
}

read_env_var() {
  local key="$1"
  local line value
  [[ -f "$ENV_FILE" ]] || return 0
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

upsert_env_var() {
  local key="$1"
  local value="$2"
  local tmp_file line replaced=false

  umask 077
  tmp_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  chmod 600 "$tmp_file"

  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local clean_line="${line%$'\r'}"
      if [[ "$clean_line" =~ ^[[:space:]]*(export[[:space:]]+)?${key}= ]]; then
        if [[ "$replaced" == false ]]; then
          printf '%s=%s\n' "$key" "$value" >> "$tmp_file"
          replaced=true
        fi
      else
        printf '%s\n' "$clean_line" >> "$tmp_file"
      fi
    done < "$ENV_FILE"
  fi

  if [[ "$replaced" == false ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi

  mv -f "$tmp_file" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

parse_ghcr_prefix_from_url() {
  local remote_url="${1:-}"
  local path=""
  [[ -n "$remote_url" ]] || return 0

  if [[ "$remote_url" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    path="${BASH_REMATCH[1]}"
    path="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"
    printf 'ghcr.io/%s' "$path"
  fi
}

detect_values() {
  DETECTED_PROJECT=""
  DETECTED_DB_MOUNT_TYPE=""
  DETECTED_VOLUME=""
  DETECTED_DB_SOURCE=""
  DETECTED_STORAGE=""
  DETECTED_PREFIX="$PREFIX_OVERRIDE"
  DETECTED_TAG="production"

  if [[ -z "$DETECTED_PREFIX" ]] && command -v git >/dev/null 2>&1; then
    local remote_url=""
    remote_url="$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null || true)"
    DETECTED_PREFIX="$(parse_ghcr_prefix_from_url "$remote_url")"
  fi

  if command -v docker >/dev/null 2>&1; then
    if docker inspect perf-app-db >/dev/null 2>&1; then
      DETECTED_PROJECT="$(docker inspect perf-app-db --format '{{index .Config.Labels "com.docker.compose.project"}}' || true)"
      local db_mount=""
      db_mount="$(docker inspect perf-app-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}}|{{.Name}}|{{.Source}}{{end}}{{end}}' || true)"
      IFS='|' read -r DETECTED_DB_MOUNT_TYPE DETECTED_VOLUME DETECTED_DB_SOURCE <<<"$db_mount"
      if [[ "$DETECTED_DB_MOUNT_TYPE" != "volume" ]]; then
        DETECTED_VOLUME=""
      fi
    fi

    if docker inspect perf-app-backend >/dev/null 2>&1; then
      DETECTED_STORAGE="$(docker inspect perf-app-backend --format '{{range .Mounts}}{{if eq .Destination "/var/www/storage"}}{{.Source}}{{end}}{{end}}' || true)"
      if [[ -z "$DETECTED_STORAGE" ]]; then
        local app_src=""
        app_src="$(docker inspect perf-app-backend --format '{{range .Mounts}}{{if eq .Destination "/var/www"}}{{.Source}}{{end}}{{end}}' || true)"
        if [[ -n "$app_src" ]]; then
          DETECTED_STORAGE="${app_src%/}/storage"
        fi
      fi
    fi
  fi
}

needs_env_value() {
  local key="$1"
  local current
  [[ "$FORCE_ENV" == true ]] && return 0
  current="$(read_env_var "$key")"
  [[ -z "$current" || "$current" == PASTE_EXISTING_* ]]
}

sync_env_file() {
  local keys=(COMPOSE_PROJECT_NAME DB_VOLUME_NAME LARAVEL_STORAGE_PATH GHCR_IMAGE_PREFIX IMAGE_TAG)
  local any_needed=false
  local key

  for key in "${keys[@]}"; do
    if needs_env_value "$key"; then
      any_needed=true
      break
    fi
  done

  if [[ "$any_needed" == false ]]; then
    echo "[0/9] Semua variabel GHCR di $ENV_FILE sudah terisi; tidak ada perubahan pada .env."
    return 0
  fi

  detect_values

  local updates_keys=()
  local updates_vals=()

  if needs_env_value "COMPOSE_PROJECT_NAME"; then
    [[ -n "$DETECTED_PROJECT" ]] || {
      echo "Error: Gagal mendeteksi COMPOSE_PROJECT_NAME dari container perf-app-db. Isi manual di $ENV_FILE." >&2
      exit 1
    }
    updates_keys+=("COMPOSE_PROJECT_NAME")
    updates_vals+=("$DETECTED_PROJECT")
  fi

  if needs_env_value "DB_VOLUME_NAME"; then
    if [[ "$DETECTED_DB_MOUNT_TYPE" != "volume" || -z "$DETECTED_VOLUME" ]]; then
      echo "Error: DB lama tidak memakai Docker named volume (type=${DETECTED_DB_MOUNT_TYPE:-tidak ditemukan}, source=${DETECTED_DB_SOURCE:-none}). Sesuaikan mount DB sebelum melanjutkan." >&2
      exit 1
    fi
    updates_keys+=("DB_VOLUME_NAME")
    updates_vals+=("$DETECTED_VOLUME")
  fi

  if needs_env_value "LARAVEL_STORAGE_PATH"; then
    [[ -n "$DETECTED_STORAGE" ]] || {
      echo "Error: Gagal mendeteksi LARAVEL_STORAGE_PATH dari container perf-app-backend. Isi manual di $ENV_FILE." >&2
      exit 1
    }
    [[ -d "$DETECTED_STORAGE/app/public" ]] || {
      echo "Error: Path storage terdeteksi ('$DETECTED_STORAGE/app/public') tidak ditemukan di host. Jangan membuat folder kosong baru." >&2
      exit 1
    }
    updates_keys+=("LARAVEL_STORAGE_PATH")
    updates_vals+=("$DETECTED_STORAGE")
  fi

  if needs_env_value "GHCR_IMAGE_PREFIX"; then
    [[ -n "$DETECTED_PREFIX" ]] || {
      echo "Error: Gagal mendeteksi GHCR_IMAGE_PREFIX otomatis. Jalankan ulang dengan --prefix ghcr.io/<owner>/<repo> atau isi di $ENV_FILE." >&2
      exit 1
    }
    updates_keys+=("GHCR_IMAGE_PREFIX")
    updates_vals+=("$DETECTED_PREFIX")
  fi

  if needs_env_value "IMAGE_TAG"; then
    updates_keys+=("IMAGE_TAG")
    updates_vals+=("$DETECTED_TAG")
  fi

  local backup_env="${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
  umask 077
  cp "$ENV_FILE" "$backup_env"
  chmod 600 "$backup_env"
  echo "Backup .env tersimpan di: $backup_env"

  local i
  for i in "${!updates_keys[@]}"; do
    upsert_env_var "${updates_keys[$i]}" "${updates_vals[$i]}"
    echo "Diset ke .env: ${updates_keys[$i]}=${updates_vals[$i]}"
  done
}

run_inspect() {
  require_docker
  detect_values
  echo "=== Hasil Inspect Container & Repo (Read-Only) ==="
  echo "COMPOSE_PROJECT_NAME=${DETECTED_PROJECT}"
  if [[ "$DETECTED_DB_MOUNT_TYPE" == "volume" ]]; then
    echo "DB_VOLUME_NAME=${DETECTED_VOLUME}"
  else
    echo "# Peringatan: mount DB bukan named volume (type=${DETECTED_DB_MOUNT_TYPE:-unknown}, source=${DETECTED_DB_SOURCE:-unknown})."
  fi
  echo "LARAVEL_STORAGE_PATH=${DETECTED_STORAGE}"
  echo "GHCR_IMAGE_PREFIX=${DETECTED_PREFIX}"
  echo "IMAGE_TAG=${DETECTED_TAG}"

  if docker inspect perf-app-backend >/dev/null 2>&1; then
    echo "# Mount backend saat ini:"
    docker inspect perf-app-backend --format '{{range .Mounts}}#   {{.Source}} -> {{.Destination}}{{println}}{{end}}' || true
  fi
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --inspect)
        INSPECT_ONLY=true
        shift
        ;;
      --prepare-env)
        PREPARE_ENV_ONLY=true
        shift
        ;;
      --skip-backup)
        SKIP_BACKUP=true
        shift
        ;;
      --force-env)
        FORCE_ENV=true
        shift
        ;;
      --prefix)
        [[ $# -ge 2 && -n "$2" ]] || { echo "Error: --prefix membutuhkan nilai (contoh: --prefix ghcr.io/owner/repo)." >&2; exit 1; }
        PREFIX_OVERRIDE="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
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

  if [[ "$INSPECT_ONLY" == true ]]; then
    run_inspect
    exit 0
  fi

  require_docker
  cd "$SCRIPT_DIR"

  [[ -f "$COMPOSE_FILE" ]] || { echo "Error: $COMPOSE_FILE tidak ditemukan." >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Error: $ENV_FILE tidak ditemukan. Siapkan .env production lama terlebih dahulu." >&2; exit 1; }

  sync_env_file

  if [[ "$PREPARE_ENV_ONLY" == true ]]; then
    echo "Selesai menyiapkan .env (--prepare-env). Tidak ada container yang diubah."
    exit 0
  fi

  local required_keys=(
    APP_KEY
    DB_DATABASE
    DB_USERNAME
    DB_PASSWORD
    GHCR_IMAGE_PREFIX
    COMPOSE_PROJECT_NAME
    DB_VOLUME_NAME
    LARAVEL_STORAGE_PATH
  )

  local key val
  for key in "${required_keys[@]}"; do
    val="$(read_env_var "$key")"
    if [[ -z "$val" ]]; then
      echo "Error: Variabel wajib $key kosong atau belum diset di $ENV_FILE." >&2
      exit 1
    fi
    if [[ "$val" == PASTE_EXISTING_* ]]; then
      echo "Error: Variabel $key masih berisi placeholder ($val)." >&2
      exit 1
    fi
  done

  local db_database db_username db_password db_volume_name storage_path
  db_database="$(read_env_var DB_DATABASE)"
  db_username="$(read_env_var DB_USERNAME)"
  db_password="$(read_env_var DB_PASSWORD)"
  db_volume_name="$(read_env_var DB_VOLUME_NAME)"
  storage_path="$(read_env_var LARAVEL_STORAGE_PATH)"

  echo "[1/9] Memeriksa volume PostgreSQL ($db_volume_name)..."
  docker volume inspect "$db_volume_name" >/dev/null 2>&1 || {
    echo "Error: Docker volume '$db_volume_name' tidak ditemukan. Pastikan nama volume persis hasil --inspect." >&2
    exit 1
  }

  echo "[2/9] Memeriksa direktori Laravel storage ($storage_path)..."
  [[ -d "$storage_path" ]] || {
    echo "Error: LARAVEL_STORAGE_PATH '$storage_path' tidak ada. Jangan buat folder kosong baru." >&2
    exit 1
  }
  [[ -d "$storage_path/app/public" ]] || {
    echo "Error: Direktori '$storage_path/app/public' tidak ditemukan." >&2
    exit 1
  }

  echo "[3/9] Memvalidasi konfigurasi Compose production..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet

  echo "[4/9] Mengunduh image GHCR sebelum menghentikan layanan..."
  if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull backend scheduler frontend; then
    echo "Error: Gagal pull image GHCR. Pastikan sudah menjalankan: docker login ghcr.io -u <github-username> dengan PAT scope read:packages." >&2
    exit 1
  fi

  if [[ "$SKIP_BACKUP" == false ]]; then
    echo "[5/9] Membuat backup PostgreSQL sebelum cutover..."
    if ! docker inspect -f '{{.State.Running}}' perf-app-db 2>/dev/null | grep -qx 'true'; then
      echo "Error: Container perf-app-db tidak sedang berjalan sehingga backup otomatis tidak bisa dijalankan." >&2
      echo "Buat backup PostgreSQL secara manual terlebih dahulu, lalu jalankan ulang dengan --skip-backup." >&2
      exit 1
    fi

    local backup_dir="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
    local backup_file="$backup_dir/db-before-ghcr-cutover-$(date +%Y%m%d-%H%M%S).sql.gz"
    umask 077
    mkdir -p "$backup_dir"

    if ! docker exec -e PGPASSWORD="$db_password" perf-app-db pg_dump -U "$db_username" "$db_database" | gzip > "$backup_file"; then
      rm -f "$backup_file"
      echo "Error: Backup pg_dump gagal. Cutover dibatalkan." >&2
      exit 1
    fi
    if [[ ! -s "$backup_file" ]]; then
      rm -f "$backup_file"
      echo "Error: File backup kosong ($backup_file). Cutover dibatalkan." >&2
      exit 1
    fi
    echo "Backup tersimpan di: $backup_file"
  else
    echo "[5/9] Melewati backup otomatis (--skip-backup)."
  fi

  echo "[6/9] Menghentikan service aplikasi sebelum migrasi..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop scheduler frontend backend >/dev/null 2>&1 || true
  docker stop perf-app-scheduler perf-app-frontend perf-app-backend >/dev/null 2>&1 || true

  echo "[7/9] Menyalakan DB dan menjalankan php artisan migrate --force..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --wait db
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps backend php artisan migrate --force

  echo "[8/9] Menyalakan backend, menjalankan backup:sync, lalu menyalakan frontend & scheduler..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps --wait backend
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend php artisan backup:sync
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps frontend scheduler

  echo "[9/9] Status akhir container:"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

  cat <<'EOF'

Initial setup production selesai.
Silakan verifikasi login, laporan, upload/download evidence lama dan baru, serta log scheduler:
  docker compose -f docker-compose.prod.yml logs --tail=50 backend scheduler frontend
EOF
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
