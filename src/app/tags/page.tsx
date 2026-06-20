import type { Metadata } from "next";
import Link from "next/link";
import getPostData from "@/lib/getPostData";
import humanDate from "@/lib/date";
import styles from "@/styles/Tags.module.css";

export const metadata: Metadata = {
	title: "Tags - Conrad Ludgate",
	description: "I am Conrad Ludgate, welcome to my blog where I write about code",
	openGraph: {
		title: "Tags",
		siteName: "Conrad Ludgate",
		images: ["https://conradludgate.com/android-icon-192x192.png"],
	},
};

interface TagCount {
	tag: string;
	count: number;
	latest: string;
}

export default async function TagsPage() {
	const posts = await getPostData();
	const tags: Record<string, { count: number, latest: string }> = {};
	posts.forEach((post) => {
		post.tags.forEach((tag) => {
			if (!tags[tag]) {
				tags[tag] = {
					count: 1,
					latest: post.date,
				};
			} else {
				const latest = tags[tag].latest > post.date ? tags[tag].latest : post.date;
				tags[tag] = {
					count: tags[tag].count + 1,
					latest: latest,
				};
			}
		});
	});

	const tagPosts = Object.entries(tags).map(([tag, { count, latest }]) => ({ tag, count, latest }));
	tagPosts.sort((a, b) => {
		if (a.count != b.count) {
			return b.count - a.count;
		}
		return b.latest > a.latest ? 1 :
			b.latest == a.latest ? 0 : -1;
	});

	return (
		<div className={styles.container}>
			<div className={styles.Links}>
				<Link href="/about" prefetch={false}>About</Link>
				<Link href="/tags" prefetch={false}>Tags</Link>
				<Link href="/index.xml" prefetch={false}>RSS</Link>
			</div>
			{tagPosts.map((tag) => <Tag key={tag.tag} {...tag} />)}
		</div>
	);
}

function Tag({ tag, count, latest }: TagCount) {
	return (
		<div className={styles.Tag}>
			<Link prefetch={false} href={`/tags/${tag}`}>
				<>
					<h2>#{tag}</h2>
					<div className={styles.TagFooter}>
						<time>{humanDate(latest)}</time>
						<span>{count} {count == 1 ? "post" : "posts"}</span>
					</div>
				</>
			</Link>
		</div>
	);
}
