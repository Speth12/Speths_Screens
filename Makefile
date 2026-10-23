# ── Speth's Screens Makefile ──────────────────────────────────────────────────
# Targets:
#   make dev          Start runtime (dev mode, :3001) in background + IDE dev server
#   make runtime      Build & run runtime locally (embeds operator UI, :8080)
#   make build        Build everything (Go + both frontends)
#   make build-plc    Cross-compile ARM64 binary with embedded operator UI
#   make deploy-plc   Build ARM64 + scp to PLC + restart service
#   make test         Go unit tests
#   make test-race    Go unit tests with race detector
#   make lint         go vet + staticcheck (if installed)
#   make clean        Remove build artifacts
# ─────────────────────────────────────────────────────────────────────────

PLC_HOST     ?= admin@10.0.0.210
PLC_DEST_DIR ?= /opt/plcnext/x-hmi

BINARY       := speths-screens
BINARY_AMD   := speths-screens-linux-amd64
CMD_DIR      := ./cmd/speths-screens
UI_EMBED_DIR := cmd/speths-screens/ui

OPERATOR_PKG := packages/operator
IDE_PKG      := packages/ide

.PHONY: all dev runtime build build-operator build-ide build-plc deploy-plc \
        docker-build docker-up docker-down \
        test test-race lint deps tidy clean help

# ── Default ────────────────────────────────────────────────────────────────
all: build

# ── Help ───────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Speth's Screens Build Targets"
	@echo "  ─────────────────────────────────────────────────────"
	@echo "  make dev         Run runtime in dev mode (:3001)"
	@echo "  make runtime     Build + run with embedded operator UI (:8080)"
	@echo "  make build       Build Go binary + both frontends"
	@echo "  make build-plc   Cross-compile ARM64 with embedded operator UI"
	@echo "  make deploy-plc  Build ARM64 + deploy to PLC_HOST=$(PLC_HOST)"
	@echo "  make test        Run Go tests"
	@echo "  make test-race   Run Go tests with race detector"
	@echo "  make lint        go vet (+ staticcheck if available)"
	@echo "  make clean       Remove build artifacts"
	@echo ""

# ── Development ────────────────────────────────────────────────────────────

# Run runtime in dev mode (no embedded UI — IDE has its own dev server).
dev:
	go run $(CMD_DIR) --mode=dev --project=demo.xhmi.json

# Build embedded operator UI, then run locally as a full runtime.
runtime: build-operator
	go run $(CMD_DIR) --mode=runtime --project=demo.xhmi.json --addr=:8080

# ── Frontend builds ────────────────────────────────────────────────────────

build-operator:
	@echo "→ Building operator frontend…"
	cd $(OPERATOR_PKG) && npm ci --silent && npm run build
	@echo "→ Copying operator dist → $(UI_EMBED_DIR)"
	rm -rf $(UI_EMBED_DIR)
	mkdir -p $(UI_EMBED_DIR)
	cp -r $(OPERATOR_PKG)/dist/. $(UI_EMBED_DIR)/
	@echo "✓ Operator frontend ready at $(UI_EMBED_DIR)"

build-ide:
	@echo "→ Building IDE frontend…"
	cd $(IDE_PKG) && npm ci --silent && npm run build
	@echo "✓ IDE frontend built to $(IDE_PKG)/dist"

# ── Go build ───────────────────────────────────────────────────────────────

# Full build: operator UI embedded in Go binary.
build: build-operator
	@echo "→ Building Go binary ($(shell go env GOOS)/$(shell go env GOARCH))…"
	go build -ldflags "-s -w" -o $(BINARY) $(CMD_DIR)
	@echo "✓ Binary: ./$(BINARY)"

# amd64 cross-compile for PLCnext AXC F 3152 (x86_64 / Linux 2026.0.0).
build-plc: build-operator
	@echo "→ Cross-compiling for linux/amd64…"
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags "-s -w" -o $(BINARY_AMD) $(CMD_DIR)
	@echo "✓ amd64 binary: ./$(BINARY_AMD)"
	@ls -lh $(BINARY_AMD)

# ── Deploy ─────────────────────────────────────────────────────────────────

# Build amd64 binary and scp to PLC (emergency/debug only — normal use is docker-up).
deploy-plc: build-plc
	@echo "→ Uploading to $(PLC_HOST):$(PLC_DEST_DIR)…"
	scp $(BINARY_AMD) $(PLC_HOST):$(PLC_DEST_DIR)/$(BINARY)
	@echo "✓ Uploaded. SSH to PLC and run: sh $(PLC_DEST_DIR)/start.sh"

# ── Docker (local PC runtime) ─────────────────────────────────────────────────

docker-build:
	docker build -t speths-screens:latest .

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# Install as a systemd service on the PLC (run once after first deploy-plc).
install-service:
	@echo "→ Installing systemd service on $(PLC_HOST)…"
	@cat scripts/xhmi.service | ssh $(PLC_HOST) "cat > /etc/systemd/system/xhmi.service"
	ssh $(PLC_HOST) "systemctl daemon-reload && systemctl enable xhmi && systemctl restart xhmi"
	@echo "✓ Service installed and started"

# ── Tests ─────────────────────────────────────────────────────────────────

test:
	go test ./...

test-race:
	go test -race ./...

test-verbose:
	go test -v ./...

# ── Linting ────────────────────────────────────────────────────────────────

lint:
	go vet ./...
	@command -v staticcheck >/dev/null 2>&1 && staticcheck ./... || \
		echo "(staticcheck not installed — run: go install honnef.co/go/tools/cmd/staticcheck@latest)"

# ── Dependencies ───────────────────────────────────────────────────────────

deps:
	go mod download
	cd $(OPERATOR_PKG) && npm ci
	cd $(IDE_PKG) && npm ci

tidy:
	go mod tidy

# ── Cleanup ────────────────────────────────────────────────────────────────

clean:
	rm -f $(BINARY) $(BINARY_AMD)
	rm -rf $(UI_EMBED_DIR)
	rm -rf $(OPERATOR_PKG)/dist $(IDE_PKG)/dist
	@echo "✓ Clean"
