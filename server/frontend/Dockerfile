FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 80 siempre; 443 solo cuando se activa docker-compose.https.yml.
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
