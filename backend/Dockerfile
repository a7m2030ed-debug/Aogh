# Production image for the backend API. Build with:
#   docker build -t qitaati-backend .
# Run against a real (managed) Postgres:
#   docker run -p 3000:3000 --env-file .env qitaati-backend
# See README.md "Deploying" for the full checklist (migrations, seed,
# every env var). This image is host-agnostic — it runs unchanged on any
# platform that can run a container and give it a DATABASE_URL (a VPS,
# Railway, Render, Fly.io, ECS, ...); picking that host is still a client
# decision, not something baked in here.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# The generated Prisma client + query engine binary — copied rather than
# regenerated here, since the CLI that generates it (`prisma`) is a
# devDependency this stage deliberately doesn't install. Both stages
# share node:20-alpine so the query engine binary target matches.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
