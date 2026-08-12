import type { APIContext } from 'astro';
import { marked } from 'marked';
import { findBlog, getBlogPosts, validateBlogName } from '../../../lib/blogs';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateBlogName(name)) {
      return new Response('Invalid blog name', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    const blog = await findBlog(name);
    if (!blog) {
      return new Response('Blog not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    const posts = await getBlogPosts(name, undefined, 20);
    const baseUrl = context.url.origin;
    const blogUrl = `${baseUrl}/blog/${encodeURIComponent(name)}`;
    const feedUrl = `${blogUrl}/rss`;

    const itemsXml = await Promise.all(
      posts.map(async (post) => {
        const postUrl = `${baseUrl}/blog/${encodeURIComponent(name)}/posts/${post.id}`;
        const html = await marked.parse(post.content || '');
        const pubDate = new Date(post.created_at).toUTCString();
        return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(postUrl)}</link>
  <pubDate>${escapeXml(pubDate)}</pubDate>
  <description><![CDATA[${html}]]></description>
  <author>${escapeXml(post.author)}</author>
</item>`;
      })
    );

    const channelTitle = escapeXml(blog.title || blog.name);
    const channelDescription = escapeXml(blog.description || `RSS feed for ${blog.name}`);

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${escapeXml(blogUrl)}</link>
    <description>${channelDescription}</description>
    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    ${itemsXml.join('\n')}
  </channel>
</rss>`;

    return new Response(rss, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  } catch (error: unknown) {
    console.error('Blog RSS error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(message, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
