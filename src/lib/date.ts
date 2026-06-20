const formatter = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

export default function humanDate(dateString: string): string {
	return formatter.format(new Date(dateString));
}
