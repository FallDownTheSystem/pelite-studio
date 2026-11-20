import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vite-plus/test'
import { PeDocument } from './document'
import { loadPelite } from './pelite'

// A real PE file keeps the parser in the test. Windows ships this one; other systems skip the test.
const sample = 'C:/Windows/System32/notepad.exe'

test.skipIf(!existsSync(sample))(
	'a file is dirty only while a layer has facts that are in no file',
	async () => {
		const pelite = await loadPelite()
		const doc = new PeDocument(new File([], 'notepad.exe'), new Uint8Array(readFileSync(sample)), pelite)
		const db = doc.facts
		expect(doc.dirty, 'a new, empty layer loses nothing').toBe(false)

		db.mutate(() => db.replace(0, '#factmap\nAx1000 4\n'))
		expect(db.error).toBe('')
		expect(db.isUnsaved(db.layers[0])).toBe(true)
		expect(doc.dirty).toBe(true)

		db.markKept(db.layers[0].text)
		expect(doc.dirty, 'an exported layer loses nothing').toBe(false)

		db.mutate(() => db.replace(0, '#factmap\nAx1000 4\nAx2000 4\n'))
		expect(doc.dirty, 'a change after the export is unsaved again').toBe(true)

		db.undo()
		expect(doc.dirty, 'undo back to the exported text').toBe(false)
		doc.dispose()
	},
)
