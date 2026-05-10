import type { MapDocument } from '../types'
import { generateId } from './generateId'

export function migrateToSequentialIds(doc: MapDocument): MapDocument {
  const idMap = new Map<string, string>()
  const assigned = new Set<string>()

  const newWaypoints = doc.waypoints.map(wp => {
    const newId = generateId('wp', assigned)
    assigned.add(newId)
    idMap.set(wp.id, newId)
    return { ...wp, id: newId }
  })

  const newEdges = doc.edges.map(e => {
    const newId = generateId('edge', assigned)
    assigned.add(newId)
    idMap.set(e.id, newId)
    return { ...e, id: newId }
  })

  const newPois = doc.pois.map(p => {
    const prefix = p.memberPois?.length ? 'poi' : p.type
    const newId = generateId(prefix, assigned)
    assigned.add(newId)
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
