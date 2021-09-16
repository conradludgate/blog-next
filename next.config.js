const withPlugins = require('next-compose-plugins');
const withMDX = require('@next/mdx')({
	options: {
		remarkPlugins: [
			require("remark-prism"),
		],
		rehypePlugins: [
			require('rehype-slug'),
		],
		extension: /\.mdx$/
	},
})

module.exports = withPlugins([
	withMDX,
], {
	reactStrictMode: true,
	pageExtensions: ['ts', 'tsx', 'mdx']
});
