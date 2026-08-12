FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace setup
COPY package.json package-lock.json* ./

# Copy workspace package.json files
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install all dependencies
RUN npm install --ignore-scripts

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY packages/backend/ ./packages/backend/

# Generate Prisma client
RUN cd packages/backend && npx prisma generate

# Build the backend
RUN cd packages/backend && npx tsc --project tsconfig.json

# ---- Production image ----
FROM node:22-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN npm install --ignore-scripts --omit=dev

COPY --from=builder /app/packages/shared/ ./packages/shared/
COPY --from=builder /app/packages/backend/dist/ ./packages/backend/dist/
COPY --from=builder /app/packages/backend/node_modules/.prisma/ ./packages/backend/node_modules/.prisma/
COPY packages/backend/prisma/ ./packages/backend/prisma/

WORKDIR /app/packages/backend

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
