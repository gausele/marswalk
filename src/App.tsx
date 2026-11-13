import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { FeatureCollection } from 'geojson'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { BASE, STOPS, ROUTE, MISSION_CENTER, type Stop } from './data/site'

const MARS_TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'
const TILE_SUFFIX = '1.0.0/default/default028mm/{z}/{y}/{x}.jpg'

const BASE_LAYERS = {
  viking: {
    label: 'Optical: Viking color mosaic',
    url: `${MARS_TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/${TILE_SUFFIX}`,
  },
  elevation: {
    label: 'Topography: MOLA shaded relief',
    url: `${MARS_TREK}/Mars_MGS_MOLA_ClrShade_merge_global_463m/${TILE_SUFFIX}`,
  },
} as const

type BaseKey = keyof typeof BASE_LAYERS

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  if (target) map.flyTo(target, 5, { duration: 0.8 })
  return null
}

const METERS_PER_DEGREE = 59276

type Nested = number[] | Nested[]


function toDegrees(c: Nested): Nested {
  if (typeof c[0] === 'number') {
    const [x, y] = c as number[]
    return [x / METERS_PER_DEGREE, y / METERS_PER_DEGREE]
  }
  return (c as Nested[]).map(toDegrees)
}

const LEG_LABELS = ['Base to Stop 1', 'Stop 1 to Stop 2', 'Stop 2 to Stop 3', 'Stop 3 back to base']

type Poly = { ring: number[][]; minX: number; maxX: number; minY: number; maxY: number }


function toPolys(fc: FeatureCollection | null): Poly[] {
  if (!fc) return []
  const rings: number[][][] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (g.type === 'Polygon') rings.push(g.coordinates[0] as number[][])
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) rings.push(p[0] as number[][])
  }
  return rings.map((ring) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { ring, minX, maxX, minY, maxY }
  })
}


function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inSteep(lon: number, lat: number, polys: Poly[]): boolean {
  return polys.some(
    (p) => lon >= p.minX && lon <= p.maxX && lat >= p.minY && lat <= p.maxY && inRing(lon, lat, p.ring),
  )
}


function legCrossesSteep(a: [number, number], b: [number, number], polys: Poly[]): boolean {
  const samples = 60
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const lat = a[0] + (b[0] - a[0]) * t
    const lon = a[1] + (b[1] - a[1]) * t
    if (inSteep(lon, lat, polys)) return true
  }
  return false
}

type LegStatus = 'clear' | 'detour' | 'blocked'
type Seg = { a: [number, number]; b: [number, number]; blocked: boolean }
type LegResult = { label: string; status: LegStatus }

const STATUS_TEXT: Record<LegStatus, string> = {
  clear: 'clear',
  detour: 'detour added around steep terrain',
  blocked: 'crosses steep terrain, no detour found',
}


function findDetour(a: [number, number], b: [number, number], polys: Poly[]): [number, number] | null {
  const midLat = (a[0] + b[0]) / 2
  const midLon = (a[1] + b[1]) / 2
  const dLat = b[0] - a[0]
  const dLon = b[1] - a[1]
  const len = Math.hypot(dLat, dLon) || 1
  
  const pLat = -dLon / len
  const pLon = dLat / len

  for (const d of [0.2, 0.4, 0.6, 0.8]) {
    for (const sign of [1, -1]) {
      const c: [number, number] = [midLat + sign * d * pLat, midLon + sign * d * pLon]
      if (!legCrossesSteep(a, c, polys) && !legCrossesSteep(c, b, polys)) return c
    }
  }
  return null
}


function planRoute(waypoints: [number, number][], polys: Poly[]): { segs: Seg[]; legs: LegResult[] } {
  const segs: Seg[] = []
  const legs: LegResult[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    const label = LEG_LABELS[i]
    if (!legCrossesSteep(a, b, polys)) {
      segs.push({ a, b, blocked: false })
      legs.push({ label, status: 'clear' })
      continue
    }
    const detour = findDetour(a, b, polys)
    if (detour) {
      segs.push({ a, b: detour, blocked: false }, { a: detour, b, blocked: false })
      legs.push({ label, status: 'detour' })
    } else {
      segs.push({ a, b, blocked: true })
      legs.push({ label, status: 'blocked' })
    }
  }
  return { segs, legs }
}

function App() {
  const [baseKey, setBaseKey] = useState<BaseKey>('viking')
  const [showRoute, setShowRoute] = useState(true)
  const [showHazards, setShowHazards] = useState(true)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [selected, setSelected] = useState<Stop | typeof BASE>(BASE)
  const [steep, setSteep] = useState<FeatureCollection | null>(null)

  
  useEffect(() => {
    fetch('/steep.geojson')
      .then((r) => r.json())
      .then((data: FeatureCollection) =>
        setSteep({
          ...data,
          features: data.features.map((f) => {
            const g = f.geometry
            if (g.type === 'GeometryCollection') return f
            return { ...f, geometry: { ...g, coordinates: toDegrees(g.coordinates as Nested) } }
          }),
        } as FeatureCollection),
      )
      .catch(() => setSteep(null))
  }, [])

  const steepPolys = useMemo(() => toPolys(steep), [steep])
  const plan = useMemo(() => planRoute(ROUTE, steepPolys), [steepPolys])

  const choose = (s: Stop | typeof BASE) => {
    setSelected(s)
    setFlyTarget(s.position)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Marswalk: Gale Crater surface map</h1>
        <div className="controls">
          {(Object.keys(BASE_LAYERS) as BaseKey[]).map((k) => (
            <label key={k}>
              <input
                type="radio"
                name="base"
                checked={baseKey === k}
                onChange={() => setBaseKey(k)}
              />
              {BASE_LAYERS[k].label}
            </label>
          ))}
          <label>
            <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} />
            Route
          </label>
          <label>
            <input
              type="checkbox"
              checked={showHazards}
              onChange={(e) => setShowHazards(e.target.checked)}
            />
            Hazards
          </label>
        </div>
      </header>

      <div className="body">
        <aside className="panel">
          <h2>Stops</h2>
          <ul>
            {[BASE, ...STOPS].map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => choose(s)}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="detail">
            <h3>{selected.name}</h3>
            <p>{selected.summary}</p>
            <p>
              <strong>Objective:</strong> {selected.objective}
            </p>
          </div>
          <div className="detail">
            <h3>Route check</h3>
            {steep ? (
              plan.legs.map((leg, i) => (
                <p key={i} className={leg.status === 'blocked' ? 'warn' : undefined}>
                  {leg.label}: {STATUS_TEXT[leg.status]}
                </p>
              ))
            ) : (
              <p>Hazard data not loaded, so the route can't be checked.</p>
            )}
          </div>
          <p className="note">
            Hazard areas show slopes steeper than 15°, computed from MOLA elevation data at 463 m
            resolution. They show broad steep terrain, not individual rocks.
          </p>
        </aside>

        <main className="map">
          <MapContainer
            center={MISSION_CENTER}
            zoom={3}
            minZoom={0}
            maxZoom={8}
            crs={L.CRS.EPSG4326}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              key={baseKey}
              url={BASE_LAYERS[baseKey].url}
              maxNativeZoom={7}
              attribution="Imagery: NASA Mars Trek"
              noWrap={false}
            />
            <FlyTo target={flyTarget} />

            {showRoute &&
              plan.segs.map((s, i) => (
                <Polyline
                  key={i}
                  positions={[s.a, s.b]}
                  pathOptions={{
                    color: s.blocked ? '#ff3b30' : '#ffb36b',
                    weight: 3,
                    dashArray: '6 6',
                  }}
                />
              ))}

            {[BASE, ...STOPS].map((s) => (
              <CircleMarker
                key={s.id}
                center={s.position}
                radius={7}
                pathOptions={{ color: '#ffffff', fillColor: '#e0583a', fillOpacity: 1, weight: 2 }}
                eventHandlers={{ click: () => choose(s) }}
              >
                <Popup>{s.name}</Popup>
              </CircleMarker>
            ))}

            {showHazards && steep && (
              <GeoJSON
                key="steep"
                data={steep}
                style={() => ({ color: '#ffd23f', weight: 1, fillColor: '#ffd23f', fillOpacity: 0.35 })}
              />
            )}
          </MapContainer>
        </main>
      </div>
    </div>
  )
}

export default App