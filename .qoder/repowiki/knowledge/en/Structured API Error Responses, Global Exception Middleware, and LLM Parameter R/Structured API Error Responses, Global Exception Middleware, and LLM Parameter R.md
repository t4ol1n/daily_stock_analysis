---
kind: error_handling
name: Structured API Error Responses, Global Exception Middleware, and LLM Parameter Recovery
category: error_handling
scope:
    - '**'
source_files:
    - api/v1/errors.py
    - api/middlewares/error_handler.py
    - api/app.py
    - src/llm/errors.py
    - src/llm/generation_params.py
    - apps/dsa-web/src/api/error.ts
---

## Overview

The repository uses a layered error-handling strategy: the FastAPI backend normalizes all HTTP errors into a consistent JSON envelope via a global middleware + exception handlers; business endpoints raise typed `HTTPException` instances built through shared helpers; the Python LLM layer classifies provider parameter errors and retries with request-scoped recovery; and the React web client parses every response into a domain-specific `ApiErrorCategory` so UI code can display localized, actionable messages.

## Backend (FastAPI)

### Centralized error shape
- `api/v1/errors.py` defines `error_body(error, message, detail=None)` which produces `{"error": ..., "message": ..., "detail": ...}` and two builders:
  - `api_error(status_code, error, message, detail=None)` → `HTTPException(detail=error_body(...))`
  - `error_json_response(status_code, error, message, detail=None)` → `JSONResponse(content=error_body(...))`
- Endpoints in `api/v1/endpoints/` (e.g. `analysis.py`, `portfolio.py`) raise `api_error(400, "validation_error", ...)` or `api_error(500, "internal_error", ...)` rather than constructing dicts manually.

### Global exception handling
- `api/middlewares/error_handler.py` registers three FastAPI exception handlers via `add_error_handlers(app)` (called from `api/app.py` after including routers):
  - `HTTPException` handler: if `exc.detail` is already an ErrorResponse-style dict it is returned verbatim; otherwise it wraps the message as `{"error": "http_error", "message": ..., "detail": None}`.
  - `RequestValidationError` handler: returns 422 with `{"error": "validation_error", "message": "请求参数验证失败", "detail": exc.errors()}`.
  - Generic `Exception` handler: logs the full traceback and returns 500 `{"error": "internal_error", "message": "服务器内部错误", "detail": None}`.
- A Starlette `BaseHTTPMiddleware` (`ErrorHandlerMiddleware`) is also available to wrap individual routes for additional try/catch logging, but the primary path is the registered exception handlers.

### App wiring
- `api/app.py:create_app()` calls `add_error_handlers(app)` right after `app.include_router(api_v1_router, prefix="/api/v1")`, ensuring all v1 routes are covered. The `/assets/*` SPA fallback intentionally returns plain-text 404s (not JSON) so missing static assets do not get swallowed by the JSON error handler.

## LLM Layer (Python)

- `src/llm/errors.py` provides `classify_litellm_generation_param_error(exc)` which inspects LiteLLM exceptions for markers like `unsupported`, `unrecognized parameter`, `only ... default temperature value`, etc., and returns a `GenerationParamRecovery` dataclass (`omit_params`, `set_params`, `reason`).
- `call_litellm_with_param_recovery(call, model, call_kwargs, ...)` executes the call once, and on a matching generation-parameter error retries exactly once with the recovered kwargs. Successful recoveries are cached per model/request shape via `remember_litellm_generation_param_recovery` / `get_cached_litellm_generation_param_recovery` in `src/llm/generation_params.py` (with secret redaction).
- This is a **one-shot retry** pattern — non-recoverable errors are re-raised unchanged.

## Frontend (React / TypeScript)

- `apps/dsa-web/src/api/error.ts` defines the canonical client-side error taxonomy:
  ```ts
  type ApiErrorCategory =
    | 'agent_disabled'
    | 'missing_params'
    | 'llm_not_configured'
    | 'model_tool_incompatible'
    | 'invalid_tool_call'
    | 'portfolio_oversell'
    | 'portfolio_busy'
    | 'upstream_llm_400'
    | 'upstream_timeout'
    | 'upstream_network'
    | 'local_connection_failed'
    | 'http_error'
    | 'unknown';
  ```
- `parseApiError(error)` extracts status, payload text, and error codes from Axios responses and maps them to one of these categories using substring matching against both the response body and error messages (e.g. `ECONNABORTED`, `ERR_NETWORK`, `ECONNREFUSED`, `502/503`, `all llm models failed`, `does not support tools`, `stock_code`, `oversell detected`, `agent_mode`).
- `createParsedApiError` / `createApiError` build a `ParsedApiError` plus an `Error` instance tagged with `name = 'ApiRequestError'` and a `parsedError` field, so callers can check `isApiRequestError(err)` and branch on `err.category`.
- `toApiErrorMessage(error)` renders a user-facing string via `formatParsedApiError(parsed)` (title + message), falling back to a generic Chinese message when no payload is present.

## Conventions Observed

1. **Backend endpoints never return raw dicts for errors** — they use `api_error(...)` or `error_json_response(...)` so the response always has the `{error, message, detail?}` shape.
2. **Validation failures go through FastAPI's `RequestValidationError`** and are normalized to 422 with `error: "validation_error"`; business-level input checks explicitly raise `api_error(400, "validation_error", ...)`.
3. **Unexpected server errors are caught globally** — any unhandled exception becomes a 500 with `error: "internal_error"` and a logged traceback; endpoint code should catch known exceptions and convert them to `api_error(...)` with a specific error code.
4. **LLM provider parameter incompatibilities are treated as recoverable**: the LLM layer classifies the exception, applies a request-scoped fix (omit or set a parameter), retries once, and caches the recovery for subsequent calls with the same model/request shape.
5. **Frontend treats every network/API failure as a categorized error**: consumers call `parseApiError` / `getParsedApiError` / `toApiErrorMessage` instead of inspecting raw Axios errors, and UI branches on `ApiErrorCategory` to show localized guidance (e.g. agent disabled, LLM not configured, upstream timeout, local connection failed).
6. **No custom Python exception hierarchy is used at the API boundary** — `HTTPException` is the only propagated error type; internal modules define their own exceptions (e.g. `DuplicateTaskError` in `src/services/task_queue.py`) but those are converted to `api_error(...)` before reaching the wire.