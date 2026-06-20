import getPostData from "@/lib/getPostData";
import { generateRss } from "@/lib/rss";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
	const posts = await getPostData();
	const tags = new Set(posts.flatMap((post) => post.tags));
	return [...tags].map((tag) => ({ tag }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ tag: string }> },
): Promise<Response> {
	const { tag } = await params;
	const posts = (await getPostData()).filter((post) => post.tags.includes(tag));
	const rss = generateRss(posts);
	return new Response(rss, {
		headers: { "Content-Type": "application/xml" },
	});
}
