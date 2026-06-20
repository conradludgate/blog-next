import createMDX from "@next/mdx";

const withMDX = createMDX({
	extension: /\.mdx?$/,
	options: {
		// Plugins are referenced by name (not imported) so they work with
		// Turbopack, which requires serializable loader options.
		remarkPlugins: [["remark-prism", {}]],
		rehypePlugins: [["rehype-slug", {}]],
	},
});

export default withMDX({
	reactStrictMode: true,
	pageExtensions: ["ts", "tsx", "mdx"],
	images: {
		unoptimized: true,
	},
});
