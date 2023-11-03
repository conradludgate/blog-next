import styles from "@/styles/Home.module.css";
import Link from "next/link";
import Head from "next/head";
import { GetStaticProps } from "next";
import getPostData, { PostData } from "@/lib/getPostData";
import humanDate from "@/lib/date";
import { generateRss } from "@/lib/rss";
import { ReactElement } from "react";

export interface Posts {
	posts: PostData[];
}

export default function Home({ posts }: Posts): ReactElement {
	return <>
		<Head>
			<title>Conrad Ludgate</title>
			<meta name="description" content="I am Conrad Ludgate, welcome to my blog where I write about code" />
			<meta property="og:description" content="I am Conrad Ludgate, welcome to my blog where I write about code" />
			<meta property="og:site_name" content="Conrad Ludgate" />
			<meta property="og:image" content="https://conradludgate.com/android-icon-192x192.png" />
		</Head>
		<a href="https://social.conrad.cafe/@conrad" rel="me" hidden></a>
		<div className={styles.container}>
			<div className={styles.Links}>
				<Link href="/about" prefetch={false}>About</Link>
				<Link href="/tags" prefetch={false}>Tags</Link>
				<Link href="index.xml" prefetch={false}>RSS</Link>
			</div>
			{posts.map((post: PostData, key: number) =>
				<Post key={key} {...post} />
			)}
		</div>
	</>;
}

export function Post({ path, title, date, tags, desc }: PostData): ReactElement {
	return (
		<div className={styles.Post}>
			<Link prefetch={false} href={path}>
				<>
					<h2>{title}</h2>
					<p>{desc}</p>
				</>
			</Link>
			<div className={styles.PostFooter}>
				<time>{humanDate(date)}</time>
				<div className={styles.PostFooterTags}>
					{tags.map((tag, key) =>
						<Link prefetch={false} key={key} href={"/tags/" + tag}>{`#${tag}`}</Link>
					)}
				</div>
			</div>
		</div>
	);
}

export const getStaticProps: GetStaticProps = async () => {
	const postData = await getPostData();

	const rss = await generateRss(postData);
	const { writeFile } = await import("fs/promises");
	await writeFile("./public/index.xml", rss);

	return {
		props: {
			posts: postData,
		},
	};
};
