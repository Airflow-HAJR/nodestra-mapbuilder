const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function rand4(): string {
  return Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

export function generateId(
  prefix: string,
  existingIds: Iterable<string>,
): string {
  const ids = new Set(existingIds)
  let id: string
  do {
    id = `${prefix}-${rand4()}`
  } while (ids.has(id))
  return id
}

export function allDocIds(doc: {
  waypoints: { id: string }[]
  edges: { id: string }[]
  pois: { id: string }[]
}): string[] {
  return [
    ...doc.waypoints.map(w => w.id),
    ...doc.edges.map(e => e.id),
    ...doc.pois.map(p => p.id),
  ]
}
