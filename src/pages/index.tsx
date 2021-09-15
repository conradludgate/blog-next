import styles from '../styles/Home.module.css'
import Link from "next/link";
import { GetStaticProps } from 'next';
import getPostData, { PostData } from "../lib/getPostData";

interface HomeProps {
	posts: PostData[];
}

export default function Home({posts}: HomeProps) {
	return (
		<div className={styles.container}>
			{posts.map((post: PostData, key: number) =>
				<div key={key} className={styles.Image}>
					<Link href={post.path}>
						<a>
							<p>{post.title}</p>
						</a>
					</Link>
				</div>
			)}
		</div>
	)
}

export const getStaticProps: GetStaticProps = async (context) => {
	let postData = await getPostData();



	return {
		props: {
			posts: postData,
		},
	};
}
