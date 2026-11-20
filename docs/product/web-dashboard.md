# Web application: authentication and live ESG overview

## Experience

The React/Vite client provides registration and sign-in, secure session restoration, an organization workspace shell and an analytics dashboard. The dashboard calls the authenticated `GET /api/v1/analytics/overview` endpoint and renders calculation-backed totals, monthly emissions, Scope 1/2/3 mix, facility rankings, supplier submission coverage and saved reduction scenarios.

The reporting period defaults to the current month plus the preceding eleven months. Users can change the date range and export the corresponding emissions CSV.

## Session handling

- Short-lived access tokens are kept in JavaScript memory only; they are not persisted to localStorage or sessionStorage.
- Refresh tokens remain in the API's HttpOnly cookie and are sent with credentialed requests.
- On application startup the client attempts a refresh, then loads the current user and organization.
- Authenticated API calls retry once after a 401 if refresh succeeds.
- Logout calls the API to revoke the refresh session and clears the in-memory access token.

The API's configured `WEB_ORIGIN`, browser origin, credentialed CORS policy and HTTPS cookie settings must agree in deployment. Cross-site deployments may require a deliberate cookie/CORS architecture; do not weaken SameSite or CSRF protections without a threat-model review.

## Current boundaries

Navigation entries for Emissions, Activity data, Facilities, Suppliers, Reduction plans and Audit & compliance are product navigation placeholders in this milestone; the live overview and emissions export are connected. The dashboard does not fabricate demo KPI values when no calculation data exists. Empty states explain that metrics appear after source data is approved and calculated.

The overview reflects saved calculation snapshots and current supplier submission coverage. Supplier coverage is not verified emissions coverage, and reduction scenario values are planning estimates rather than measured reductions.
