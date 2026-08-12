FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace setup
COPY package.json package-lock.json* ./

# Copy workspace package.json files
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies
RUN npm install --ignore-scripts

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY packages/frontend/ ./packages/frontend/

# Build the frontend
RUN cd packages/frontend && npm run build

# ---- Production image ----
FROM nginx:alpine AS runner

COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/frontend/dist/ /usr/share/nginx/html/

EXPOSE 80
