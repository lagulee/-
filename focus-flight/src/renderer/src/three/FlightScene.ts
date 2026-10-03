import * as THREE from 'three'
import { CITIES } from '../../../shared/cities'
import { greatCirclePath, slerp, type LatLon } from '../../../shared/geo'
import { createAirplane } from './airplane'
import { globeCanvas, paintPatch, type GeoData, type Patch } from './earthTexture'

/** 장면 단위: 지구 반지름 R = 1000 (1 단위 ≈ 6.4 km) */
const R = 1000
/** 순항 고도 (시각적으로 과장한 값) */
const CRUISE_ALT = 5.5
/** 지상에 있을 때 동체 중심 높이 (바퀴가 활주로에 닿는 높이) */
const GROUND_ALT = 0.21

export type CameraMode = 'chase' | 'cockpit' | 'window'

export interface SceneState {
  from: LatLon
  to: LatLon
  /** 0 ~ 1 경로 진행률 */
  progress: number
  /** 0(지상) ~ 1(순항) */
  altitude: number
  /** 기수 각도(라디안). 이륙 때 +, 착륙 때 - */
  pitch: number
  /** 구름이 흘러가는지 (일시정지·지상 대기 중엔 멈춤) */
  airspeed: number
  turbulence: boolean
  /** 추락 후 경과 초 (추락 아니면 null) */
  crashSeconds: number | null
}

const rad = THREE.MathUtils.degToRad

export function surfaceVec(p: LatLon, r = R): THREE.Vector3 {
  const phi = rad(p.lat)
  const lambda = rad(p.lon)
  return new THREE.Vector3(r * Math.cos(phi) * Math.cos(lambda), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lambda))
}

function cloudTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  for (let i = 0; i < 14; i++) {
    const x = 128 + (Math.random() - 0.5) * 120
    const y = 140 + (Math.random() - 0.5) * 50
    const r = 35 + Math.random() * 45
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.6, 'rgba(245,248,252,0.25)')
    g.addColorStop(1, 'rgba(240,245,250,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function labelSprite(text: string, color: string, size = 0.045): THREE.Sprite {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const font = 'bold 44px "Segoe UI", "Malgun Gothic", sans-serif'
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 40
  c.width = w
  c.height = 64
  ctx.font = font
  ctx.fillStyle = 'rgba(8,14,26,0.65)'
  ctx.beginPath()
  ctx.roundRect(0, 6, w, 52, 26)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, 33)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: true, fog: false, transparent: true })
  )
  sprite.scale.set((size * w) / 64, size, 1)
  sprite.center.set(0.5, -0.3)
  return sprite
}

interface PatchLayer {
  latSpan: number
  /** 지구 표면보다 얼마나 띄울지 (겹침 방지) */
  lift: number
  patch: Patch | null
  mesh: THREE.Mesh | null
}

/** 활주로: 길이 0.9, 폭 0.07 단위. 로컬 좌표 -Z가 이륙 방향 */
function createRunway(): THREE.Group {
  const g = new THREE.Group()
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x34383c })
  const paint = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.9), asphalt)
  g.add(base)
  for (let i = 0; i < 14; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0045, 0.03), paint)
    dash.position.set(0, 0.0002, -0.39 + i * 0.06)
    g.add(dash)
  }
  for (const x of [-0.034, 0.034]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.0045, 0.9), paint)
    edge.position.set(x, 0.0002, 0)
    g.add(edge)
  }
  for (const z of [-0.43, 0.43]) {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0045, 0.035), paint)
      bar.position.set(k * 0.009, 0.0002, z)
      g.add(bar)
    }
  }
  return g
}

interface Cloud {
  sprite: THREE.Sprite
  f: number
  r: number
  alt: number
}

export class FlightScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(60, 1, 0.005, 4000)
  private earth: THREE.Mesh
  private earthMat: THREE.MeshLambertMaterial
  private geo: GeoData | null = null
  /** 넓은 범위(12°) 조각과 이착륙용 좁은 범위(1.2°) 조각 */
  private layers: PatchLayer[] = [
    { latSpan: 12, lift: 0.015, patch: null, mesh: null },
    { latSpan: 1.2, lift: 0.03, patch: null, mesh: null }
  ]
  private sky: THREE.Mesh
  private sun = new THREE.DirectionalLight(0xffffff, 2.2)
  private plane: THREE.Group
  private gear: THREE.Group
  private trails: THREE.Mesh[] = []
  private windowSeat: THREE.Vector3
  private clouds: Cloud[] = []
  private routeGroup = new THREE.Group()
  private mode: CameraMode = 'chase'
  private time = 0
  private camPos = new THREE.Vector3()
  private camInit = false
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.fog = new THREE.Fog(0xa9c8e8, 20, 170)
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a3a2a, 1.1))
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    // 지구 (지도 데이터가 오기 전엔 바다색 구)
    this.earthMat = new THREE.MeshLambertMaterial({ color: 0x1f5f8f })
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), this.earthMat)
    this.scene.add(this.earth)

    // 하늘 돔: 카메라를 따라다니며 지평선은 밝고 천정은 짙은 파랑
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          up: { value: new THREE.Vector3(0, 1, 0) },
          zenith: { value: new THREE.Color(0x1d5fb4) },
          horizon: { value: new THREE.Color(0xbcd7f0) },
          below: { value: new THREE.Color(0x6f8fb0) },
          tint: { value: new THREE.Color(1, 1, 1) }
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 up; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 below; uniform vec3 tint;
          varying vec3 vDir;
          void main() {
            float t = dot(normalize(vDir), up);
            vec3 c = t > 0.0 ? mix(horizon, zenith, pow(smoothstep(0.0, 0.7, t), 0.7))
                             : mix(horizon, below, smoothstep(0.0, -0.3, t));
            gl_FragColor = vec4(c * tint, 1.0);
          }`
      })
    )
    this.sky.renderOrder = -1
    this.scene.add(this.sky)

    // 비행기와 비행운
    const { group, gear, engines, windowSeat } = createAirplane()
    this.plane = group
    this.gear = gear
    this.windowSeat = windowSeat
    const trailAlpha = document.createElement('canvas')
    trailAlpha.width = 1
    trailAlpha.height = 128
    const tctx = trailAlpha.getContext('2d')!
    const tg = tctx.createLinearGradient(0, 0, 0, 128)
    tg.addColorStop(0, '#000')
    tg.addColorStop(0.85, '#fff')
    tg.addColorStop(1, '#000')
    tctx.fillStyle = tg
    tctx.fillRect(0, 0, 1, 128)
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      alphaMap: new THREE.CanvasTexture(trailAlpha),
      depthWrite: false,
      fog: false
    })
    for (const e of engines) {
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 3.5, 10, 1, true), trailMat)
      trail.rotation.x = Math.PI / 2
      trail.position.set(e.x, e.y, e.z + 1.75 + 0.05)
      this.plane.add(trail)
      this.trails.push(trail)
    }
    this.scene.add(this.plane)

    // 구름
    const cloudTex = cloudTexture()
    for (let i = 0; i < 90; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: true })
      )
      const s = 3 + Math.random() * 9
      sprite.scale.set(s * 1.8, s, 1)
      this.scene.add(sprite)
      this.clouds.push({
        sprite,
        f: -30 + Math.random() * 150,
        r: (Math.random() - 0.5) * 140,
        alt: Math.random() < 0.85 ? 1.5 + Math.random() * 3 : 7 + Math.random() * 3
      })
    }

    this.scene.add(this.routeGroup)

    // 도시 라벨
    for (const c of CITIES) {
      const label = labelSprite(c.code, '#e6ecf7', 0.032)
      label.position.copy(surfaceVec(c, R + 0.05))
      label.userData.code = c.code
      this.routeGroup.add(label)
    }

    void globeCanvas().then(({ geo, canvas: globe }) => {
      if (this.disposed) return
      this.geo = geo
      const tex = new THREE.CanvasTexture(globe)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
      this.earthMat.map = tex
      this.earthMat.color.set(0xffffff)
      this.earthMat.needsUpdate = true
    })
  }

  private routeKey = ''

  setRoute(from: LatLon & { code?: string }, to: LatLon & { code?: string }): void {
    // (code가 있으면 해당 도시의 작은 라벨은 숨기고 큰 라벨을 보여 준다)
    const key = `${from.lat},${from.lon}-${to.lat},${to.lon}`
    if (key === this.routeKey) return
    this.routeKey = key
    for (const o of [...this.routeGroup.children]) {
      if (o.userData.route) this.routeGroup.remove(o)
    }
    const pts = greatCirclePath(from, to, 256).map((p) => surfaceVec(p, R + 0.04))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 1.2, gapSize: 0.8, fog: false })
    )
    line.computeLineDistances()
    line.userData.route = true
    this.routeGroup.add(line)

    const fromCode = (from as { code?: string }).code
    const toCode = (to as { code?: string }).code
    for (const o of this.routeGroup.children) {
      if (o.userData.code) o.visible = o.userData.code !== fromCode && o.userData.code !== toCode
    }

    // 출발·도착 공항 활주로 (경로 방향으로 놓는다)
    for (const [at, ahead, offset] of [
      [from, slerp(from, to, 0.001), 0.35],
      [to, slerp(from, to, 0.999), -0.15]
    ] as const) {
      const up = surfaceVec(at, 1).normalize()
      let fwd = surfaceVec(ahead, 1).sub(up)
      if (at === to) fwd.negate()
      fwd.addScaledVector(up, -fwd.dot(up)).normalize()
      if (!Number.isFinite(fwd.x)) fwd = new THREE.Vector3(0, 1, 0).cross(up).normalize()
      const rightV = new THREE.Vector3().crossVectors(fwd, up)
      const runway = createRunway()
      runway.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rightV, up, fwd.clone().negate()))
      runway.position.copy(up).multiplyScalar(R + 0.037).addScaledVector(fwd, offset)
      runway.userData.route = true
      this.routeGroup.add(runway)
    }
    for (const [p, color] of [
      [from, '#ffd166'],
      [to, '#3ddc97']
    ] as const) {
      const city = CITIES.find((c) => Math.abs(c.lat - p.lat) < 1e-6 && Math.abs(c.lon - p.lon) < 1e-6)
      const sprite = labelSprite(city ? `${city.code} ${city.name}` : '', color, 0.05)
      sprite.position.copy(surfaceVec(p, R + 0.06))
      sprite.userData.route = true
      sprite.renderOrder = 2
      this.routeGroup.add(sprite)
    }
  }

  setMode(mode: CameraMode): void {
    this.mode = mode
    this.camInit = false
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
  }

  /** 비행기 주변 고해상도 지형 조각을 필요할 때 다시 그린다 */
  private updatePatch(layer: PatchLayer, p: LatLon, wanted: boolean): void {
    if (layer.mesh) layer.mesh.visible = wanted
    if (!this.geo || !wanted) return
    const pt = layer.patch
    if (
      pt &&
      Math.abs(p.lat - pt.lat) < pt.latSpan * 0.25 &&
      Math.abs(((p.lon - pt.lon + 540) % 360) - 180) < pt.lonSpan * 0.25
    ) {
      return
    }
    const latSpan = layer.latSpan
    const lonSpan = Math.min(60, (latSpan * 2) / Math.max(0.35, Math.cos(rad(p.lat))))
    const lat = THREE.MathUtils.clamp(p.lat, -84 + latSpan / 2, 84 - latSpan / 2)
    const next = paintPatch(this.geo, lat, p.lon, lonSpan, latSpan)
    // 가장자리를 투명하게 해 아래 층과 자연스럽게 섞는다
    const ctx = next.canvas.getContext('2d')!
    ctx.globalCompositeOperation = 'destination-in'
    const W = next.canvas.width
    const H = next.canvas.height
    for (const [x1, y1] of [
      [W, 0],
      [0, H]
    ]) {
      const g = ctx.createLinearGradient(0, 0, x1, y1)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.15, 'rgba(0,0,0,1)')
      g.addColorStop(0.85, 'rgba(0,0,0,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }

    const tex = new THREE.CanvasTexture(next.canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const geom = new THREE.SphereGeometry(
      R + layer.lift,
      160,
      80,
      rad(next.lon - next.lonSpan / 2 + 180),
      rad(next.lonSpan),
      rad(90 - (next.lat + next.latSpan / 2)),
      rad(next.latSpan)
    )
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false })
    if (layer.mesh) {
      this.scene.remove(layer.mesh)
      layer.mesh.geometry.dispose()
      const old = layer.mesh.material as THREE.MeshLambertMaterial
      old.map?.dispose()
      old.dispose()
    }
    layer.mesh = new THREE.Mesh(geom, mat)
    layer.mesh.renderOrder = layer.lift > 0.02 ? 1 : 0
    this.scene.add(layer.mesh)
    layer.patch = next
  }

  render(s: SceneState, dt: number): void {
    this.time += dt
    const t = this.time
    const progress = THREE.MathUtils.clamp(s.progress, 0, 1)
    const here = slerp(s.from, s.to, progress)
    const eps = 0.0005
    const a = slerp(s.from, s.to, Math.max(0, progress - eps))
    const b = slerp(s.from, s.to, Math.min(1, progress + eps))
    const up = surfaceVec(here, 1).normalize()
    let forward = surfaceVec(b, 1).sub(surfaceVec(a, 1))
    if (forward.lengthSq() < 1e-14) forward = new THREE.Vector3(0, 1, 0).cross(up)
    forward.addScaledVector(up, -forward.dot(up)).normalize()
    const right = new THREE.Vector3().crossVectors(forward, up).normalize()

    this.updatePatch(this.layers[0], here, true)
    this.updatePatch(this.layers[1], here, s.altitude < 0.45 && s.crashSeconds === null)

    // 고도·자세
    let alt = GROUND_ALT + s.altitude * (CRUISE_ALT - GROUND_ALT)
    let pitch = s.pitch
    let roll = Math.sin(t * 0.7) * 0.03
    let bob = Math.sin(t * 1.3) * 0.01 * s.altitude
    if (s.turbulence) {
      roll += Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.05
      pitch += Math.sin(t * 7.3) * 0.06
      bob += Math.sin(t * 17) * 0.05 + Math.sin(t * 5.1) * 0.08
    }
    if (s.crashSeconds !== null) {
      const c = Math.min(1, s.crashSeconds / 4)
      alt = alt * (1 - c * c)
      pitch = -0.9 * c
      roll = s.crashSeconds * 3
    }
    const planePos = up.clone().multiplyScalar(R + alt + bob)
    const basis = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate())
    const q = new THREE.Quaternion().setFromRotationMatrix(basis)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch))
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll))
    this.plane.position.copy(planePos)
    this.plane.quaternion.copy(q)
    this.plane.visible = this.mode !== 'cockpit' && !(s.crashSeconds !== null && s.crashSeconds > 4)
    this.gear.visible = s.altitude < 0.35
    for (const tr of this.trails) {
      ;(tr.material as THREE.MeshBasicMaterial).opacity = 0.5 * THREE.MathUtils.smoothstep(s.altitude, 0.55, 0.95)
      tr.visible = s.crashSeconds === null
    }

    // 카메라
    const local = (v: THREE.Vector3) => v.clone().applyQuaternion(q).add(planePos)
    let desired: THREE.Vector3
    let target: THREE.Vector3
    let camUp = up
    if (this.mode === 'cockpit') {
      desired = local(new THREE.Vector3(0, 0.05, -0.56))
      target = local(new THREE.Vector3(0, -0.12, -3))
      camUp = up.clone().applyAxisAngle(forward, -roll)
      this.camera.fov = 70
    } else if (this.mode === 'window') {
      desired = local(this.windowSeat)
      target = local(new THREE.Vector3(1.3, -0.38, 0.42))
      camUp = up.clone().applyAxisAngle(forward, -roll)
      this.camera.fov = 62
    } else {
      // 3인칭: 비행기 뒤쪽 위에서 따라간다
      // 지상에서는 낮고 가깝게, 순항 중에는 조금 위에서 넓게
      const air = THREE.MathUtils.smoothstep(s.altitude, 0, 0.5)
      desired = planePos
        .clone()
        .addScaledVector(forward, -(1.4 + 0.9 * air))
        .addScaledVector(up, 0.2 + air * (0.35 + 0.25 * Math.sin(t * 0.11)))
        .addScaledVector(right, (0.25 + 0.2 * air) * Math.sin(t * 0.07 + 1))
      target = planePos.clone().addScaledVector(forward, 2.5).addScaledVector(up, -0.15 * air)
      this.camera.fov = 58
    }
    if (!this.camInit || this.mode !== 'chase') {
      this.camPos.copy(desired)
      this.camInit = true
    } else {
      this.camPos.lerp(desired, 1 - Math.exp(-dt * 4))
    }
    // 지면 아래로 내려가지 않게
    const camR = this.camPos.length()
    if (camR < R + 0.05) this.camPos.multiplyScalar((R + 0.05) / camR)
    this.camera.position.copy(this.camPos)
    if (s.turbulence && this.mode !== 'chase') {
      this.camera.position.addScaledVector(up, Math.sin(t * 31) * 0.004)
    }
    this.camera.up.copy(camUp)
    this.camera.lookAt(target)
    this.camera.updateProjectionMatrix()

    // 하늘, 안개, 해
    const skyMat = this.sky.material as THREE.ShaderMaterial
    this.sky.position.copy(this.camera.position)
    skyMat.uniforms.up.value.copy(up)
    const camAlt = this.camera.position.length() - R
    const fog = this.scene.fog as THREE.Fog
    fog.near = 8 + camAlt * 3
    fog.far = 60 + camAlt * 22
    const dim = s.turbulence ? 0.8 : 1
    skyMat.uniforms.tint.value.setRGB(dim, dim * 0.97, dim * 0.95)
    this.sun.position.copy(planePos).addScaledVector(up, 50).addScaledVector(forward, 30).addScaledVector(right, -40)
    this.sun.target.position.copy(planePos)

    // 구름: 비행기 기준 좌표에서 뒤로 흘려보낸다
    for (const c of this.clouds) {
      c.f -= s.airspeed * dt
      if (c.f < -35) {
        c.f += 165
        c.r = (Math.random() - 0.5) * 140
      }
      const dist2 = c.f * c.f + c.r * c.r
      const pos = up
        .clone()
        .multiplyScalar(R + c.alt - dist2 / (2 * R))
        .addScaledVector(forward, c.f)
        .addScaledVector(right, c.r)
      c.sprite.position.copy(pos)
      const d = pos.distanceTo(this.camera.position)
      const near = THREE.MathUtils.smoothstep(d, 1.5, 6)
      const far = 1 - THREE.MathUtils.smoothstep(c.f, 100, 128)
      ;(c.sprite.material as THREE.SpriteMaterial).opacity = 0.9 * near * far
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Line) {
        o.geometry?.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          ;(m as THREE.MeshBasicMaterial).map?.dispose()
          m.dispose()
        }
      }
    })
    this.renderer.dispose()
  }
}
