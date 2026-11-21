FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY services/shared ./services/shared
COPY services/orders ./services/orders

RUN npm install --omit=dev

WORKDIR /app/services/orders
EXPOSE 4001

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4001/health || exit 1

CMD ["node", "src/index.js"]
