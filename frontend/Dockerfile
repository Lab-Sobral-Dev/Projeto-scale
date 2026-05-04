# === Frontend (React/Vite) — build ===
FROM node:18-alpine AS build
WORKDIR /app

# Instalar dependências
COPY package*.json ./
# Use "npm ci" se você tiver package-lock.json confiável
# RUN npm ci
RUN npm install --legacy-peer-deps

# Build
COPY . .
RUN npm run build

# === Servir estático com Nginx (container do frontend) ===
# Obs.: no seu compose você pode usar este container
#       OU apenas montar /app/dist no Nginx do projeto.
FROM nginx:stable-alpine
RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Nginx já inicia como PID 1 por padrão na imagem oficial
