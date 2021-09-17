import { useRouter } from "next/router";
import { useEffect } from "react";

export function useTracking(): void {
	const router = useRouter();
	useEffect(() => {
		trackView();
		const handleRouteChange = (url: string) => {
			const {
				location: { pathname, search },
			} = window;
			const currentUrl = `${pathname}${search}`;
			trackView(url, currentUrl);
		};
		router.events.on("beforeHistoryChange", handleRouteChange);
		return () => { router.events.off("beforeHistoryChange", handleRouteChange); };
	}, [router.events]);
}

const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const hostURL = process.env.NEXT_PUBLIC_UMAMI_HOST_URL;

interface Pageview {
	type: "pageview",
	payload: {
		url: string,
		referrer: string,
	},
}

interface Event {
	type: "event",
	payload: {
		event_type: string,
		event_value: string,
		url: string,
	},
}

async function collect(body: Pageview | Event, website: string | undefined): Promise<void> {
	if (localStorage.getItem("umami.disabled") || website === undefined || window.location.hostname !== "conradludgate.com") return;

	const {
		screen: { width, height },
		navigator: { language },
		location: { hostname },
	} = window;
	const screen = `${width}x${height}`;

	const type = body.type;
	const payload = {
		website,
		hostname,
		screen,
		language,
		...body.payload,
	};

	await fetch(`${hostURL}/api/collect`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			type,
			payload,
		})
	});
}

export async function trackView(url?: string, referrer?: string): Promise<void> {
	const {
		location: { pathname, search },
	} = window;
	const currentUrl = `${pathname}${search}`;
	const currentRef = document.referrer;

	await collect(
		{
			type: "pageview",
			payload: {
				url: url || currentUrl,
				referrer: referrer || currentRef,
			}
		},
		website,
	);
}

export async function trackEvent(event_value: string, event_type?: string, url?: string): Promise<void> {
	const {
		location: { pathname, search },
	} = window;
	const currentUrl = `${pathname}${search}`;

	await collect(
		{
			type: "event",
			payload: {
				event_type: event_type || "custom",
				event_value,
				url: url || currentUrl,
			}
		},
		website,
	);
}
