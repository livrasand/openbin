import type { APIContext } from 'astro';

export async function GET({ params }: APIContext): Promise<Response> {
  const cid = params.cid;
  if (typeof cid !== 'string' || cid.length < 10) {
    return new Response('Invalid CID', { status: 400 });
  }

  if (!/^[a-zA-Z0-9]+$/.test(cid)) {
    return new Response('Invalid CID', { status: 400 });
  }

  return Response.redirect(`https://ipfs.filebase.io/ipfs/${cid}`, 302);
}
