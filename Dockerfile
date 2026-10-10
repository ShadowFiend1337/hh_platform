# syntax=docker/dockerfile:1.7
# Main platform: Node.js API + built React interface + optional Python search worker.
# Build:  docker compose build app          (WITH_SEARCH=0 skips Python/torch: smaller image, text search off)
# Run:    docker compose up app             (http://localhost:8787)

FROM node:24-bookworm-slim AS node

FROM node AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json frontend/
COPY frontend/scripts frontend/scripts
RUN npm ci --omit=dev --ignore-scripts && npm ci --prefix frontend
COPY . .
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ARG WITH_SEARCH=1
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY ml/requirements.txt ml/requirements.txt
# CPU build of torch, as in docs/semantic_model.md; the trained artifact is mounted with server/data.
RUN if [ "$WITH_SEARCH" = "1" ]; then \
      python -m venv /opt/search && \
      /opt/search/bin/pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "$(grep '^torch==' ml/requirements.txt)" && \
      /opt/search/bin/pip install --no-cache-dir -r ml/requirements.txt; \
    fi
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/frontend/dist frontend/dist
COPY package.json ./
COPY server server
COPY shared shared
COPY ml ml
COPY scripts scripts
COPY docs/api docs/api
COPY frontend/src frontend/src
# APP_ENV=production disables the demo FSP realm and team accounts and requires SMTP.
ENV APP_ENV=development \
    HOST=0.0.0.0 \
    PORT=8787 \
    SEMANTIC_PYTHON=/opt/search/bin/python \
    TOKENIZERS_PARALLELISM=false
RUN useradd --create-home --uid 10001 predel && mkdir -p server/data && chown -R predel server/data
USER predel
VOLUME ["/app/server/data"]
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SETUP_LOCAL_ACCOUNTS=1 creates the team test accounts (outside production) before start.
CMD ["sh", "-c", "if [ \"$SETUP_LOCAL_ACCOUNTS\" = \"1\" ]; then node scripts/local-accounts.mjs; fi; exec node --use-env-proxy server/server.mjs"]
