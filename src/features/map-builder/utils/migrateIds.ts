import type { MapDocument } from '../types'

export function migrateToSequentialIds(doc: MapDocument): MapDocument {
  const idMap = new Map<string, string>()

  // Assign new waypoint IDs: wp-1, wp-2, …
  const newWaypoints = doc.waypoints.map((wp, i) => {
    const newId = `wp-${i + 1}`
    idMap.set(wp.id, newId)
    return { ...wp, id: newId }
  })

  // Assign new edge IDs: edge-1, edge-2, …
  const newEdges = doc.edges.map((e, i) => {
    const newId = `edge-${i + 1}`
    idMap.set(e.id, newId)
    return { ...e, id: newId }
  })

  // Assign new POI IDs grouped by type prefix; combo POIs use 'poi-'
  const typeCounters: Record<string, number> = {}
  const newPois = doc.pois.map(p => {
    const prefix = p.memberPois?.length ? 'poi' : p.type
    typeCounters[prefix] = (typeCounters[prefix] ?? 0) + 1
    const newId = `${prefix}-${typeCounters[prefix]}`
    idMap.set(p.id, newId)
    return { ...p, id: newId }
  })

  // Remap all cross-references
  const remappedEdges = newEdges.map(e => ({
    ...e,
    from: idMap.get(e.from) ?? e.from,
    to: idMap.get(e.to) ?? e.to,
  }))

  const remappedPois = newPois.map(p => ({
    ...p,
    waypointId: p.waypointId ? (idMap.get(p.waypointId) ?? p.waypointId) : null,
    projectedEdgeId: p.projectedEdgeId ? (idMap.get(p.projectedEdgeId) ?? p.projectedEdgeId) : null,
    linkedPortalIds: p.linkedPortalIds.map(id => idMap.get(id) ?? id),
  }))

  return { ...doc, waypoints: newWaypoints, edges: remappedEdges, pois: remappedPois }
}
