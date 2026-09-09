---
kind: logging_system
name: Standard Library Logging with Three-Tier File + Console Sinks
category: logging_system
scope:
    - '**'
source_files:
    - src/logging_config.py
    - server.py
    - webui.py
    - main.py
    - tests/test_logging_config.py
---

## What system/approach is used

The application uses Python's built-in `logging` module exclusively — no third-party logging frameworks (structlog, loguru, etc.) are imported. All log output is produced via `logging.getLogger(__name__)` and the standard `INFO/DEBUG/WARNING/ERROR/CRITICAL` levels. A single centralized initializer in `src/logging_config.py` configures the root logger once per process.

## Key files and packages

- `src/logging_config.py` — the sole logging configuration module; defines format strings, a custom `RelativePathFormatter`, quiet-lists for noisy third-party loggers, and the `setup_logging()` entry point.
- `server.py` — FastAPI server bootstrap that calls `setup_logging(log_prefix="api_server", console_level=..., extra_quiet_loggers=['uvicorn', 'fastapi'])` after loading config.
- `webui.py` — Web UI launcher that calls `setup_logging(log_prefix="web_server")` before starting uvicorn.
- `main.py` — CLI/scheduler entry point that first installs a minimal stderr-only handler (`_setup_bootstrap_logging`) so startup messages survive before config is loaded, then switches to file-backed logging via `_setup_runtime_logging` which calls `setup_logging(log_prefix="stock_analysis", ...)`. If writing to the configured `log_dir` fails it falls back to console-only and logs a warning.
- `tests/test_logging_config.py` — pytest suite that verifies log format, LiteLLM logger suppression, env-driven level override, and invalid-level fallback.

## Architecture and conventions

### Three-tier sink model
`setup_logging()` installs three handlers on the root logger:
1. **Console** (`StreamHandler(sys.stdout)`) — level controlled by `debug` flag or explicit `console_level`; defaults to `INFO`.
2. **Regular file** (`RotatingFileHandler`) — writes `INFO` and above into `{log_dir}/{log_prefix}_{YYYYMMDD}.log`; rotates at 10 MB, keeps 5 backups.
3. **Debug file** (`RotatingFileHandler`) — writes `DEBUG` and above into `{log_dir}/{log_prefix}_debug_{YYYYMMDD}.log`; rotates at 50 MB, keeps 3 backups.

The root logger level is set to `DEBUG` so all handlers can filter independently; each handler applies its own minimum level.

### Log format
A single format string is shared across all sinks:
```
%(asctime)s | %(levelname)-8s | %(name)s | %(pathname)s:%(lineno)d | %(message)s
```
with date format `%Y-%m-%d %H:%M:%S`. A custom `RelativePathFormatter` rewrites absolute `pathname`s to paths relative to `Path.cwd()` so logs stay portable between local dev and containers.

### Quiet lists
Noisy third-party libraries are explicitly downgraded to `WARNING`:
- Default quiet list: `urllib3`, `sqlalchemy`, `google`, `httpx`.
- Extra quiet list passed per-process (e.g. `uvicorn`, `fastapi` from `server.py`).
- LiteLLM loggers (`LiteLLM`, `LiteLLM Router`, `LiteLLM Proxy`, `litellm`) are handled separately: their level is read from the `LITELLM_LOG_LEVEL` environment variable, normalized against an allowlist (`DEBUG/INFO/WARNING/ERROR/CRITICAL`), and defaults to `WARNING` when empty or invalid. An invalid value triggers a warning log describing the fallback.

### Per-process prefixes
Each runtime wires a distinct `log_prefix` so daily-analysis runs, the API server, and the web UI write to separate filenames under the same `logs/` directory:
- `stock_analysis_*` (CLI / scheduler)
- `api_server_*` (FastAPI via `server.py`)
- `web_server_*` (standalone web UI via `webui.py`)

### Bootstrap vs runtime logging
`main.py` installs a temporary stderr-only handler before config is available, then replaces it with the full file-backed setup once `config.log_dir` is known. This ensures early startup diagnostics are never lost even if the configured log directory is unwritable; in that case `setup_logging` raises `OSError` and the caller logs a warning and continues with console-only output.

### Usage pattern across modules
Every module follows the same convention: import `logging`, then create a module-scoped `logger = logging.getLogger(__name__)` and call `logger.info/debug/warning/error(...)` directly. There is no application-specific logger factory or wrapper class — callers rely entirely on the root logger configured by `setup_logging`.

## Conventions and constraints

- **Single initialization**: `setup_logging()` clears any existing root handlers before installing new ones, making it safe to call multiple times within a process (used by tests to reset state).
- **Structured fields**: No structured JSON logging is used; log lines are plain text with pipe-delimited fields. Correlation IDs (e.g. `query_id`) are embedded as part of the message string rather than as structured fields.
- **Date-partitioned files**: Log files are named with a `YYYYMMDD` suffix so one file per day is created automatically; rotation caps disk usage.
- **Environment-controlled verbosity**: `LITELLM_LOG_LEVEL` is the only documented environment variable that changes logging behavior at runtime; the main app's console level comes from `config.log_level` (parsed from `.env`/config) while debug-file verbosity is always `DEBUG`.
- **Relative paths in logs**: Absolute filesystem paths are intentionally avoided in log output via `RelativePathFormatter`; this is tested and relied on for containerized deployments where absolute paths differ.
- **Test isolation**: The test fixture restores the root logger's original handlers, level, and LiteLLM logger levels after each test, ensuring logging configuration does not leak between tests.