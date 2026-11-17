FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://codeguard:generate@localhost:5432/codeguard?schema=public" npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc --noEmit false
EXPOSE 4000
CMD ["node", "dist/server.js"]
