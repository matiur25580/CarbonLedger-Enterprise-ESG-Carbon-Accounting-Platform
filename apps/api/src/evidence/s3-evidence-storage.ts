import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
function storage() {
  if (!env.EVIDENCE_S3_BUCKET || !env.EVIDENCE_S3_REGION || !env.EVIDENCE_S3_ACCESS_KEY_ID || !env.EVIDENCE_S3_SECRET_ACCESS_KEY) throw new Error("Private evidence storage is not configured");
  return { bucket: env.EVIDENCE_S3_BUCKET, client: new S3Client({ region: env.EVIDENCE_S3_REGION, endpoint: env.EVIDENCE_S3_ENDPOINT || undefined, forcePathStyle: !!env.EVIDENCE_S3_ENDPOINT, credentials: { accessKeyId: env.EVIDENCE_S3_ACCESS_KEY_ID, secretAccessKey: env.EVIDENCE_S3_SECRET_ACCESS_KEY } }) };
}
export async function createEvidenceUploadUrl(key: string, mediaType: string, byteSize: number) {
  const { bucket, client } = storage();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mediaType, ContentLength: byteSize }), { expiresIn: 300 });
}
export async function inspectEvidenceObject(key: string) {
  const { bucket, client } = storage();
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { byteSize: result.ContentLength ?? 0, mediaType: result.ContentType ?? "application/octet-stream", etag: result.ETag ?? null };
}
export async function readEvidenceObject(key: string): Promise<{ bytes: Buffer; etag: string }> {
  const { bucket, client } = storage();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body || !result.ETag) throw new Error("Evidence object body or ETag is unavailable");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    const part = Buffer.from(chunk); size += part.length;
    if (size > 52_428_800) throw new Error("Evidence exceeds the 50 MiB limit");
    chunks.push(part);
  }
  return { bytes: Buffer.concat(chunks), etag: result.ETag };
}
export async function promoteScannedEvidenceObject(sourceKey: string, destinationKey: string, sourceEtag: string): Promise<void> {
  const { bucket, client } = storage();
  await client.send(new CopyObjectCommand({ Bucket: bucket, Key: destinationKey, CopySource: `/${bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`, CopySourceIfMatch: sourceEtag, MetadataDirective: "COPY" }));
}
export async function createEvidenceDownloadUrl(key: string) {
  const { bucket, client } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 });
}
export async function deleteEvidenceObject(key: string): Promise<void> {
  const { bucket, client } = storage(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
