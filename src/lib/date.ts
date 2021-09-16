const months = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
export default function humanDate(dateString: string): string {
	const date = new Date(dateString);
	return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
