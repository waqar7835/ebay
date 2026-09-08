FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @ebay-order-management/shared build
RUN pnpm --filter @ebay-order-management/backend build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/backend/dist apps/backend/dist
COPY apps/backend/database apps/backend/database
COPY apps/backend/.sequelizerc apps/backend/.sequelizerc

WORKDIR /repo/apps/backend
EXPOSE 4000
CMD ["node", "dist/main.js"]
