import type { MapDocument } from '../types'
import { waypointDegree } from './projection'

/**
 * Export a single map/level.
 *
 * Backend graph rules:
 * - Each POI projected onto an edge becomes a node in the graph.
 * - Visual edges are split at every projected POI so that the exported
 *   edge list contains segments: waypoint→poi1, poi1→poi2, …, poiN→waypoint2,
 *   sorted by the parametric `t` along the original edge.
 * - Waypoints with no POIs on their edges are still connected normally.
 */
export function buildExportPayload(doc: MapDocument) {
  const wpMap = new Map(doc.waypoints.map(w => [w.id, w]))
  const edgeMap = new Map(doc.edges.map(e => [e.id, e]))

  // ── Compute projected coords for every POI ───────────────────────────
  const poisWithCoords = doc.pois.map(p => {
    let projectedX: number | null = null
    let projectedY: number | null = null
    if (p.projectedEdgeId && p.projectedT !== null) {
      const edge = edgeMap.get(p.projectedEdgeId)
      if (edge) {
        const from = wpMap.get(edge.from)
        const to = wpMap.get(edge.to)
        if (from && to) {
          projectedX = from.x + p.projectedT * (to.x - from.x)
          projectedY = from.y + p.projectedT * (to.y - from.y)
        }
      }
    }
    return { ...p, projectedX, projectedY }
  })

  // ── Group POIs by their projected edge ────────────────────────────────
  const poisByEdge = new Map<string, typeof poisWithCoords>()
  for (const p of poisWithCoords) {
    if (p.projectedEdgeId && p.projectedT !== null) {
      let list = poisByEdge.get(p.projectedEdgeId)
      if (!list) {
        list = []
        poisByEdge.set(p.projectedEdgeId, list)
      }
      list.push(p)
    }
  }

  // ── Build split edges ─────────────────────────────────────────────────
  // For each visual edge, sort its projected POIs by t, then emit
  // sub-edges: from→poi1, poi1→poi2, …, poiN→to
  interface ExportEdge {
    id: string
    name: string
    from: string
    to: string
    type: string
    weight: number
    accessible: boolean
  }

  const exportEdges: ExportEdge[] = []

  for (const edge of doc.edges) {
    const from = wpMap.get(edge.from)
    const to = wpMap.get(edge.to)
    if (!from || !to) continue

    const edgePois = poisByEdge.get(edge.id)
    if (!edgePois || edgePois.length === 0) {
      // No POIs on this edge — emit as-is
      exportEdges.push({
        id: edge.id,
        name: edge.name,
        from: edge.from,
        to: edge.to,
        type: edge.type,
        weight: edge.weight,
        accessible: edge.accessible,
      })
      continue
    }

    // Sort POIs by parametric t
    const sorted = [...edgePois].sort((a, b) => (a.projectedT ?? 0) - (b.projectedT ?? 0))

    // Compute total edge pixel length for proportional weight splitting
    const totalDx = to.x - from.x
    const totalDy = to.y - from.y
    const totalLen = Math.hypot(totalDx, totalDy)

    // Build chain: [from, poi1, poi2, ..., to]
    type ChainNode = { id: string; t: number }
    const chain: ChainNode[] = [
      { id: edge.from, t: 0 },
      ...sorted.map(p => ({ id: p.id, t: p.projectedT ?? 0 })),
      { id: edge.to, t: 1 },
    ]

    for (let i = 0; i < chain.length - 1; i++) {
      const segFrom = chain[i]
      const segTo = chain[i + 1]
      const segT = segTo.t - segFrom.t
      const segWeight = edge.weight * (totalLen > 0 ? segT : 1 / (chain.length - 1))

      exportEdges.push({
        id: `${edge.id}__seg${i}`,
        name: edge.name,
        from: segFrom.id,
        to: segTo.id,
        type: edge.type,
        weight: Math.max(0, segWeight),
        accessible: edge.accessible,
      })
    }
  }

  return {
    waypoints: doc.waypoints.map(wp => ({
      id: wp.id,
      name: wp.name,
      x: wp.x,
      y: wp.y,
      floor: wp.floor,
      kind: waypointDegree(wp.id, doc.edges) >= 3 ? 'intersection' as const : 'curve' as const,
    })),
    edges: exportEdges,
    pois: poisWithCoords.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      keywords: p.keywords,
      waypointId: p.waypointId,
      projectedEdgeId: p.projectedEdgeId,
      projectedT: p.projectedT,
      projectedX: p.projectedX,
      projectedY: p.projectedY,
      linkedPortalIds: p.linkedPortalIds ?? [],
      x: p.x,
      y: p.y,
      floor: p.floor,
    })),
    floors: doc.floors,
    activeFloor: doc.activeFloor,
  }
}

/** Export payload shape for a single level in multi-map export */
export interface LevelExport {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  waypoints: ReturnType<typeof buildExportPayload>['waypoints']
  edges: ReturnType<typeof buildExportPayload>['edges']
  pois: ReturnType<typeof buildExportPayload>['pois']
}

/** A cross-map edge connecting two portal POIs on different maps */
export interface PortalEdge {
  fromPoiId: string
  fromMapId: string
  toPoiId: string
  toMapId: string
  type: string  // elevator, escalator, stairs, shuttle
}

/** Multi-map export wrapper */
export interface AirportExport {
  levels: LevelExport[]
  portalEdges: PortalEdge[]
}

/**
 * Build portal edges from linkedPortalIds across all levels.
 * Each link pair is deduplicated (A→B and B→A produce one edge).
 */
export function buildPortalEdges(levels: LevelExport[]): PortalEdge[] {
  // Build lookup: poiId → { mapId, type }
  const poiMap = new Map<string, { mapId: string; type: string }>()
  for (const level of levels) {
    for (const poi of level.pois) {
      poiMap.set(poi.id as string, { mapId: level.id, type: poi.type as string })
    }
  }

  const seen = new Set<string>()
  const edges: PortalEdge[] = []

  for (const level of levels) {
    for (const poi of level.pois) {
      const linked = (poi.linkedPortalIds as string[] | undefined) ?? []
      for (const targetId of linked) {
        // Deduplicate: use sorted pair as key
        const key = [poi.id, targetId].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const target = poiMap.get(targetId)
        if (!target) continue

        edges.push({
          fromPoiId: poi.id as string,
          fromMapId: level.id,
          toPoiId: targetId,
          toMapId: target.mapId,
          type: poi.type as string,
        })
      }
    }
  }

  return edges
}
