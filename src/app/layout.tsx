import "@/styles/globals.scss";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import styles from "@/styles/App.module.css";
import { ThemeProvider } from "next-themes";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export const metadata: Metadata = {
	title: "Conrad Ludgate",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en-GB" suppressHydrationWarning>
			<body>
				{/* The toggle needs JS; hide it when JS is unavailable (the page
				    still follows the OS theme via prefers-color-scheme). */}
				<noscript>
					<style>{"[data-theme-switcher]{display:none}"}</style>
				</noscript>
				<ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
					<div className={styles.App}>
						<header>
							<Link href="/" prefetch={false}>Conrad Ludgate</Link>
							<ThemeSwitcher />
						</header>
						<div className={styles.Content}>
							{children}
						</div>
					</div>
				</ThemeProvider>
			</body>
		</html>
	);
}
