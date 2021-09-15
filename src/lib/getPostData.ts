// import posts, { _importMeta as metadata } from "../pages/posts/*.mdx";

export interface PostData {
    path: string;
    title: string;
    date: string;
    tags: string[];
};

export default async function getPostData(): Promise<PostData[]> {
    // console.log({posts, metadata});

    // return Object.entries(posts).map(([id, post]) => {
    //     //@ts-ignore
    //     const meta = post("").props.meta;

    //     return {
    //         path: "/posts/" + id,
    //         ...meta,
    //     };
    // })

    return []
}
