import { GetStaticProps } from "next";
import { ReactElement } from "react";
import getPostData from "@/lib/getPostData";
import styles from "@/styles/Tags.module.css";
import Link from "next/link";
import Head from "next/head";
import humanDate from "@/lib/date";

interface TagPageProps {
	tags: TagCount[],
}

interface TagCount {
	tag: string,
	count: number,
	latest: string,
}

export default function TagPage({ tags }: TagPageProps): ReactElement {
	return <>
		<Head>
			<title>Tags - Conrad Ludgate</title>
			<meta name="description" content="I am Conrad Ludgate, welcome to my blog where I write about code" />
			<meta property="og:title" content="Tags" />
			<meta property="og:site_name" content="Conrad Ludgate" />
			<meta property="og:image" content="https://conradludgate.com/android-icon-192x192.png" />
		</Head>
		<div className={styles.container}>
			<div className={styles.Links}>
				<Link href="/about" prefetch={false}><a>About</a></Link>
				<Link href="/tags" prefetch={false}><a>Tags</a></Link>
				<Link href="/index.xml" prefetch={false}><a>RSS</a></Link>
			</div>
			{tags.map((tag: TagCount, key: number) =>
				<Tag key={key} {...tag} />
			)}
		</div>
	</>;
}

export function Tag({ tag, count, latest }: TagCount): ReactElement {
	return <div className={styles.Tag}>
		<Link prefetch={false} href={`/tags/${tag}`}>
			<a>
				<h2>#{tag}</h2>
				<div className={styles.TagFooter}>
					<time>{humanDate(latest)}</time>
					<span>{count} {count == 1 ? "post" : "posts"}</span>
				</div>
			</a>
		</Link>
	</div>;
}

export const getStaticProps: GetStaticProps = async () => {
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

	return {
		props: {
			tags: tagPosts
		}
	};
};
