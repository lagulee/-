import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '../src/shared/version'

describe('isNewerVersion', () => {
  it('숫자 단위로 비교한다', () => {
    expect(isNewerVersion('0.1.3', '0.1.2')).toBe(true)
    expect(isNewerVersion('0.1.12', '0.1.3')).toBe(true)
    expect(isNewerVersion('0.1.2', '0.1.2')).toBe(false)
    expect(isNewerVersion('0.1.1', '0.1.2')).toBe(false)
    expect(isNewerVersion('1.0', '0.9.9')).toBe(true)
  })
})
