export interface IconImageSize {
	width: number
	height: number
}

/**
 * Reads the image sizes from an ICO or CUR file's ICONDIR. A width or height byte of 0 means 256.
 * Returns an empty list when the header is not an icon directory.
 */
export function iconImageSizes(bytes: Uint8Array): IconImageSize[] {
	if (bytes.length < 6) return []
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const reserved = view.getUint16(0, true)
	const type = view.getUint16(2, true)
	const count = view.getUint16(4, true)
	if (reserved !== 0 || (type !== 1 && type !== 2)) return []
	const sizes: IconImageSize[] = []
	for (let index = 0; index < count; index++) {
		const offset = 6 + index * 16
		if (offset + 16 > bytes.length) break
		sizes.push({ width: bytes[offset] || 256, height: bytes[offset + 1] || 256 })
	}
	return sizes
}
