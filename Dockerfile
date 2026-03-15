# ---------- BUILD STAGE ----------
FROM node:20-bookworm AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Playwright browserlarni install qiladi
RUN npx playwright install chromium


# ---------- RUNTIME STAGE ----------
FROM node:20-bookworm-slim

WORKDIR /app

# Playwright uchun kerakli system packages
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app /app

EXPOSE 3030

CMD ["node","app.js"]