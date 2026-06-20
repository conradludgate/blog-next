import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, getPostFiles } from "@/lib/getPostData";

export const dynamicParams = false;

export async function generateStaticParams() {
	const files = await getPostFiles();
	return files.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await params;
	const post = await getPost(slug);
	if (!post) {
		return {};
	}
	const { meta } = post;
	return {
		title: meta.title,
		description: meta.desc,
		openGraph: {
			title: meta.title,
			description: meta.desc,
			siteName: "Conrad Ludgate",
			type: "article",
			publishedTime: meta.date,
			tags: meta.tags,
			images: [meta.imageURL ?? "https://conradludgate.com/android-icon-192x192.png"],
		},
	};
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const post = await getPost(slug);
	if (!post) {
		notFound();
	}
	const { default: Content } = post;
	return <Content />;
}
