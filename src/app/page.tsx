import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/styles/Home.module.css";
import getPostData from "@/lib/getPostData";
import Post from "@/components/Post";

export const metadata: Metadata = {
	title: "Conrad Ludgate",
	description: "I am Conrad Ludgate, welcome to my blog where I write about code",
	openGraph: {
		description: "I am Conrad Ludgate, welcome to my blog where I write about code",
		siteName: "Conrad Ludgate",
		images: ["https://conradludgate.com/android-icon-192x192.png"],
	},
};

export default async function Home() {
	const posts = await getPostData();
	return (
		<>
			<a href="https://social.conrad.cafe/@conrad" rel="me" hidden></a>
			<div className={styles.container}>
				<div className={styles.Links}>
					<Link href="/about" prefetch={false}>About</Link>
					<Link href="/tags" prefetch={false}>Tags</Link>
					<Link href="index.xml" prefetch={false}>RSS</Link>
				</div>
				{posts.map((post) =>
					<Post key={post.path} {...post} />
				)}
			</div>
		</>
	);
}
