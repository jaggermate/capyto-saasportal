# Frontend Dockerfile - React (Vite) served by Nginx
# 1) Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (better caching)
COPY ./package*.json ./
RUN npm ci

# Copy source and build
COPY ./ .

# Build-time API base can be overridden: --build-arg VITE_API_BASE=http://api:8000
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=${VITE_API_BASE}

RUN npm run dev

EXPOSE 5173