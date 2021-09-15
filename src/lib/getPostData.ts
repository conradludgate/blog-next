import { promises as fs } from "fs";
import { ReactElement, ReactNode } from "react";

export interface PostData {
    path: string;
    title: string;
    date: string;
    tags: string[];
    desc: string;
};

export default async function getPostData(): Promise<PostData[]> {
    let pages = await fs.readdir("src/pages/posts/");

    return await Promise.all(pages.map(async (page) => {
        const file = page.endsWith(".mdx") ? page : page + "/index.mdx";
        const id = page.split(".mdx")[0];

        //@ts-ignore
        const { meta } = await import(`../pages/posts/${file}`);

        return {
            path: "/posts/" + id,
            ...meta,
        };
    }));

}
