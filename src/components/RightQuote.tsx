import styles from "./RightQuote.module.css";
import { ReactElement, ReactNode } from "react";

export interface RightQuoteProps {
	children: ReactNode,
}

export default function RightQuote({ children }: RightQuoteProps): ReactElement {
	return <blockquote className={styles.RightQuote}>
		<p>{children}</p>
	</blockquote>;
}
