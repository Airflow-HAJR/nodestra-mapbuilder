import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { EditorState, NodeType } from '../types'
import { PORTAL_NODE_TYPES, NODE_TYPE_LABELS, NODE_COLORS, EDGE_TYPE_LABELS } from '../types'
import type { MapDispatch } from '../useMapStore'
import { edgeWeight } from '../useMapStore'
import { mapTreeActions, type CrossMapPortal } from '../useMapTreeStore'
import { findNearestEdge } from '../utils/projection'
import { supabase } from '../../../lib/supabase'
import { NodeIcon, NodeSVGIcon } from './NodeIcon'
import { EdgeLayer, GhostEdge, POILinkLayer } from './EdgeLayer'
import { AddPOIMenu } from '../ui/AddPOIMenu'

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

interface Props {
  state: EditorState
  dispatch: MapDispatch
  onUploadImage: (file: File) => void
  hiddenTypes?: NodeType[]
  hideEdges?: boolean
  poiScale?: number
  portalScale?: number
  movementScale?: number
  layerOrder?: ('pois' | 'movement' | 'portals')[]
  addPOIMenuPos?: { screenX: number; screenY: number } | null
  onCloseAddPOIMenu?: () => void
  searchQuery?: string
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const SNAP_DISTANCE = 0.015  // normalized coords: 1.5% of canvas width (waypoint snap distance)

// Find waypoints near a given coordinate for snapping
function findNearbyWaypoints(x: number, y: number, waypoints: any[], snapDist: number = SNAP_DISTANCE) {
  return waypoints.filter(wp => {
    const dx = wp.x - x
    const dy = wp.y - y
    const dist = Math.hypot(dx, dy)
    return dist < snapDist
  }).sort((a, b) => {
    const distA = Math.hypot(a.x - x, a.y - y)
    const distB = Math.hypot(b.x - x, b.y - y)
    return distA - distB
  })
}

export function ImageCanvas({
  state, dispatch, onUploadImage, hiddenTypes = [], hideEdges = false,
  poiScale = 100, portalScale = 100, movementScale = 100,
  layerOrder = ['movement', 'portals', 'pois'],
  addPOIMenuPos, onCloseAddPOIMenu,
  searchQuery = '',
}: Props) {
  const { doc, activeTool, activeNodeType, activeEdgeType, edgeSource, selectedId, previewHighlightEdgeId } = state

  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasWorldRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const edgeSourcePosRef = useRef<{ x: number; y: number } | null>(null)
  const pendingEdgeWpRef = useRef<string | null>(null)

  const [displayZoom, setDisplayZoom] = useState(1)
  const [fittedScale, setFittedScale] = useState(1)

  const [imgSize, setImgSize] = useState({ w: 1, h: 1 })
  const [cursorNorm, setCursorNorm] = useState<{ x: number; y: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [imageOpacity, setImageOpacity] = useState(1)
  const [snapTarget, setSnapTarget] = useState<{ id: string; x: number; y: number } | null>(null)
  const [edgeSnapTarget, setEdgeSnapTarget] = useState<{ edgeId: string; x: number; y: number; t: number } | null>(null)
  const [isPanningCanvas, setIsPanningCanvas] = useState(false)
  const moveFrameRef = useRef<number | null>(null)
  const pendingCursorRef = useRef<{
    cursor: { x: number; y: number } | null
    snapTarget: { id: string; x: number; y: number } | null
    edgeSnapTarget: { edgeId: string; x: number; y: number; t: number } | null
  } | null>(null)

  // Track recently created items for placement animation
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set())
  const markRecent = useCallback((id: string) => {
    setRecentIds(prev => new Set(prev).add(id))
    setTimeout(() => setRecentIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    }), 300)
  }, [])

  // Track mousedown position to distinguish clicks from drags
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = canvasWorldRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => {
      mouseDownPosRef.current = null
    }
    el.addEventListener('mousedown', onDown)
    el.addEventListener('mouseup', onUp)
    el.addEventListener('mouseleave', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      el.removeEventListener('mouseup', onUp)
      el.removeEventListener('mouseleave', onUp)
    }
  }, [])


  // Waypoint / POI drag
  const dragRef = useRef<{
    itemId: string
    itemType: 'waypoint' | 'poi'
    startNormX: number; startNormY: number
    origX: number; origY: number
  } | null>(null)
  const panRef = useRef<{
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    scale: number
  } | null>(null)
  const [draggingPos, setDraggingPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [dragEdgeSnapTarget, setDragEdgeSnapTarget] = useState<{ edgeId: string; x: number; y: number; t: number } | null>(null)

  // Portal link popup — shown immediately after placing a portal node
  const [portalPopup, setPortalPopup] = useState<{ poiId: string; screenX: number; screenY: number } | null>(null)

  // Read the canvas-world's bounding rect directly — this has all library transforms baked in,
  // so we never need to replicate the library's internal coordinate math.
  const clientToNorm = useCallback((clientX: number, clientY: number) => {
    if (!canvasWorldRef.current) return { x: 0, y: 0 }
    const rect = canvasWorldRef.current.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    }
  }, [])

  function fitToView(w: number, h: number) {
    if (!viewportRef.current || !transformRef.current) return
    const rect = viewportRef.current.getBoundingClientRect()
    const newScale = Math.min(rect.width / w, rect.height / h) * 0.9
    const newX = (rect.width - w * newScale) / 2
    const newY = (rect.height - h * newScale) / 2
    transformRef.current.setTransform(newX, newY, newScale, 300, 'easeOut')
    setFittedScale(newScale)
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget
    // Use natural pixel dimensions so zooming in stays sharp
    setImgSize({ w: nw, h: nh })
    // Defer to next frame so TransformWrapper is fully mounted
    requestAnimationFrame(() => fitToView(nw, nh))
  }

  function handleCanvasClick(e: React.MouseEvent) {
    e.stopPropagation() // prevent double-fire if event also bubbles to viewport

    // Close portal popup on any canvas click
    if (portalPopup) {
      setPortalPopup(null)
      return
    }

    // Suppress click if mouse moved significantly (was a pan drag, not a click)
    const downPos = mouseDownPosRef.current
    mouseDownPosRef.current = null
    if (downPos) {
      const dx = e.clientX - downPos.x
      const dy = e.clientY - downPos.y
      if (dx * dx + dy * dy > 25) return // moved >5px — this was a drag
    }
    // Allow clicks on waypoints in draw-edge mode (for snapping), but block in other modes
    if ((e.target as HTMLElement).closest('.node-icon-wrapper, .waypoint-dot') && !(activeTool === 'draw-edge')) return

    const norm = clientToNorm(e.clientX, e.clientY)
    const x = Math.max(0, Math.min(1, norm.x))
    const y = Math.max(0, Math.min(1, norm.y))

    // Handle draw-edge mode: click to place start, click again to place end
    if (activeTool === 'draw-edge' && doc.imageUrl) {
      if (!edgeSource) {
        // First click: create start waypoint or snap to existing one
        const nearby = findNearbyWaypoints(x, y, doc.waypoints.filter(w => w.floor === doc.activeFloor))
        const targetWp = nearby[0]

        if (targetWp) {
          // Snap to existing waypoint — no new waypoint created, nothing to revert
          dispatch({ type: 'SET_EDGE_SOURCE', id: targetWp.id })
          edgeSourcePosRef.current = { x: targetWp.x, y: targetWp.y }
          pendingEdgeWpRef.current = null
        } else {
          // Create new waypoint and track it for possible revert on Escape
          const wpId = generateId('wp')
          dispatch({
            type: 'ADD_WAYPOINT',
            waypoint: { id: wpId, name: '', x, y, floor: doc.activeFloor },
          })
          markRecent(wpId)
          dispatch({ type: 'SET_EDGE_SOURCE', id: wpId })
          edgeSourcePosRef.current = { x, y }
          pendingEdgeWpRef.current = wpId
        }
      } else {
        // Second click: create end waypoint and connect with edge
        let toWpId: string
        let toWpPos: { x: number; y: number }

        // Check if snapped to edge first
        if (edgeSnapTarget) {
          toWpId = generateId('wp')
          toWpPos = { x: edgeSnapTarget.x, y: edgeSnapTarget.y }
          dispatch({
            type: 'ADD_WAYPOINT',
            waypoint: { id: toWpId, name: '', x: edgeSnapTarget.x, y: edgeSnapTarget.y, floor: doc.activeFloor },
          })
          markRecent(toWpId)
        } else {
          // Check for nearby waypoints
          const nearby = findNearbyWaypoints(x, y, doc.waypoints.filter(w => w.floor === doc.activeFloor))
          const targetWp = nearby[0]

          if (targetWp) {
            toWpId = targetWp.id
            toWpPos = { x: targetWp.x, y: targetWp.y }
          } else {
            toWpId = generateId('wp')
            toWpPos = { x, y }
            dispatch({
              type: 'ADD_WAYPOINT',
              waypoint: { id: toWpId, name: '', x, y, floor: doc.activeFloor },
            })
            markRecent(toWpId)
          }
        }

        // Create edge between source and target
        if (edgeSource !== toWpId) {
          let fromWpPos: { x: number; y: number } | null = edgeSourcePosRef.current
          if (!fromWpPos) {
            const fromWp = doc.waypoints.find(w => w.id === edgeSource)
            if (fromWp) {
              fromWpPos = { x: fromWp.x, y: fromWp.y }
            }
          }

          if (fromWpPos) {
            const edgeId = generateId('edge')
            const weight = edgeWeight(
              { x: fromWpPos.x, y: fromWpPos.y, id: edgeSource, name: '', floor: doc.activeFloor },
              { x: toWpPos.x, y: toWpPos.y, id: toWpId, name: '', floor: doc.activeFloor },
              doc.pixelsPerMeter
            )

            dispatch({
              type: 'ADD_EDGE',
              edge: {
                id: edgeId,
                from: edgeSource,
                to: toWpId,
                type: activeEdgeType,
                name: '',
                weight: weight,
                accessible: false,
              },
            })
            markRecent(edgeId)
          }
        }

        // Edge completed — chain: set source to the new endpoint
        pendingEdgeWpRef.current = null
        dispatch({ type: 'SET_EDGE_SOURCE', id: toWpId })
        edgeSourcePosRef.current = toWpPos
        setSnapTarget(null)
        setEdgeSnapTarget(null)
      }
      return
    }

    if (activeTool === 'add-waypoint' && doc.imageUrl) {
      const id = generateId('wp')
      dispatch({
        type: 'ADD_WAYPOINT',
        waypoint: { id, name: '', x, y, floor: doc.activeFloor },
      })
      markRecent(id)
      return
    }

    if (activeTool === 'add-poi' && doc.imageUrl) {
      const id = generateId(activeNodeType)
      dispatch({
        type: 'ADD_POI',
        poi: {
          id, type: activeNodeType,
          name: '', keywords: [],
          waypointId: null,
          projectedEdgeId: null,
          projectedT: null,
          linkedPortalIds: [],
          x, y, floor: doc.activeFloor,
        },
      })
      markRecent(id)
      // Auto-select the newly placed POI so the properties panel opens with name focused
      dispatch({ type: 'SET_SELECTION', id, selType: 'poi' })
      // Show link popup for portal nodes
      if (PORTAL_NODE_TYPES.includes(activeNodeType)) {
        setPortalPopup({ poiId: id, screenX: e.clientX, screenY: e.clientY })
      }
      return
    }

    // Clear selection when clicking on empty space (regardless of active tool)
    dispatch({ type: 'SET_SELECTION', id: null, selType: null })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!doc.imageUrl || activeTool !== 'draw-edge') return

    const norm = clientToNorm(e.clientX, e.clientY)
    let nextSnapTarget: { id: string; x: number; y: number } | null = null
    let nextEdgeSnapTarget: { edgeId: string; x: number; y: number; t: number } | null = null

    if (edgeSource) {
      // Check waypoints first (higher priority)
      const nearby = findNearbyWaypoints(
        norm.x,
        norm.y,
        doc.waypoints.filter(w => w.floor === doc.activeFloor && w.id !== edgeSource),
      )
      if (nearby.length > 0) {
        nextSnapTarget = { id: nearby[0].id, x: nearby[0].x, y: nearby[0].y }
      }

      // If no waypoint snap, check for edge snaps
      if (!nextSnapTarget) {
        const floorEdges = doc.edges.filter(e => {
          const from = doc.waypoints.find(w => w.id === e.from)
          const to = doc.waypoints.find(w => w.id === e.to)
          return from?.floor === doc.activeFloor && to?.floor === doc.activeFloor
        })
        const nearestEdge = findNearestEdge(norm.x, norm.y, floorEdges, doc.waypoints, doc.activeFloor)
        if (nearestEdge) {
          const dist = Math.hypot(norm.x - nearestEdge.x, norm.y - nearestEdge.y)
          const EDGE_SNAP_DISTANCE = 0.06  // snap distance: 6% of canvas (significantly larger than waypoint snap)
          if (dist < EDGE_SNAP_DISTANCE) {
            nextEdgeSnapTarget = { edgeId: nearestEdge.edgeId, x: nearestEdge.x, y: nearestEdge.y, t: nearestEdge.t }
          }
        }
      }
    }

    pendingCursorRef.current = { cursor: norm, snapTarget: nextSnapTarget, edgeSnapTarget: nextEdgeSnapTarget }
    if (moveFrameRef.current !== null) return

    moveFrameRef.current = requestAnimationFrame(() => {
      moveFrameRef.current = null
      const pending = pendingCursorRef.current
      if (!pending) return
      setCursorNorm(pending.cursor)
      setSnapTarget((prev) => {
        if (
          prev?.id === pending.snapTarget?.id &&
          prev?.x === pending.snapTarget?.x &&
          prev?.y === pending.snapTarget?.y
        ) {
          return prev
        }
        return pending.snapTarget
      })
      setEdgeSnapTarget(pending.edgeSnapTarget)
    })
  }

  function handleWaypointClick(wpId: string, e: React.MouseEvent) {
    e.stopPropagation()

    // Switch to select mode if in a placer tool
    if (activeTool !== 'select' && activeTool !== 'draw-edge') {
      dispatch({ type: 'SET_TOOL', tool: 'select' })
      dispatch({ type: 'SET_SELECTION', id: wpId, selType: 'waypoint' })
      return
    }

    if (activeTool === 'draw-edge') {
      if (!edgeSource) {
        dispatch({ type: 'SET_EDGE_SOURCE', id: wpId })
        const wp = doc.waypoints.find(w => w.id === wpId)
        if (wp) {
          edgeSourcePosRef.current = { x: wp.x, y: wp.y }
        }
      } else if (edgeSource !== wpId) {
        const from = doc.waypoints.find(w => w.id === edgeSource)
        const to = doc.waypoints.find(w => w.id === wpId)
        if (from && to) {
          const edgeId = generateId('edge')
          dispatch({
            type: 'ADD_EDGE',
            edge: {
              id: edgeId,
              name: '',
              from: edgeSource,
              to: wpId,
              type: activeEdgeType,
              weight: edgeWeight(from, to, doc.pixelsPerMeter),
              accessible: false,
            },
          })
          markRecent(edgeId)
        }
        // Chain: set source to the clicked waypoint
        pendingEdgeWpRef.current = null
        dispatch({ type: 'SET_EDGE_SOURCE', id: wpId })
        edgeSourcePosRef.current = to ? { x: to.x, y: to.y } : null
        setSnapTarget(null)
        setEdgeSnapTarget(null)
      }
      return
    }

    dispatch({ type: 'SET_SELECTION', id: wpId, selType: 'waypoint' })
  }

  function handleViewportMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return

    // Blur any focused input so keyboard shortcuts (Delete, Backspace, etc.) work after clicking canvas
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur?.()
    }

    if (!transformRef.current) return

    const target = e.target as Element | null
    const isInteractive = !!target?.closest(
      '.node-icon-wrapper, .edge-hit-area, .canvas-ctrl-btn, .canvas-opacity, .canvas-replace-btn, button, input, label'
    )
    if (isInteractive) return

    const { positionX, positionY, scale } = transformRef.current.instance.transformState
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: positionX,
      startY: positionY,
      scale,
    }
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    setIsPanningCanvas(true)
    e.preventDefault()
  }

  // Drag start for waypoints and POIs
  function handleItemDragStart(itemId: string, itemType: 'waypoint' | 'poi', e: React.MouseEvent) {
    // If in a placer tool, switch to select mode so the user can move existing items
    if (activeTool !== 'select' && activeTool !== 'draw-edge') {
      dispatch({ type: 'SET_TOOL', tool: 'select' })
    }
    if (activeTool === 'draw-edge') return
    e.stopPropagation()
    const items = itemType === 'waypoint' ? doc.waypoints : doc.pois
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const norm = clientToNorm(e.clientX, e.clientY)
    dragRef.current = {
      itemId, itemType,
      startNormX: norm.x, startNormY: norm.y,
      origX: item.x, origY: item.y,
    }
    setDraggingPos({ id: itemId, x: item.x, y: item.y })
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (panRef.current && transformRef.current) {
        const dx = e.clientX - panRef.current.startClientX
        const dy = e.clientY - panRef.current.startClientY
        transformRef.current.setTransform(
          panRef.current.startX + dx,
          panRef.current.startY + dy,
          panRef.current.scale,
          0
        )
        return
      }

      if (!dragRef.current) return
      const norm = clientToNorm(e.clientX, e.clientY)
      const newX = Math.max(0, Math.min(1, dragRef.current.origX + norm.x - dragRef.current.startNormX))
      const newY = Math.max(0, Math.min(1, dragRef.current.origY + norm.y - dragRef.current.startNormY))
      setDraggingPos({ id: dragRef.current.itemId, x: newX, y: newY })

      // Update state in real-time for edges to follow
      if (dragRef.current.itemType === 'waypoint') {
        dispatch({ type: 'MOVE_WAYPOINT', id: dragRef.current.itemId, x: newX, y: newY })
        // Detect nearby waypoint for merge preview (only if not on the same edge)
        const dragId = dragRef.current.itemId
        const siblings = new Set(
          doc.edges.filter(e => e.from === dragId || e.to === dragId)
            .map(e => e.from === dragId ? e.to : e.from)
        )
        const nearby = findNearbyWaypoints(
          newX, newY,
          doc.waypoints.filter(w => w.floor === doc.activeFloor && w.id !== dragId && !siblings.has(w.id)),
          SNAP_DISTANCE,
        )
        if (nearby.length > 0) {
          setMergeTargetId(nearby[0].id)
          setDragEdgeSnapTarget(null)
        } else {
          setMergeTargetId(null)
          // Check edge proximity for split-and-merge
          const connectedEdgeIds = new Set(
            doc.edges.filter(e => e.from === dragId || e.to === dragId).map(e => e.id)
          )
          const candidateEdges = doc.edges.filter(e => !connectedEdgeIds.has(e.id))
          const nearest = findNearestEdge(newX, newY, candidateEdges, doc.waypoints, doc.activeFloor)
          const DRAG_EDGE_SNAP_DIST = 0.025
          if (nearest && Math.hypot(newX - nearest.x, newY - nearest.y) < DRAG_EDGE_SNAP_DIST) {
            setDragEdgeSnapTarget(nearest)
          } else {
            setDragEdgeSnapTarget(null)
          }
        }
      }
    }
    function onUp() {
      if (panRef.current) {
        panRef.current = null
        setIsPanningCanvas(false)
      }
      if (dragRef.current && draggingPos) {
        const { itemId, itemType } = dragRef.current
        if (itemType === 'waypoint') {
          // Check if dropped near another waypoint — merge if so (only different edges)
          const sibs = new Set(
            doc.edges.filter(e => e.from === itemId || e.to === itemId)
              .map(e => e.from === itemId ? e.to : e.from)
          )
          const nearby = findNearbyWaypoints(
            draggingPos.x, draggingPos.y,
            doc.waypoints.filter(w => w.floor === doc.activeFloor && w.id !== itemId && !sibs.has(w.id)),
            SNAP_DISTANCE,
          )
          if (nearby.length > 0) {
            dispatch({ type: 'MERGE_WAYPOINTS', sourceId: itemId, targetId: nearby[0].id })
          } else if (dragEdgeSnapTarget) {
            dispatch({
              type: 'SPLIT_EDGE_AND_MERGE',
              sourceId: itemId,
              edgeId: dragEdgeSnapTarget.edgeId,
              x: dragEdgeSnapTarget.x,
              y: dragEdgeSnapTarget.y,
              t: dragEdgeSnapTarget.t,
            })
          } else {
            dispatch({ type: 'FINALIZE_WAYPOINT_MOVE', id: itemId, x: draggingPos.x, y: draggingPos.y })
          }
        } else {
          dispatch({ type: 'MOVE_POI', id: itemId, x: draggingPos.x, y: draggingPos.y })
        }
      }
      dragRef.current = null
      setDraggingPos(null)
      setMergeTargetId(null)
      setDragEdgeSnapTarget(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [clientToNorm, draggingPos, dragEdgeSnapTarget, dispatch])

  useEffect(() => () => {
    if (moveFrameRef.current !== null) {
      cancelAnimationFrame(moveFrameRef.current)
    }
  }, [])

  // Revert pending edge waypoint on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && pendingEdgeWpRef.current) {
        dispatch({ type: 'DELETE_WAYPOINT', id: pendingEdgeWpRef.current })
        pendingEdgeWpRef.current = null
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  useEffect(() => {
    if (activeTool !== 'draw-edge') {
      setCursorNorm(null)
      setSnapTarget(null)
      setEdgeSnapTarget(null)
      // Revert pending waypoint if tool changed mid-edge
      if (pendingEdgeWpRef.current) {
        dispatch({ type: 'DELETE_WAYPOINT', id: pendingEdgeWpRef.current })
        pendingEdgeWpRef.current = null
      }
    }
  }, [activeTool, dispatch])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/') || file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf')) {
      onUploadImage(file)
    }
  }

  const floorWaypoints = doc.waypoints.filter(w => w.floor === doc.activeFloor)
  const floorEdges = doc.edges.filter(e => {
    const from = doc.waypoints.find(w => w.id === e.from)
    const to = doc.waypoints.find(w => w.id === e.to)
    return from?.floor === doc.activeFloor && to?.floor === doc.activeFloor
  })
  const floorPois = doc.pois.filter(p => p.floor === doc.activeFloor && !hiddenTypes.includes(p.type))

  // Search filter: compute which IDs match the search query
  const isSearchActive = searchQuery.trim().length > 0
  const searchMatchIds = useMemo(() => {
    if (!isSearchActive) return null
    const q = searchQuery.trim().toLowerCase()
    const matched = new Set<string>()

    // Match POIs by name, type label, type key, keywords, or ID
    for (const poi of floorPois) {
      const typeLabel = NODE_TYPE_LABELS[poi.type]?.toLowerCase() ?? ''
      const typeKey = poi.type.replace(/-/g, ' ').toLowerCase()
      if (
        poi.name.toLowerCase().startsWith(q) ||
        poi.id.toLowerCase().startsWith(q) ||
        typeLabel.startsWith(q) ||
        typeKey.startsWith(q) ||
        poi.keywords.some(k => k.toLowerCase().startsWith(q))
      ) {
        matched.add(poi.id)
      }
    }

    // Match edges by name, type label, type key, or ID
    for (const edge of floorEdges) {
      const typeLabel = EDGE_TYPE_LABELS[edge.type]?.toLowerCase() ?? ''
      const typeKey = edge.type.replace(/-/g, ' ').toLowerCase()
      if (
        edge.name.toLowerCase().startsWith(q) ||
        edge.id.toLowerCase().startsWith(q) ||
        typeLabel.startsWith(q) ||
        typeKey.startsWith(q)
      ) {
        matched.add(edge.id)
        // Also highlight waypoints connected to matching edges
        matched.add(edge.from)
        matched.add(edge.to)
      }
    }

    // Match waypoints by name or ID
    for (const wp of floorWaypoints) {
      if (wp.name.toLowerCase().startsWith(q) || wp.id.toLowerCase().startsWith(q)) {
        matched.add(wp.id)
      }
    }

    return matched
  }, [searchQuery, isSearchActive, floorPois, floorEdges, floorWaypoints])

  // Helper to get opacity based on search match
  const searchOpacity = useCallback((id: string) => {
    if (!isSearchActive || !searchMatchIds) return 1
    return searchMatchIds.has(id) ? 1 : 0.2
  }, [isSearchActive, searchMatchIds])

  // Precompute waypoint degree map for visual differentiation
  const wpDegree = new Map<string, number>()
  for (const e of floorEdges) {
    wpDegree.set(e.from, (wpDegree.get(e.from) ?? 0) + 1)
    wpDegree.set(e.to, (wpDegree.get(e.to) ?? 0) + 1)
  }

  const edgeSourceWp = edgeSource ? doc.waypoints.find(w => w.id === edgeSource) : null

  // Track which waypoint the cursor is hovering over during edge drawing
  // COMMENTED OUT: Edge snapping now uses snapTarget state instead
  // const [edgeTargetId, setEdgeTargetId] = useState<string | null>(null)

  const canvasCursor = isPanningCanvas || dragRef.current ? 'grabbing'
    : activeTool === 'add-waypoint' ? 'crosshair'
    : activeTool === 'add-poi' ? 'crosshair'
    : activeTool === 'draw-edge' ? 'crosshair'
    : 'default'

  if (!doc.imageUrl) {
    return (
      <EmptyState
        isDragOver={isDragOver}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClickUpload={() => fileInputRef.current?.click()}
        fileInputRef={fileInputRef}
        onFileSelect={onUploadImage}
      />
    )
  }

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      style={{ cursor: canvasCursor }}
      onMouseDown={handleViewportMouseDown}
      onMouseMove={handleMouseMove}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={(e) => {
        // Close dashboard when clicking on blank viewport area (not on canvas-world)
        if ((e.target as HTMLElement).closest('.canvas-world')) return
        dispatch({ type: 'SET_SELECTION', id: null, selType: null })
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isDragOver && <div className="canvas-drop-overlay"><span>Drop to replace floor plan</span></div>}

      {/* Dot grid overlay in placement modes */}
      {(activeTool === 'add-waypoint' || activeTool === 'add-poi') && <div className="canvas-grid-overlay" />}

        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={MIN_ZOOM}
          maxScale={MAX_ZOOM}
          limitToBounds={false}
          disablePadding
          panning={{
            disabled: true,
          }}
          wheel={{ step: Math.max(0.03, fittedScale * 0.18), smoothStep: Math.max(0.003, fittedScale * 0.012) }}
          doubleClick={{ disabled: true }}
          onTransformed={(_, s) => setDisplayZoom(s.scale)}
        >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
        >
          <div
            ref={canvasWorldRef}
            className="canvas-world"
            style={{ width: imgSize.w, height: imgSize.h }}
            onClick={handleCanvasClick}
          >
            {/* Floor plan image */}
            <img
              src={doc.imageUrl}
              draggable={false}
              onLoad={handleImageLoad}
              style={{
                display: 'block', width: imgSize.w, height: imgSize.h,
                userSelect: 'none', opacity: imageOpacity,
                filter: `contrast(1.08) brightness(1.02)`,
              }}
              alt="Floor plan"
            />

            {/* Render layers in configurable z-order */}
            {layerOrder.map((layer, layerIdx) => {
              if (layer === 'movement') return (
                <div key="movement" style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: layerIdx + 1 }}>
                  {/* SVG overlay: edges + ghost edge */}
                  <svg
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      width: imgSize.w, height: imgSize.h,
                      overflow: 'visible', pointerEvents: 'none',
                    }}
                    shapeRendering="geometricPrecision"
                  >
                    <g style={{ pointerEvents: 'all' }}>
                      {!hideEdges && (
                        <EdgeLayer
                          edges={floorEdges}
                          waypoints={floorWaypoints}
                          selectedId={selectedId}
                          previewHighlightEdgeId={previewHighlightEdgeId}
                          imgW={imgSize.w}
                          imgH={imgSize.h}
                          recentIds={recentIds}
                          zoomScale={displayZoom}
                          sizeScale={movementScale / 100}
                          onSelect={id => dispatch({ type: 'SET_SELECTION', id, selType: 'edge' })}
                          searchOpacity={isSearchActive ? searchOpacity : undefined}
                        />
                      )}
                      {!hideEdges && (
                        <POILinkLayer
                          pois={floorPois}
                          waypoints={floorWaypoints}
                          edges={floorEdges}
                          imgW={imgSize.w}
                          imgH={imgSize.h}
                          selectedId={selectedId}
                          zoomScale={displayZoom}
                          draggingPos={draggingPos}
                        />
                      )}
                      {edgeSourceWp && (
                        <GhostEdge
                          from={edgeSourceWp}
                          cursorNorm={cursorNorm}
                          snapTarget={snapTarget}
                          edgeSnapTarget={edgeSnapTarget}
                          imgW={imgSize.w}
                          imgH={imgSize.h}
                          zoomScale={displayZoom}
                        />
                      )}
                      {/* Edge split snap indicator during waypoint drag */}
                      {dragEdgeSnapTarget && (
                        <g style={{ pointerEvents: 'none' }}>
                          <circle
                            cx={dragEdgeSnapTarget.x * imgSize.w}
                            cy={dragEdgeSnapTarget.y * imgSize.h}
                            r={10 / displayZoom}
                            fill="none"
                            stroke="#22c55e"
                            strokeWidth={2.5 / displayZoom}
                            opacity={0.9}
                          />
                          <circle
                            cx={dragEdgeSnapTarget.x * imgSize.w}
                            cy={dragEdgeSnapTarget.y * imgSize.h}
                            r={4 / displayZoom}
                            fill="#22c55e"
                            opacity={1}
                          />
                        </g>
                      )}
                    </g>
                  </svg>

                  {/* Waypoint dots */}
                  {floorWaypoints.map(wp => {
                    const overridePos = draggingPos?.id === wp.id
                      ? { x: draggingPos.x, y: draggingPos.y }
                      : undefined
                    const pos = overridePos ?? { x: wp.x, y: wp.y }
                    const isSelected = selectedId === wp.id
                    const isEdgeSource = edgeSource === wp.id
                    const isSnapTarget = snapTarget && snapTarget.id === wp.id
                    const isMergeTarget = mergeTargetId === wp.id
                    const isDraggingThis = draggingPos?.id === wp.id
                    const isMerging = isMergeTarget || (isDraggingThis && mergeTargetId !== null)
                    const isJustPlaced = recentIds.has(wp.id)
                    const degree = wpDegree.get(wp.id) ?? 0
                    const isCurve = degree <= 2

                    const baseSize = isCurve ? 8 : 11
                    const activeSize = isSelected || isEdgeSource || isSnapTarget || isMerging
                      ? (isCurve ? 12 : 15)
                      : baseSize

                    const inverseScale = 1 / displayZoom

                    return (
                      <div
                        key={wp.id}
                        className={`node-icon-wrapper waypoint-dot${isJustPlaced ? ' just-placed' : ''}`}
                        style={{ left: pos.x * imgSize.w, top: pos.y * imgSize.h, transform: `translate(-50%, -50%) scale(${inverseScale})`, opacity: searchOpacity(wp.id), transition: 'opacity 0.2s' }}
                        onMouseDown={(e) => handleItemDragStart(wp.id, 'waypoint', e)}
                        onClick={(e) => handleWaypointClick(wp.id, e)}
                      >
                        {isSnapTarget && (
                          <div className="edge-snap-ring" />
                        )}
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            width: activeSize + 15,
                            height: activeSize + 15,
                            borderRadius: '50%',
                            border: '2px solid #2A4A5E',
                            filter: 'blur(4px)',
                            opacity: 0.4,
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                          }} />
                        )}
                        <div style={{
                          width: activeSize,
                          height: activeSize,
                          borderRadius: '50%',
                          background: isMerging ? '#22c55e'
                            : isEdgeSource ? '#2A4A5E'
                            : isSnapTarget ? '#22c55e'
                            : isCurve ? 'rgba(42, 74, 94, 0.4)'
                            : '#2A4A5E',
                          border: isMerging
                            ? '3px solid #22c55e'
                            : isSnapTarget
                            ? '3px solid #22c55e'
                            : isSelected
                            ? '3px solid #2A4A5E'
                            : isCurve
                            ? '2px solid rgba(42, 74, 94, 0.25)'
                            : '3px solid rgba(42, 74, 94, 0.6)',
                          opacity: 1,
                          boxShadow: isMerging
                            ? '0 0 0 3px white, 0 0 0 6px #22c55e, 0 0 16px rgba(34,197,94,0.5)'
                            : isSnapTarget
                            ? '0 0 0 3px white, 0 0 0 6px #22c55e, 0 0 14px rgba(34,197,94,0.4)'
                            : isSelected
                            ? '0 0 10px rgba(42, 74, 94, 0.3)'
                            : 'none',
                          transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          cursor: activeTool === 'select' ? 'grab' : 'default',
                          position: 'relative',
                          zIndex: 1,
                          transform: isMerging ? 'scale(1.6)' : isSelected ? 'scale(1.3)' : 'scale(1)',
                        }} />
                      </div>
                    )
                  })}
                </div>
              )

              if (layer === 'pois') return (
                <div key="pois" style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: layerIdx + 1, pointerEvents: 'none' }}>
                  {floorPois.filter(p => !PORTAL_NODE_TYPES.includes(p.type)).map(poi => {
                    const overridePos = draggingPos?.id === poi.id
                      ? { x: draggingPos.x, y: draggingPos.y }
                      : undefined
                    return (
                      <NodeIcon
                        key={poi.id}
                        poi={poi}
                        imgWidth={imgSize.w}
                        imgHeight={imgSize.h}
                        selected={selectedId === poi.id}
                        isUnlinked={poi.projectedEdgeId === null}
                        isJustPlaced={recentIds.has(poi.id)}
                        zoomScale={displayZoom}
                        overridePos={overridePos}
                        sizeScale={poiScale / 100}
                        searchOpacity={searchOpacity(poi.id)}
                        onSelect={() => {
                          if (activeTool === 'add-poi') return
                          if (activeTool !== 'select') dispatch({ type: 'SET_TOOL', tool: 'select' })
                          dispatch({ type: 'SET_SELECTION', id: poi.id, selType: 'poi' })
                        }}
                        onDragStart={(id, e) => handleItemDragStart(id, 'poi', e)}
                      />
                    )
                  })}
                </div>
              )

              if (layer === 'portals') return (
                <div key="portals" style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: layerIdx + 1, pointerEvents: 'none' }}>
                  {floorPois.filter(p => PORTAL_NODE_TYPES.includes(p.type)).map(poi => {
                    const overridePos = draggingPos?.id === poi.id
                      ? { x: draggingPos.x, y: draggingPos.y }
                      : undefined
                    return (
                      <NodeIcon
                        key={poi.id}
                        poi={poi}
                        imgWidth={imgSize.w}
                        imgHeight={imgSize.h}
                        selected={selectedId === poi.id}
                        isUnlinked={poi.projectedEdgeId === null}
                        isJustPlaced={recentIds.has(poi.id)}
                        zoomScale={displayZoom}
                        overridePos={overridePos}
                        sizeScale={portalScale / 100}
                        searchOpacity={searchOpacity(poi.id)}
                        onSelect={() => {
                          if (activeTool === 'add-poi') return
                          if (activeTool !== 'select') dispatch({ type: 'SET_TOOL', tool: 'select' })
                          dispatch({ type: 'SET_SELECTION', id: poi.id, selType: 'poi' })
                        }}
                        onDragStart={(id, e) => handleItemDragStart(id, 'poi', e)}
                      />
                    )
                  })}
                </div>
              )

              return null
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* Drawing hints */}
      {activeTool === 'draw-edge' && (
        <div className="canvas-hint">
          {edgeSource
            ? 'Click to place end point · Esc to cancel'
            : 'Click to place start point'}
        </div>
      )}
      {activeTool === 'add-waypoint' && (
        <div className="canvas-hint">Click to place a waypoint</div>
      )}
      {activeTool === 'add-poi' && (
        <div className="canvas-hint">Click to place a POI — projects onto nearest edge</div>
      )}

      {/* Controls */}
      <div className="canvas-controls">
        <button className="canvas-ctrl-btn" onClick={() => transformRef.current?.zoomIn(0.5)} title="Zoom in">+</button>
        <span className="canvas-zoom-level">{Math.round(displayZoom * 100)}%</span>
        <button className="canvas-ctrl-btn" onClick={() => transformRef.current?.zoomOut(0.5)} title="Zoom out">−</button>
        <div className="canvas-ctrl-divider" />
        <button className="canvas-ctrl-btn" onClick={() => fitToView(imgSize.w, imgSize.h)} title="Fit to view">⊡</button>
      </div>

      {/* Opacity slider */}
      <div className="canvas-opacity">
        <span className="canvas-opacity-label">Image</span>
        <input
          type="range" min={0.1} max={1} step={0.05}
          value={imageOpacity}
          onChange={e => setImageOpacity(Number(e.target.value))}
          className="canvas-opacity-slider"
          title={`Image opacity: ${Math.round(imageOpacity * 100)}%`}
        />
        <span className="canvas-opacity-pct">{Math.round(imageOpacity * 100)}%</span>
      </div>

      {/* Replace button */}
      <button className="canvas-replace-btn" onClick={() => fileInputRef.current?.click()}>
        ↑ Replace image
      </button>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUploadImage(f); e.target.value = '' }} />

      {/* Portal link popup */}
      {portalPopup && (
        <PortalLinkPopup
          poiId={portalPopup.poiId}
          screenX={portalPopup.screenX}
          screenY={portalPopup.screenY}
          doc={doc}
          dispatch={dispatch}
          onClose={() => setPortalPopup(null)}
        />
      )}

      {/* Shift+A quick-add POI menu */}
      {addPOIMenuPos && (
        <AddPOIMenu
          screenX={addPOIMenuPos.screenX}
          screenY={addPOIMenuPos.screenY}
          onSelectType={(type) => {
            const norm = clientToNorm(addPOIMenuPos.screenX, addPOIMenuPos.screenY)
            const x = Math.max(0, Math.min(1, norm.x))
            const y = Math.max(0, Math.min(1, norm.y))
            const id = generateId(type)
            dispatch({
              type: 'ADD_POI',
              poi: {
                id, type,
                name: '', keywords: [],
                waypointId: null,
                projectedEdgeId: null,
                projectedT: null,
                linkedPortalIds: [],
                x, y, floor: doc.activeFloor,
              },
            })
            markRecent(id)
            dispatch({ type: 'SET_SELECTION', id, selType: 'poi' })
            if (PORTAL_NODE_TYPES.includes(type)) {
              setPortalPopup({ poiId: id, screenX: addPOIMenuPos.screenX, screenY: addPOIMenuPos.screenY })
            }
            onCloseAddPOIMenu?.()
          }}
          onClose={() => onCloseAddPOIMenu?.()}
        />
      )}
    </div>
  )
}

// ── Portal Link Popup ─────────────────────────────────────────────────────

function PortalLinkPopup({ poiId, screenX, screenY, doc, dispatch, onClose }: {
  poiId: string
  screenX: number
  screenY: number
  doc: import('../types').MapDocument
  dispatch: MapDispatch
  onClose: () => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)
  const poi = doc.pois.find(p => p.id === poiId)

  const [crossMapPortals, setCrossMapPortals] = useState<CrossMapPortal[]>([])
  const [isLoadingPortals, setIsLoadingPortals] = useState(true)

  // Fetch all portal nodes across all maps on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingPortals(true)
      const portals = await mapTreeActions.fetchAllPortals()
      if (!cancelled) {
        setCrossMapPortals(portals)
        setIsLoadingPortals(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Use fixed positioning with viewport clamping
  const POPUP_W = 280
  const POPUP_MAX_H = 380
  let posX = screenX + 16
  let posY = screenY - 12

  // Clamp to viewport so popup doesn't overflow
  if (posX + POPUP_W > window.innerWidth) posX = window.innerWidth - POPUP_W - 8
  if (posY + POPUP_MAX_H > window.innerHeight) posY = window.innerHeight - POPUP_MAX_H - 8
  if (posX < 8) posX = 8
  if (posY < 8) posY = 8

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!poi) return null

  // Filter: same type, exclude self
  const candidates = crossMapPortals.filter(
    p => p.poiId !== poi.id && p.type === poi.type
  )

  const linkedIds = new Set(poi.linkedPortalIds ?? [])

  function toggleLink(targetPoiId: string) {
    const current = poi!.linkedPortalIds ?? []
    let next: string[]

    if (current.includes(targetPoiId)) {
      next = current.filter(id => id !== targetPoiId)
    } else {
      next = [...current, targetPoiId]
    }

    // Update this POI locally
    dispatch({ type: 'UPDATE_POI', id: poi!.id, patch: { linkedPortalIds: next } })

    // Also update the target's linkedPortalIds in its map via Supabase
    const targetPortal = crossMapPortals.find(p => p.poiId === targetPoiId)
    if (targetPortal) {
      updateCrossMapPortalLink(targetPortal, poi!.id, !current.includes(targetPoiId))
    }
  }

  const typeName = NODE_TYPE_LABELS[poi.type].toLowerCase()

  // Group candidates by map
  const byMap = new Map<string, { mapName: string; portals: CrossMapPortal[] }>()
  for (const c of candidates) {
    if (!byMap.has(c.mapId)) {
      byMap.set(c.mapId, { mapName: c.mapName, portals: [] })
    }
    byMap.get(c.mapId)!.portals.push(c)
  }

  return (
    <div
      ref={popupRef}
      className="portal-link-popup"
      style={{ position: 'fixed', left: posX, top: posY }}
    >
      <div className="portal-link-popup-header">
        <div className="portal-link-popup-icon" style={{ background: NODE_COLORS[poi.type].bg, color: NODE_COLORS[poi.type].text }}>
          <NodeSVGIcon type={poi.type} size={20} />
        </div>
        <div className="portal-link-popup-title">
          <span className="portal-link-popup-heading">Link {NODE_TYPE_LABELS[poi.type]}</span>
          <span className="portal-link-popup-sub">Connect to {typeName}s on other maps</span>
        </div>
        <button className="portal-link-popup-close" onClick={onClose}>×</button>
      </div>

      {isLoadingPortals ? (
        <div className="portal-link-popup-empty">Loading portals...</div>
      ) : candidates.length === 0 ? (
        <div className="portal-link-popup-empty">
          No other {typeName}s across any map yet.
          <br />You can link later from the properties panel.
        </div>
      ) : (
        <div className="portal-link-popup-list">
          {Array.from(byMap.entries()).map(([mapId, { mapName, portals }]) => (
            <div key={mapId}>
              <div className="portal-link-popup-map-label">{mapName}</div>
              {portals.map(p => {
                const isLinked = linkedIds.has(p.poiId)
                const namePart = p.name ? `${p.name}, ` : ''
                const label = `${namePart}${NODE_TYPE_LABELS[p.type]}, ${mapName}`
                return (
                  <button
                    key={p.poiId}
                    className={`portal-link-popup-option${isLinked ? ' linked' : ''}`}
                    onClick={() => toggleLink(p.poiId)}
                  >
                    <span
                      className="portal-link-popup-check"
                      style={isLinked ? { background: NODE_COLORS[p.type].bg, borderColor: NODE_COLORS[p.type].bg } : undefined}
                    >
                      {isLinked && (
                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="portal-link-popup-label">{label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <button className="portal-link-popup-done" onClick={onClose}>
        {linkedIds.size > 0 ? 'Done' : 'Skip for now'}
      </button>
    </div>
  )
}

/** Update a portal POI's linkedPortalIds in another map via Supabase */
async function updateCrossMapPortalLink(target: CrossMapPortal, sourcePoi: string, adding: boolean) {
  // Fetch the target map's graph_map
  const { data: mapRow } = await supabase
    .from('maps')
    .select('graph_map')
    .eq('id', target.mapId)
    .maybeSingle()

  if (!mapRow?.graph_map) return

  const graph = mapRow.graph_map as Record<string, unknown>
  const pois = (graph.pois ?? []) as Array<Record<string, unknown>>

  const targetPoi = pois.find(p => p.id === target.poiId)
  if (!targetPoi) return

  const currentLinks = Array.isArray(targetPoi.linkedPortalIds) ? targetPoi.linkedPortalIds as string[] : []

  if (adding) {
    if (!currentLinks.includes(sourcePoi)) {
      targetPoi.linkedPortalIds = [...currentLinks, sourcePoi]
    }
  } else {
    targetPoi.linkedPortalIds = currentLinks.filter(id => id !== sourcePoi)
  }

  // Write back
  await supabase
    .from('maps')
    .update({ graph_map: graph, updated_at: new Date().toISOString() })
    .eq('id', target.mapId)
}

// ── Empty State ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onClickUpload: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (file: File) => void
}

function EmptyState({ isDragOver, onDragOver, onDragLeave, onDrop, onClickUpload, fileInputRef, onFileSelect }: EmptyStateProps) {
  return (
    <div className={`canvas-empty${isDragOver ? ' drag-over' : ''}`}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <svg className="ghost-terminal" viewBox="0 0 900 500" aria-hidden="true">
        <rect x="330" y="160" width="240" height="180" rx="10" fill="#e2e5ec" />
        <rect x="90" y="218" width="240" height="64" rx="6" fill="#e2e5ec" />
        <rect x="100" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="158" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="216" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="274" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="100" y="282" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="158" y="282" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="216" y="282" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="570" y="218" width="240" height="64" rx="6" fill="#e2e5ec" />
        <rect x="580" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="638" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="696" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="754" y="148" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="580" y="282" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="638" y="282" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="696" y="282" width="44" height="70" rx="5" fill="#e2e5ec" />
        <rect x="240" y="228" width="90" height="44" fill="#e2e5ec" />
        <rect x="570" y="228" width="90" height="44" fill="#e2e5ec" />
        <circle cx="122" cy="183" r="5" fill="#d1d5db" />
        <circle cx="180" cy="183" r="5" fill="#d1d5db" />
        <circle cx="238" cy="183" r="5" fill="#d1d5db" />
        <circle cx="296" cy="183" r="5" fill="#d1d5db" />
        <circle cx="602" cy="183" r="5" fill="#d1d5db" />
        <circle cx="660" cy="183" r="5" fill="#d1d5db" />
        <circle cx="718" cy="183" r="5" fill="#d1d5db" />
        <circle cx="776" cy="183" r="5" fill="#d1d5db" />
        <line x1="122" y1="183" x2="296" y2="183" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round" />
        <line x1="602" y1="183" x2="776" y2="183" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round" />
      </svg>

      <div className="canvas-upload-card" onClick={onClickUpload}>
        <div className="canvas-upload-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="canvas-upload-title">Upload your floor plan</div>
        <div className="canvas-upload-sub">Drop an image here or click to browse</div>
        <div className="canvas-upload-formats">PNG · JPG · WEBP · PDF</div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); e.target.value = '' }} />
    </div>
  )
}
