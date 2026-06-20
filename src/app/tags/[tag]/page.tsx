import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import getPostData from "@/lib/getPostData";
import Post from "@/components/Post";
import styles from "@/styles/Home.module.css";

export const dynamicParams = false;

export async function generateStaticParams() {
	const posts = await getPostData();
	const tags = new Set(posts.flatMap((post) => post.tags));
	return [...tags].map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
	const { tag } = await params;
	return {
		title: `#${tag} - Conrad Ludgate`,
		description: "I am Conrad Ludgate, welcome to my blog where I write about code",
		openGraph: {
			title: `#${tag}`,
			siteName: "Conrad Ludgate",
			images: ["https://conradludgate.com/android-icon-192x192.png"],
		},
	};
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
	const { tag } = await params;
	const posts = (await getPostData()).filter((post) => post.tags.includes(tag));
	if (!posts.length) {
		notFound();
	}
	return (
		<div className={styles.container}>
			<div className={styles.Links}>
				<Link href="/about" prefetch={false}>About</Link>
				<Link href="/tags" prefetch={false}>Tags</Link>
				<Link href={`/tags/${tag}/index.xml`} prefetch={false}>RSS</Link>
			</div>
			{posts.map((post) => <Post key={post.path} {...post} tags={[]} />)}
		</div>
	);
}
