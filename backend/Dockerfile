# Production image for the backend API. Build with:
#   docker build -t qitaati-backend .
# Run against a real (managed) Postgres:
#   docker run -p 3000:3000 --env-file .env qitaati-backend
#
# The container is self-sufficient: docker-entrypoint.sh applies
# migrations and loads the catalog before starting, so a fresh host needs
# nothing but a DATABASE_URL. See DEPLOY.md.
#
# Host-agnostic — it runs unchanged anywhere that can run a container and
# hand it a DATABASE_URL (a VPS, Render, Railway, Fly.io, ECS, ...).

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build
# The seed is compiled separately because tsconfig.build.json excludes
# prisma/ on purpose (including it there widens the inferred rootDir and
# moves dist/main.js). The entrypoint runs the compiled output, so the
# runtime image needs neither ts-node nor typescript.
RUN npx tsc prisma/seed.ts \
      --outDir dist-seed \
      --module commonjs \
      --target es2022 \
      --moduleResolution node \
      --esModuleInterop \
      --skipLibCheck

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# `prisma` (the CLI) is a runtime dependency here, not just a dev one:
# the entrypoint runs `prisma migrate deploy` on every boot.
RUN npm ci --omit=dev && npm cache clean --force

# The generated Prisma client + query engine binary — copied rather than
# regenerated, since generating needs the schema and a full CLI run. Both
# stages share node:20-alpine so the query engine binary target matches.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
# migrate deploy reads the schema and the migrations folder at runtime.
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
