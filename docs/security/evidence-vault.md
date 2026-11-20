# Private evidence vault

## Upload and verification flow

1. An authenticated tenant member requests an upload intent for a supplier submission.
2. The API verifies tenant ownership and returns a five-minute presigned S3 PUT URL under a private `quarantine/<organization>/<submission>/<evidence-id>` key.
3. The browser uploads directly to object storage using the signed Content-Type header.
4. The completion endpoint verifies object size and media type, then enqueues a PostgreSQL scan job and returns HTTP 202.
5. A background worker claims jobs with `FOR UPDATE SKIP LOCKED`, computes SHA-256 and scans at most 50 MiB using ClamAV INSTREAM.
6. After a clean verdict, the worker promotes the exact scanned object to a separate private evidence key using an ETag-conditional server-side copy. If the quarantine source changes between read/scan and copy, the conditional copy fails and the job retries.
7. The worker registers immutable evidence metadata and a scan-success audit event only if its processing lease is still current. A stale worker cannot register evidence after another worker has reclaimed its lease.
8. The quarantine object is deleted after successful registration. A later PUT using the still-valid upload URL cannot overwrite the separately promoted evidence object.
9. Authenticated tenant members can request a 60-second presigned download URL only for scan-approved evidence; issuance is audit logged.

## Endpoints

- `POST /api/v1/suppliers/submissions/:submissionId/evidence/upload-intents`
- `POST /api/v1/suppliers/submissions/:submissionId/evidence/:evidenceId/complete`
- `GET /api/v1/suppliers/submissions/:submissionId/evidence/:evidenceId/scan-status`
- `GET /api/v1/suppliers/submissions/:submissionId/evidence/:evidenceId/download`

## Configuration

Set `EVIDENCE_S3_BUCKET`, `EVIDENCE_S3_REGION`, `EVIDENCE_S3_ACCESS_KEY_ID` and `EVIDENCE_S3_SECRET_ACCESS_KEY`. Optionally set `EVIDENCE_S3_ENDPOINT` for an S3-compatible provider. Set `CLAMAV_HOST` and optionally `CLAMAV_PORT` (default 3310). The API fails closed if storage or scanner configuration is missing.

Use a private bucket with public access blocked, TLS enforced, server-side encryption, and a lifecycle rule to expire abandoned `quarantine/` objects. Limit the API identity to the required bucket and object prefixes. The storage identity also needs permission to copy from quarantine into the final evidence prefix and delete quarantine objects. Confirm that the selected S3-compatible provider supports conditional `CopyObject` with `CopySourceIfMatch`; do not assume every compatible provider implements identical conditional-copy semantics.

## Operational limitations

The PostgreSQL-backed queue is durable and supports bounded retries and lease recovery. Each worker buffers at most 50 MiB per active scan; scale worker replicas independently. Failed or abandoned quarantine objects need a bucket lifecycle policy. Existing metadata-only evidence records are not eligible for the S3 download endpoint. Malware scanning is a risk-reduction control, not a guarantee that every file is safe.

The API service and background worker are separate processes. Run the worker entrypoint with `pnpm --filter @carbonledger/api worker` (or the workspace-equivalent command) and provide the same database, private-storage and ClamAV configuration. The worker process handles both webhook delivery and evidence scanning; the webhook worker remains disabled if its encryption key is absent.

## Manual validation

Before accepting real evidence, configure a private test bucket and ClamAV daemon. Test a clean document and the EICAR antivirus test file in a non-production environment; verify that the infected file is rejected and no evidence row is created. Also test that overwriting the original quarantine key after a clean scan does not change the promoted object, and that a source change between scan and promotion fails the conditional copy. Confirm bucket policy, lifecycle expiry, encryption, tenant isolation and audit logging.
