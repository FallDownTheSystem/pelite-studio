/**
 * Turns the data of a view into plain JSON for an agent. View data holds things JSON cannot
 * carry (64-bit integers, byte arrays, reactive objects) and lists far longer than a model
 * should read at once, so long lists come back as a page with their total.
 */
export interface PlainOptions {
	/** First item of each long list. */
	offset?: number
	/** Most items of each long list. */
	limit?: number
	/** Objects to leave out, such as handles that mean nothing outside the page. */
	skip?: (value: object) => boolean
}

export interface PlainPage {
	total: number
	offset: number
	items: unknown[]
}

const maxDepth = 16
const maxText = 20_000
const maxBytes = 256

function bytesToPlain(bytes: Uint8Array) {
	const shown = bytes.subarray(0, maxBytes)
	return {
		bytes: bytes.length,
		hex: Array.from(shown, (byte) => byte.toString(16).padStart(2, '0')).join(' '),
		...(bytes.length > maxBytes ? { truncated: true } : {}),
	}
}

export function toPlain(value: unknown, options: PlainOptions = {}): unknown {
	const offset = Math.max(0, Math.trunc(options.offset ?? 0))
	const limit = Math.min(2000, Math.max(1, Math.trunc(options.limit ?? 200)))
	// Only the path from the root is tracked: one object shown in two places is not a cycle.
	const path = new Set<object>()

	function list(items: readonly unknown[], depth: number): unknown[] | PlainPage {
		if (items.length <= limit) return items.map((item) => walk(item, depth))
		return {
			total: items.length,
			offset,
			items: items.slice(offset, offset + limit).map((item) => walk(item, depth)),
		}
	}

	function walk(item: unknown, depth: number): unknown {
		if (item === null || item === undefined) return null
		switch (typeof item) {
			case 'string':
				return item.length > maxText
					? `${item.slice(0, maxText)}… [${item.length - maxText} more characters]`
					: item
			case 'number':
				return Number.isFinite(item) ? item : String(item)
			case 'boolean':
				return item
			case 'bigint':
				return `0x${item.toString(16)}`
			case 'object':
				break
			default:
				// Functions and symbols are behavior, not data.
				return undefined
		}
		if (item instanceof Uint8Array) return bytesToPlain(item)
		if (item instanceof ArrayBuffer) return bytesToPlain(new Uint8Array(item))
		if (item instanceof DataView) {
			return bytesToPlain(new Uint8Array(item.buffer, item.byteOffset, item.byteLength))
		}
		// A wider typed array holds values, such as RVAs, so it reads as a list of numbers.
		if (ArrayBuffer.isView(item)) return list(Array.from(item as unknown as ArrayLike<unknown>), depth + 1)
		if (item instanceof Date) return item.toISOString()
		if (item instanceof Error) return { error: item.message }
		if (typeof Node !== 'undefined' && item instanceof Node) return undefined
		if (options.skip?.(item)) return undefined
		if (depth >= maxDepth) return '[too deep]'
		if (path.has(item)) return '[circular]'
		path.add(item)
		try {
			if (Array.isArray(item)) return list(item, depth + 1)
			if (item instanceof Set) return list([...item], depth + 1)
			const entries = item instanceof Map ? [...item] : Object.entries(item)
			const result: Record<string, unknown> = {}
			for (const [key, entry] of entries) {
				const plain = walk(entry, depth + 1)
				if (plain !== undefined) result[String(key)] = plain
			}
			return result
		} finally {
			path.delete(item)
		}
	}

	return walk(value, 0) ?? null
}
