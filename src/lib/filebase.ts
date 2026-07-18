import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
