import "@/styles/globals.scss";
import { AppProps } from "next/app";
import { useRouter } from "next/router";
import Link from "next/link";
import React, { ReactElement, useEffect } from "react";
import styles from "@/styles/App.module.css";
import { trackView } from "@/lib/umami";
import About from "@/layouts/About";
import BlogPost from "@/layouts/BlogPost";
import { MDXProvider, MDXProviderComponentsProp } from "@mdx-js/react";
import Heading from "@/components/Heading";

const components: MDXProviderComponentsProp = {
	wrapper: (props) => {
		switch (props.meta.layout) {
		case "about":
			return <About {...props} />;
		default:
			return <BlogPost {...props} />;
		}
	},
	h1: (props) => <Heading {...props} type={(props) => <h1 {...props} />} />,
	h2: (props) => <Heading {...props} type={(props) => <h2 {...props} />} />,
	h3: (props) => <Heading {...props} type={(props) => <h3 {...props} />} />,
	h4: (props) => <Heading {...props} type={(props) => <h4 {...props} />} />,
	h5: (props) => <Heading {...props} type={(props) => <h5 {...props} />} />,
	h6: (props) => <Heading {...props} type={(props) => <h6 {...props} />} />,
};

export default function App({ Component, pageProps }: AppProps): ReactElement {
	const router = useRouter();
	useEffect(() => {
		trackView();
		const handleRouteChange = (url: string) => {
			const {
				location: { pathname, search },
			} = window;
			const currentUrl = `${pathname}${search}`;
			trackView(url, currentUrl);
		};
		router.events.on("beforeHistoryChange", handleRouteChange);
		return () => { router.events.off("beforeHistoryChange", handleRouteChange); };
	}, [router.events]);

	return <div className={styles.App}>
		<header>
			<Link href="/" prefetch={false}><a>Conrad Ludgate</a></Link>
		</header>
		<div className={styles.Content}>
			<MDXProvider components={components}>
				<Component {...pageProps} />
			</MDXProvider>
		</div>
	</div>;
}
