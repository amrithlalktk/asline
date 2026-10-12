# --- deps: install all dependencies (needed for the build step) -------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
# postinstall (`prisma generate`) needs the schema present before `npm ci`.
COPY prisma ./prisma
RUN npm ci

# --- builder: generate Prisma client + build Next.js -------------------------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy DB URL — only needed for `prisma generate` to parse the schema's
# datasource block, not for real connectivity at build time.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV DIRECT_URL="postgresql://user:pass@localhost:5432/db"
# NEXT_PUBLIC_* vars are baked into the client bundle at build time, so this
# must be set here — setting it only at `docker run` time is too late.
ARG NEXT_PUBLIC_CURRENCY=INR
ENV NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY
RUN npx prisma generate
RUN npm run build

# --- runner: run the built app ------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
# DATABASE_URL/DIRECT_URL come from docker-compose.yml at runtime, pointing
# at the `db` Postgres service.

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
