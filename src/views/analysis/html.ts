/** Escapes text for the listings that Hex Dump and Disassembly build as one HTML string. */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>"]/g, (char) =>
		char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;',
	)
}

/**
 * Moves a class from the elements that had it to the ones `select` returns. The listings set
 * their caret mark this way, so a caret move touches two elements instead of re-rendering
 * thousands.
 */
export function createMark(name: string) {
	let marked: Element[] = []
	return (select: () => Iterable<Element> | undefined) => {
		for (const element of marked) element.classList.remove(name)
		marked = [...(select() ?? [])]
		for (const element of marked) element.classList.add(name)
	}
}
