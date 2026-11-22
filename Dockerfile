# Three stages (design §13). `build` keeps every dependency and the compiled
# output; the benchmark service targets it, since it still has the
# development tools. `deps` installs the production dependencies only.
# `runtime` takes the two and nothing else.

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# nest-cli.json's assets copy the hand-written SQL into dist/database/migrations.
RUN npm run build

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Both flags: typescript is an optional peer of @nestjs/swagger, so --omit=dev alone keeps it.
RUN npm ci --omit=dev --omit=optional

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Owned by root and only read by the app user, so the process cannot rewrite
# its own code.
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
