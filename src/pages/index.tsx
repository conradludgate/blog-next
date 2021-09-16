import styles from "@/styles/Home.module.css";
import Link from "next/link";
import { GetStaticProps } from "next";
import getPostData, { PostData } from "@/lib/getPostData";
import humanDate from "@/lib/date";
import { generateRss } from "@/lib/rss";
import { ReactElement } from "react";

export interface Posts {
	posts: PostData[];
}

export default function Home({ posts }: Posts): ReactElement {
	return (
		<div className={styles.container}>
			<div className={styles.Links}>
				<Link href="/about" prefetch={false}><a>About</a></Link>
				<Link href="/tags" prefetch={false}><a>Tags</a></Link>
				<Link href="index.xml" prefetch={false}><a>RSS</a></Link>
			</div>
			{posts.map((post: PostData, key: number) =>
				<Post key={key} {...post} />
			)}
		</div>
	);
}

export function Post({ path, title, date, tags, desc }: PostData): ReactElement {
	return <div className={styles.Post}>
		<Link prefetch={false} href={path}>
			<a>
				<h2>{title}</h2>
				<p>{desc}</p>
				<div className={styles.PostFooter}>
					<time>{humanDate(date)}</time>
					<div className={styles.PostFooterTags}>
						{tags.map((tag, key) =>
							<Link prefetch={false} key={key} href={"/tags/" + tag}><a>#{tag}</a></Link>
						)}
					</div>
				</div>
			</a>
		</Link>
	</div>;
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
