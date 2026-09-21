SHELL := /bin/bash
export UV_CACHE_DIR := $(CURDIR)/.tools/uv-cache
export PATH := $(CURDIR)/.tools/node/bin:$(PATH)
PY := uv run --locked python
OUTPUT ?= reports/new-reference-run
APP_BASE ?= /
export APP_BASE
.DEFAULT_GOAL := help
.PHONY: benchmark validate-science reproduce help setup doctor fmt lint typecheck test test-browser browser-install dev build check integrity restore-reference reference-quick reference-full reference-replay reference-replay-full
help:
	@echo 'Development: setup doctor fmt lint typecheck test browser-install build test-browser dev check benchmark'
	@echo 'Evidence: integrity restore-reference reference-quick reference-full reference-replay reference-replay-full'
	@echo 'Production: validate-science reproduce ensemble-replay (new report directory per run)'

setup:
	python3 scripts/fetch_assets.py --node
	uv sync --locked
	npm --prefix web ci
	$(PY) scripts/fetch_assets.py
	$(MAKE) doctor
browser-install:
	cd web && npx playwright install chromium firefox webkit
doctor:
	$(PY) scripts/repository.py doctor
integrity:
	$(PY) scripts/repository.py integrity
restore-reference:
	$(PY) scripts/repository.py restore
fmt:
	uv run --locked ruff format .
	npm --prefix web run fmt
lint:
	uv run --locked ruff format --check .
	uv run --locked ruff check .
	npm --prefix web run lint
typecheck:
	uv run --locked mypy
	npm --prefix web run typecheck
test:
	uv run --locked pytest
build:
	$(PY) scripts/fetch_assets.py
	uv build --no-build-isolation --wheel --out-dir dist
	$(PY) scripts/repository.py build-assets
	npm --prefix web run build
	$(PY) scripts/repository.py seal-build
benchmark: build
	npm --prefix web run benchmark
test-browser:
	$(PY) scripts/browser_parity.py
	npm --prefix web test
dev:
	$(MAKE) build
	npm --prefix web run dev
reference-quick:
	$(PY) scripts/run_reference_pipeline.py --quick --output "$(OUTPUT)"
reference-full:
	$(PY) scripts/run_reference_pipeline.py --output "$(OUTPUT)"
reference-replay:
	$(PY) scripts/reference_replay.py
reference-replay-full:
	$(PY) scripts/reference_replay.py --full
check: doctor integrity lint typecheck validate-science reference-replay ensemble-replay
	$(MAKE) build APP_BASE=/
	$(MAKE) test-browser APP_BASE=/
	$(MAKE) build APP_BASE=/single_vent_sim/
	$(MAKE) test-browser APP_BASE=/single_vent_sim/

validate-science:
	$(PY) scripts/science_report.py validate $(if $(SCIENCE_OUTPUT),--output "$(SCIENCE_OUTPUT)",)
reproduce:
	$(PY) scripts/science_report.py reproduce $(if $(SCIENCE_OUTPUT),--output "$(SCIENCE_OUTPUT)",)

.PHONY: ensemble-replay
ensemble-replay:
	$(PY) scripts/ensemble_report.py

.PHONY: verify-live
verify-live:
	$(PY) scripts/verify_deployment.py --accepted-manifest "$(ACCEPTED_MANIFEST)" --commit "$(COMMIT)" --output artifacts/deployment/hosted-assets.json
	cd web && EXPECTED_COMMIT="$(COMMIT)" ACCEPTED_ASSET_MANIFEST="$(ACCEPTED_MANIFEST)" npx playwright test --config playwright.live.config.ts
