#!/data/data/com.termux/files/usr/bin/bash
#
# Contoh skrip Termux:Boot.
# Salin ke:  ~/.termux/boot/khutbah.sh  lalu chmod +x.
# Sesuaikan REPO_DIR dengan lokasi clone Anda (default ~/khutbah-bot).
#
set -euo pipefail

REPO_DIR="${HOME}/khutbah-bot"

termux-wake-lock || true

if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  mkdir -p tmp
  exec npm start >> "$REPO_DIR/tmp/bot.log" 2>&1
else
  echo "[BOOT] Repo tidak ditemukan di $REPO_DIR" >> "$HOME/khutbah-boot-error.log"
fi
