FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY services/shared ./services/shared
COPY services/payments ./services/payments

RUN npm install --omit=dev

WORKDIR /app/services/payments
EXPOSE 4002

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4002/health || exit 1

CMD ["node", "src/index.js"]
