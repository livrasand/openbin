# openbin

Lightweight Pastebin/CDN deployed on Vercel. Files are stored on IPFS through [Filebase](https://filebase.com) and only metadata is kept in a minimal database.

## Features

- **Anonymous upload** to IPFS via the Filebase S3 API.
- **Global deduplication** by SHA-256 hash: if a file already exists, the same CID and slug are returned.
- **Minimal database** (Vercel Postgres) storing slug, CID, name, MIME and size.
- **Rate limiting** by IP with Vercel KV.
- **Friendly URLs**: `https://openbin.livrasand.com/f/<slug>`.
- **Direct IPFS link**: `https://ipfs.filebase.io/ipfs/<cid>`.

## Stack

- [Astro 5](https://astro.build/) with SSR and the Vercel adapter.
- [React](https://react.dev/) for the upload form.
- [Tailwind CSS](https://tailwindcss.com/) for styling.
- [Vercel Postgres](https://vercel.com/storage/postgres) for metadata.
- [Vercel KV](https://vercel.com/storage/kv) for rate limiting.
- [Filebase S3 API](https://docs.filebase.com/code-development-+-sdks/sdk-examples-pinning-files-and-folders-to-ipfs/aws-sdk-for-javascript) for IPFS.

## Environment variables

Create a `.env` file based on `.env.example`:

```bash
# Filebase S3
FILEBASE_ACCESS_KEY=your_access_key
FILEBASE_SECRET_KEY=your_secret_key
FILEBASE_BUCKET=your_bucket
FILEBASE_ENDPOINT=https://s3.filebase.com   # optional, default for IPFS
FILEBASE_REGION=us-east-1                   # optional

# Vercel Postgres
POSTGRES_URL=postgres://...

# Vercel KV (rate limiting)
KV_URL=https://...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...

# Optional
UPLOAD_MAX_SIZE=5242880        # 5 MB
UPLOAD_RATE_LIMIT=10           # uploads per window
UPLOAD_RATE_WINDOW=3600        # window in seconds (1 hour)
PUBLIC_APP_URL=https://openbin.livrasand.com
```

## Initial setup

1. Create a Vercel Postgres database and a KV store in the Vercel dashboard.
2. Create an IPFS bucket in Filebase and generate S3 credentials.
3. Run the database setup script:

```bash
npm run db:setup
```

Or create the table manually with:

```sql
CREATE TABLE files (
  slug VARCHAR(12) PRIMARY KEY,
  sha256 CHAR(64) UNIQUE NOT NULL,
  cid VARCHAR(128) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_files_sha256 ON files(sha256);
```

## Development

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Deploy on Vercel

```bash
npm run build
```

Connect the repository to Vercel and configure the environment variables in the dashboard.

## Endpoints

| Method | Route                    | Description                                          |
|--------|--------------------------|------------------------------------------------------|
| `GET`  | `/`                      | Main page with the upload form.                      |
| `POST` | `/api/upload`            | Upload a file (`multipart/form-data`, field `file`). |
| `GET`  | `/f/<slug>`              | Serves the file content (IPFS-backed).               |
| `GET`  | `/ipfs/<cid>`            | Redirects to the Filebase gateway.                   |
| `GET`  | `/api/files/<slug>.json` | Returns file metadata.                               |

## Upload response

```json
{
  "slug": "abc123",
  "cid": "bafybeihxk3...",
  "filename": "hello.js",
  "mime": "application/javascript",
  "size": 1024,
  "url": "https://openbin.livrasand.com/f/abc123",
  "directUrl": "https://ipfs.filebase.io/ipfs/bafybeihxk3..."
}
```

## Deduplication

If two users upload the exact same file, the SHA-256 matches and the second one receives the same CID and slug without re-uploading anything to Filebase.

## Notes

- Maximum file size is configurable with `UPLOAD_MAX_SIZE` (bytes).
- Rate limiting is optional: if you don't configure Vercel KV, it is disabled with a console warning.
- The Postgres schema is created automatically on the first request if it doesn't exist, or you can use `npm run db:setup`.
