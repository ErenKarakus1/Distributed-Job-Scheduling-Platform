FROM node:22-alpine AS backend

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend ./backend
COPY frontend ./frontend

RUN npm ci
RUN npm run db:generate
RUN npm run build --workspaces --if-present

ENV NODE_ENV=production

CMD ["node", "backend/api-gateway/dist/index.js"]
