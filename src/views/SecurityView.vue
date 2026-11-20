<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { PeSecurityDirectory } from '@/vendor/pelite/pelite.js'

export interface SecurityData {
	/** The security directory's VirtualAddress is a file offset, not an RVA. */
	offset: number
	size: number
	certificates: PeSecurityDirectory
}

export function prepare(doc: PeDocument): ViewContent<SecurityData> {
	const certificates = unwrap(doc.peFile.security())
	if (certificates === null) throw new Error('The directory is unavailable.')
	const directory = unwrap(doc.peFile.headers()).DataDirectory[4]
	return {
		data: { offset: directory?.VirtualAddress ?? 0, size: directory?.Size ?? 0, certificates },
	}
}
</script>

<script setup lang="ts">
import SecurityCertificate from './security/SecurityCertificate.vue'
import { byteCount, count, hexOrZero } from '@/lib/format'

const props = defineProps<{ data: SecurityData }>()

const total = props.data.certificates.length
</script>

<template>
	<ViewPage
		title="Security directory"
		:description="`Authenticode signatures and certificates appended to the file. ${total ? `${count(total)} ${total === 1 ? 'entry' : 'entries'}.` : ''}`"
	>
		<dl class="flex flex-wrap items-start gap-x-6 gap-y-2" aria-label="Certificate table">
			<div class="min-w-0">
				<dt class="text-caption text-secondary">File offset</dt>
				<dd>
					<AddressText v-if="data.offset" kind="fo" :value="data.offset" />
					<span v-else class="num font-mono text-data">{{ hexOrZero(data.offset) }}</span>
				</dd>
			</div>
			<div class="min-w-0">
				<dt class="text-caption text-secondary">Table size</dt>
				<dd>
					<span class="num font-mono text-data">{{ hexOrZero(data.size) }}</span>
					<span class="ms-2 text-secondary">{{ byteCount(data.size) }}</span>
				</dd>
			</div>
		</dl>

		<EmptyState v-if="!total" title="No certificates in this file">
			The security directory is present but holds no certificate entries.
		</EmptyState>
		<template v-for="(certificate, index) in data.certificates" :key="index">
			<ViewSection :title="`Certificate ${index + 1}`">
				<Notice
					v-if="'$error' in certificate"
					tone="warning"
					title="This certificate entry could not be read"
				>
					{{ certificate.$error }}
				</Notice>
				<SecurityCertificate v-else :certificate="certificate" :number="index + 1" />
			</ViewSection>
		</template>
	</ViewPage>
</template>
