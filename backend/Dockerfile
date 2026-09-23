# ---- Build stage: compile TypeScript ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim

# CACHEBUST busts the layer below so `docker build --build-arg CACHEBUST=$(date +%s)`
# (or `fly deploy --build-arg CACHEBUST=$(date +%s)`) pulls the latest yt-dlp.
# YouTube changes break extraction regularly, so re-run a deploy with this bumped
# every so often even when nothing else in the repo changed.
ARG CACHEBUST=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ffmpeg \
      ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/server.js"]
