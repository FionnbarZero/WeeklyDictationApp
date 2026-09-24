FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY backend ./backend
CMD ["node", "--experimental-strip-types", "backend/server.ts"]
