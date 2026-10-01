# doona-tools — 빌드 컨텍스트는 저장소 루트 (docker compose 가 지정)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/tools/package.json apps/tools/
RUN npm ci -w @doona/tools --include-workspace-root=false
COPY tsconfig.base.json ./
COPY apps/tools apps/tools
RUN npm run build -w @doona/tools

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/tools/package.json apps/tools/
RUN npm ci --omit=dev -w @doona/tools --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/tools/dist apps/tools/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/tools/dist/index.js"]
