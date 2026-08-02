FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend ./backend
COPY frontend ./frontend

RUN npm ci
RUN npm run build -w @scheduler/dashboard

FROM nginx:1.27-alpine

COPY frontend/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dashboard/dist /usr/share/nginx/html

EXPOSE 80
