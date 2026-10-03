import type { LatLon } from './geo'

export interface City extends LatLon {
  code: string
  name: string
  country: string
}

/** IATA 코드 기준 공항 좌표(소수점 둘째 자리 근사) */
export const CITIES: City[] = [
  { code: 'ICN', name: '서울/인천', country: 'KR', lat: 37.46, lon: 126.44 },
  { code: 'GMP', name: '서울/김포', country: 'KR', lat: 37.56, lon: 126.8 },
  { code: 'PUS', name: '부산', country: 'KR', lat: 35.18, lon: 128.94 },
  { code: 'CJU', name: '제주', country: 'KR', lat: 33.51, lon: 126.49 },
  { code: 'NRT', name: '도쿄/나리타', country: 'JP', lat: 35.77, lon: 140.39 },
  { code: 'HND', name: '도쿄/하네다', country: 'JP', lat: 35.55, lon: 139.78 },
  { code: 'KIX', name: '오사카', country: 'JP', lat: 34.43, lon: 135.24 },
  { code: 'FUK', name: '후쿠오카', country: 'JP', lat: 33.59, lon: 130.45 },
  { code: 'PVG', name: '상하이', country: 'CN', lat: 31.14, lon: 121.81 },
  { code: 'PEK', name: '베이징', country: 'CN', lat: 40.08, lon: 116.6 },
  { code: 'TPE', name: '타이베이', country: 'TW', lat: 25.08, lon: 121.23 },
  { code: 'HKG', name: '홍콩', country: 'HK', lat: 22.31, lon: 113.91 },
  { code: 'BKK', name: '방콕', country: 'TH', lat: 13.69, lon: 100.75 },
  { code: 'SIN', name: '싱가포르', country: 'SG', lat: 1.36, lon: 103.99 },
  { code: 'SYD', name: '시드니', country: 'AU', lat: -33.95, lon: 151.18 },
  { code: 'DXB', name: '두바이', country: 'AE', lat: 25.25, lon: 55.36 },
  { code: 'LHR', name: '런던', country: 'GB', lat: 51.47, lon: -0.45 },
  { code: 'CDG', name: '파리', country: 'FR', lat: 49.01, lon: 2.55 },
  { code: 'FRA', name: '프랑크푸르트', country: 'DE', lat: 50.04, lon: 8.56 },
  { code: 'JFK', name: '뉴욕', country: 'US', lat: 40.64, lon: -73.78 },
  { code: 'LAX', name: '로스앤젤레스', country: 'US', lat: 33.94, lon: -118.41 },
  { code: 'SFO', name: '샌프란시스코', country: 'US', lat: 37.62, lon: -122.38 },
  { code: 'HNL', name: '호놀룰루', country: 'US', lat: 21.32, lon: -157.92 }
]

export function findCity(code: string): City | undefined {
  return CITIES.find((c) => c.code === code)
}
