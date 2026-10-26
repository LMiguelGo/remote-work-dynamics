FROM node:22-alpine

WORKDIR /app

# Instalacion reproducible y solo con dependencias de produccion (sin las de
# desarrollo). Usa package-lock.json, por eso npm ci en lugar de npm install.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# La imagen corre como el usuario 'node' que ya trae la imagen base, no como root.
# El directorio de trabajo queda a su nombre para que el seed pueda escribir el
# archivo de claves temporales en /app cuando se ejecuta dentro del contenedor.
RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["npm", "start"]
