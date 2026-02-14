# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend files
COPY frontend/package.json frontend/yarn.lock* frontend/package-lock.json* ./

# Install dependencies
RUN npm install --prefer-offline --no-audit || yarn install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build || yarn build

# Stage 2: Build and run backend with served frontend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt ./backend/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Make entrypoint script executable
RUN chmod +x ./backend/entrypoint.sh

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/frontend/build ./backend/static

# Set working directory to backend
WORKDIR /app/backend

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=5)"

# Start the application
CMD ["sh", "-c", "python -m uvicorn server:app --host 0.0.0.0 --port 8000"]
