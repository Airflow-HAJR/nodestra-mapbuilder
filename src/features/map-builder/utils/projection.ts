import type { Edge, Waypoint } from '../types'

export interface ProjectionResult {
  x: number
  y: number
  t: number       // 0–1 parametric position along edge
  distance: number // distance from point to projected point
}

export interface NearestEdgeResult {
  edgeId: string
  x: number
  y: number
  t: number
}

/**
 * Project a point (px, py) onto the line segment from (ax, ay) to (bx, by).
 * Returns the projected point, parametric t (clamped 0–1), and distance.
 */
export function projectPointOntoEdge(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): ProjectionResult {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  // Degenerate edge: both endpoints at the same position
  if (lenSq < 1e-12) {
    return {
      x: ax, y: ay, t: 0,
      distance: Math.hypot(px - ax, py - ay),
    }
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const projX = ax + t * dx
  const projY = ay + t * dy
  return {
    x: projX, y: projY, t,
    distance: Math.hypot(px - projX, py - projY),
  }
}

/**
 * Find the nearest edge on the given floor to a point (px, py).
 * Returns null if no edges exist on the floor.
 */
export function findNearestEdge(
  px: number, py: number,
  edges: Edge[],
  waypoints: Waypoint[],
  floor: number,
): NearestEdgeResult | null {
  const wpMap = new Map(waypoints.map(w => [w.id, w]))
  let best: (NearestEdgeResult & { distance: number }) | null = null

  for (const edge of edges) {
    const from = wpMap.get(edge.from)
    const to = wpMap.get(edge.to)
    if (!from || !to) continue
    if (from.floor !== floor || to.floor !== floor) continue

    const proj = projectPointOntoEdge(px, py, from.x, from.y, to.x, to.y)
    if (!best || proj.distance < best.distance) {
      best = { edgeId: edge.id, x: proj.x, y: proj.y, t: proj.t, distance: proj.distance }
    }
  }

  if (!best) return null
  return { edgeId: best.edgeId, x: best.x, y: best.y, t: best.t }
}

/** Count edges connected to a waypoint. */
export function waypointDegree(wpId: string, edges: Edge[]): number {
  let count = 0
  for (const e of edges) {
    if (e.from === wpId || e.to === wpId) count++
  }
  return count
}

/** A waypoint is an intersection if it has 3+ edges (decision point). */
export function isIntersection(wpId: string, edges: Edge[]): boolean {
  return waypointDegree(wpId, edges) >= 3
}

/**
 * Derive the nearest waypoint ID from a projection result.
 * t < 0.5 means closer to the "from" end, otherwise "to".
 */
export function waypointIdFromProjection(
  projection: NearestEdgeResult,
  edges: Edge[],
): string | null {
  const edge = edges.find(e => e.id === projection.edgeId)
  if (!edge) return null
  return projection.t < 0.5 ? edge.from : edge.to
}

/**
 * Re-project a single POI onto the nearest edge on its floor.
 * Mutates the POI in place (for use inside immer reducers).
 */
export function reprojectPoi(
  poi: { waypointId: string | null; projectedEdgeId: string | null; projectedT: number | null; x: number; y: number; floor: number },
  edges: Edge[],
  waypoints: Waypoint[],
): void {
  const result = findNearestEdge(poi.x, poi.y, edges, waypoints, poi.floor)
  if (result) {
    poi.projectedEdgeId = result.edgeId
    poi.projectedT = result.t
    poi.waypointId = waypointIdFromProjection(result, edges)
  } else {
    poi.projectedEdgeId = null
    poi.projectedT = null
    poi.waypointId = null
  }
}
