import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getS3Client(): S3Client {
  const accessKeyId = process.env.FILEBASE_ACCESS_KEY;
  const secretAccessKey = process.env.FILEBASE_SECRET_KEY;
  const endpoint = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.com';
  const region = process.env.FILEBASE_REGION || 'us-east-1';
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing Filebase credentials');
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function getBucket(): string {
  const bucket = process.env.FILEBASE_BUCKET;
  if (!bucket) {
    throw new Error('Missing the FILEBASE_BUCKET environment variable');
  }
  return bucket;
}

function extractCid(metadata: Record<string, string>): string | undefined {
  const candidates = ['cid', 'x-amz-meta-cid', 'x-amz-meta-CID', 'CID'];
  for (const key of candidates) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }

  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if ((lower === 'cid' || lower === 'x-amz-meta-cid') && typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export async function downloadFromFilebase(hash: string): Promise<Buffer> {
  const client = getS3Client();
  const bucket = getBucket();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: hash }));
  if (!response.Body) throw new Error('Filebase returned an empty object');
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function uploadToFilebase(
  hash: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: hash,
      Body: buffer,
      ContentType: contentType,
      Metadata: { source: 'openbin' },
    })
  );

  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: hash,
    })
  );

  const cid = extractCid(head.Metadata ?? {});
  if (!cid) {
    throw new Error('Could not get the CID from Filebase');
  }

  return cid;
}

export async function deleteFromFilebase(hash: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: hash }));
}

// createPresignedPutUrl genera una URL firmada para subir un objeto directo a
// Filebase (S3) sin pasar por la función serverless. La key es el sha256 del
// contenido: así la subida es idempotente y deduplicable por objeto.
export async function createPresignedPutUrl(
  hash: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: hash,
      ContentType: contentType,
      Metadata: { source: 'gitgost' },
    }),
    { expiresIn: expiresInSeconds }
  );
}

// createPresignedGetUrl genera una URL firmada de lectura (soporta Range
// Requests nativamente en S3) para descargas resilientes con resume por bytes.
export async function createPresignedGetUrl(hash: string, expiresInSeconds = 86400): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: hash }),
    { expiresIn: expiresInSeconds }
  );
}

// getObjectInfo devuelve el CID IPFS y el tamaño de un objeto ya subido.
export async function getObjectInfo(hash: string): Promise<{ cid: string | null; size: number | null }> {
  const client = getS3Client();
  const bucket = getBucket();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: hash }));
  const size = head.ContentLength ?? null;
  return { cid: extractCid(head.Metadata ?? {}) ?? null, size: size !== null ? Number(size) : null };
}
