import '../styles/globals.scss'
import Head from "next/head";
import { AppProps } from "next/app";
// import { useRouter } from 'next/router'
import Link from 'next/link'
import { ReactElement } from "react";
import styles from '../styles/App.module.css';
// import { trackView } from '../lib/umami';

export default function App({ Component, pageProps }: AppProps): ReactElement {
	// const router = useRouter();
	// useEffect(() => {
	// 	trackView();
	// 	const handleRouteChange = (url: string) => {
	// 		const {
	// 			location: { pathname, search },
	// 		} = window;
	// 		let currentUrl = `${pathname}${search}`;
	// 		trackView(url, currentUrl)
	// 	}
	// 	router.events.on('beforeHistoryChange', handleRouteChange)
	// 	return () => { router.events.off('beforeHistoryChange', handleRouteChange) }
	// }, [router.events])

	return <div className={styles.App}>
		<Head>
		</Head>
		<header>
			<Link href="/" prefetch={false}><a>Conrad Ludgate</a></Link>
		</header>
		<div className={styles.Content}>
			<Component {...pageProps} />
		</div>
	</div>
}
