#!/usr/bin/env bash
# =====================================================================
#  نشر متجر نسيج على خادم أوبونتو أو دبيان جديد
#  ---------------------------------------------------------------------
#  يفعل كل شيء: Node، مستخدم النظام، خدمة تعمل وتعود بعد إعادة التشغيل،
#  Nginx، شهادة https مجانية تتجدّد تلقائيًا، جدار ناري، ونسخة احتياطية
#  يومية.
#
#  التشغيل على الخادم بصلاحية root:
#      bash setup.sh naseej.example.com you@example.com
#
#  آمن للتكرار: تشغيله مرة أخرى يحدّث ولا يكسر شيئًا.
# =====================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_USER="naseej"
APP_DIR="/srv/naseej"
NGINX_USER="www-data"
NODE_MAJOR="22"

c_ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
c_info() { printf '\033[0;34m•\033[0m %s\n' "$1"; }
c_warn() { printf '\033[0;33m!\033[0m %s\n' "$1"; }
c_err()  { printf '\033[0;31m✗\033[0m %s\n' "$1" >&2; }

die() { c_err "$1"; exit 1; }

# ------------------------------------------------------------ فحوص أولية

[[ $EUID -eq 0 ]] || die "شغّله بصلاحية root:  sudo bash setup.sh نطاقك بريدك"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  cat <<'USAGE'
الاستعمال:
    sudo bash setup.sh <النطاق> <البريد>

مثال:
    sudo bash setup.sh naseej.example.com owner@example.com

النطاق يجب أن يكون مُوجَّهًا إلى عنوان هذا الخادم (سجل A) قبل التشغيل،
وإلا فشل إصدار الشهادة. البريد يستعمله Let's Encrypt لتنبيهك قبل انتهاء
الشهادة.
USAGE
  exit 1
fi

[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "صيغة النطاق غير صحيحة: $DOMAIN"
[[ "$EMAIL"  =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "صيغة البريد غير صحيحة: $EMAIL"

command -v apt-get >/dev/null || die "هذا السكربت لأوبونتو أو دبيان. لتوزيعة أخرى راجع deploy/README.md"

# مصدر ملفات التطبيق: مجلد server الذي يحوي هذا السكربت
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$SRC_DIR/server.js" ]] || die "لم أجد server.js بجوار السكربت. انسخ مجلد fabric كاملًا إلى الخادم."

echo
echo "  نشر متجر نسيج"
echo "  النطاق: $DOMAIN"
echo "  المصدر: $SRC_DIR"
echo

# ------------------------------------------------- التحقق من توجيه النطاق

c_info "أتحقق من أن النطاق يشير إلى هذا الخادم…"
SERVER_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || echo "")"
DOMAIN_IP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || echo "")"

if [[ -z "$DOMAIN_IP" ]]; then
  c_warn "النطاق $DOMAIN لا يُترجم إلى أي عنوان بعد."
  c_warn "أضف سجل A يشير إلى ${SERVER_IP:-عنوان هذا الخادم} ثم أعد التشغيل."
  read -rp "أكمل بلا شهادة https الآن؟ [y/N] " go
  [[ "${go,,}" == "y" ]] || exit 1
  SKIP_TLS=1
elif [[ -n "$SERVER_IP" && "$DOMAIN_IP" != "$SERVER_IP" ]]; then
  c_warn "النطاق يشير إلى $DOMAIN_IP بينما هذا الخادم $SERVER_IP."
  c_warn "إن كنت خلف Cloudflare فهذا طبيعي. غير ذلك، صحّح سجل A أولًا."
  read -rp "أكمل؟ [y/N] " go
  [[ "${go,,}" == "y" ]] || exit 1
  SKIP_TLS="${SKIP_TLS:-0}"
else
  c_ok "النطاق يشير إلى هذا الخادم ($SERVER_IP)"
  SKIP_TLS=0
fi

# ------------------------------------------------------------ الحزم

c_info "أحدّث الحزم…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg ufw nginx rsync >/dev/null

# ------------------------------------------------------------ Node

if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]]; then
  c_info "أثبّت Node $NODE_MAJOR…"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
c_ok "Node $(node -v)"

# ------------------------------------------------------- مستخدم النظام

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
  c_ok "أُنشئ المستخدم $APP_USER"
fi
mkdir -p "$APP_DIR"

# --------------------------------------------------------- نسخ التطبيق

c_info "أنسخ ملفات المتجر…"
# البيانات و.env لا تُمَس عند إعادة التشغيل
rsync -a --delete \
  --exclude 'data/' --exclude '.env' --exclude 'node_modules/' \
  "$SRC_DIR/" "$APP_DIR/server/"
# ملفات الواجهة (المجلد الأب لمجلد الخادم)
rsync -a --delete \
  --exclude 'server/' \
  "$SRC_DIR/../" "$APP_DIR/" 2>/dev/null || true

mkdir -p "$APP_DIR/server/data/uploads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Nginx يخدم ملفات الواجهة وصور المنتجات مباشرة دون المرور على Node، فيلزمه
# المرور إلى مجلديهما لا أكثر. المرور (x) بلا قراءة (r): يفتح ما يعرف مساره
# ولا يسرد المجلد، فتبقى بيانات الطلبات و.env خارج متناوله.
chmod 751 "$APP_DIR" "$APP_DIR/server"
chown "$APP_USER:$NGINX_USER" "$APP_DIR/server/data"
chmod 710 "$APP_DIR/server/data"
# مجلد الصور وحده يُقرأ ويُسرد. setgid ليرث كل ما يُرفع لاحقًا المجموعة نفسها.
chown "$APP_USER:$NGINX_USER" "$APP_DIR/server/data/uploads"
chmod 2750 "$APP_DIR/server/data/uploads"
# ملفات البيانات: للمالك وحده. يشمل تثبيتًا قائمًا كُتبت ملفاته قبل ضبط UMask.
find "$APP_DIR/server/data" -maxdepth 1 -type f -exec chmod 640 {} + 2>/dev/null || true
c_ok "الملفات في $APP_DIR"

# --------------------------------------------------------------- .env

ENV_FILE="$APP_DIR/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
PUBLIC_URL=https://$DOMAIN
TRUST_PROXY=1
DATA_DIR=data

# ----------------------------------------------------------------- الدفع
# ما دامت demo فلن يُحصَّل أي مبلغ، والخادم سيرفض العمل في وضع الإنتاج.
# ضع هنا بوابتك ومفاتيحها ثم:  systemctl restart naseej
PAYMENT_PROVIDER=demo
# PAYTABS_PROFILE_ID=
# PAYTABS_SERVER_KEY=
# MYFATOORAH_TOKEN=
# MYFATOORAH_WEBHOOK_SECRET=
# TAP_SECRET_KEY=

# ----------------------------------------------------------------- الشحن
SHIPPING_PROVIDER=manual
ENVEOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  c_ok "أُنشئ .env (صلاحياته 600، لا يقرؤه غير $APP_USER)"
else
  c_info ".env موجود — لم يُمَس"
fi

# ------------------------------------------------------------- systemd

cat > /etc/systemd/system/naseej.service <<SVCEOF
[Unit]
Description=Naseej fabric store
Documentation=file://$APP_DIR/server/README.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=naseej

# ما يكتبه الخادم للمالك ومجموعته فقط: بيانات الطلبات لا تُقرأ من مستخدم آخر،
# وصور المنتجات ترث مجموعة Nginx من setgid فيقرؤها ويخدمها مباشرة.
UMask=0027

# تضييق الصلاحيات: لا يكتب إلا في مجلد بياناته
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/server/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable --now naseej >/dev/null 2>&1 || systemctl restart naseej

sleep 2
if systemctl is-active --quiet naseej; then
  c_ok "الخدمة تعمل وستعود تلقائيًا بعد أي إعادة تشغيل"
else
  c_err "الخدمة لم تعمل. السجل:"
  journalctl -u naseej -n 30 --no-pager
  exit 1
fi

# --------------------------------------------------------------- Nginx

# مناطق التخزين والكبح تُعرَّف على مستوى http لا داخل server
mkdir -p /var/cache/nginx
cat > /etc/nginx/conf.d/naseej-zones.conf <<'ZONEEOF'
# تخزين مؤقت لردّ الكتالوج: يُبنى مرة كل دقيقة مهما بلغ عدد الزوار
proxy_cache_path /var/cache/nginx/naseej levels=1:2 keys_zone=naseej:16m
                 max_size=256m inactive=10m use_temp_path=off;

# كبح معدّل الطلبات على الواجهة البرمجية: يحمي من الروبوتات وموجات الضغط
limit_req_zone $binary_remote_addr zone=naseej_api:16m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=naseej_conn:16m;
ZONEEOF

cat > /etc/nginx/sites-available/naseej <<NGXEOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 15M;
    limit_conn naseej_conn 40;

    # الضغط لما يخدمه Nginx مباشرة (الخادم يضغط ردوده بنفسه)
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript
               text/javascript image/svg+xml application/manifest+json;

    # صور المنتجات: اسمها من تجزئة محتواها، فلا تتغيّر أبدًا تحت نفس الاسم
    location /uploads/ {
        alias $APP_DIR/server/data/uploads/;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options nosniff;
    }

    # ملفات الواجهة: يخدمها Nginx مباشرة فلا تمرّ على Node
    location /assets/ {
        alias $APP_DIR/assets/;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        add_header X-Content-Type-Options nosniff;
    }

    # الكتالوج: يُخزَّن دقيقة، ويُبنى مرة واحدة حتى لو طلبه ألف زائر معًا
    location = /api/catalog {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Accept-Encoding \$http_accept_encoding;

        proxy_cache naseej;
        proxy_cache_valid 200 60s;
        proxy_cache_key "\$scheme\$request_uri\$http_accept_encoding";
        proxy_cache_lock on;
        proxy_cache_lock_timeout 5s;
        proxy_cache_use_stale updating error timeout http_500 http_502 http_503;
        proxy_cache_background_update on;
        add_header X-Cache \$upstream_cache_status;
    }

    # بقية الواجهة البرمجية: بلا تخزين، مع كبح المعدّل
    location /api/ {
        limit_req zone=naseej_api burst=40 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
NGXEOF

ln -sf /etc/nginx/sites-available/naseej /etc/nginx/sites-enabled/naseej
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || die "إعداد Nginx غير صالح"
systemctl reload nginx
c_ok "Nginx يمرّر النطاق إلى الخادم"

# ---------------------------------------------------------- جدار ناري

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true
c_ok "الجدار الناري يسمح بـ SSH والويب فقط (المنفذ 3000 مغلق من الخارج)"

# --------------------------------------------------------------- TLS

if [[ "${SKIP_TLS:-0}" == "0" ]]; then
  c_info "أصدر شهادة https…"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect >/dev/null 2>&1; then
    c_ok "الشهادة صدرت، وتتجدّد تلقائيًا"
  else
    c_warn "تعذّر إصدار الشهادة. تحقّق من سجل A ثم:  certbot --nginx -d $DOMAIN"
  fi
else
  c_warn "تُخطّيت الشهادة. بعد ضبط النطاق:  certbot --nginx -d $DOMAIN"
fi

# ------------------------------------------------------ نسخة احتياطية

install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/backups"
cat > /usr/local/bin/naseej-backup <<'BKEOF'
#!/usr/bin/env bash
# نسخة احتياطية يومية من بيانات المتجر، ويُحتفظ بآخر ثلاثين
set -euo pipefail
DIR=/srv/naseej
OUT="$DIR/backups/naseej-$(date +%F-%H%M).tar.gz"
tar czf "$OUT" -C "$DIR/server" data
find "$DIR/backups" -name 'naseej-*.tar.gz' -mtime +30 -delete
echo "$(date -Is) نسخة: $OUT"
BKEOF
chmod +x /usr/local/bin/naseej-backup

cat > /etc/cron.d/naseej-backup <<CRONEOF
# نسخة احتياطية كل يوم الثالثة فجرًا
0 3 * * * $APP_USER /usr/local/bin/naseej-backup >> $APP_DIR/backups/backup.log 2>&1
CRONEOF
sudo -u "$APP_USER" /usr/local/bin/naseej-backup >/dev/null 2>&1 || true
c_ok "نسخة احتياطية يومية في $APP_DIR/backups"

# --------------------------------------------------------------- خلاصة

SCHEME="https"; [[ "${SKIP_TLS:-0}" == "0" ]] || SCHEME="http"

echo
echo "──────────────────────────────────────────────────────────"
c_ok "اكتمل النشر"
echo
echo "  المتجر:  $SCHEME://$DOMAIN"
echo "  اللوحة:  $SCHEME://$DOMAIN/admin.html"
echo
echo "  كلمة مرور المدير طُبعت مرة واحدة في سجل الخدمة:"
echo "      journalctl -u naseej | grep -A3 'كلمة المرور'"
echo
echo "  أوامر تحتاجها:"
echo "      systemctl restart naseej     إعادة التشغيل بعد تعديل .env"
echo "      systemctl status naseej      حالة الخدمة"
echo "      journalctl -u naseej -f      متابعة السجل"
echo "      naseej-backup                نسخة احتياطية الآن"
echo
c_warn "قبل أول بيع حقيقي:"
echo "      1. ضع مفاتيح بوابة الدفع في $ENV_FILE ثم أعد التشغيل."
echo "      2. غيّر كلمة مرور المدير من اللوحة."
echo "      3. الضريبة مطفأة افتراضيًا. لا تفعّلها إلا بتسجيل ضريبي ساري."
echo "──────────────────────────────────────────────────────────"
