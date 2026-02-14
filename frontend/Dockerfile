FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* yarn.lock* ./

# Install dependencies
RUN if [ -f yarn.lock ]; then yarn install; else npm install --legacy-peer-deps --force; fi

# Copy source code
COPY . .

# Build the application
RUN if [ -f yarn.lock ]; then yarn build; else npm run build; fi

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install serve to run the production build
RUN npm install -g serve

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Verify build folder exists
RUN ls -la /app/build/ || (echo "Build folder not found!" && exit 1)

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

# Serve the application with single page application mode
CMD ["serve", "-s", "build", "-l", "3000", "--single"]
