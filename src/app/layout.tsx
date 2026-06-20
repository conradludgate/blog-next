import "@/styles/globals.scss";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import styles from "@/styles/App.module.css";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export const metadata: Metadata = {
	title: "Conrad Ludgate",
};

// Runs before paint to set the theme from a saved choice or the OS preference,
// avoiding a flash of the wrong theme on first load.
const themeScript = "(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en-GB" suppressHydrationWarning>
			<body>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				<div className={styles.App}>
					<header>
						<Link href="/" prefetch={false}>Conrad Ludgate</Link>
						<ThemeSwitcher />
					</header>
					<div className={styles.Content}>
						{children}
					</div>
				</div>
			</body>
		</html>
	);
}
