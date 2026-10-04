import type { FocusFlightApi } from '../../shared/ipc'

declare global {
  /** 빌드할 때 package.json 버전으로 채워진다 */
  const __APP_VERSION__: string
  /** 웹 버전(GitHub Pages) 빌드일 때 true */
  const __WEB_APP__: boolean

  interface Window {
    focusFlight?: FocusFlightApi
  }
}
