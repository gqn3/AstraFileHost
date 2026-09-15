FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime
RUN apk add --no-cache --upgrade libcrypto3 libssl3 postgresql17-client ca-certificates tini && addgroup -g 10001 astrafile && adduser -D -u 10001 -G astrafile astrafile
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The running service only needs node; remove build/package-manager tooling from this image.
RUN node -e "const fs=require('fs');for(const p of ['/usr/local/lib/node_modules/npm','/usr/local/lib/node_modules/corepack','/opt/yarn-v1.22.22'])fs.rmSync(p,{recursive:true,force:true});for(const p of ['/usr/local/bin/npm','/usr/local/bin/npx','/usr/local/bin/corepack','/usr/local/bin/yarn','/usr/local/bin/yarnpkg'])fs.rmSync(p,{force:true});"
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --from=build --chown=10001:10001 /app/packages/database/migrations ./packages/database/migrations
COPY --chown=10001:10001 scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod 0555 /app/entrypoint.sh
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "dist/api.mjs"]
