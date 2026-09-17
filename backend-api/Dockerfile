# ==============================================================================
# Stage 1: Build dependencies in an isolated sandbox
# ==============================================================================
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build tools required for compiling C extensions if necessary
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies into user directory
RUN pip install --no-cache-dir --user -r requirements.txt

# ==============================================================================
# Stage 2: Minimal hardened production runtime
# ==============================================================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Install minimal runtime dependencies (libpq for PostgreSQL driver, curl for optional healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Security: Create dedicated unprivileged user and group (UID/GID 10001)
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -m appuser

# Copy installed Python packages from the builder stage
COPY --from=builder /root/.local /home/appuser/.local

# Copy application source code with correct ownership
COPY --chown=appuser:appgroup app /app/app

# Set environment paths
ENV PATH="/home/appuser/.local/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Run as non-root user
USER 10001

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Start FastAPI application with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
