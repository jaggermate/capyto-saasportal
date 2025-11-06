# Frontend Dockerfile - React (Vite) served by Nginx
# 1) Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (better caching)
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ .

# Build-time API base can be overridden: --build-arg VITE_API_BASE=http://api:8000
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=${VITE_API_BASE}

RUN npm run build

# 2) Runtime stage
FROM nginx:alpine AS runtime

# Copy a simple SPA-friendly nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
