import nextMdx from "@next/mdx";

const withMdx = nextMdx({
	extension: /\.mdx?$/,
	options: {
		providerImportSource: "@mdx-js/react",
		// Plugins are referenced by name (not imported) so they work with
		// Turbopack, which requires serializable loader options.
		remarkPlugins: [["remark-prism", {}]],
		rehypePlugins: [["rehype-slug", {}]],
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
});
