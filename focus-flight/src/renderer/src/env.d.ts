import type { FocusFlightApi } from '../../shared/ipc'

declare global {
  /** 빌드할 때 package.json 버전으로 채워진다 */
  const __APP_VERSION__: string

  interface Window {
    focusFlight?: FocusFlightApi
  }
}
