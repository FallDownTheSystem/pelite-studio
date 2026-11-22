/**
 * A file that the address of the page names: `?file=<address>`, with `name=<name>` for the name to
 * show when the last part of the address is not one. The address is read like a link on this
 * page, so `?file=samples/a.dll` and a full address on another site both work. Another site must
 * allow this page to read the file (CORS).
 */
export type LinkedFile = { url: URL; name: string }

export function linkedFile(search: string, base: string): LinkedFile | null {
	const query = new URLSearchParams(search)
	const address = query.get('file')
	if (!address) return null
	let url: URL
	try {
		url = new URL(address, base)
	} catch {
		return null
	}
	// Only a web address: `data:`, `blob:` and `javascript:` have no place in a link someone else wrote.
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
	return { url, name: query.get('name')?.trim() || lastPart(url) || 'file' }
}

function lastPart(url: URL): string {
	const part = url.pathname.split('/').pop() ?? ''
	try {
		return decodeURIComponent(part)
	} catch {
		return part
	}
}

/** The request carries no cookies and no referrer: the site that holds the file learns only that it was read. */
export async function fetchLinkedFile(linked: LinkedFile): Promise<File> {
	const response = await fetch(linked.url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
	if (!response.ok) throw new Error(`the server answered ${response.status}`)
	return new File([await response.blob()], linked.name)
}
