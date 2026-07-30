import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request } = context;

  const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]{3,64})$/);
  if (match && request.method === 'GET') {
    const accept = request.headers.get('accept') || '';
    // Browser navigation requests include text/html; API polling uses */* or application/json
    if (accept.includes('text/html') || accept === '') {
      return context.rewrite(`/spaces/${match[1]}`);
    }
  }

  return next();
});
