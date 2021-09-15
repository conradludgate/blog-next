import '../styles/globals.scss'
import Head from "next/head";
import { AppProps } from "next/app";
import { useRouter } from 'next/router'
import { ReactElement, useEffect } from "react";
import Header from '../components/Header';
import styles from '../styles/App.module.css';
import { trackView } from '../lib/umami';
import { ThemeProvider } from 'next-themes';

export default function App({ Component, pageProps }: AppProps): ReactElement {
	const router = useRouter();
	useEffect(() => {
		trackView();
		const handleRouteChange = (url: string) => {
			const {
				location: { pathname, search },
			} = window;
			let currentUrl = `${pathname}${search}`;
			trackView(url, currentUrl)
		}
		router.events.on('beforeHistoryChange', handleRouteChange)
		return () => { router.events.off('beforeHistoryChange', handleRouteChange) }
	}, [])

	return <div className={styles.App}>
		<Head>
		</Head>
		<div className={styles.Content}>
			<Component {...pageProps} />
		</div>
	</div>
}
