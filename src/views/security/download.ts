export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
	return bytes
}

export function downloadBytes(name: string, bytes: Uint8Array<ArrayBuffer>, type: string) {
	const url = URL.createObjectURL(new Blob([bytes], { type }))
	const link = document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
