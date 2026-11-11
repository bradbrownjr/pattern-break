# Pattern Break: the leaderboard server and the built client in one image.
# Build: docker build -t pattern-break .
# Run:   docker run --rm -p 8080:8080 -v pattern-break-data:/data pattern-break

# Build stage: install the workspace, build the client, then keep only what the server needs
# to run: its production dependencies and the workspace packages it imports.
FROM node:26-alpine AS build
# Keep this version in step with "packageManager" in package.json. Node 26 has no corepack.
RUN npm install --global pnpm@12.18.0
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @game/client build
# Node runs the workspace's TypeScript directly, but not from inside node_modules, so the
# workspace packages stay where they are, linked from node_modules, as in the repo.
RUN find . -name node_modules -type d -prune -exec rm -rf {} + \
 && pnpm install --frozen-lockfile --prod --filter "@game/server..."

# Runtime stage: Node, the server and the packages it imports, the bundled songs (to check
# runs on them) and the built client.
FROM node:26-alpine
LABEL org.opencontainers.image.title="Pattern Break" \
      org.opencontainers.image.description="A tunnel shooter whose levels are built from songs (tracker modules)." \
      org.opencontainers.image.source="https://github.com/bradbrownjr/pattern-break" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=8080 \
    CLIENT_DIST=/app/packages/client/dist \
    DATA_DIR=/data \
    MUSIC_DIR=/app/music
WORKDIR /app
COPY --from=build /src/package.json /src/pnpm-workspace.yaml ./
COPY --from=build /src/node_modules node_modules
COPY --from=build /src/packages/core/package.json packages/core/package.json
COPY --from=build /src/packages/core/src packages/core/src
COPY --from=build /src/packages/analysis/package.json packages/analysis/package.json
COPY --from=build /src/packages/analysis/src packages/analysis/src
COPY --from=build /src/packages/analysis/vendor packages/analysis/vendor
COPY --from=build /src/packages/analysis/node_modules packages/analysis/node_modules
COPY --from=build /src/packages/server/package.json packages/server/package.json
COPY --from=build /src/packages/server/src packages/server/src
COPY --from=build /src/packages/server/node_modules packages/server/node_modules
COPY --from=build /src/packages/client/dist packages/client/dist
COPY --from=build /src/music music

# The node image ships a non-root "node" user. /data holds the database, replays, uploaded
# songs and the level cache; mount a volume there to keep them.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "packages/server/src/main.ts"]
