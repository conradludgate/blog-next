import getPostData from "@/lib/getPostData";
import { generateRss } from "@/lib/rss";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	const posts = await getPostData();
	const rss = generateRss(posts);
	return new Response(rss, {
		headers: { "Content-Type": "application/xml" },
	});
}
