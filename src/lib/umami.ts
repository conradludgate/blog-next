import { useRouter } from "next/router";
import { useEffect } from "react";

export function useTracking(): void {
	const router = useRouter();
	useEffect(() => {
		setTimeout(() => send(getPayload(
			`${window.location.pathname}${window.location.search}`,
			window.document.referrer,
		)), delayDuration);
		const handleRouteChange = (url: string) => {
			const currentRef = `${window.location.pathname}${window.location.search}`;
			const currentUrl = url.toString();
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

const domains: string[] = ["conradludgate.com"];
const delayDuration = 300;

const getPayload = (currentUrl: string, currentRef: string) => {
	const {
		screen: { width, height },
		navigator: { language },
		location,
	} = window;
	const { hostname } = location;
	const screen = `${width}x${height}`;

	return {
		website,
		hostname,
		screen,
		language,
		title: window.document.title,
		url: currentUrl,
		referrer: currentRef,
	};
};

/* Tracking functions */

/* eslint @typescript-eslint/ban-ts-comment: "off" */
const doNotTrack: () => boolean = () => {
	// @ts-ignore
	const { doNotTrack, navigator, external } = window;

	const msTrackProtection = "msTrackingProtectionEnabled";
	const msTracking = () => {
		// @ts-ignore
		return external && msTrackProtection in external && external[msTrackProtection]();
	};

	// @ts-ignore
	const dnt = doNotTrack || navigator.doNotTrack || navigator.msDoNotTrack || msTracking();

	return dnt == "1" || dnt === "yes";
};

const trackingDisabled = () =>
	(window.localStorage && window.localStorage.getItem("umami.disabled")) ||
	doNotTrack() ||
	(!domains.includes(window.location.hostname));

let cache: string | undefined = undefined;

/* eslint @typescript-eslint/no-explicit-any: "off" */
const send: (payload: any, type?: string) => Promise<string | void> = (payload, type = "event") => {
	if (trackingDisabled()) return Promise.resolve();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (typeof cache !== "undefined") {
		headers["x-umami-cache"] = cache;
	}
	return fetch(`${hostURL}/api/send`, {
		method: "POST",
		body: JSON.stringify({ type, payload }),
		headers,
	})
		.then(res => res.text())
		.then(text => (cache = text))
		/* eslint @typescript-eslint/no-empty-function: "off" */
		.catch(() => { }); // no-op, gulp error
};
