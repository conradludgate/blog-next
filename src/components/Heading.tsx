import styles from "./Heading.module.css";
import React, { FunctionComponent, ReactElement } from "react";

export interface HeadingProps {
	id: string,
	type: FunctionComponent<any>,
	children: ReactElement,
}

export default function Heading({ id, type: Header, children }: HeadingProps): ReactElement {
	// console.log({id, type, children});
	return <Header id={id} className={styles.Heading}>{children} <a href={`#${id}`} aria-hidden>¶</a></Header>;
}
