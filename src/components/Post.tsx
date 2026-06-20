import Link from "next/link";
import { ReactElement } from "react";
import humanDate from "@/lib/date";
import { PostData } from "@/lib/getPostData";
import styles from "@/styles/Home.module.css";

export default function Post({ path, title, date, tags, desc }: PostData): ReactElement {
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
