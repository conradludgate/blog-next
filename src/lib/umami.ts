/* eslint-disable @typescript-eslint/no-explicit-any */

function post(url: string, data: any) {
	const req = new XMLHttpRequest();
	req.open("POST", url, true);
	req.setRequestHeader("Content-Type", "application/json");
	req.send(JSON.stringify(data));
}

const website = "bc7baad1-db36-4225-b7c7-ad5edf480238";
const hostURL = "https://api.conradludgate.com";

function collect(type: "pageview" | "event", params: any, uuid: string) {
	if (navigator.doNotTrack === "1") return;

	const {
		screen: { width, height },
		navigator: { language },
		location: { hostname },
	} = window;
	const screen = `${width}x${height}`;

	if (hostname === "localhost") {
		// console.log(type, params);
		return;
	}

	const payload = {
		website: uuid,
		hostname,
		screen,
		language,
		...params,
	};

	post(
		`${hostURL}/api/collect`,
		{
			type,
			payload,
		},
	);
}

export function trackView(url?: string, referrer?: string): void {
	const {
		location: { pathname, search },
	} = window;
	const currentUrl = `${pathname}${search}`;
	const currentRef = document.referrer;

	collect(
		"pageview",
		{
			url: url || currentUrl,
			referrer: referrer || currentRef,
		},
		website,
	);
}

export function trackEvent(event_value: string, event_type?: string, url?: string): void {
	const {
		location: { pathname, search },
	} = window;
	const currentUrl = `${pathname}${search}`;

	collect(
		"event",
		{
			event_type: event_type || "custom",
			event_value,
			url: url || currentUrl,
		},
		website,
	);
}
