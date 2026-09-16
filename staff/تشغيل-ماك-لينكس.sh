#!/usr/bin/env bash
# =====================================================================
#  تشغيل النظام على ماك أو لينكس — بلا نطاق ولا استضافة
#  ---------------------------------------------------------------------
#      bash تشغيل-ماك-لينكس.sh
#  يفتح النظام في المتصفح، ويبقى يعمل ما دامت هذه النافذة مفتوحة.
#  لإيقافه: Ctrl+C
# =====================================================================

set -u
cd "$(dirname "$0")/server"
PORT="${PORT:-3000}"

echo
echo "  نظام إدارة الموظفين"
echo "  ----------------------------------------------------------"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [x] لم يُعثر على Node.js على هذا الجهاز."
  echo
  echo "      نزّله مرة واحدة من https://nodejs.org (نسخة LTS)"
  echo "      أو على ماك:  brew install node"
  echo
  exit 1
fi

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "  [x] نسخة Node.js قديمة ولا تحمل قاعدة البيانات المدمجة."
  echo "      حدّثها إلى 22 أو أحدث من https://nodejs.org ثم أعد التشغيل."
  echo
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "  أول تشغيل: يُنشأ ملف الإعدادات…"
  cat > .env <<EOF
NODE_ENV=production
LAN=1
PORT=${PORT}
HOST=0.0.0.0
DATA_DIR=data
BACKUP_DIR=backups
BACKUP_HOUR=2
BACKUP_RETENTION_DAYS=60
SESSION_IDLE_MINUTES=60
ADMIN_USERNAME=admin
EOF
  chmod 600 .env
  echo "  تمّ. كلمة مرور أول دخول ستظهر بعد قليل — احفظها."
  echo
fi

# فتح المتصفح بعد أن يُقلع الخادم
(
  sleep 4
  if command -v open >/dev/null 2>&1; then open "http://localhost:${PORT}"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:${PORT}" >/dev/null 2>&1
  fi
) &

exec node server.js
