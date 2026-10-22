---
kind: dependency_management
name: 'Multi-Tool Dependency Management: Python (requirements.txt), Node (package.json + lockfiles), Docker, and CI'
category: dependency_management
scope:
    - '**'
source_files:
    - requirements.txt
    - .github/requirements-ci.txt
    - apps/dsa-web/package.json
    - apps/dsa-web/package-lock.json
    - apps/dsa-desktop/package.json
    - apps/dsa-desktop/package-lock.json
    - docker/Dockerfile
    - setup.cfg
    - pyproject.toml
---

## What system/approach is used

This repository manages dependencies across three distinct toolchains, each with its own manifest and pinning strategy:

1. **Python backend** — flat `requirements.txt` at the repo root, consumed by `pip install -r requirements.txt`, Docker builds, and a CI-only subset in `.github/requirements-ci.txt` that re-uses the main file via `-r ../requirements.txt`.
2. **Node.js frontends** — two separate npm projects under `apps/dsa-web/` (Vite + React SPA) and `apps/dsa-desktop/` (Electron app), each with its own `package.json` plus a committed `package-lock.json`. The web app declares an `engines` field constraining Node ≥20.19.0 <27 and npm ≥10.
3. **Container runtime** — `docker/Dockerfile` pins the base images (`node:20-slim`, `python:3.11-slim-bookworm`) and installs both frontend and backend dependencies using `npm ci` and `pip install -r requirements.txt` with build cache mounts.

There is no vendoring of third-party Python packages; all dependencies are resolved from PyPI at install/build time. There is no private PyPI registry configured anywhere in the repo.

## Key files and packages

- `requirements.txt` — single source of truth for Python runtime dependencies, including conditional extras like `longbridge==0.2.74; platform_system == "Linux" and python_version < "3.12"` and `httpx[socks]`.
- `.github/requirements-ci.txt` — extends the main requirements with flake8, pytest, and pytest-timeout for CI.
- `apps/dsa-web/package.json` + `apps/dsa-web/package-lock.json` — Vite/React frontend dependencies (react, zustand, axios, tailwindcss, vite, vitest, playwright).
- `apps/dsa-desktop/package.json` + `apps/dsa-desktop/package-lock.json` — Electron desktop app dependencies (electron, electron-builder, electron-updater) with an `overrides.builder-util-runtime = 9.7.0` to force a transitive dependency version.
- `docker/Dockerfile` — multi-stage build that copies `package.json` / `package-lock.json` into the image and runs `npm ci`; copies `requirements.txt` and runs `pip install -r requirements.txt` with pip cache mounted.
- `setup.cfg` — local dev tooling config (flake8, pytest, isort); not a dependency manifest but influences how installed packages are used during lint/test.
- `pyproject.toml` — only contains Black, isort, and Bandit configuration; no project metadata or dependency declarations.

## Architecture and conventions

### Python
- A single flat `requirements.txt` lists every runtime dependency with minimum versions (`>=X.Y.Z`). Comments annotate fallback priority for data-source SDKs (efinance → akshare → tushare → baostock → yfinance) and known incompatibilities (e.g., `exchange-calendars>=4.13.0` pinned because 4.5.x breaks pandas 3 Timedelta "T").
- Conditional dependencies use PEP 508 environment markers (e.g., `longbridge==0.2.74; platform_system == "Linux" and python_version < "3.12"` vs `longbridge>=4.0.5,<5; platform_system != "Linux" or python_version >= "3.12"`).
- Known-bad versions are explicitly excluded via `!=` specifiers (e.g., `litellm>=1.80.10,!=1.82.7,!=1.82.8,<2.0.0`; `tiktoken>=0.8.0,<0.12.0` pinned below 0.12 to avoid plugin registration issues per issue #537).
- No `requirements.in` / `requirements.txt` split; no `poetry.lock`, `Pipfile.lock`, or `uv.lock`. Lockfiles are absent for Python.
- CI reuses the same file via `-r ../requirements.txt` rather than maintaining a parallel list.

### Node.js
- Two independent npm workspaces, each self-contained with its own `package.json` and committed `package-lock.json`. There is no monorepo-level `package.json` or pnpm/yarn workspace config.
- The web app enforces Node/npm versions via the `engines` field.
- The desktop app uses `electron-builder` with a GitHub Releases publish target and an `overrides` block forcing `builder-util-runtime` to `9.7.0`.

### Docker
- Frontend build stage (`node:20-slim`) copies `package.json` and `package-lock.json` first and runs `npm ci` (locked install) before copying source.
- Backend stage (`python:3.11-slim-bookworm`) copies `requirements.txt` first and runs `pip install -r requirements.txt` with a persistent pip cache mount (`--mount=type=cache,target=/root/.cache/pip`).
- System-level dependencies (wkhtmltopdf, fonts, gcc) are installed directly in the image.

## Conventions and constraints

- **Single Python manifest**: All Python dependencies live in one file (`requirements.txt`); nothing else declares Python packages.
- **Minimum-version pinning**: Versions are expressed as lower bounds (`>=X.Y.Z`) with occasional upper bounds or exclusions when upstream breakage is known (e.g., `litellm<2.0.0`, `tiktoken<0.12.0`, `orjson>=3.10,<4`).
- **Conditional SDK selection**: Platform- and Python-version markers select between alternative SDK releases (notably the Longbridge SDK).
- **No vendoring**: Third-party code is never checked into the repo; it is fetched from PyPI/npm registries at build time.
- **Lockfiles only for Node**: `package-lock.json` files are committed for both `apps/dsa-web` and `apps/dsa-desktop`, ensuring reproducible Node installs; there is no equivalent lockfile for Python.
- **CI reuse**: `.github/requirements-ci.txt` includes the main `requirements.txt` via `-r ../requirements.txt` instead of duplicating entries.
- **Docker immutability**: The Dockerfile uses `npm ci` (not `npm install`) and pins base images to exact tags, enforcing reproducible builds.