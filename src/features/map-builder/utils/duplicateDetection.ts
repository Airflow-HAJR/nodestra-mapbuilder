import type { MapDocument, POI, Edge } from '../types'

export interface DuplicateGroup<T> {
  displayName: string
  normalizedName: string
  count: number
  items: T[]
}

export interface DuplicateDetectionResult {
  pois: DuplicateGroup<POI>[]
  edges: DuplicateGroup<Edge>[]
  hasDuplicates: boolean
}

/**
 * Detects duplicate POIs and edges within a map based on normalized names.
 * POIs are only compared on the active floor; edges are compared globally.
 * Names are normalized (trimmed, lowercased) for comparison.
 */
export function detectDuplicates(
  doc: MapDocument,
  activeFloor: number,
): DuplicateDetectionResult {
  // Normalize name: trim and lowercase for comparison
  const normalizeName = (name: string): string =>
    (name || '').trim().toLowerCase() || '(unnamed)'

  // Detect duplicate POIs on the active floor
  const poiMap = new Map<string, POI[]>()
  const poiDisplayNames = new Map<string, string>() // normalized → display

  for (const poi of doc.pois) {
    if (poi.floor === activeFloor) {
      const normalized = normalizeName(poi.name)
      const display = (poi.name || '').trim() || '(unnamed)'
      poiDisplayNames.set(normalized, display)

      if (!poiMap.has(normalized)) {
        poiMap.set(normalized, [])
      }
      poiMap.get(normalized)!.push(poi)
    }
  }

  // Filter to only groups with 2+ items
  const poiDuplicates: DuplicateGroup<POI>[] = []
  poiMap.forEach((items, normalized) => {
    if (items.length >= 2) {
      poiDuplicates.push({
        displayName: poiDisplayNames.get(normalized) || normalized,
        normalizedName: normalized,
        count: items.length,
        items,
      })
    }
  })

  const edgeDuplicates: DuplicateGroup<Edge>[] = []

  // Sort alphabetically for consistent display
  poiDuplicates.sort((a, b) => a.displayName.localeCompare(b.displayName))
  edgeDuplicates.sort((a, b) => a.displayName.localeCompare(b.displayName))

  const hasDuplicates = poiDuplicates.length > 0 || edgeDuplicates.length > 0

  return {
    pois: poiDuplicates,
    edges: edgeDuplicates,
    hasDuplicates,
  }
}
