import Head from "next/head";
import { ReactElement, useEffect, useRef } from "react";
import humanDate from "../lib/date";
import { PostData } from "../lib/getPostData";
import styles from "../styles/BlogPost.module.css";

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
			<span>{humanDate(meta.date)}</span>
			{children}
		</div>
	</div>
}
