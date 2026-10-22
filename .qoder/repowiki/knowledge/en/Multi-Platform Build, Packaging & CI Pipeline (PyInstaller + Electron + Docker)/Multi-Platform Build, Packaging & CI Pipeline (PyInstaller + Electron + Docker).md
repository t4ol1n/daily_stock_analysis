---
kind: build_system
name: Multi-Platform Build, Packaging & CI Pipeline (PyInstaller + Electron + Docker)
category: build_system
scope:
    - '**'
source_files:
    - docker/Dockerfile
    - docker/docker-compose.yml
    - docker/entrypoint.sh
    - scripts/build-backend-macos.sh
    - scripts/build-backend.ps1
    - scripts/build-all-macos.sh
    - scripts/build-all.ps1
    - scripts/ci_gate.sh
    - scripts/ci_test_shard.py
    - .github/workflows/ci.yml
    - .github/workflows/create-release.yml
    - .github/workflows/desktop-release.yml
    - apps/dsa-web/package.json
    - apps/dsa-desktop/package.json
    - requirements.txt
    - pyproject.toml
---

## What system/approach is used

The repository builds three distinct artifacts from a single monorepo:

1. **Python backend executable** — frozen with PyInstaller into a `onedir` bundle named `stock_analysis`, including the FastAPI server, CLI scheduler, bot, data providers, strategies, and bundled static assets.
2. **Electron desktop app** (`apps/dsa-desktop`) — packages the frozen backend as an extra resource and ships NSIS installers (Windows) and DMGs (macOS), with automatic updates via `electron-updater` and GitHub Releases.
3. **Docker image** (`docker/Dockerfile`) — multi-stage build that compiles the React SPA (`apps/dsa-web`) with Node 20, then runs the Python backend on `python:3.11-slim-bookworm` as a non-root user (`dsa`).

CI is driven by GitHub Actions (`.github/workflows/`) with path-based change detection (`dorny/paths-filter`) to gate backend tests, frontend lint/build, Docker build, and platform-specific desktop packaging.

## Key files and packages

- **Root dependency manifests**: `requirements.txt`, `pyproject.toml` (Black/isort/Bandit config), `.github/requirements-ci.txt`.
- **Web frontend build**: `apps/dsa-web/package.json` (Vite + TypeScript + Vitest + Playwright), built via `npm run build` producing static assets under `static/`.
- **Desktop packaging**: `apps/dsa-desktop/package.json` (Electron 31 + electron-builder 24, NSIS target on Windows, DMG on macOS, `extraResources` embedding `dist/backend/stock_analysis`).
- **Backend freeze scripts**: `scripts/build-backend-macos.sh` and `scripts/build-backend.ps1` — identical logic in bash/PowerShell: build SPA, install deps, run PyInstaller with explicit `--hidden-import`, `--collect-all`, `--add-data` for `static`, `strategies`, `src/assets/share_image`, `litellm`, `tiktoken`, `akshare`, `futu`; then verify imports, AkShare calendar data, strategy counts, and packaged static asset references.
- **Orchestrators**: `scripts/build-all-macos.sh` calls backend + desktop; `scripts/build-all.ps1` mirrors it on Windows.
- **Containerization**: `docker/Dockerfile` (Node 20 web-builder stage → Python 3.11 bookworm runtime stage), `docker/docker-compose.yml` (analyzer vs server service profiles), `docker/entrypoint.sh` (rootless permission repair for bind mounts).
- **CI workflows**: `.github/workflows/ci.yml` (PR checks: syntax, flake8, deterministic tests, offline pytest shards 1/2/3, Docker build smoke, desktop packaging triggers), `.github/workflows/create-release.yml` (annotated tag → release notes), `.github/workflows/desktop-release.yml` (tag-triggered cross-platform desktop releases with artifact upload).
- **Gate script**: `scripts/ci_gate.sh` — unified entrypoint for syntax check, flake8 critical errors, deterministic subset, and sharded offline pytest suite using `scripts/ci_test_shard.py` and `.github/ci-test-durations.json`.

## Architecture and conventions

### Multi-stage containerized build
The Dockerfile separates concerns: a `node:20-slim` stage builds the SPA (`apps/dsa-web`) and emits `static/`, which is copied into the final `python:3.11-slim-bookworm` image alongside Python source, `api/`, `bot/`, `data_provider/`, `src/`, `strategies/`. System deps include `wkhtmltopdf`, CJK fonts, and `gosu` for non-root execution. The image exposes port 8000, declares volumes for `/app/data`, `/app/logs`, `/app/reports`, and runs a healthcheck against `/api/health`.

### Frozen backend convention
Both `build-backend-macos.sh` and `build-backend.ps1` enforce the same invariant: the PyInstaller command line is identical except for shell syntax. They pass a fixed list of `--hidden-import` modules (`multipart`, `json_repair`, `tiktoken*`, `api.*`, `uvicorn.*`, `src.services.*`), `--collect-all src.services.screening` and `--collect-all futu`, and `--runtime-hook scripts/pyinstaller_runtime_compat.py`. After freezing, they assert that the produced `stock_analysis` binary can `--help`, import `src.services.screening.pipeline`, `futu`, and `orjson`, and that the packaged `strategies/*.yaml` count matches the source tree.

### Desktop packaging contract
`apps/dsa-desktop/package.json` embeds the frozen backend via `extraResources: { from: ../../dist/backend/stock_analysis, to: backend/stock_analysis }`. The macOS build script enforces that the resulting `.app` and mounted DMG are unsigned (`codesign -d` must report "code object is not signed at all") and rejects Gatekeeper false positives from issue #2075. It caches `node_modules` based on `package-lock.json` SHA256 and supports `DSA_MAC_ARCH=x64|arm64` for cross-arch builds.

### Versioning
- Desktop app version lives in `apps/dsa-desktop/package.json` (`"version": "3.21.0"`) and is overwritten during release by `npm version ${VERSION} --no-git-tag-version --allow-same-version` driven by the git tag.
- Web version and commit revision are injected via `DSA_WEB_VERSION` and `DSA_WEB_REVISION` build args passed through to the Docker build and SPA build.
- Release tags follow `vX.Y.Z` semver; `create-release.yml` triggers on push of such tags and generates release notes via `.github/scripts/build_release_notes.py`.

### CI gating model
`ci.yml` uses `dorny/paths-filter` to compute four outputs: `backend`, `docker`, `frontend`, `futu_packaging`. Backend tests run in 3 parallel shards controlled by `PYTEST_SPLITS`/`PYTEST_GROUP`, with shard balancing driven by `.github/ci-test-durations.json`. A separate `ai-governance` job runs `scripts/check_ai_assets.py`. Frontend lint+build runs only when `apps/dsa-web/**` changes. Desktop packaging jobs run only when Futu-related paths change.

### Runtime deployment conventions
- Container runs as UID/GID 1000 (`dsa`); `entrypoint.sh` repairs ownership of `/app/data`, `/app/logs`, `/app/reports`, `/home/dsa/.longbridge` before exec'ing the command.
- `docker-compose.yml` defines two services sharing a common block: `analyzer` (default `main.py --schedule`) and `server` (`main.py --serve-only --host 0.0.0.0 --port ${API_PORT:-8000}`), both mounting host `data/`, `logs/`, `reports/`, `strategies/` (read-only), and optional `longbridge_tokens/`.

## Conventions and constraints

- **Python toolchain**: Black line-length 120, target py310–py312; isort profile `black`; Bandit skips `B101` in tests. All enforced via `pyproject.toml` and invoked through `ci_gate.sh`.
- **Dependency pinning**: Python deps via `requirements.txt`; Node deps locked via `package-lock.json` (both `apps/dsa-web` and `apps/dsa-desktop`); CI caches pip/npm layers keyed by these files.
- **Deterministic test execution**: Offline tests are gated behind `-m "not network"`, with a 120s per-test timeout and a 300s faulthandler dump; sharding requires `.github/ci-test-durations.json` to exist.
- **Frozen artifact integrity**: Post-PyInstaller steps assert presence of AkShare calendar JSON, match strategy YAML counts between source and `_internal/strategies`, and re-run static asset reference validation against the packaged `static/` directory.
- **Desktop signing policy**: Builds produce explicitly unsigned bundles; macOS verification rejects any pre-existing signature and flags known broken-signature defects. Signing is expected to be performed post-build or via a separate signing step.
- **Release workflow**: Tag `v*.*.*` triggers `create-release.yml` (release notes) and `desktop-release.yml` (Windows NSIS + macOS x64/arm64 DMGs uploaded as artifacts). The desktop release workflow validates `latest.yml` version/path/blockmap consistency against the expected installer name derived from the tag.
- **Non-root container runtime**: Image creates group/user `dsa` (1000:1000), pre-creates writable dirs, fixes `efinance` data dir ownership dynamically resolved via Python, and uses `gosu` to drop privileges before running the application.