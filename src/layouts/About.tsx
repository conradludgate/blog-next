import { ReactElement } from "react";
import styles from "@/styles/BlogPost.module.css";

interface AboutProps {
	children: ReactElement,
}

export default function About({ children }: AboutProps): ReactElement {
	return <div className={styles.BlogPost}>
		<div>
			{children}
		</div>
	</div>;
}
