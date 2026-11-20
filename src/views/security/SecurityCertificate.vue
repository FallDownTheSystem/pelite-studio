<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import IconDownload from '~icons/lucide/download'
import { byteCount, errorMessage, hex } from '@/lib/format'
import { toast } from '@/lib/overlays'
import { useWorkspace } from '@/pe/view'
import type { PeCertificate } from '@/vendor/pelite/pelite.js'
import { decodeBase64, downloadBytes } from './download'

const props = defineProps<{ certificate: PeCertificate; number: number }>()

const workspace = useWorkspace()

const revisions: Record<number, string> = {
	0x0100: 'WIN_CERT_REVISION_1_0',
	0x0200: 'WIN_CERT_REVISION_2_0',
}

const types: Record<number, { constant: string; format?: string; extension: string }> = {
	0x0001: { constant: 'WIN_CERT_TYPE_X509', format: 'X.509 certificate', extension: 'cer' },
	0x0002: {
		constant: 'WIN_CERT_TYPE_PKCS_SIGNED_DATA',
		format: 'Authenticode PKCS#7 SignedData',
		extension: 'p7b',
	},
	0x0003: { constant: 'WIN_CERT_TYPE_RESERVED_1', extension: 'bin' },
	0x0004: { constant: 'WIN_CERT_TYPE_TS_STACK_SIGNED', extension: 'bin' },
	0x0009: { constant: 'WIN_CERT_TYPE_PKCS1_SIGN', extension: 'bin' },
}

const image = props.certificate.image
const type = types[image.wCertificateType]

const payloadTitle = type?.format
	? `${type.format} (ASN.1 DER, Base64-encoded)`
	: 'Certificate payload (Base64-encoded)'

/** Base64 length minus padding gives the decoded size without decoding. */
const payloadBytes = computed(() => {
	const text = props.certificate.payload
	const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
	return Math.floor((text.length * 3) / 4) - padding
})

function save() {
	const base = workspace.doc.file.name.replace(/\.[^.]+$/, '')
	const name = `${base}-certificate-${props.number}.${type?.extension ?? 'bin'}`
	try {
		downloadBytes(name, decodeBase64(props.certificate.payload), 'application/octet-stream')
	} catch (error) {
		toast.error(`Could not save the certificate: ${errorMessage(error)}`)
	}
}
</script>

<template>
	<div class="flex min-w-0 flex-col gap-4">
		<dl class="flex flex-wrap items-start gap-x-6 gap-y-2">
			<div class="min-w-0">
				<dt class="text-caption text-secondary">Length (dwLength)</dt>
				<dd>
					<span class="num font-mono text-data">{{ hex(image.dwLength) }}</span>
					<span class="ms-2 text-secondary">{{ byteCount(image.dwLength) }}</span>
				</dd>
			</div>
			<div class="min-w-0">
				<dt class="text-caption text-secondary">Revision (wRevision)</dt>
				<dd>
					<span class="num font-mono text-data">{{ hex(image.wRevision, 4) }}</span>
					<span class="ms-2 font-mono text-data text-secondary" translate="no">{{
						revisions[image.wRevision] ?? 'Unknown revision'
					}}</span>
				</dd>
			</div>
			<div class="min-w-0">
				<dt class="text-caption text-secondary">Type (wCertificateType)</dt>
				<dd>
					<span class="num font-mono text-data">{{ hex(image.wCertificateType, 4) }}</span>
					<span class="ms-2 font-mono text-data text-secondary" translate="no">{{
						type?.constant ?? 'Unknown type'
					}}</span>
				</dd>
			</div>
		</dl>

		<section class="flex min-w-0 flex-col gap-2" :aria-label="`Certificate ${number} payload`">
			<header class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
				<h4 class="font-medium text-primary">{{ payloadTitle }}</h4>
				<span v-if="certificate.payload" class="num text-caption text-secondary">{{
					byteCount(payloadBytes)
				}}</span>
				<div v-if="certificate.payload" class="ms-auto flex items-center gap-1">
					<CopyButton :value="certificate.payload" :label="`Copy Base64 text of certificate ${number}`" />
					<Button data-size="sm" @click="save">
						<IconDownload class="size-4 shrink-0" aria-hidden="true" />
						Save certificate
					</Button>
				</div>
			</header>
			<div
				v-if="certificate.payload"
				class="max-h-48 min-w-0 overflow-auto scroll-thin rounded-md bg-sunken px-3 py-2 font-mono text-data wrap-anywhere text-primary"
				tabindex="0"
				role="region"
				:aria-label="`Certificate ${number} payload (Base64-encoded)`"
				translate="no"
				v-text="certificate.payload"
			></div>
			<p v-else class="text-secondary">The certificate payload is empty.</p>
		</section>
	</div>
</template>
