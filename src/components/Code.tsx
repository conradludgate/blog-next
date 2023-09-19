import React, { ReactElement, ReactNode } from "react";

export interface CodeProps {
    className?: string,
	children?: ReactNode,
}

export default function Code({ className, children }: CodeProps): ReactElement {
	return <>
		{
			className?.startsWith("language-") &&
			<span>{className.substring("langauge-".length)}</span>
		}
		<pre className={className}>{children}</pre>
	</>;
}
