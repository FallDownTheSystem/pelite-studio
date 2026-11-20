export type Pelite = typeof import('@/vendor/pelite/pelite.js')
export type { PeFile, Facts, Result, PeHeaders } from '@/vendor/pelite/pelite.js'

let pending: Promise<Pelite> | undefined

/** The module instantiates its WebAssembly on import, so one shared promise covers every caller. */
export function loadPelite(): Promise<Pelite> {
	pending ??= import('@/vendor/pelite/pelite.js').catch((error: unknown) => {
		pending = undefined
		throw error
	})
	return pending
}

/** pelite reports failures as returned Error values; this turns one into a thrown error. */
export function unwrap<T>(result: T | Error): T {
	if (result instanceof Error) throw result
	return result
}
