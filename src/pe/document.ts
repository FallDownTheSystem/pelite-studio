import { markRaw, reactive } from 'vue'
import { FactsDatabase } from './facts'
import type { PeFile, Pelite } from './pelite'

/** One open binary and its analysis database. Passed through the UI as a unit. */
export class PeDocument {
	readonly file: File
	readonly peFile: PeFile
	private readonly pelite: Pelite
	private factsDatabase: FactsDatabase | null = null
	disposed = false

	constructor(file: File, bytes: Uint8Array, pelite: Pelite) {
		this.file = file
		this.pelite = pelite
		this.peFile = markRaw(new pelite.PeFile(bytes))
		markRaw(this)
	}

	/** Keep initialization lazy so other viewers do not depend on Facts parsing. */
	get facts(): FactsDatabase {
		if (this.disposed) throw new Error('This document is closed.')
		this.factsDatabase ??= reactive(new FactsDatabase(this.peFile, this.pelite.Facts)) as FactsDatabase
		return this.factsDatabase
	}

	get dirty(): boolean {
		return this.factsDatabase?.dirty ?? false
	}

	/** Both WASM handles share the document lifetime, independently of open views. */
	dispose() {
		if (this.disposed) return
		this.disposed = true
		this.factsDatabase?.dispose()
		this.peFile.dispose()
	}
}
