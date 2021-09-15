import { ReactElement } from "react";
import Link from "next/link";
import styles from "../styles/Header.module.css";
import ThemeButton from "./ThemeButton";

export default function Header(): ReactElement {
	return <div className={styles.Header}>
		<ThemeButton />
		<Link href="/"><a>Home</a></Link>
	</div>
}
