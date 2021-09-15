// const withMdxEnhanced = require("next-mdx-enhanced");
// const withSvgr = require("next-svgr");
const withPlugins = require('next-compose-plugins');
const withMDX = require('@next/mdx')({
	options: {
		remarkPlugins: [
			require("remark-prism"),
		],
		rehypePlugins: [
			require('rehype-slug'),
			// require("@jsdevtools/rehype-toc"),
		],
		extension: /\.mdx$/
	},
})

module.exports = withPlugins([
	// withMdxEnhanced({
	// 	layoutPath: "src/layouts",
	// 	remarkPlugins: [
	// 		require("remark-prism"),
	// 	],
	// 	rehypePlugins: [
	// 		require('rehype-slug'),
	// 		require("@jsdevtools/rehype-toc"),
	// 	],
	// }),
	withMDX,
	// withSvgr,
], {
	reactStrictMode: true,
	pageExtensions: ['ts', 'tsx', 'mdx'],
});
