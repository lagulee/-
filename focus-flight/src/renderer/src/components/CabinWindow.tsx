import { useRef, useState, type PointerEvent } from 'react'

const SHADE_KEY = 'focus-flight-shade'

function savedShade(): number {
  try {
    const v = Number(localStorage.getItem(SHADE_KEY))
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  return 0.14
}

/**
 * 창가석 오버레이: 기내 벽, 둥근 창 테두리, 유리 반사, 숨구멍, 끌어서 올리고 내리는 블라인드.
 * 가운데 창 부분은 비어 있어 뒤의 3D 장면이 보인다.
 */
export default function CabinWindow() {
  const [shade, setShade] = useState(savedShade)
  const paneRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; start: number } | null>(null)

  const save = (v: number): void => {
    try {
      localStorage.setItem(SHADE_KEY, String(v))
    } catch {
      // 무시
    }
  }

  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, start: shade }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current || !paneRef.current) return
    const h = paneRef.current.getBoundingClientRect().height
    const v = Math.min(1, Math.max(0, drag.current.start + (e.clientY - drag.current.startY) / h))
    setShade(v)
  }
  const onUp = (): void => {
    if (drag.current) save(shade)
    drag.current = null
  }
  const toggle = (): void => {
    const v = shade > 0.5 ? 0.14 : 1
    setShade(v)
    save(v)
  }

  return (
    <div className="cabin">
      <div className="cabin-wall" />
      <div className="cabin-light" />
      <div className="win-bezel" />
      <div className="win-pane" ref={paneRef}>
        <div className="win-glass" />
        <div className="win-breather" />
        <div className="win-shade" style={{ height: `${shade * 100}%` }}>
          <div
            className="win-shade-lip"
            title="끌어서 블라인드를 올리거나 내리세요 (더블클릭: 열기/닫기)"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDoubleClick={toggle}
          >
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}
