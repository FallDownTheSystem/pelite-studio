import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cleanup } from '@testing-library/vue'
import { afterEach } from 'vite-plus/test'

declare global {
	var __UI_SDK_STRICT__: boolean | undefined
}
globalThis.__UI_SDK_STRICT__ = true

// A test file that asks for the node environment has no page to prepare.
if (typeof document !== 'undefined') {
	// jsdom has no layout and no top layer; the parts only need these calls to exist.
	HTMLElement.prototype.showPopover = function () {}
	HTMLElement.prototype.hidePopover = function () {}
	Element.prototype.getAnimations = () => []
	Element.prototype.scrollIntoView = function () {}
	Element.prototype.scrollTo = function () {}
	Element.prototype.checkVisibility = () => true
	Element.prototype.getClientRects = () => [] as unknown as DOMRectList
	document.elementFromPoint = () => null
	document.elementsFromPoint = () => []
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	globalThis.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent: () => false,
	})) as typeof matchMedia
	document.head.append(
		Object.assign(document.createElement('style'), {
			textContent: '[popover] { display: block !important }',
		}),
	)
}

// The vendored pelite module fetches its WebAssembly next to itself. No server runs in a test,
// so that one request is answered from the file.
const networkFetch = globalThis.fetch
const wasmFile = resolve(process.cwd(), 'src/vendor/pelite/pelite.wasm')
globalThis.fetch = async (input, init) => {
	const url = input instanceof Request ? input.url : String(input)
	if (!url.endsWith('/pelite.wasm')) return networkFetch(input, init)
	return new Response(await readFile(wasmFile), { headers: { 'content-type': 'application/wasm' } })
}

afterEach(cleanup)
