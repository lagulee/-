import type { FocusFlightApi } from '../../shared/ipc'

declare global {
  interface Window {
    focusFlight?: FocusFlightApi
  }
}
