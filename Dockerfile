# ── Stage 1: build operator UI ───────────────────────────────────────────────
FROM node:20-alpine AS node-builder
WORKDIR /src

# Install deps (operator only — IDE is never bundled into the container).
COPY package.json package-lock.json* ./
COPY packages/operator/package.json ./packages/operator/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci --workspace=packages/operator --workspace=packages/shared-types --ignore-scripts

COPY packages/shared-types ./packages/shared-types
COPY packages/operator ./packages/operator

# Build output goes directly to cmd/speths-screens/ui/ (the Go embed target).
RUN npm run build --workspace=packages/operator

# ── Stage 2: build Go binary ─────────────────────────────────────────────────
FROM golang:1.25-alpine AS go-builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Pull in the operator dist from stage 1.
COPY --from=node-builder /src/cmd/speths-screens/ui ./cmd/speths-screens/ui

# CGO_ENABLED=0: modernc.org/sqlite is pure Go — no libc needed.
# TARGETARCH is set by buildx; defaults to the host arch for plain docker build.
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -ldflags="-s -w" -o /speths-screens ./cmd/speths-screens

# ── Stage 3: runtime image ───────────────────────────────────────────────────
FROM scratch

# CA certs so the runtime can make verified TLS calls to the PLC in production.
COPY --from=go-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

COPY --from=go-builder /speths-screens /speths-screens

# /project  → mount your .xhmi.json project files here (read-write for IDE save)
# /data     → SQLite historian database lives here
VOLUME ["/project", "/data"]

EXPOSE 8080

ENTRYPOINT ["/speths-screens"]
CMD ["--mode=runtime", "--addr=:8080", "--project=/project/project.json", "--history=/data/history.db"]
