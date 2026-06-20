import next from "eslint-config-next";
import stylistic from "@stylistic/eslint-plugin";

const config = [
	...next,
	{
		plugins: {
			"@stylistic": stylistic,
		},
		rules: {
			"@stylistic/indent": ["error", "tab"],
			"@stylistic/linebreak-style": ["error", "unix"],
			"@stylistic/quotes": ["error", "double"],
			"@stylistic/semi": ["error", "always"],
		},
	},
	{
		ignores: [".next/**", "node_modules/**", "public/**"],
	},
];

export default config;
