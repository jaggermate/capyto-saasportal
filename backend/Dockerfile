# Backend Dockerfile - FastAPI (Uvicorn)
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps (optional, keep minimal for now)
# RUN apt-get update && apt-get install -y --no-install-recommends ... && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching)
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY backend/ /app/

EXPOSE 8000

# Entrypoint: run FastAPI app with Uvicorn
# main.py is at /app/main.py, so the app import path is "main:app"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
