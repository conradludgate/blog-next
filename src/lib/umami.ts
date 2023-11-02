import { useRouter } from "next/router";
import { useEffect } from "react";

export function useTracking(): void {
	const {
		location: { pathname, search },
	} = window;
	let currentUrl = `${pathname}${search}`;
	let currentRef = document.referrer;
	const router = useRouter();
	useEffect(() => {
		const handleRouteChange = (url: string) => {
			currentRef = currentUrl;
			currentUrl = url.toString();

			if (currentUrl !== currentRef) {
				setTimeout(() => send(getPayload(currentUrl, currentRef)), delayDuration);
			}
		};
		router.events.on("beforeHistoryChange", handleRouteChange);
		return () => { router.events.off("beforeHistoryChange", handleRouteChange); };
	}, [router.events]);
}

const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const hostURL = process.env.NEXT_PUBLIC_UMAMI_HOST_URL;

const {
	screen: { width, height },
	navigator: { language },
	location,
	localStorage,
	document,
} = window;
const { hostname } = location;

const ignoredDomains: string[] = ["localhost:3000"];
const screen = `${width}x${height}`;
const delayDuration = 300;

const getPayload = (currentUrl: string, currentRef: string) => ({
	website,
	hostname,
	screen,
	language,
	title: window.document.title,
	url: currentUrl,
	referrer: currentRef,
});

/* Tracking functions */

const doNotTrack: () => boolean = () => {
	// @ts-ignore
	const { doNotTrack, navigator, external } = window;

	const msTrackProtection = 'msTrackingProtectionEnabled';
	const msTracking = () => {
		// @ts-ignore
		return external && msTrackProtection in external && external[msTrackProtection]();
	};

	// @ts-ignore
	const dnt = doNotTrack || navigator.doNotTrack || navigator.msDoNotTrack || msTracking();

	return dnt == '1' || dnt === 'yes';
};

const trackingDisabled = () =>
	(localStorage && localStorage.getItem('umami.disabled')) ||
	doNotTrack() ||
	(!ignoredDomains.includes(hostname));

let cache: string | undefined = undefined;
const send: (payload: any, type?: string) => Promise<string | void> = (payload, type = 'event') => {
	if (trackingDisabled()) return Promise.resolve();
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (typeof cache !== 'undefined') {
		headers['x-umami-cache'] = cache;
	}
	return fetch(`${hostURL}/api/send`, {
		method: 'POST',
		body: JSON.stringify({ type, payload }),
		headers,
	})
		.then(res => res.text())
		.then(text => (cache = text))
		.catch(() => { }); // no-op, gulp error
};
