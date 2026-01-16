# ===============================
# CoachUp API - Production Dockerfile
# ===============================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (bcrypt, sharp)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript
RUN npm run build

# ===============================
# Production stage
# ===============================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
# - ffmpeg: for video processing (end-screen generation)
# - fonts: for text rendering in videos
RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu \
    font-noto \
    # Required for sharp and bcrypt
    vips-dev \
    libc6-compat

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist/

# Create storage directories
RUN mkdir -p storage/temp storage/videos storage/images uploads

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3847

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3847/health || exit 1

# Start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
