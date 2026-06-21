# ── Rapha HNaaS Care Navigator ──
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3000
# Run migrations then start. Railway provides DATABASE_URL at runtime.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
