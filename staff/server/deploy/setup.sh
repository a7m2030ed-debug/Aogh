#!/usr/bin/env bash
# =====================================================================
#  نشر نظام إدارة الموظفين على خادم أوبونتو/دبيان جديد
#  ---------------------------------------------------------------------
#  يفعل كل شيء: Node، مستخدم نظام بلا صلاحيات زائدة، خدمة تعمل وتعود
#  بعد إعادة التشغيل، Nginx، شهادة https مجانية تتجدّد تلقائيًا، جدار
#  ناري، ونسخة احتياطية يومية إلى مجلد منفصل.
#
#  التشغيل على الخادم بصلاحية root من داخل مجلد staff:
#      sudo bash server/deploy/setup.sh staff.example.com you@example.com
#
#  آمن للتكرار: تشغيله مرة أخرى يحدّث ولا يكسر شيئًا ولا يمسّ البيانات.
# =====================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_USER="staffhr"
APP_DIR="/srv/staff"
DATA_DIR="/var/lib/staff"
BACKUP_DIR="/var/backups/staff"
NODE_MAJOR="22"

c_ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
c_info() { printf '\033[0;34m•\033[0m %s\n' "$1"; }
c_warn() { printf '\033[0;33m!\033[0m %s\n' "$1"; }
die()    { printf '\033[0;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "شغّله بصلاحية root:  sudo bash server/deploy/setup.sh <النطاق> <البريد>"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  cat <<'USAGE'
الاستعمال:
    sudo bash server/deploy/setup.sh <النطاق> <البريد>

مثال:
    sudo bash server/deploy/setup.sh staff.example.com hr@example.com

قبل التشغيل: وجّه سجل A للنطاق إلى عنوان هذا الخادم.
USAGE
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ -f "$SRC_DIR/server/server.js" ]] || die "لم أجد server/server.js — شغّل السكربت من داخل مجلد staff"

# ------------------------------------------------------------ الحزم

c_info "تحديث الحزم…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx certbot python3-certbot-nginx ufw rsync >/dev/null
c_ok "الحزم الأساسية"

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]]; then
  c_info "تثبيت Node ${NODE_MAJOR}…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -e 'require("node:sqlite")' 2>/dev/null || die "نسخة Node لا تحمل node:sqlite — يلزم Node 22.5 فأحدث"
c_ok "Node $(node -v)"

# --------------------------------------------------------- المستخدم والملفات

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
rsync -a --delete \
  --exclude 'server/data' --exclude 'server/backups' --exclude 'server/.env' --exclude '.git' \
  "$SRC_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
chmod 750 "$DATA_DIR" "$BACKUP_DIR"
c_ok "الملفات في $APP_DIR"

# ------------------------------------------------------------- الإعداد

ENV_FILE="$APP_DIR/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
PUBLIC_URL=https://${DOMAIN}
DATA_DIR=${DATA_DIR}
BACKUP_DIR=${BACKUP_DIR}
BACKUP_HOUR=2
BACKUP_RETENTION_DAYS=30
SESSION_IDLE_MINUTES=30
SESSION_MAX_HOURS=12
TRUST_PROXY=1
MAX_UPLOAD_MB=10
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  c_ok "أُنشئ server/.env"
else
  c_info "server/.env موجود — تُرك كما هو"
fi

# -------------------------------------------------------------- الخدمة

cat > /etc/systemd/system/staff.service <<EOF
[Unit]
Description=نظام إدارة الموظفين
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

# تضييق صلاحيات الخدمة: لا تكتب إلا في مجلدَي البيانات والنسخ
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${BACKUP_DIR}
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryMax=1G

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now staff >/dev/null
sleep 2
systemctl is-active --quiet staff || { journalctl -u staff -n 30 --no-pager; die "لم تُقلع الخدمة"; }
c_ok "الخدمة تعمل (systemctl status staff)"

# --------------------------------------------------------------- Nginx

cat > /etc/nginx/sites-available/staff <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 12m;
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/staff /etc/nginx/sites-enabled/staff
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || die "إعداد Nginx غير صالح"
systemctl reload nginx
c_ok "Nginx يوجّه ${DOMAIN} إلى الخدمة"

# ----------------------------------------------------------- الشهادة

if certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
  c_info "شهادة ${DOMAIN} موجودة"
else
  c_info "طلب شهادة https…"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect >/dev/null \
    && c_ok "https مفعَّل ويتجدّد تلقائيًا" \
    || c_warn "تعذّر إصدار الشهادة — تأكد أن سجل A يشير إلى هذا الخادم ثم: certbot --nginx -d ${DOMAIN}"
fi

# ------------------------------------------------------- الجدار الناري

if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  c_ok "الجدار الناري: 22 و80 و443 فقط"
fi

# --------------------------------------------- نسخة احتياطية يومية إضافية

cat > /etc/cron.daily/staff-backup <<EOF
#!/bin/sh
# نسخة احتياطية من قاعدة الموظفين. الخادم ينسخ يوميًا أيضًا، وهذه شبكة أمان
# ثانية تعمل حتى لو كانت الخدمة متوقفة.
cd ${APP_DIR}/server && /usr/bin/node tools/backup-now.js >> /var/log/staff-backup.log 2>&1
EOF
chmod +x /etc/cron.daily/staff-backup
c_ok "نسخة احتياطية يومية في ${BACKUP_DIR}"

echo
c_ok "تمّ. افتح: https://${DOMAIN}"
echo
c_info "كلمة مرور أول دخول طُبعت في سجل الخدمة:"
echo "      journalctl -u staff | grep -A3 'الحساب الأول'"
echo
c_warn "انسخ ${BACKUP_DIR} إلى خارج الخادم دوريًا — نسخة على نفس الجهاز لا تنجو من عطبه."
c_info "فحص ما بعد النشر:   cd ${APP_DIR}/server && node deploy/preflight.js https://${DOMAIN}"
