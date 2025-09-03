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
# (Opcional) Remover configs padrão de exemplo
RUN rm -rf /usr/share/nginx/html/*

# Copia a pasta gerada pelo build
COPY --from=build /app/dist /usr/share/nginx/html

# Porta interna (o Nginx do projeto ouvirá essa porta)
EXPOSE 80

# Nginx já inicia como PID 1 por padrão na imagem oficial
