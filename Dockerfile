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

# su-exec lets the entrypoint start the app as the unprivileged "node" user —
# see docker-entrypoint.sh for how existing root-owned data folders are handled.
RUN apk add --no-cache su-exec
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
ENV MOVIES_DIR=/movies

EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]
