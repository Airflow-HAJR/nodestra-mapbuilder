import { useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import type { MapTreeNode, NodeType } from './types'
import { PORTAL_NODE_TYPES } from './types'

/** A portal POI from any map in the airport */
export interface CrossMapPortal {
  poiId: string
  mapId: string
  mapName: string
  type: NodeType
  name: string
  linkedPortalIds: string[]
}

export interface TreeNodeWithChildren extends MapTreeNode {
  children: TreeNodeWithChildren[]
}

export type DropPosition = 'before' | 'inside' | 'after'

export interface DropTarget {
  nodeId: string
  position: DropPosition
}

interface MapTreeState {
  nodes: MapTreeNode[]
  activeMapId: string | null
  expandedIds: Set<string>
  renamingId: string | null
  isLoading: boolean
  airportId: string | null
  dragId: string | null
  dropTarget: DropTarget | null
}

// ── Vanilla store (no external deps) ───────────────────────────────────────

let state: MapTreeState = {
  nodes: [],
  activeMapId: null,
  expandedIds: new Set<string>(),
  renamingId: null,
  isLoading: false,
  airportId: null,
  dragId: null,
  dropTarget: null,
}

const listeners = new Set<() => void>()

function setState(partial: Partial<MapTreeState>) {
  state = { ...state, ...partial }
  listeners.forEach((l) => l())
}

function getSnapshot(): MapTreeState {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ── Tree builder ───────────────────────────────────────────────────────────

function buildTree(nodes: MapTreeNode[]): TreeNodeWithChildren[] {
  const map = new Map<string, TreeNodeWithChildren>()
  const roots: TreeNodeWithChildren[] = []

  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] })
  }

  for (const node of nodes) {
    const treeNode = map.get(node.id)!
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(treeNode)
    } else {
      roots.push(treeNode)
    }
  }

  function sortChildren(ns: TreeNodeWithChildren[]) {
    ns.sort((a, b) => a.sortOrder - b.sortOrder)
    for (const n of ns) sortChildren(n.children)
  }
  sortChildren(roots)

  return roots
}

/** Find the first leaf node for default selection */
function findFirstLeaf(nodes: MapTreeNode[]): string | null {
  const roots = nodes.filter((n) => !n.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
  if (roots.length === 0) return nodes[0]?.id ?? null

  let current = roots[0]
  while (true) {
    const children = nodes
      .filter((n) => n.parentId === current.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    if (children.length === 0) return current.id
    current = children[0]
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

async function fetchTree(airportId: string) {
  // Only show loading if we don't have data yet
  if (state.nodes.length === 0) {
    setState({ isLoading: true, airportId })
  }

  const { data, error } = await supabase
    .from('maps')
    .select('id, airport_id, parent_id, name, sort_order, created_at, updated_at')
    .eq('airport_id', airportId)
    .order('sort_order')

  if (error || !data) {
    setState({ isLoading: false })
    return
  }

  // If no maps exist, auto-create a default one
  if (data.length === 0) {
    const { data: created, error: createErr } = await supabase
      .from('maps')
      .insert({
        airport_id: airportId,
        parent_id: null,
        name: 'Untitled Level',
        sort_order: 0,
      })
      .select('id, airport_id, parent_id, name, sort_order, created_at, updated_at')
      .single()

    if (createErr || !created) {
      setState({ isLoading: false })
      return
    }

    data.push(created)
  }

  const nodes: MapTreeNode[] = data.map((row) => ({
    id: row.id,
    airportId: row.airport_id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const expandedIds = new Set(nodes.map((n) => n.id))
  const currentActive = state.activeMapId
  const activeMapId = currentActive && nodes.some((n) => n.id === currentActive)
    ? currentActive
    : nodes.length > 0 ? findFirstLeaf(nodes) : null

  setState({ nodes, expandedIds, activeMapId, isLoading: false })
}

function setActiveMap(id: string | null) {
  setState({ activeMapId: id })
}

function toggleExpand(id: string) {
  const expandedIds = new Set(state.expandedIds)
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
  setState({ expandedIds })
}

async function createMap(parentId: string | null, name: string) {
  const { airportId, nodes } = state
  if (!airportId) return

  const siblings = nodes.filter((n) => n.parentId === parentId)
  const sortOrder = siblings.length > 0
    ? Math.max(...siblings.map((s) => s.sortOrder)) + 1
    : 0

  const { data, error } = await supabase
    .from('maps')
    .insert({
      airport_id: airportId,
      parent_id: parentId,
      name,
      sort_order: sortOrder,
    })
    .select('id')
    .single()

  if (error || !data) return

  if (parentId) {
    const expandedIds = new Set(state.expandedIds)
    expandedIds.add(parentId)
    setState({ expandedIds })
  }

  await fetchTree(airportId)
  setState({ activeMapId: data.id })
}

async function deleteMap(id: string) {
  const { airportId, activeMapId } = state
  if (!airportId) return

  const { error } = await supabase
    .from('maps')
    .delete()
    .eq('id', id)

  if (error) return

  await fetchTree(airportId)

  if (activeMapId === id) {
    const remaining = state.nodes
    setState({ activeMapId: remaining.length > 0 ? findFirstLeaf(remaining) : null })
  }
}

async function renameMap(id: string, name: string) {
  const { airportId } = state
  if (!airportId) return

  const { error } = await supabase
    .from('maps')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return

  setState({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, name } : n),
    renamingId: null,
  })
}

/** Check if `ancestorId` is an ancestor of `nodeId` (prevents dropping a node into its own subtree) */
function isAncestor(nodeId: string, ancestorId: string): boolean {
  const { nodes } = state
  let current = nodes.find((n) => n.id === nodeId)
  while (current) {
    if (current.parentId === ancestorId) return true
    current = nodes.find((n) => n.id === current!.parentId)
  }
  return false
}

/**
 * Move a map node to a new position.
 * `newParentId` = null means root level.
 * `beforeId` = the sibling to insert before, or null to append at end.
 */
async function moveMap(nodeId: string, newParentId: string | null, beforeId: string | null) {
  const { airportId, nodes } = state
  if (!airportId) return

  // Prevent dropping onto self or into own subtree
  if (nodeId === newParentId) return
  if (newParentId && isAncestor(newParentId, nodeId)) return

  // Compute new sort_order values for siblings under newParentId
  const siblings = nodes
    .filter((n) => n.parentId === newParentId && n.id !== nodeId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Insert the moved node at the right position
  let insertIdx = siblings.length // default: append
  if (beforeId) {
    const idx = siblings.findIndex((s) => s.id === beforeId)
    if (idx >= 0) insertIdx = idx
  }

  // Build update batch: moved node + reorder siblings
  const updates: { id: string; parent_id: string | null; sort_order: number }[] = []

  let order = 0
  for (let i = 0; i < siblings.length; i++) {
    if (i === insertIdx) {
      updates.push({ id: nodeId, parent_id: newParentId, sort_order: order++ })
    }
    updates.push({ id: siblings[i].id, parent_id: siblings[i].parentId, sort_order: order++ })
  }
  // If inserting at end
  if (insertIdx >= siblings.length) {
    updates.push({ id: nodeId, parent_id: newParentId, sort_order: order++ })
  }

  // Batch update via individual calls (Supabase doesn't support bulk upsert well with different values)
  await Promise.all(
    updates.map((u) =>
      supabase
        .from('maps')
        .update({ parent_id: u.parent_id, sort_order: u.sort_order, updated_at: new Date().toISOString() })
        .eq('id', u.id)
    )
  )

  // Expand new parent so moved node is visible
  if (newParentId) {
    const expandedIds = new Set(state.expandedIds)
    expandedIds.add(newParentId)
    setState({ expandedIds })
  }

  await fetchTree(airportId)
}

function setDragState(dragId: string | null) {
  setState({ dragId })
}

function setDropTarget(target: DropTarget | null) {
  setState({ dropTarget: target })
}

function startRename(id: string) {
  setState({ renamingId: id })
}

function cancelRename() {
  setState({ renamingId: null })
}

/** Fetch all portal POIs across every map in this airport */
async function fetchAllPortals(): Promise<CrossMapPortal[]> {
  const { airportId } = state
  if (!airportId) return []

  const { data, error } = await supabase
    .from('maps')
    .select('id, name, graph_map')
    .eq('airport_id', airportId)

  if (error || !data) return []

  const portals: CrossMapPortal[] = []
  for (const row of data) {
    const graph = row.graph_map as Record<string, unknown> | null
    const pois = (graph?.pois ?? []) as Array<Record<string, unknown>>
    for (const p of pois) {
      const poiType = p.type as NodeType
      if (PORTAL_NODE_TYPES.includes(poiType)) {
        portals.push({
          poiId: p.id as string,
          mapId: row.id,
          mapName: row.name,
          type: poiType,
          name: (p.name as string) || '',
          linkedPortalIds: Array.isArray(p.linkedPortalIds) ? p.linkedPortalIds as string[] : [],
        })
      }
    }
  }
  return portals
}

/** Remove a deleted portal ID from linkedPortalIds in all OTHER maps (cross-map cleanup) */
async function unlinkPortalAcrossMaps(deletedPoiId: string, currentMapId: string) {
  const { airportId } = state
  if (!airportId) return

  const { data, error } = await supabase
    .from('maps')
    .select('id, graph_map')
    .eq('airport_id', airportId)
    .neq('id', currentMapId)

  if (error || !data) return

  for (const row of data) {
    const graph = row.graph_map as Record<string, unknown> | null
    if (!graph) continue
    const pois = (graph.pois ?? []) as Array<Record<string, unknown>>
    let changed = false

    for (const p of pois) {
      const linked = p.linkedPortalIds as string[] | undefined
      if (linked?.includes(deletedPoiId)) {
        p.linkedPortalIds = linked.filter(id => id !== deletedPoiId)
        changed = true
      }
    }

    if (changed) {
      await supabase
        .from('maps')
        .update({ graph_map: { ...graph, pois } })
        .eq('id', row.id)
    }
  }
}

// ── Exported actions object ────────────────────────────────────────────────

function getActiveMapId(): string | null {
  return state.activeMapId
}

export const mapTreeActions = {
  fetchTree,
  fetchAllPortals,
  unlinkPortalAcrossMaps,
  getActiveMapId,
  setActiveMap,
  toggleExpand,
  createMap,
  deleteMap,
  renameMap,
  moveMap,
  startRename,
  cancelRename,
  setDragState,
  setDropTarget,
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useMapTreeStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot)
  const tree = buildTree(snap.nodes)

  return {
    ...snap,
    tree,
    ...mapTreeActions,
  }
}
