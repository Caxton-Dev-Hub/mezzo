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
COPY apps/web/package.json apps/web/package.json

FROM manifests AS deps
RUN pnpm install --frozen-lockfile --filter @mezzo/web...

FROM manifests AS prod-deps
RUN pnpm install --prod --frozen-lockfile --filter @mezzo/web...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAX_UPLOAD_MB
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_STELLAR_MODE
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @mezzo/web build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages/shared-types/node_modules packages/shared-types/node_modules
COPY --from=prod-deps /app/apps/web/node_modules apps/web/node_modules
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY apps/web/package.json apps/web/next.config.mjs apps/web/
COPY apps/web/public apps/web/public
COPY --from=build /app/apps/web/.next apps/web/.next
WORKDIR /app/apps/web
USER node
EXPOSE 3001
CMD ["node_modules/.bin/next", "start", "--port", "3001", "--hostname", "0.0.0.0"]
