# Request correlation and structured HTTP logging

## What is implemented

The API assigns every request a correlation ID and returns it in the `X-Request-Id` response header. A caller-supplied ID is accepted only when it matches a UUID format; otherwise the API creates a new UUID.

At response completion, the API emits one JSON log event with:

- `event`: `http.request.completed`
- `requestId`, HTTP method and route template
- response status code and elapsed milliseconds

Unhandled errors emit a separate structured event with the correlation ID and error type. The client receives a generic error body with the request ID so operators can correlate a report with server logs.

## Privacy choices

The logger deliberately does not record raw URLs, query strings, request bodies, authorization/cookie headers, IP addresses, user IDs, supplier invitation tokens or arbitrary caller-supplied correlation strings. Route templates are used instead of raw paths so parameter values are not exposed.

## Operational boundary

This is a lightweight structured logging and correlation baseline. It writes to the process console; it does not provide centralized storage, retention controls, redaction at a log collector, metrics, distributed tracing, alerting or error-tracking integration. Configure those services in the target environment before production use, and ensure log access and retention meet the organization's privacy policy.

## Validation

Unit tests cover UUID acceptance/replacement and safe route-label behavior. The standard CI pipeline typechecks, lints, tests and builds the API.
