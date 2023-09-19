import styles from "./Heading.module.css";
import React, { FunctionComponent, ReactElement, ReactNode } from "react";

export interface HeadingProps {
	id?: string,
	type: FunctionComponent<{ id?: string, className: string, children?: ReactNode }>,
	children?: ReactNode,
}

export default function Heading({ id, type: Header, children }: HeadingProps): ReactElement {
	return <Header id={id} className={styles.Heading}>{children} <a href={`#${id}`} aria-hidden>¶</a></Header>;
}
