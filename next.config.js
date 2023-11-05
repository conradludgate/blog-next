import nextMdx from "@next/mdx";
import prism from "remark-prism";
import slug from "rehype-slug";

const withMdx = nextMdx({
	extension: /\.mdx?$/,
	options: {
		providerImportSource: "@mdx-js/react",
		remarkPlugins: [
			prism,
		],
		rehypePlugins: [
			slug,
		],
	},
});

export default withMdx({
	reactStrictMode: true,
	pageExtensions: ["ts", "tsx", "mdx"],
	images: {
		unoptimized: true,
	},
	i18n: {
		locales: ["en-GB"],
		defaultLocale: "en-GB",
	},
	// output: 'export',
});
