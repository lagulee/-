import * as THREE from 'three'

/**
 * 간단한 여객기 모델. 앞쪽이 -Z, 위쪽이 +Y, 오른쪽 날개가 +X.
 * 길이 약 1.2 단위.
 */
export function createAirplane(): {
  group: THREE.Group
  gear: THREE.Group
  engines: THREE.Vector3[]
  windowSeat: THREE.Vector3
} {
  const group = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f5f8, roughness: 0.45, metalness: 0.15 })
  const grey = new THREE.MeshStandardMaterial({ color: 0xaab4c3, roughness: 0.5, metalness: 0.4 })
  const accent = new THREE.MeshStandardMaterial({ color: 0x2f7fe0, roughness: 0.4, metalness: 0.2 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2433, roughness: 0.1, metalness: 0.8 })

  // 동체
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.9, 24), white)
  body.rotation.x = Math.PI / 2
  group.add(body)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), white)
  nose.rotation.x = -Math.PI / 2
  nose.scale.set(1, 1.8, 1)
  nose.position.z = -0.45
  group.add(nose)
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 24), white)
  tailCone.rotation.x = Math.PI / 2
  tailCone.position.set(0, 0.012, 0.59)
  group.add(tailCone)
  // 조종석 유리
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.05), glass)
  cockpit.position.set(0, 0.045, -0.5)
  cockpit.rotation.x = 0.5
  group.add(cockpit)
  // 띠
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0765, 0.0765, 0.9, 24, 1, true, Math.PI * 0.42, Math.PI * 0.16), accent)
  stripe.rotation.x = Math.PI / 2
  group.add(stripe)
  const stripeL = stripe.clone()
  stripeL.rotation.y = Math.PI
  group.add(stripeL)

  // 주날개 (뒤로 젖힌 모양)
  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, 0)
  wingShape.lineTo(0.62, 0.2)
  wingShape.lineTo(0.62, 0.27)
  wingShape.lineTo(0, 0.22)
  wingShape.closePath()
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.012, bevelEnabled: false })
  for (const side of [1, -1]) {
    const wing = new THREE.Mesh(wingGeo, white)
    wing.rotation.x = Math.PI / 2
    wing.scale.x = side
    wing.position.set(0, -0.03, -0.12)
    wing.rotation.y = side * -0.08 // 상반각 비슷하게
    group.add(wing)
    // 날개 끝 윙렛
    const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.05), accent)
    winglet.position.set(side * 0.62, 0.02, 0.12)
    group.add(winglet)
  }

  // 엔진
  const engines: THREE.Vector3[] = []
  for (const side of [1, -1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.17, 20), grey)
    eng.rotation.x = Math.PI / 2
    eng.position.set(side * 0.22, -0.075, -0.06)
    group.add(eng)
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), glass)
    intake.position.set(side * 0.22, -0.075, -0.146)
    intake.rotation.y = Math.PI
    group.add(intake)
    engines.push(new THREE.Vector3(side * 0.22, -0.075, 0.03))
  }

  // 수평·수직 꼬리날개
  const hShape = new THREE.Shape()
  hShape.moveTo(0, 0)
  hShape.lineTo(0.22, 0.09)
  hShape.lineTo(0.22, 0.13)
  hShape.lineTo(0, 0.12)
  hShape.closePath()
  const hGeo = new THREE.ExtrudeGeometry(hShape, { depth: 0.008, bevelEnabled: false })
  for (const side of [1, -1]) {
    const h = new THREE.Mesh(hGeo, white)
    h.rotation.x = Math.PI / 2
    h.scale.x = side
    h.position.set(0, 0.01, 0.48)
    group.add(h)
  }
  const vShape = new THREE.Shape()
  vShape.moveTo(0, 0)
  vShape.lineTo(0.15, 0.22)
  vShape.lineTo(0.23, 0.22)
  vShape.lineTo(0.2, 0)
  vShape.closePath()
  const vTail = new THREE.Mesh(new THREE.ExtrudeGeometry(vShape, { depth: 0.01, bevelEnabled: false }), accent)
  vTail.rotation.y = -Math.PI / 2
  vTail.position.set(-0.005, 0.05, 0.47)
  group.add(vTail)

  // 항법등 (오른쪽 초록, 왼쪽 빨강)
  for (const [x, color] of [
    [0.625, 0x33ff66],
    [-0.625, 0xff3344]
  ] as const) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color }))
    light.position.set(x, -0.02, 0.15)
    group.add(light)
  }

  // 착륙 바퀴 (지상·저고도에서만 보임). 바퀴 아래 끝이 y = -0.17
  const gear = new THREE.Group()
  const tire = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.9 })
  for (const [x, z] of [
    [0, -0.36],
    [0.1, 0.03],
    [-0.1, 0.03]
  ]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), grey)
    strut.position.set(x, -0.11, z)
    gear.add(strut)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 14), tire)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, -0.148, z)
    gear.add(wheel)
  }
  group.add(gear)

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false
  })
  // 창가석: 오른쪽 날개 앞쪽 동체 옆
  return { group, gear, engines, windowSeat: new THREE.Vector3(0.09, 0.05, -0.42) }
}
