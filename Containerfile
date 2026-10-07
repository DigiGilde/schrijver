FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/library/node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

FROM docker.io/library/node:22-alpine
WORKDIR /app
RUN adduser -D -u 1001 schrijver
COPY --from=deps --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=build --chown=1001:1001 /app/build ./build
COPY --chown=1001:1001 package.json package-lock.json ./
COPY --chown=1001:1001 db ./db
ENV PORT=8080 NODE_ENV=production TZ=Europe/Amsterdam BODY_SIZE_LIMIT=6M
USER 1001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "build"]
