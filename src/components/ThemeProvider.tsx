"use client";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export default function ThemeProvider({ children }: { children: ReactNode }) {
	return (
		<NextThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
			{children}
		</NextThemeProvider>
	);
}
