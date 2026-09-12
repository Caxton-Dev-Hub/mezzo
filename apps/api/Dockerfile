FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN node -e "const p = require('./package.json'); delete p.scripts.prepare; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2));"
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json

FROM manifests AS deps
RUN pnpm install --frozen-lockfile --filter @mezzo/api...

FROM manifests AS prod-deps
RUN pnpm install --prod --frozen-lockfile --filter @mezzo/api...

FROM deps AS build
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm --filter @mezzo/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages/shared-types/node_modules packages/shared-types/node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
WORKDIR /app/apps/api
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
