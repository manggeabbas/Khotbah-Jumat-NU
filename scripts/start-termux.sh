#!/data/data/com.termux/files/usr/bin/bash
#
# Menjalankan bot di Termux dengan wake-lock agar tidak tidur.
# Jalankan dari root repo:  bash scripts/start-termux.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

mkdir -p tmp

# Cegah perangkat tidur selama bot berjalan (bila tersedia).
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
  echo "[START] termux-wake-lock aktif."
else
  echo "[START] termux-wake-lock tidak tersedia (abaikan bila bukan Termux)."
fi

if [ ! -f .env ]; then
  echo "[START] .env belum ada. Jalankan: cp .env.example .env lalu isi."
  exit 1
fi

exec npm start
