import "@/styles/globals.scss";
import { AppProps } from "next/app";
import Link from "next/link";
import React, { ReactElement } from "react";
import styles from "@/styles/App.module.css";
import { useTracking } from "@/lib/umami";
import About from "@/layouts/About";
import BlogPost from "@/layouts/BlogPost";
import { MDXProvider, MDXProviderComponentsProp } from "@mdx-js/react";
import Heading from "@/components/Heading";
import Code from "@/components/Code";

const components: MDXProviderComponentsProp = {
	wrapper: (props) => {
		console.log(props);
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
	pre: (props) => <Code {...props} />
};

export default function App({ Component, pageProps }: AppProps): ReactElement {
	useTracking();

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
