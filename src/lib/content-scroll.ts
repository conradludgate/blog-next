import { RefObject, useEffect, useState } from "react";

interface Styles {
    [key: string]: string;
}

export default function useBlogPostContentScroll(ref: RefObject<HTMLDivElement>, styles: Styles): string {
    const [selected, setSelected] = useState("");

    useEffect(() => {
        if (ref.current === null) {
            return;
        }
        const post = ref.current;

        const nav = parseNavTree(post.children[1] as HTMLElement);
        const flatNav = flatten(nav);

        let percentages: number[] = [];
        const onResize = () => {
            percentages = flatNav.map(id => {
                return (document.getElementById(id)!.offsetTop - post.offsetTop) / post.clientHeight;
            })
        }

        post.addEventListener("resize", onResize);
        onResize();

        const onScroll = () => {
            const scroll = window.scrollY / (post.clientHeight + post.offsetTop - document.body.clientHeight);
            const i = percentages.findIndex((percentage, i) => {
                return percentage < scroll && (percentages[i + 1] || 1) >= scroll
            })
            setSelected(flatNav[i] || "");
        }
        window.addEventListener("scroll", onScroll);
        onScroll();

        return () => {
            window.removeEventListener("scroll", onScroll);
            post.removeEventListener("resize", onResize);
        }
    }, [ref.current]);

    useEffect(() => {
        document.querySelectorAll(`.toc-link`).forEach(elem => elem.classList.remove(styles.selected!));
        if (selected != "") {
            document.querySelector(`.toc-link[href="#${selected}"]`)!.classList.add(styles.selected!);
        }
    }, [selected]);

    return selected;
}

interface Node {
    text: string,
    link: string,
    children: Node[];
}
function parseNavTree(elem: HTMLElement): Node[] {
    return parseOL(elem.firstChild as HTMLOListElement);
}

function parseOL(elem: HTMLOListElement): Node[] {
    return Array.prototype.map.call<HTMLCollection, [(child: HTMLElement) => Node], Node[]>(elem.children, child => {
        const a = child.firstChild! as HTMLAnchorElement;
        const ol = child.lastChild as (HTMLOListElement | null);
        return {
            text: a.innerText,
            link: a.getAttribute("href")!,
            children: ol ? parseOL(ol) : [],
        }
    });
}

function flatten(nav: Node[]): string[] {
    return nav.flatMap(child => {
        return [child.link.slice(1), ...flatten(child.children)]
    })
}
