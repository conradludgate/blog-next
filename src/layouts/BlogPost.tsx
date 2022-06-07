import Head from "next/head";
import Link from "next/link";
import React, { ReactElement } from "react";
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
			<meta name="description" content={meta.desc} />
			<meta property="og:title" content={meta.title} />
			<meta property="og:description" content={meta.desc} />
			<meta property="og:site_name" content="Conrad Ludgate" />
			<meta property="og:type" content="article" />
			<meta property="og:article:published_time" content={meta.date} />
			{meta.tags.map((tag, key) => <meta key={key} property="og:article:tag" content={tag} />)}
			{meta.imageURL && <meta property="og:image" content={meta.imageURL} />}
		</Head>
		<div>
			<h1>{meta.title}</h1>
			<time>{humanDate(meta.date)}</time>
			{children}
			<footer className={styles.Footer}>
				<div className={styles.Tags}>
					{meta.tags.map((tag, key) =>
						<Link key={key} href={"/tags/" + tag}><a>#{tag}</a></Link>
					)}
				</div>
				<span>
					All text <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC-BY-SA</a> &amp; code <a href="https://mit-license.org/">MIT</a>
				</span>
			</footer>
		</div>
	</div>;
}
