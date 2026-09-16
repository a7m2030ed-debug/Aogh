# =====================================================================
#  صورة نظام إدارة الموظفين
#  بلا اعتماديات: لا npm install ولا مرحلة بناء.
#  البناء من جذر مجلد staff:
#      docker build -f server/deploy/Dockerfile -t staff-hr .
# =====================================================================

FROM node:22-alpine

# tini ليصل SIGTERM إلى العملية فتُغلق القاعدة بنظافة
RUN apk add --no-cache tini wget

WORKDIR /app

# الواجهة ثم الخادم
COPY index.html README.md ./
COPY assets ./assets
COPY server ./server

# البيانات والنسخ في حجمين منفصلين حتى لا تضيع مع كل تحديث،
# ولا تُحفظ النسخة الاحتياطية في نفس حجم القاعدة
RUN mkdir -p /data /backups \
 && addgroup -S staff && adduser -S -G staff staff \
 && chown -R staff:staff /app /data /backups

USER staff

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    BACKUP_DIR=/backups \
    TRUST_PROXY=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/server.js"]
