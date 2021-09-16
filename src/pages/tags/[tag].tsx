import { GetStaticPaths, GetStaticProps } from "next";
import { ReactElement } from "react";
import { ParsedUrlQuery } from "querystring";
import getPostData, { PostData }  from "@/lib/getPostData";
import { Post } from "..";
import styles from "@/styles/Home.module.css";
import { generateRss } from "@/lib/rss";
import Link from "next/link";
import Head from "next/head";

export interface TaggedPosts {
	tag: string;
	posts: PostData[];
}

export default function TagPage({ tag, posts }: TaggedPosts): ReactElement {
	return <>
		<Head>
			<title>#{tag} - Conrad Ludgate</title>
			<meta name="description" content="I am Conrad Ludgate, welcome to my blog where I write about code" />
			<meta property="og:title" content={`#${tag}`} />
			<meta property="og:site_name" content="Conrad Ludgate" />
			<meta property="og:image" content="https://conradludgate.com/android-icon-192x192.png" />
		</Head>
		<div className={styles.container}>
			<div className={styles.Links}>
				<Link href="/about" prefetch={false}><a>About</a></Link>
				<Link href="/tags" prefetch={false}><a>Tags</a></Link>
				<Link href={`/tags/${tag}/index.xml`} prefetch={false}><a>RSS</a></Link>
			</div>
			{posts.map((post, key) =>
				<Post key={key} {...post} tags={[]} />
			)}
		</div>
	</>;
}

interface Params extends ParsedUrlQuery {
	tag: string,
}

export const getStaticProps: GetStaticProps<TaggedPosts, Params> = async function ({ params }) {
	const tag = params?.tag;
	if (!tag) {
		return { notFound: true };
	}

	const posts = await getPostData();
	const filtered = posts.filter((post) => {
		return post.tags.includes(tag);
	});

	const rss = await generateRss(filtered);
	const { writeFile, mkdir } = await import("fs/promises");
	await mkdir(`./public/tags/${tag}`, { recursive: true });
	await writeFile(`./public/tags/${tag}/index.xml`, rss);

	return {
		props: {
			tag,
			posts: filtered,
		}
	};
};

export const getStaticPaths: GetStaticPaths<Params> = async function () {
	const posts = await getPostData();
	const tags: Record<string, true> = {};
	posts.forEach((post) => {
		post.tags.forEach((tag) => {
			tags[tag] = true;
		});
	});

	return {
		paths: Object.keys(tags).map((tag) => ({
			params: {
				tag,
			},
		})),
		fallback: false,
	};
};
