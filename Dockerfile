# ---- build the React frontend ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- build the server, including the native better-sqlite3 addon ----
FROM node:20-alpine AS server-build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/ ./

# ---- final runtime image ----
FROM node:20-alpine
WORKDIR /app
COPY --from=server-build /app ./
COPY --from=client-build /app/client/dist ./public
COPY VERSION ./VERSION

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
ENV MOVIES_DIR=/movies

EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "index.js"]
