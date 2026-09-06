# ---- build: web bundle + api ----
FROM node:22-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps ./apps
RUN pnpm -r build

# ---- runtime: api only, with the web bundle as static files ----
FROM node:22-alpine
RUN npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter api && npm uninstall -g pnpm
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/api/public
WORKDIR /app/apps/api
RUN mkdir -p data && chown -R node:node /app/apps/api
USER node
ENV NODE_ENV=production PORT=3001 WEB_DIR=public
EXPOSE 3001
VOLUME ["/app/apps/api/data"]
CMD ["node", "--no-warnings=ExperimentalWarning", "dist/server.js"]
