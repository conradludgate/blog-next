import { PostData } from "./getPostData";

export async function generateRssItem(post: PostData): Promise<string> {
	return `
    <item>
      <guid>https://conradludgate.com${post.path}</guid>
      <title>${post.title}</title>
      <description>${post.desc}</description>
      <link>https://conradludgate.com${post.path}</link>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    </item>
`;
}

export async function generateRss(posts: PostData[]): Promise<string> {
	const itemsList = await Promise.all(posts.map(generateRssItem));

	return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Conrad Ludgate</title>
    <link>https://conradludgate.com/</link>
    <description>Ramblings from Conrad Ludgate</description>
    <language>en</language>
    <lastBuildDate>${new Date(posts[0].date).toUTCString()}</lastBuildDate>
    <atom:link href="https://conradludgate.com/index.xml" rel="self" type="application/rss+xml"/>
    ${itemsList.join("")}
  </channel>
</rss>`;
}
