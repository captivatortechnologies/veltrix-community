# Veltrix Community Edition — developer shortcuts.
# Run `make help` for the list. Requires: docker (v2 compose), node 20+, pnpm 9+.

.DEFAULT_GOAL := help
.PHONY: help install dev up down clean build test lint typecheck \
        db-generate db-migrate seed quickstart smoke secrets-scan sdk-test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies (pnpm)
	pnpm install

dev: ## Run the full stack in the foreground (docker compose up --build)
	docker compose up --build

up: ## Start the stack detached
	docker compose up -d

down: ## Stop the stack (keep data)
	docker compose down

clean: ## Stop the stack and remove volumes (wipes the database)
	docker compose down -v

build: ## Build all workspace packages
	pnpm build

test: ## Run all unit tests
	pnpm test

lint: ## Typecheck / lint all packages
	pnpm lint

db-generate: ## Generate the Prisma client
	pnpm db:generate

db-migrate: ## Apply database migrations (dev)
	pnpm db:migrate

seed: ## Seed the database (default org, admin, RBAC, tool + compliance catalogs)
	pnpm --filter ./server db:seed

quickstart: ## One-command self-host bootstrap (build + migrate + start)
	bash scripts/quickstart.sh

smoke: ## Local docker smoke test: boot the stack and hit the live endpoints
	bash scripts/quickstart.sh
	@echo "==> Waiting for server health"; \
	for i in $$(seq 1 45); do \
	  code=$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8731/ || true); \
	  [ "$$code" = "200" ] && break; sleep 2; done
	@echo "==> /api/brand"        && curl -fsS http://localhost:8731/api/brand;        echo
	@echo "==> /api/feature-flags" && curl -fsS http://localhost:8731/api/feature-flags; echo
	@echo "==> smoke OK"

secrets-scan: ## Scan the tree for secrets (gitleaks)
	pnpm secrets:scan

sdk-test: ## Run both SDK test suites
	pnpm --filter ./packages/sdk-js test
	cd packages/sdk-python && python -m pytest
