/** 휴대폰·태블릿 같은 터치 기기인지 (안드로이드 에뮬레이터는 마우스로 잡히므로 터치 지점 수도 본다) */
export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}
