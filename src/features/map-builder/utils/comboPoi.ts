import type { POI, Edge, Waypoint } from '../types'

export function getSideOfEdge(poi: POI, edge: Edge, waypoints: Waypoint[]): 'left' | 'right' {
  const from = waypoints.find(w => w.id === edge.from)
  const to = waypoints.find(w => w.id === edge.to)
  if (!from || !to || poi.projectedT === null) return 'left'

  const edgeDx = to.x - from.x
  const edgeDy = to.y - from.y
  const projX = from.x + poi.projectedT * edgeDx
  const projY = from.y + poi.projectedT * edgeDy

  // Cross product z-component: edgeDir × (poi - projectedPoint)
  const cross = edgeDx * (poi.y - projY) - edgeDy * (poi.x - projX)
  return cross >= 0 ? 'left' : 'right'
}

export function findMergeablePOIs(
  anchor: POI,
  allPOIs: POI[],
  edges: Edge[],
  waypoints: Waypoint[],
  radiusT: number,
): POI[] {
  if (!anchor.projectedEdgeId || anchor.projectedT === null) return []

  const edge = edges.find(e => e.id === anchor.projectedEdgeId)
  if (!edge) return []

  const anchorSide = getSideOfEdge(anchor, edge, waypoints)
  const anchorT = anchor.projectedT

  return allPOIs.filter(p => {
    if (p.id === anchor.id) return false
    if (p.memberPois && p.memberPois.length > 0) return false
    if (p.projectedEdgeId !== anchor.projectedEdgeId) return false
    if (p.floor !== anchor.floor) return false
    if (p.projectedT === null) return false
    if (Math.abs(p.projectedT - anchorT) > radiusT) return false
    return getSideOfEdge(p, edge, waypoints) === anchorSide
  })
}
