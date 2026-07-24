/**
 * P1-MOD-10: object storage (S3/MinIO) for student documents. The API never
 * proxies file bytes — it hands out short-lived presigned PUT/GET URLs and the
 * browser talks to storage directly. Only metadata + verification state live
 * in Postgres. Tenant isolation is enforced by the object key prefix
 * (tenants/<tenantId>/…) plus RLS on the metadata table.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true, // required for MinIO
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }
  return s3;
}

let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const c = client();
      try {
        await c.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      } catch {
        await c.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET })).catch(() => undefined);
      }
    })();
  }
  return bucketReady;
}

const EXPIRES = 300; // 5 minutes

export async function presignUpload(key: string): Promise<string> {
  await ensureBucket();
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: EXPIRES,
  });
}

export async function presignDownload(key: string, downloadName?: string): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ...(downloadName
        ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` }
        : {}),
    }),
    { expiresIn: EXPIRES },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await client()
    .send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
    .catch(() => undefined);
}

/** Build a tenant-namespaced object key; the file name is sanitized. */
export function buildStorageKey(
  tenantId: string,
  studentId: string,
  id: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^\w.-]+/g, '_').slice(-80);
  return `tenants/${tenantId}/students/${studentId}/${id}-${safe}`;
}
