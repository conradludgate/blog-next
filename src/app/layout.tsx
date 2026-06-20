import "@/styles/globals.scss";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import styles from "@/styles/App.module.css";

export const metadata: Metadata = {
	title: "Conrad Ludgate",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en-GB">
			<body>
				<div className={styles.App}>
					<header>
						<Link href="/" prefetch={false}>Conrad Ludgate</Link>
					</header>
					<div className={styles.Content}>
						{children}
					</div>
				</div>
			</body>
		</html>
	);
}
