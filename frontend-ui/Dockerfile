# ==============================================================================
# Stage 1: Compile React SPA using Node 20 Alpine
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Compile optimized static bundle to /app/dist
RUN npm run build

# ==============================================================================
# Stage 2: Serve static bundle via unprivileged NGINX Alpine (Rootless)
# ==============================================================================
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Copy compiled assets from build stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom hardened reverse-proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose unprivileged port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

# Start NGINX in foreground
CMD ["nginx", "-g", "daemon off;"]
