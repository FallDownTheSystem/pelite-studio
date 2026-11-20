export interface XmlToken {
	text: string
	/** Markup punctuation and comments read as secondary; names, values and text stay primary. */
	muted: boolean
}

const pattern = /<!--[\s\S]*?-->|<\?|\?>|<\/|\/>|[<>=]/g

/**
 * Splits XML into muted punctuation and primary text. Only marks characters inside tags, so a
 * `>` or `=` in element text stays as it is. Malformed input still renders in full.
 */
export function tokenizeXml(source: string): XmlToken[] {
	const tokens: XmlToken[] = []
	let inTag = false
	let last = 0
	const push = (text: string, muted: boolean) => {
		if (!text) return
		const previous = tokens[tokens.length - 1]
		if (previous && previous.muted === muted) previous.text += text
		else tokens.push({ text, muted })
	}
	for (const match of source.matchAll(pattern)) {
		const token = match[0]
		const index = match.index
		const isComment = token.startsWith('<!--')
		const opens = token === '<' || token === '</' || token === '<?'
		const closes = token === '>' || token === '/>' || token === '?>'
		if (!isComment && !opens && !closes && !inTag) continue
		if (inTag && (opens || isComment)) continue
		if (!inTag && closes) continue
		// Quoted attribute values may contain `=` or `>`; skip matches inside them.
		if (inTag && quoteOpen(source.slice(last, index))) continue
		push(source.slice(last, index), false)
		push(token, true)
		last = index + token.length
		if (opens) inTag = true
		if (closes) inTag = false
	}
	push(source.slice(last), false)
	return tokens
}

function quoteOpen(text: string): boolean {
	let quote: string | null = null
	for (const character of text) {
		if (quote) {
			if (character === quote) quote = null
		} else if (character === '"' || character === "'") quote = character
	}
	return quote !== null
}
