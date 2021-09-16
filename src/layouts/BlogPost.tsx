import Head from "next/head";
import Link from "next/link";
import { ReactElement } from "react";
import humanDate from "@/lib/date";
import { PostData } from "@/lib/getPostData";
import styles from "@/styles/BlogPost.module.css";

interface BlogProps {
	children: ReactElement,
	meta: PostData,
}

export default function BlogPost({ children, meta }: BlogProps): ReactElement {
	return <div className={styles.BlogPost}>
		<Head>
			<title>{meta.title}</title>
		</Head>
		<div>
			<h1>{meta.title}</h1>
			<time>{humanDate(meta.date)}</time>
			{children}
			<footer className={styles.Footer}>
				{meta.tags.map((tag, key) => {
					return <Link key={key} href={"/tags/" + tag}><a>#{tag}</a></Link>
				})}
			</footer>
		</div>
	</div>
}
