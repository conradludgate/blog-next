# blog-next

Source for [conradludgate.com](https://conradludgate.com) — a static blog built with
[Next.js](https://nextjs.org/) (Pages Router) and MDX, deployed on [Vercel](https://vercel.com/).

## Development

Requires Node 24 (see `.nvmrc`).

```bash
npm install
npm run dev     # start the dev server on http://localhost:3000
npm run build   # production build
npm run lint    # eslint
```

## Writing a post

Posts live in `src/pages/posts/` as MDX, either as `slug.mdx` or `slug/index.mdx`
(use the directory form when the post has co-located images). Each post exports a
`meta` object and wraps its content in the `BlogPost` layout:

```mdx
export const meta = {
  title: "My Post",
  date: "2026-06-20",
  tags: ["rust", "dev"],
  desc: "A short summary used for previews and RSS.",
  imageURL: "https://conradludgate.com/og-image/example.png", // optional
};

import BlogPost from "@/layouts/BlogPost";
export default function Layout({ children }) {
  return <BlogPost meta={meta}>{children}</BlogPost>;
}

Your markdown content here...
```

The home page, tag pages, and RSS feeds are generated automatically from each post's
`meta` (see `src/lib/getPostData.ts`).

### Hiding a post

Add `hidden: true` to a post's `meta` to keep it out of every listing and feed (home,
tags, RSS) while leaving its `/posts/...` page reachable by direct link.

## Deployment

Pushed to `main` → deployed by Vercel. Pull requests get preview deployments.
The Node version is pinned via `engines.node` in `package.json`.
