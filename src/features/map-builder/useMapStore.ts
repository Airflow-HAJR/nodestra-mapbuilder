import { useImmerReducer } from 'use-immer'
import type { EditorState, MapDocument, Waypoint, Edge, POI, MemberPoiSnapshot, Tool, NodeType, EdgeType } from './types'
import { EDGE_STYLES, PORTAL_NODE_TYPES } from './types'
import { findNearestEdge, waypointIdFromProjection } from './utils/projection'
import { mapTreeActions } from './useMapTreeStore'
import { migrateToSequentialIds } from './utils/migrateIds'
import { generateId, allDocIds } from './utils/generateId'

const UNDO_LIMIT = 100

function nextDocId(prefix: string, doc: MapDocument): string {
  return generateId(prefix, allDocIds(doc))
}

export function defaultDocument(): MapDocument {
  return {
    waypoints: [], edges: [], pois: [],
    imageUrl: null, pixelsPerMeter: null,
    floors: [1], activeFloor: 1,
  }
}

/** Undo history entry: snapshot + human-readable label for toast feedback */
interface HistoryEntry {
  doc: MapDocument
  label: string
}

const INITIAL: EditorState = {
  doc: defaultDocument(),
  past: [] as HistoryEntry[], future: [] as HistoryEntry[],
  selectedId: null, selectedType: null,
  activeTool: 'select', activeNodeType: 'gate',
  activeEdgeType: 'walkway',
  edgeSource: null,
  previewHighlightEdgeId: null,
  isDirty: false, isSaving: false, lastSavedAt: null,
  lastUndoLabel: null as string | null,
}

type Action =
  | { type: 'LOAD_DOCUMENT'; payload: (Partial<MapDocument> & Record<string, unknown>) | null }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_NODE_TYPE'; nodeType: NodeType }
  | { type: 'SET_EDGE_TYPE'; edgeType: EdgeType }
  | { type: 'SET_SELECTION'; id: string | null; selType: EditorState['selectedType'] }
  // Waypoints
  | { type: 'ADD_WAYPOINT'; waypoint: Waypoint }
  | { type: 'MOVE_WAYPOINT'; id: string; x: number; y: number }
  | { type: 'FINALIZE_WAYPOINT_MOVE'; id: string; x: number; y: number }
  | { type: 'UPDATE_WAYPOINT'; id: string; patch: Partial<Waypoint> }
  | { type: 'DELETE_WAYPOINT'; id: string }
  | { type: 'MERGE_WAYPOINTS'; sourceId: string; targetId: string }
  | { type: 'SPLIT_EDGE_AND_MERGE'; sourceId: string; edgeId: string; x: number; y: number; t: number }
  // Edges
  | { type: 'ADD_EDGE'; edge: Edge }
  | { type: 'DELETE_EDGE'; id: string }
  | { type: 'UPDATE_EDGE'; id: string; patch: Partial<Edge> }
  | { type: 'SET_EDGE_SOURCE'; id: string | null }
  | { type: 'SET_PREVIEW_HIGHLIGHT_EDGE'; id: string | null }
  // POIs
  | { type: 'ADD_POI'; poi: POI }
  | { type: 'MOVE_POI'; id: string; x: number; y: number }
  | { type: 'UPDATE_POI'; id: string; patch: Partial<POI> }
  | { type: 'DELETE_POI'; id: string }
  | { type: 'MERGE_POIS'; poiIds: string[] }
  | { type: 'UNMERGE_POI'; comboPoiId: string }
  // Image & floor
  | { type: 'SET_IMAGE_URL'; url: string | null; fromLoad?: boolean }
  | { type: 'SET_PIXELS_PER_METER'; ppm: number }
  | { type: 'SET_ACTIVE_FLOOR'; floor: number }
  | { type: 'ADD_FLOOR' }
  | { type: 'REMOVE_FLOOR'; floor: number }
  // Save
  | { type: 'SET_SAVING'; saving: boolean }
  | { type: 'SET_SAVED' }
  // Clear all
  | { type: 'CLEAR_ALL' }
  // Migrate
  | { type: 'MIGRATE_IDS' }
  // Undo / Redo
  | { type: 'UNDO' }
  | { type: 'REDO' }

function commitDoc(state: EditorState, label: string = 'Edit') {
  state.past = [...state.past.slice(-UNDO_LIMIT + 1), { doc: JSON.parse(JSON.stringify(state.doc)), label }]
  state.future = []
  state.isDirty = true
}

export function edgeWeight(a: Waypoint, b: Waypoint, ppm: number | null): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const normDist = Math.hypot(dx, dy)
  return ppm ? normDist * ppm : normDist
}

/** Re-project all POIs on a given floor onto their nearest edge. Mutates draft in place. */
function reprojectFloorPois(state: EditorState, floor: number) {
  for (const poi of state.doc.pois) {
    if (poi.floor !== floor) continue
    reprojectPoiDraft(poi, state.doc.edges, state.doc.waypoints)
  }
}

/** Project a single POI onto nearest edge, mutating the immer draft POI. */
function reprojectPoiDraft(
  poi: POI,
  edges: Edge[],
  waypoints: Waypoint[],
) {
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

function reducer(state: EditorState, action: Action) {
  switch (action.type) {
    case 'LOAD_DOCUMENT': {
      const defaults = defaultDocument()
      const p = action.payload

      // Null payload = reset to empty document
      if (!p) {
        state.doc = defaults
        state.past = []
        state.future = []
        state.selectedId = null
        state.selectedType = null
        state.edgeSource = null
        state.isDirty = false
        break
      }

      // New format: waypoints/edges/pois
      const waypoints: Waypoint[] = Array.isArray(p.waypoints)
        ? (p.waypoints as Partial<Waypoint>[]).map((waypoint) => ({
            id: waypoint.id ?? generateId('wp', []),
            name: typeof waypoint.name === 'string' ? waypoint.name : '',
            x: typeof waypoint.x === 'number' ? waypoint.x : 0,
            y: typeof waypoint.y === 'number' ? waypoint.y : 0,
            floor: typeof waypoint.floor === 'number' ? waypoint.floor : defaults.activeFloor,
          }))
        : defaults.waypoints
      const edges: Edge[] = Array.isArray(p.edges)
        ? (p.edges as Partial<Edge>[]).map((edge) => {
            const type = edge.type && EDGE_STYLES[edge.type as EdgeType] ? edge.type as EdgeType : 'walkway'
            return {
              id: edge.id ?? generateId('edge', []),
              name: typeof edge.name === 'string' ? edge.name : '',
              from: edge.from ?? '',
              to: edge.to ?? '',
              type,
              weight: typeof edge.weight === 'number' ? edge.weight : 0,
              accessible: typeof edge.accessible === 'boolean' ? edge.accessible : false,
            }
          })
        : defaults.edges
      const pois: POI[] = Array.isArray(p.pois)
        ? (p.pois as Partial<POI>[]).map((poi) => ({
            id: poi.id ?? generateId((poi.type ?? 'poi') as string, []),
            type: (poi.type ?? 'gate') as NodeType,
            name: typeof poi.name === 'string' ? poi.name : '',
            keywords: Array.isArray(poi.keywords) ? poi.keywords : [],
            waypointId: typeof poi.waypointId === 'string' ? poi.waypointId : null,
            projectedEdgeId: typeof poi.projectedEdgeId === 'string' ? poi.projectedEdgeId : null,
            projectedT: typeof poi.projectedT === 'number' ? poi.projectedT : null,
            linkedPortalIds: Array.isArray(poi.linkedPortalIds) ? poi.linkedPortalIds : [],
            x: typeof poi.x === 'number' ? poi.x : 0,
            y: typeof poi.y === 'number' ? poi.y : 0,
            floor: typeof poi.floor === 'number' ? poi.floor : defaults.activeFloor,
            memberPois: Array.isArray(poi.memberPois)
              ? (poi.memberPois as Partial<MemberPoiSnapshot>[]).map(m => ({
                  id: typeof m.id === 'string' ? m.id : generateId((m.type ?? 'poi') as string, []),
                  type: (m.type ?? 'gate') as NodeType,
                  name: typeof m.name === 'string' ? m.name : '',
                  keywords: Array.isArray(m.keywords) ? m.keywords : [],
                  x: typeof m.x === 'number' ? m.x : 0,
                  y: typeof m.y === 'number' ? m.y : 0,
                  floor: typeof m.floor === 'number' ? m.floor : defaults.activeFloor,
                }))
              : undefined,
          }))
        : defaults.pois

      state.doc = {
        waypoints,
        edges,
        pois,
        imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : defaults.imageUrl,
        pixelsPerMeter: typeof p.pixelsPerMeter === 'number' ? p.pixelsPerMeter : defaults.pixelsPerMeter,
        floors: Array.isArray(p.floors) && typeof (p.floors as unknown[])[0] === 'number'
          ? (p.floors as number[]) : defaults.floors,
        activeFloor: typeof p.activeFloor === 'number' ? p.activeFloor : defaults.activeFloor,
      }
      state.past = []; state.future = []
      state.isDirty = false
      state.previewHighlightEdgeId = null

      // Auto-re-project POIs missing projection fields (migration from old format)
      for (const poi of state.doc.pois) {
        if (poi.projectedEdgeId === undefined || poi.projectedEdgeId === null) {
          reprojectPoiDraft(poi, state.doc.edges, state.doc.waypoints)
        }
      }
      break
    }

    case 'SET_TOOL':
      state.activeTool = action.tool
      state.edgeSource = null
      state.previewHighlightEdgeId = null
      break

    case 'SET_NODE_TYPE':
      state.activeNodeType = action.nodeType
      break

    case 'SET_EDGE_TYPE':
      state.activeEdgeType = action.edgeType
      break

    case 'SET_SELECTION':
      state.selectedId = action.id
      state.selectedType = action.selType
      break

    // ── Waypoints ──────────────────────────────────────────────────────────

    case 'ADD_WAYPOINT':
      commitDoc(state, 'Add waypoint')
      state.doc.waypoints.push(action.waypoint)
      break

    case 'MOVE_WAYPOINT': {
      // Live drag: update position only, no undo snapshot, no re-projection
      const wp = state.doc.waypoints.find(w => w.id === action.id)
      if (wp) {
        wp.x = action.x
        wp.y = action.y
      }
      break
    }

    case 'FINALIZE_WAYPOINT_MOVE': {
      // Committed on mouseup: undo snapshot + edge weights + POI re-projection
      commitDoc(state, 'Move waypoint')
      const wp = state.doc.waypoints.find(w => w.id === action.id)
      if (wp) {
        wp.x = action.x
        wp.y = action.y
        // Recalculate weights of connected edges
        for (const edge of state.doc.edges) {
          if (edge.from === action.id || edge.to === action.id) {
            const a = state.doc.waypoints.find(w => w.id === edge.from)
            const b = state.doc.waypoints.find(w => w.id === edge.to)
            if (a && b) edge.weight = edgeWeight(a, b, state.doc.pixelsPerMeter)
          }
        }
        // Re-project all POIs on this floor
        reprojectFloorPois(state, wp.floor)
      }
      break
    }

    case 'UPDATE_WAYPOINT': {
      commitDoc(state, 'Update waypoint')
      const wp = state.doc.waypoints.find(w => w.id === action.id)
      if (wp) Object.assign(wp, action.patch)
      break
    }

    case 'DELETE_WAYPOINT': {
      commitDoc(state, 'Delete waypoint')
      const deletedWp = state.doc.waypoints.find(w => w.id === action.id)
      const floor = deletedWp?.floor
      // Cascade: delete connected edges
      state.doc.edges = state.doc.edges.filter(e => e.from !== action.id && e.to !== action.id)
      // Remove waypoint
      state.doc.waypoints = state.doc.waypoints.filter(w => w.id !== action.id)
      // Re-project POIs on the affected floor (edges changed)
      if (floor !== undefined) {
        reprojectFloorPois(state, floor)
      }
      if (state.selectedId === action.id) { state.selectedId = null; state.selectedType = null }
      if (state.edgeSource === action.id) state.edgeSource = null
      break
    }

    case 'MERGE_WAYPOINTS': {
      const { sourceId, targetId } = action
      if (sourceId === targetId) break
      const sourceWp = state.doc.waypoints.find(w => w.id === sourceId)
      const targetWp = state.doc.waypoints.find(w => w.id === targetId)
      if (!sourceWp || !targetWp) break
      commitDoc(state, 'Merge waypoints')
      // Rewire all edges from source to target
      for (const edge of state.doc.edges) {
        if (edge.from === sourceId) edge.from = targetId
        if (edge.to === sourceId) edge.to = targetId
      }
      // Remove self-loops created by merge
      state.doc.edges = state.doc.edges.filter(e => e.from !== e.to)
      // Remove duplicate edges (same pair in any order)
      const seen = new Set<string>()
      state.doc.edges = state.doc.edges.filter(e => {
        const key = [e.from, e.to].sort().join('|')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      // Recalculate edge weights for affected edges
      for (const edge of state.doc.edges) {
        if (edge.from === targetId || edge.to === targetId) {
          const f = state.doc.waypoints.find(w => w.id === edge.from)
          const t = state.doc.waypoints.find(w => w.id === edge.to)
          if (f && t && state.doc.pixelsPerMeter) {
            edge.weight = Math.hypot(f.x - t.x, f.y - t.y) * state.doc.pixelsPerMeter
          }
        }
      }
      // Remove source waypoint
      state.doc.waypoints = state.doc.waypoints.filter(w => w.id !== sourceId)
      // Re-project POIs on the floor
      reprojectFloorPois(state, targetWp.floor)
      if (state.selectedId === sourceId) { state.selectedId = targetId; state.selectedType = 'waypoint' }
      if (state.edgeSource === sourceId) state.edgeSource = null
      break
    }

    case 'SPLIT_EDGE_AND_MERGE': {
      // Split a target edge at (x, y, t) and move the source waypoint there.
      // The source waypoint becomes the intersection point.
      const { sourceId, edgeId, x, y } = action
      const sourceWp = state.doc.waypoints.find(w => w.id === sourceId)
      const targetEdge = state.doc.edges.find(e => e.id === edgeId)
      if (!sourceWp || !targetEdge) break
      // Don't split if source is already an endpoint of the target edge
      if (targetEdge.from === sourceId || targetEdge.to === sourceId) break

      commitDoc(state, 'Split edge and merge')

      // Move source waypoint to the split point
      sourceWp.x = x
      sourceWp.y = y

      // Replace target edge with two new edges: from→source, source→to
      const fromWp = state.doc.waypoints.find(w => w.id === targetEdge.from)
      const toWp = state.doc.waypoints.find(w => w.id === targetEdge.to)
      state.doc.edges = state.doc.edges.filter(e => e.id !== edgeId)

      if (fromWp) {
        state.doc.edges.push({
          id: nextDocId('edge', state.doc),
          name: '',
          from: targetEdge.from,
          to: sourceId,
          weight: edgeWeight(fromWp, sourceWp, state.doc.pixelsPerMeter),
          accessible: targetEdge.accessible,
          type: targetEdge.type,
        })
      }
      if (toWp) {
        state.doc.edges.push({
          id: nextDocId('edge', state.doc),
          name: '',
          from: sourceId,
          to: targetEdge.to,
          weight: edgeWeight(sourceWp, toWp, state.doc.pixelsPerMeter),
          accessible: targetEdge.accessible,
          type: targetEdge.type,
        })
      }

      // Remove self-loops
      state.doc.edges = state.doc.edges.filter(e => e.from !== e.to)
      // Remove duplicate edges
      const seenSplit = new Set<string>()
      state.doc.edges = state.doc.edges.filter(e => {
        const key = [e.from, e.to].sort().join('|')
        if (seenSplit.has(key)) return false
        seenSplit.add(key)
        return true
      })

      // Recalculate weights for all edges touching source
      for (const edge of state.doc.edges) {
        if (edge.from === sourceId || edge.to === sourceId) {
          const a = state.doc.waypoints.find(w => w.id === edge.from)
          const b = state.doc.waypoints.find(w => w.id === edge.to)
          if (a && b) edge.weight = edgeWeight(a, b, state.doc.pixelsPerMeter)
        }
      }

      // Re-project POIs on the floor
      reprojectFloorPois(state, sourceWp.floor)

      if (state.selectedId === edgeId) { state.selectedId = sourceId; state.selectedType = 'waypoint' }
      break
    }

    // ── Edges ──────────────────────────────────────────────────────────────

    case 'ADD_EDGE': {
      // Reject self-loops
      if (action.edge.from === action.edge.to) break
      // Reject duplicates
      const exists = state.doc.edges.some(e =>
        (e.from === action.edge.from && e.to === action.edge.to) ||
        (e.from === action.edge.to && e.to === action.edge.from)
      )
      if (exists) break
      commitDoc(state, 'Add edge')
      state.doc.edges.push(action.edge)
      // Re-project POIs on the edge's floor (new edge may be closer to some POIs)
      const fromWp = state.doc.waypoints.find(w => w.id === action.edge.from)
      if (fromWp) reprojectFloorPois(state, fromWp.floor)
      break
    }

    case 'DELETE_EDGE': {
      const deletedEdge = state.doc.edges.find(e => e.id === action.id)
      commitDoc(state, 'Delete edge')
      state.doc.edges = state.doc.edges.filter(e => e.id !== action.id)
      // Remove orphaned waypoints (no remaining edges connected)
      if (deletedEdge) {
        const floor = state.doc.waypoints.find(w => w.id === deletedEdge.from)?.floor ?? state.doc.activeFloor
        for (const wpId of [deletedEdge.from, deletedEdge.to]) {
          const hasEdge = state.doc.edges.some(e => e.from === wpId || e.to === wpId)
          if (!hasEdge) {
            state.doc.waypoints = state.doc.waypoints.filter(w => w.id !== wpId)
            if (state.selectedId === wpId) { state.selectedId = null; state.selectedType = null }
          }
        }
        reprojectFloorPois(state, floor)
      }
      if (state.selectedId === action.id) { state.selectedId = null; state.selectedType = null }
      break
    }

    case 'UPDATE_EDGE': {
      commitDoc(state, 'Update edge')
      const edge = state.doc.edges.find(e => e.id === action.id)
      if (edge) Object.assign(edge, action.patch)
      break
    }

    case 'SET_EDGE_SOURCE':
      state.edgeSource = action.id
      break

    case 'SET_PREVIEW_HIGHLIGHT_EDGE':
      state.previewHighlightEdgeId = action.id
      break

    // ── POIs ───────────────────────────────────────────────────────────────

    case 'ADD_POI': {
      commitDoc(state, 'Add POI')
      // Compute projection before pushing (avoids immer freeze issues)
      const projection = findNearestEdge(
        action.poi.x, action.poi.y,
        state.doc.edges, state.doc.waypoints,
        action.poi.floor,
      )
      const newPoi: POI = {
        ...action.poi,
        linkedPortalIds: action.poi.linkedPortalIds ?? [],
        projectedEdgeId: projection?.edgeId ?? null,
        projectedT: projection?.t ?? null,
        waypointId: projection ? waypointIdFromProjection(projection, state.doc.edges) : null,
      }
      state.doc.pois.push(newPoi)
      break
    }

    case 'MOVE_POI': {
      commitDoc(state, 'Move POI')
      const poi = state.doc.pois.find(p => p.id === action.id)
      if (poi) {
        poi.x = action.x
        poi.y = action.y
        reprojectPoiDraft(poi, state.doc.edges, state.doc.waypoints)
      }
      break
    }

    case 'UPDATE_POI': {
      commitDoc(state, 'Update POI')
      const poi = state.doc.pois.find(p => p.id === action.id)
      if (poi) Object.assign(poi, action.patch)
      break
    }

    case 'DELETE_POI': {
      commitDoc(state, 'Delete POI')
      const deletedPoi = state.doc.pois.find(p => p.id === action.id)
      // Remove this portal's ID from other POIs' linkedPortalIds (same map)
      for (const p of state.doc.pois) {
        if (p.linkedPortalIds?.length) {
          p.linkedPortalIds = p.linkedPortalIds.filter(lid => lid !== action.id)
        }
      }
      state.doc.pois = state.doc.pois.filter(p => p.id !== action.id)
      if (state.selectedId === action.id) { state.selectedId = null; state.selectedType = null }
      // Cross-map cleanup: remove from linkedPortalIds in other maps (fire-and-forget)
      if (deletedPoi && PORTAL_NODE_TYPES.includes(deletedPoi.type)) {
        const activeMapId = mapTreeActions.getActiveMapId()
        if (activeMapId) {
          mapTreeActions.unlinkPortalAcrossMaps(action.id, activeMapId)
        }
      }
      break
    }

    case 'MERGE_POIS': {
      const { poiIds } = action
      if (poiIds.length < 2) break
      const members = poiIds.map(id => state.doc.pois.find(p => p.id === id)).filter(Boolean) as POI[]
      if (members.length < 2) break

      commitDoc(state, 'Merge POIs')

      const cx = members.reduce((sum, p) => sum + p.x, 0) / members.length
      const cy = members.reduce((sum, p) => sum + p.y, 0) / members.length
      const avgT = members.reduce((sum, p) => sum + (p.projectedT ?? 0), 0) / members.length
      const first = members[0]

      const sharedEdge = state.doc.edges.find(e => e.id === first.projectedEdgeId)
      const waypointId = sharedEdge
        ? (avgT < 0.5 ? sharedEdge.from : sharedEdge.to)
        : null

      const comboPoi: POI = {
        id: nextDocId('poi', state.doc),
        type: first.type,
        name: '',
        keywords: [],
        waypointId,
        projectedEdgeId: first.projectedEdgeId,
        projectedT: avgT,
        linkedPortalIds: [],
        x: cx,
        y: cy,
        floor: first.floor,
        memberPois: members.map(p => ({
          id: p.id,
          type: p.type,
          name: p.name,
          keywords: [...p.keywords],
          x: p.x,
          y: p.y,
          floor: p.floor,
        })),
      }

      state.doc.pois = state.doc.pois.filter(p => !poiIds.includes(p.id))
      state.doc.pois.push(comboPoi)
      state.selectedId = comboPoi.id
      state.selectedType = 'poi'
      break
    }

    case 'UNMERGE_POI': {
      const combo = state.doc.pois.find(p => p.id === action.comboPoiId)
      if (!combo?.memberPois?.length) break

      commitDoc(state, 'Unmerge POIs')

      const restored: POI[] = combo.memberPois.map(m => {
        const result = findNearestEdge(m.x, m.y, state.doc.edges, state.doc.waypoints, m.floor)
        return {
          id: m.id,
          type: m.type,
          name: m.name,
          keywords: [...m.keywords],
          waypointId: result ? waypointIdFromProjection(result, state.doc.edges) : null,
          projectedEdgeId: result?.edgeId ?? null,
          projectedT: result?.t ?? null,
          linkedPortalIds: [],
          x: m.x,
          y: m.y,
          floor: m.floor,
        }
      })

      state.doc.pois = state.doc.pois.filter(p => p.id !== action.comboPoiId)
      for (const p of restored) state.doc.pois.push(p)
      state.selectedId = null
      state.selectedType = null
      break
    }

    // ── Image & Floor ──────────────────────────────────────────────────────

    case 'SET_IMAGE_URL':
      if (!action.fromLoad) {
        commitDoc(state, 'Set image')
      }
      state.doc.imageUrl = action.url
      break

    case 'SET_PIXELS_PER_METER':
      commitDoc(state, 'Set scale')
      state.doc.pixelsPerMeter = action.ppm
      break

    case 'SET_ACTIVE_FLOOR':
      state.doc.activeFloor = action.floor
      break

    case 'ADD_FLOOR': {
      const next = Math.max(...state.doc.floors) + 1
      commitDoc(state, 'Add floor')
      state.doc.floors.push(next)
      state.doc.activeFloor = next
      break
    }

    case 'REMOVE_FLOOR': {
      if (state.doc.floors.length <= 1) break
      commitDoc(state, 'Remove floor')
      state.doc.floors = state.doc.floors.filter(f => f !== action.floor)
      if (state.doc.activeFloor === action.floor) state.doc.activeFloor = state.doc.floors[0]
      break
    }

    // ── Save ───────────────────────────────────────────────────────────────

    case 'SET_SAVING':
      state.isSaving = action.saving
      break

    case 'SET_SAVED':
      state.isSaving = false
      state.isDirty = false
      state.lastSavedAt = new Date()
      break

    // ── Clear All ─────────────────────────────────────────────────────────

    case 'CLEAR_ALL': {
      commitDoc(state, 'Clear all')
      state.doc.waypoints = []
      state.doc.edges = []
      state.doc.pois = []
      state.selectedId = null
      state.selectedType = null
      state.edgeSource = null
      state.previewHighlightEdgeId = null
      break
    }

    case 'MIGRATE_IDS': {
      commitDoc(state, 'Migrate IDs')
      const migrated = migrateToSequentialIds(state.doc)
      state.doc.waypoints = migrated.waypoints
      state.doc.edges = migrated.edges
      state.doc.pois = migrated.pois
      state.selectedId = null
      state.selectedType = null
      break
    }

    // ── Undo / Redo ────────────────────────────────────────────────────────

    case 'UNDO': {
      if (state.past.length === 0) break
      const prev = state.past[state.past.length - 1]
      const undoLabel = prev.label
      state.future = [{ doc: JSON.parse(JSON.stringify(state.doc)), label: undoLabel }, ...state.future.slice(0, UNDO_LIMIT - 1)]
      state.past = state.past.slice(0, -1)
      state.doc = prev.doc
      state.selectedId = null; state.selectedType = null
      state.edgeSource = null
      state.previewHighlightEdgeId = null
      state.isDirty = true
      state.lastUndoLabel = `Undo: ${undoLabel}`
      break
    }

    case 'REDO': {
      if (state.future.length === 0) break
      const next = state.future[0]
      const redoLabel = next.label
      state.past = [...state.past.slice(-UNDO_LIMIT + 1), { doc: JSON.parse(JSON.stringify(state.doc)), label: redoLabel }]
      state.future = state.future.slice(1)
      state.doc = next.doc
      state.selectedId = null; state.selectedType = null
      state.edgeSource = null
      state.previewHighlightEdgeId = null
      state.isDirty = true
      state.lastUndoLabel = `Redo: ${redoLabel}`
      break
    }
  }
}

export function useMapStore() {
  const [state, dispatch] = useImmerReducer(reducer, INITIAL)
  return { state, dispatch }
}

export type MapDispatch = ReturnType<typeof useMapStore>['dispatch']
