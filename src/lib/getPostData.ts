import { promises as fs } from "fs";
import type { ComponentType } from "react";

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

interface PostFile {
	slug: string;
	file: string;
}

interface PostModule {
	default: ComponentType;
	meta: Omit<PostData, "path">;
}

// Posts live in src/posts as either `<slug>.mdx` or `<slug>/index.mdx` (the
// directory form is used when a post has co-located images).
export async function getPostFiles(): Promise<PostFile[]> {
	const entries = await fs.readdir("src/posts/");
	return entries.map((entry) => ({
		slug: entry.replace(/\.mdx$/, ""),
		file: entry.endsWith(".mdx") ? entry : `${entry}/index.mdx`,
	}));
}

// Imports a single post module (its MDX component + meta) by slug. Returns null
// for an unknown slug. Hidden posts are still returned so their page renders.
export async function getPost(slug: string): Promise<PostModule | null> {
	const files = await getPostFiles();
	const match = files.find((f) => f.slug === slug);
	if (!match) {
		return null;
	}
	return import(`../posts/${match.file}`) as unknown as Promise<PostModule>;
}

export default async function getPostData(): Promise<PostData[]> {
	const files = await getPostFiles();

	const postData = await Promise.all(files.map(async ({ slug, file }) => {
		const { meta } = await import(`../posts/${file}`) as unknown as PostModule;

		return {
			path: "/posts/" + slug,
			...meta,
		};
	}));

	const visible = postData.filter((post) => !post.hidden);

	visible.sort((a, b) => {
		return a.date > b.date ? -1 : 1;
	});

	return visible;
}
