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
COPY apps/charge/package.json apps/charge/package.json

FROM manifests AS deps
RUN pnpm install --frozen-lockfile --filter @mezzo/charge...

FROM manifests AS prod-deps
RUN pnpm install --prod --frozen-lockfile --filter @mezzo/charge...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAX_UPLOAD_MB
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY apps/charge apps/charge
RUN pnpm --filter @mezzo/charge build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages/shared-types/node_modules packages/shared-types/node_modules
COPY --from=prod-deps /app/apps/charge/node_modules apps/charge/node_modules
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY apps/charge/package.json apps/charge/next.config.mjs apps/charge/
COPY apps/charge/public apps/charge/public
COPY --from=build /app/apps/charge/.next apps/charge/.next
WORKDIR /app/apps/charge
USER node
EXPOSE 3002
CMD ["node_modules/.bin/next", "start", "--port", "3002", "--hostname", "0.0.0.0"]
