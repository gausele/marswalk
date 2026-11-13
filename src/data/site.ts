// Mission site data for the Gale Crater / Mount Sharp Marswalk.
// Coordinates are [latitude, longitude] in degrees. Verify exact positions
// against NASA's published Curiosity site lists before final submission.

export type Stop = {
  id: string
  name: string
  position: [number, number]
  summary: string
  objective: string
}

export const MISSION_CENTER: [number, number] = [-4.9, 137.5]

// Landing / base point (Curiosity's Bradbury Landing site, approximate).
export const BASE: Stop = {
  id: 'base',
  name: 'Base: Bradbury Landing',
  position: [-4.5895, 137.4417],
  summary: 'Curiosity landed here in August 2012. Start and return point for the excursion.',
  objective: 'Habitat, staging area, and comms baseline.',
}

export const STOPS: Stop[] = [
  {
    id: 'stop1',
    name: 'Stop 1: Lower Mount Sharp layers',
    position: [-4.95, 137.45],
    summary:
      'Layered rock on the foothills of Mount Sharp, a mountain about 5 km tall. The layers record changing climate, with older, wetter conditions near the bottom and drier periods higher up.',
    objective: 'Compare the layers from bottom to top and sample the sulfate-bearing rock.',
  },
  {
    id: 'stop2',
    name: 'Stop 2: Boxwork ridge field',
    position: [-5.08, 137.66],
    summary:
      'Boxwork ridges stand about 1 to 2 m tall, with sandy hollows between them. The bedrock has calcium sulfate veins in small cracks. Boxwork has not been seen anywhere else on Mount Sharp.',
    objective:
      'Study how the ridges formed and sample the pea-sized mineral nodules left by drying groundwater.',
  },
  {
    id: 'stop3',
    name: 'Stop 3: High sulfate layers',
    position: [-5.12, 137.7],
    summary:
      'Sulfate minerals this high up Mount Sharp suggest the groundwater table was higher and stayed stable for longer than earlier estimates.',
    objective: 'Sample the higher layers and compare them with the boxwork and lower stops.',
  },
]

// Illustrative hazard markers. No longer used by the app; the steep-terrain layer replaces them.
export const HAZARDS: { id: string; position: [number, number]; label: string }[] = [
  { id: 'h1', position: [-5.0, 137.55], label: 'Steep slope (illustrative)' },
  { id: 'h2', position: [-5.06, 137.62], label: 'Large rock field (illustrative)' },
]

// Waypoints for the planned route: base -> stops in order -> base.
export const ROUTE: [number, number][] = [
  BASE.position,
  ...STOPS.map((s) => s.position),
  BASE.position,
]