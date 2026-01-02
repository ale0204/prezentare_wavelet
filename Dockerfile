# prezentare_wavelet/Dockerfile
# Multi-stage build: Vite frontend + Python/FastAPI backend in one image.
# Build context: prezentare_wavelet/
#
# Stage 1  - node:20-alpine  - compiles the React/Vite frontend to dist/
# Stage 2  - python:3.12-slim - installs API deps, serves API + static frontend
#
# Run locally:
#   docker build -t dsp:latest .
#   docker run --rm -p 8000:8000 dsp:latest
#   -> open http://localhost:8000
#
# In production the host stack's nginx terminates TLS and proxies to dsp:8000;
# the container itself publishes no port.

FROM node:20-alpine AS build-frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgfortran5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=build-frontend /app/dist ./static
COPY data/ ./data/

ENV DATA_DIR=/app/data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
