# Pattern Break play-test image: the built client behind the static server in packages/server.
# Build: docker build -t pattern-break .
# Run:   docker run --rm -p 8080:8080 pattern-break

# Build stage: install the workspace and build the client.
FROM node:26-alpine AS build
# Keep this version in step with "packageManager" in package.json. Node 26 has no corepack.
RUN npm install --global pnpm@12.18.0
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @game/client build

# Runtime stage: Node, the server source and the built client. The server has no
# dependencies, so nothing is installed here.
FROM node:26-alpine
LABEL org.opencontainers.image.title="Pattern Break" \
      org.opencontainers.image.description="A tunnel shooter whose levels are built from songs (tracker modules)." \
      org.opencontainers.image.source="https://github.com/bradbrownjr/pattern-break" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=8080 \
    CLIENT_DIST=/app/packages/client/dist
WORKDIR /app
COPY --from=build /src/packages/server/package.json packages/server/package.json
COPY --from=build /src/packages/server/src packages/server/src
COPY --from=build /src/packages/client/dist packages/client/dist

# The node image ships a non-root "node" user.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "packages/server/src/main.ts"]
