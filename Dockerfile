FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000 BEI_DB=/data/bei.db
VOLUME /data
EXPOSE 3000
CMD ["node", "src/server.js"]
