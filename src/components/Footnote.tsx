import styles from "@/styles/Footnote.module.css";
import { ReactElement, ReactNodeArray } from "react";

export interface FootnoteProps {
	tag: string,
	children: ReactNodeArray,
}

export default function Footnote({ tag, children }: FootnoteProps): ReactElement {
	if (!children) {
		return <a href={`#footnote-${tag}`} className={styles.Footnote}>{tag}</a>;
	}
	return (
		<span id={`#footnote-${tag}`} className={styles.Footnote}>[{tag}] {children}</span>
	);
}
