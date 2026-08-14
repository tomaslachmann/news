FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN npm install --ignore-scripts

COPY packages/shared/ ./packages/shared/
COPY packages/backend/ ./packages/backend/

RUN cd packages/backend && npx prisma generate

RUN cd packages/backend && npx tsc --project tsconfig.build.json

RUN cp -r packages/backend/src/prompts packages/backend/dist/prompts

# ---- Production image ----
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN npm install --ignore-scripts --omit=dev

# Overwrite with the Prisma-generated client and engine from the builder.
# prisma generate puts the engine binary in /app/node_modules/.prisma/ (workspace root)
# and writes generated types into /app/node_modules/@prisma/client/.
COPY --from=builder /app/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma/client/ ./node_modules/@prisma/client/

COPY --from=builder /app/packages/shared/ ./packages/shared/
COPY --from=builder /app/packages/backend/dist/ ./packages/backend/dist/
COPY packages/backend/prisma/ ./packages/backend/prisma/

WORKDIR /app/packages/backend

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
