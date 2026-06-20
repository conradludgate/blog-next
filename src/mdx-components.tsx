import type { MDXComponents } from "mdx/types";
import Heading from "@/components/Heading";
import Code from "@/components/Code";

// App Router replacement for the old MDXProvider: maps MDX elements to our
// custom components for every MDX file in the app.
export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		...components,
		h1: (props) => <Heading {...props} type={(props) => <h1 {...props} />} />,
		h2: (props) => <Heading {...props} type={(props) => <h2 {...props} />} />,
		h3: (props) => <Heading {...props} type={(props) => <h3 {...props} />} />,
		h4: (props) => <Heading {...props} type={(props) => <h4 {...props} />} />,
		h5: (props) => <Heading {...props} type={(props) => <h5 {...props} />} />,
		h6: (props) => <Heading {...props} type={(props) => <h6 {...props} />} />,
		pre: (props) => <Code {...props} />,
	};
}
