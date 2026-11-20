import type { PeRichRecord } from '@/vendor/pelite/pelite.js'

/**
 * Product names come from the richprint project's comp_id table, pinned to one commit so the
 * content cannot change under the user. It is fetched only when the user asks for it, without
 * cookies or a referrer, so opening a file never contacts a server on its own.
 */
export const richprintDatabaseUrl =
	'https://raw.githubusercontent.com/dishather/richprint/b0a4f598cc076a8c2ff4b1b90850004bc17da31c/comp_id.txt'

let pending: Promise<Map<string, string>> | undefined

function parseRichprintDatabase(text: string): Map<string, string> {
	const descriptions = new Map<string, string>()
	for (const line of text.split('\n')) {
		const entry = /^([\da-f]{8}|[\da-f]{4})\s+(.+)$/i.exec(line.split('#', 1)[0].trim())
		if (entry) descriptions.set(entry[1].toLowerCase(), entry[2])
	}
	if (!descriptions.size) throw new Error('The richprint database has no readable entries.')
	return descriptions
}

/** One download per session; a failed one is forgotten so the next attempt retries. */
export function loadRichprintDatabase(): Promise<Map<string, string>> {
	pending ??= fetch(richprintDatabaseUrl, { credentials: 'omit', referrerPolicy: 'no-referrer' })
		.then((response) => {
			if (!response.ok)
				throw new Error(`Unable to download the richprint database (HTTP ${response.status}).`)
			return response.text()
		})
		.then(parseRichprintDatabase)
		.catch((error: unknown) => {
			pending = undefined
			throw error
		})
	return pending
}

/** Entries are keyed by product and build (8 hex digits), or by product alone (4 digits). */
export function describeRecord(descriptions: Map<string, string>, record: PeRichRecord): string {
	const product = record.product.toString(16).padStart(4, '0')
	const build = record.build.toString(16).padStart(4, '0')
	const exact = descriptions.get(product + build)
	if (exact !== undefined) return exact
	const generic = descriptions.get(product)
	return generic === undefined ? 'Unknown' : `${generic} (product ID only)`
}
