import { createConfirm } from '@ui-sdk/vue/alert-dialog'
import { createOverlays } from '@ui-sdk/vue/overlays'
import { createToaster } from '@ui-sdk/vue/toast'

/** One queue for the whole app. `AppOverlays.vue` renders it. */
export const overlays = createOverlays()

/** `toast('Factmap exported')`, `toast.error('…')`. Works from any module. */
export const toast = createToaster({ overlays })

/**
 * Asks before something is lost. Resolves `true` only for the confirming button.
 * Title: the action and its object ("Delete layer 'Notes'?"). Buttons: verb plus object.
 */
export const confirm = createConfirm({ overlays })
