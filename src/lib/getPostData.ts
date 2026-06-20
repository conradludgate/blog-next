import { promises as fs } from "fs";

export interface PostData {
	path: string;
	title: string;
	date: string;
	tags: string[];
	desc: string;
	imageURL?: string;
	// When true, the post is omitted from all listings and feeds (home, tags,
	// RSS) but its /posts/... page is still generated and reachable directly.
	hidden?: boolean;
}

export default async function getPostData(): Promise<PostData[]> {
	const pages = await fs.readdir("src/pages/posts/");

	const postData = await Promise.all(pages.map(async (page) => {
		const file = page.endsWith(".mdx") ? page : page + "/index.mdx";
		const id = page.split(".mdx")[0];

		const { meta } = await import(`../pages/posts/${file}`);

		return {
			path: "/posts/" + id,
			...meta,
		};
	}));

	const visible = postData.filter((post) => !post.hidden);

	visible.sort((a, b) => {
		return a.date > b.date ? -1 : 1;
	});

	return visible;
}
