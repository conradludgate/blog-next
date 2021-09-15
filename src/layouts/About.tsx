import Head from "next/head";
import { ReactElement } from "react";
import humanDate from "../lib/date";
import styles from "../styles/BlogPost.module.css";

interface AboutProps {
	children: ReactElement,
}

export default function About({ children }: AboutProps): ReactElement {
	return <div className={styles.BlogPost}>
		<Head>
			<title>About</title>
		</Head>
		<div>
			{children}
		</div>
	</div>
}
