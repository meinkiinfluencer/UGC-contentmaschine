# Ein Image für Web + Worker. Web: CMD default. Worker: `npm run worker`.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu fonts-liberation openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production MEDIA_DIR=/data/media
VOLUME /data
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
