# Private evidence vault

## Upload and verification flow

1. An authenticated tenant member requests an upload intent for a supplier submission.
2. The API verifies tenant ownership and returns a five-minute presigned S3 PUT URL under a private `quarantine/<organization>/<submission>/<evidence-id>` key.
3. The browser uploads directly to object storage using the signed Content-Type header.
4. The completion endpoint verifies the stored size and media type with S3, downloads at most 50 MiB, computes SHA-256 on the server and scans the bytes using ClamAV's INSTREAM protocol.
5. Only a clean ClamAV verdict allows the API to create immutable evidence metadata.
6. Authenticated tenant members can request a 60-second presigned download URL only for registered S3 evidence; issuance is audit logged.

## Endpoints

- `POST /api/v1/suppliers/submissions/:submissionId/evidence/upload-intents`
- `POST /api/v1/suppliers/submissions/:submissionId/evidence/:evidenceId/complete`
- `GET /api/v1/suppliers/submissions/:submissionId/evidence/:evidenceId/download`

## Configuration

Set `EVIDENCE_S3_BUCKET`, `EVIDENCE_S3_REGION`, `EVIDENCE_S3_ACCESS_KEY_ID` and `EVIDENCE_S3_SECRET_ACCESS_KEY`. Optionally set `EVIDENCE_S3_ENDPOINT` for an S3-compatible provider. Set `CLAMAV_HOST` and optionally `CLAMAV_PORT` (default 3310). The API fails closed if storage or scanner configuration is missing.

Use a private bucket with public access blocked, TLS enforced, server-side encryption, and a lifecycle rule to expire abandoned `quarantine/` objects. Limit the API identity to the required bucket and object prefixes. Never expose credentials to the browser.

## Operational limitations

Scanning currently runs synchronously in the API process and buffers at most 50 MiB; high-volume production should move it to a durable queue. The API does not create evidence metadata until a clean verdict, but failed or abandoned quarantine objects need a bucket lifecycle policy. Existing metadata-only evidence records are not eligible for the S3 download endpoint. Malware scanning is a risk reduction control, not a guarantee that every file is safe.

## Manual validation

Before accepting real evidence, configure a private test bucket and ClamAV daemon. Test a clean document and the EICAR antivirus test file in a non-production environment; verify that the infected file is rejected and no evidence row is created. Confirm bucket policy, lifecycle expiry, encryption, tenant isolation and audit logging.
