import Head from "next/head";
import { ReactElement, useEffect, useRef } from "react";
import useBlogPostContentScroll from "../lib/content-scroll";
import { trackEvent } from "../lib/umami";
import styles from "../styles/BlogPost.module.css";

interface Metadata {
	title: string;
	date: string;
	tags?: string[];
}

interface BlogProps {
	children: ReactElement,
	meta: Metadata,
}

const months = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]

export default function BlogPost({ children, meta }: BlogProps): ReactElement {
	// const ref = useRef<HTMLDivElement>(null);
	// const selected = useBlogPostContentScroll(ref, styles);

	// useEffect(() => {
	// 	if (selected)
	// 		trackEvent(`Read section ${selected}`, "blog-post-read-section");
	// }, [selected]);

	let date = new Date(meta.date)
	let dateString = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`

	return <div className={styles.BlogPost}>
		<Head>
			<title>{meta.title}</title>
		</Head>
		<h1>{meta.title}</h1>
		<span>{dateString}</span>
		{children}
	</div>
}
