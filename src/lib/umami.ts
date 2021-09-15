import { randomBytes } from "crypto";

function post(url: string, data: any) {
    const req = new XMLHttpRequest();
    req.open('POST', url, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.send(JSON.stringify(data));
}

const website = "af63e513-329a-4366-8411-729a44ed643c";
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

export function trackView(url?: string, referrer?: string) {
    const {
        location: { host, pathname, search },
    } = window;
    let currentUrl = `${pathname}${search}`;
    let currentRef = document.referrer;

    collect(
        'pageview',
        {
            url: url || currentUrl,
            referrer: referrer || currentRef,
        },
        website,
    );
}

export function trackEvent(event_value: string, event_type?: string, url?: string) {
    const {
        location: { pathname, search },
    } = window;
    let currentUrl = `${pathname}${search}`;

    collect(
        'event',
        {
            event_type: event_type || "custom",
            event_value,
            url: url || currentUrl,
        },
        website,
    );
}
