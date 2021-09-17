import styles from "./Footnote.module.css";
import { ReactElement, ReactChildren, ReactNode } from "react";

export interface FootnoteProps {
	tag: string,
	children: ReactNode,
}

export default function Footnote({ tag, children }: FootnoteProps): ReactElement {
	if (!children) {
		return <a href={`#footnote-${tag}`} className={styles.Footnote}><sup>{tag}</sup></a>;
	}
	return (
		<span id={`#footnote-${tag}`} className={styles.Footnote}>[{tag}] {children}</span>
	);
}
