// SPDX-License-Identifier: Apache-2.0
// Markdown renderer for AI output. react-markdown builds React elements (no
// dangerouslySetInnerHTML), so untrusted model text can't inject HTML; we still
// harden links (noopener) and keep raw HTML disabled (the default).

import ReactMarkdown, {
	type Components,
} from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
	h1: ({ children }) => (
		<h2 className="mt-3 mb-1.5 text-sm font-semibold text-foreground first:mt-0">
			{children}
		</h2>
	),
	h2: ({ children }) => (
		<h3 className="mt-3 mb-1.5 text-sm font-semibold text-foreground first:mt-0">
			{children}
		</h3>
	),
	h3: ({ children }) => (
		<h4 className="mt-2.5 mb-1 text-[13px] font-semibold text-foreground first:mt-0">
			{children}
		</h4>
	),
	p: ({ children }) => (
		<p className="my-1.5 first:mt-0 last:mb-0">
			{children}
		</p>
	),
	ul: ({ children }) => (
		<ul className="my-1.5 list-disc space-y-0.5 pl-5">
			{children}
		</ul>
	),
	ol: ({ children }) => (
		<ol className="my-1.5 list-decimal space-y-0.5 pl-5">
			{children}
		</ol>
	),
	li: ({ children }) => (
		<li className="leading-relaxed">{children}</li>
	),
	strong: ({ children }) => (
		<strong className="font-semibold text-foreground">
			{children}
		</strong>
	),
	em: ({ children }) => (
		<em className="italic">{children}</em>
	),
	a: ({ children, href }) => (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			className="text-primary underline underline-offset-2"
		>
			{children}
		</a>
	),
	code: ({ className, children }) => {
		const isBlock =
			/language-/.test(className ?? '') ||
			String(children).includes('\n');
		return isBlock ? (
			<code className="block break-all font-mono text-[11.5px]">
				{children}
			</code>
		) : (
			<code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[11.5px] text-foreground">
				{children}
			</code>
		);
	},
	pre: ({ children }) => (
		<pre className="my-2 overflow-auto rounded-lg border border-border bg-card/60 p-3">
			{children}
		</pre>
	),
	blockquote: ({ children }) => (
		<blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
			{children}
		</blockquote>
	),
	hr: () => <hr className="my-3 border-border" />,
	table: ({ children }) => (
		<div className="my-2 overflow-x-auto">
			<table className="w-full border-collapse text-[12px]">
				{children}
			</table>
		</div>
	),
	th: ({ children }) => (
		<th className="border border-border bg-muted/50 px-2 py-1 text-left font-semibold">
			{children}
		</th>
	),
	td: ({ children }) => (
		<td className="border border-border px-2 py-1">
			{children}
		</td>
	),
};

export function Markdown({
	children,
}: {
	children: string;
}) {
	return (
		<div className="text-[13px] leading-relaxed text-foreground">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={components}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}
