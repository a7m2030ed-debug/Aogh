# =====================================================================
#  صورة متجر نسيج
#  بلا اعتماديات، فلا npm install ولا مرحلة بناء.
#  البناء من جذر مجلد fabric:
#      docker build -f server/deploy/Dockerfile -t naseej .
# =====================================================================

FROM node:22-alpine

# tini يجعل إشارات الإيقاف تصل للعملية فتُغلق بنظافة
RUN apk add --no-cache tini wget

WORKDIR /app

# ملفات الواجهة ثم الخادم
COPY index.html admin.html README.md ./
COPY assets ./assets
COPY server ./server

# البيانات في حجم منفصل حتى لا تضيع مع كل نشر
RUN mkdir -p /data \
 && addgroup -S naseej && adduser -S -G naseej naseej \
 && chown -R naseej:naseej /app /data

USER naseej

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/catalog >/dev/null || exit 1

WORKDIR /app/server
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
