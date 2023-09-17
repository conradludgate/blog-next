import styles from "./ProgressBar.module.css";
import { ReactElement, useEffect, useMemo, useState } from "react";

export default function ProgressBar(): ReactElement {
	const [counter, setCounter] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter(c => c + 1);
		}, 200);
		return () => clearInterval(timer);
	}, [setCounter]);

	const [widthInt, setWidthInt] = useState(0);

	const width = useMemo(() => {
		const width = (1 - Math.exp(counter / -100)) * 100;
		setWidthInt(Math.floor(width));
		return width;
	}, [counter, setWidthInt]);

	const joke = useMemo(() => {
		return jokes[hash(widthInt) % jokes.length];
	}, [widthInt]);

	return (
		<div className={styles.ProgressBar_Container}>
			<span>{joke}</span>
			<div className={styles.ProgressBar}>
				<div className={styles.ProgressBar_Bar} style={{ width: `${width}%` }}></div>
			</div>
		</div>
	);
}

const jokes = [
	"Mining crypto",
	"Stealing cookies",
	"Leaving the toilet seat up",
];

function hash(x: number): number {
	x = ((x >> 16) ^ x) * 0x45d9f3b;
	x = ((x >> 16) ^ x) * 0x45d9f3b;
	x = (x >> 16) ^ x;
	return x;
}
