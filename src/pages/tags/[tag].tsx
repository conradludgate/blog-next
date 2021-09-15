import { GetStaticPaths, GetStaticProps } from "next";
import { ReactElement } from "react";
import Head from "next/head";
import { ParsedUrlQuery } from "querystring";
import getPostData from "../../lib/getPostData";
import { Post, Posts } from "..";
import styles from '../../styles/Home.module.css'

export default function TagPage({ posts }: Posts): ReactElement {
	return (
		<div className={styles.container}>
			{posts.map((post, key) =>
				<Post key={key} {...post} tags={[]} />
			)}
		</div>
	)
}

interface Params extends ParsedUrlQuery {
	tag: string,
}

export const getStaticProps: GetStaticProps<Posts, Params> = async function ({ params }) {
	const tag = params?.tag!;

    const posts = await getPostData();
    const filtered = posts.filter((post) => {
        return post.tags.includes(tag);
    })
    filtered.sort((a, b) => {
		return a.date > b.date ? -1 : 1
	});

	return {
		props: {
            posts: filtered,
        }
	};
};

export const getStaticPaths: GetStaticPaths<Params> = async function () {
    const posts = await getPostData();
    const tags: Record<string, true> = {};
    posts.forEach((post) => {
        post.tags.forEach((tag) => {
            tags[tag] = true
        })
    })

	return {
		paths: Object.keys(tags).map((tag) => ({
			params: {
				tag,
			},
		})),
		fallback: false,
	};
};
