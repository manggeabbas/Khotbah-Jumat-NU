#!/data/data/com.termux/files/usr/bin/bash
#
# Setup awal Bot Khutbah Jumat di Termux. Idempoten & aman.
# Jalankan dari root repo:  bash scripts/setup-termux.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[SETUP] Memperbarui paket Termux..."
pkg update -y
pkg upgrade -y

echo "[SETUP] Memasang Node.js dan Git..."
pkg install -y nodejs git

echo "[SETUP] Versi Node: $(node --version)"

cd "$REPO_DIR"

if [ -f package-lock.json ]; then
  echo "[SETUP] npm ci --omit=dev"
  npm ci --omit=dev
else
  echo "[SETUP] npm install"
  npm install --omit=dev
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[SETUP] .env dibuat dari .env.example — ISI NILAINYA sebelum menjalankan bot."
else
  echo "[SETUP] .env sudah ada — tidak ditimpa."
fi

mkdir -p tmp data

echo "[SETUP] Menyiapkan database SQLite (idempoten)..."
node src/database/init.js >/dev/null && echo "[SETUP] data/khutbah.db siap."

echo "[SETUP] Selesai."
echo "Langkah berikutnya:"
echo "  1. nano $REPO_DIR/.env   (isi TELEGRAM_BOT_TOKEN dan TELEGRAM_USER_ID)"
echo "  2. npm run db:verify     (cek tabel + constraint + CRUD)"
echo "  3. npm start"
