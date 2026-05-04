import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, Plus, Trash2, Map, GripVertical } from 'lucide-react'
import { useMapTreeStore, type TreeNodeWithChildren, type DropPosition } from '../useMapTreeStore'

// ── Drag helpers ──────────────────────────────────────────────────────────

/** Determine drop position based on mouse Y within the row */
function getDropPosition(e: React.DragEvent, el: HTMLElement): DropPosition {
  const rect = el.getBoundingClientRect()
  const y = e.clientY - rect.top
  const h = rect.height
  if (y < h * 0.25) return 'before'
  if (y > h * 0.75) return 'after'
  return 'inside'
}

// ── Tree item ─────────────────────────────────────────────────────────────

function MapTreeItem({
  node,
  depth,
}: {
  node: TreeNodeWithChildren
  depth: number
}) {
  const {
    activeMapId, expandedIds, renamingId, dragId, dropTarget, nodes: allNodes,
    setActiveMap, toggleExpand, renameMap, deleteMap, createMap,
    startRename, cancelRename, moveMap, setDragState, setDropTarget,
  } = useMapTreeStore()

  const isActive = activeMapId === node.id
  const isExpanded = expandedIds.has(node.id)
  const isRenaming = renamingId === node.id
  const hasChildren = node.children.length > 0
  const isDragging = dragId === node.id
  const isDropTarget = dropTarget?.nodeId === node.id

  const rowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [renameValue, setRenameValue] = useState(node.name)
  const [showActions, setShowActions] = useState(false)

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      renameMap(node.id, trimmed)
    } else {
      cancelRename()
    }
  }, [renameValue, node.id, node.name, renameMap, cancelRename])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    if (e.key === 'Escape') cancelRename()
  }, [handleRenameSubmit, cancelRename])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const msg = hasChildren
      ? `Delete "${node.name}" and all its child maps?`
      : `Delete "${node.name}"?`
    if (window.confirm(msg)) {
      deleteMap(node.id)
    }
  }, [node.id, node.name, hasChildren, deleteMap])

  const handleAddChild = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    createMap(node.id, 'Untitled Map')
  }, [node.id, createMap])

  // ── Drag handlers ────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
    setDragState(node.id)
  }, [node.id, setDragState])

  const handleDragEnd = useCallback(() => {
    setDragState(null)
    setDropTarget(null)
  }, [setDragState, setDropTarget])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!rowRef.current || dragId === node.id) return
    const position = getDropPosition(e, rowRef.current)
    // Only update if changed to avoid thrashing
    if (!dropTarget || dropTarget.nodeId !== node.id || dropTarget.position !== position) {
      setDropTarget({ nodeId: node.id, position })
    }
  }, [dragId, node.id, dropTarget, setDropTarget])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if actually leaving this element (not entering a child)
    if (rowRef.current && !rowRef.current.contains(e.relatedTarget as Node)) {
      if (dropTarget?.nodeId === node.id) {
        setDropTarget(null)
      }
    }
  }, [node.id, dropTarget, setDropTarget])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === node.id) {
      setDragState(null)
      setDropTarget(null)
      return
    }

    const position = rowRef.current ? getDropPosition(e, rowRef.current) : 'inside'

    if (position === 'inside') {
      // Drop as child of this node (append at end)
      moveMap(sourceId, node.id, null)
    } else if (position === 'before') {
      // Drop as sibling before this node
      moveMap(sourceId, node.parentId, node.id)
    } else {
      // Drop as sibling after this node
      // Find next sibling to use as "beforeId"
      const parent = node.parentId
      const siblings = allNodes
        .filter((n) => n.parentId === parent)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const idx = siblings.findIndex((s) => s.id === node.id)
      const nextSibling = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
      moveMap(sourceId, parent, nextSibling?.id ?? null)
    }

    setDragState(null)
    setDropTarget(null)
  }, [node.id, node.parentId, moveMap, setDragState, setDropTarget])

  // ── Drop indicator class ─────────────────────────────────────────────

  let dropClass = ''
  if (isDropTarget && dragId && dragId !== node.id) {
    dropClass = ` drop-${dropTarget!.position}`
  }

  return (
    <>
      <div
        ref={rowRef}
        className={`map-tree-item${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}${dropClass}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        draggable={!isRenaming}
        onClick={() => setActiveMap(node.id)}
        onDoubleClick={() => {
          setRenameValue(node.name)
          startRename(node.id)
        }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag handle */}
        <GripVertical size={12} className="map-tree-grip" />

        {/* Expand/collapse chevron */}
        <button
          className={`map-tree-chevron${hasChildren ? '' : ' invisible'}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleExpand(node.id)
          }}
        >
          <ChevronRight
            size={14}
            className={isExpanded ? 'rotated' : ''}
          />
        </button>

        {/* Map icon */}
        <Map size={14} className="map-tree-icon" />

        {/* Name / rename input */}
        {isRenaming ? (
          <input
            ref={inputRef}
            className="map-tree-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="map-tree-name">{node.name}</span>
        )}

        {/* Action buttons */}
        {showActions && !isRenaming && (
          <div className="map-tree-actions">
            <button
              className="map-tree-action-btn"
              onClick={handleAddChild}
              title="Add child map"
            >
              <Plus size={12} />
            </button>
            <button
              className="map-tree-action-btn delete"
              onClick={handleDelete}
              title="Delete map"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Render children if expanded */}
      {isExpanded && node.children.map((child) => (
        <MapTreeItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

// ── Root drop zone ───────────────────────────────────────────────────────

function RootDropZone() {
  const { dragId, moveMap, setDragState, setDropTarget } = useMapTreeStore()
  const [over, setOver] = useState(false)

  if (!dragId) return null

  return (
    <div
      className={`map-tree-root-drop${over ? ' active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        const sourceId = e.dataTransfer.getData('text/plain')
        if (sourceId) {
          moveMap(sourceId, null, null)
        }
        setDragState(null)
        setDropTarget(null)
        setOver(false)
      }}
    >
      Move to root level
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────

const MIN_WIDTH = 160
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 220

interface SidebarProps {
  onOpenNav: () => void
}

export function MapTreeSidebar({ onOpenNav }: SidebarProps) {
  const { tree, createMap, isLoading, nodes } = useMapTreeStore()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const widthBeforeCollapse = useRef(DEFAULT_WIDTH)
  const isDraggingHandle = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleToggle = useCallback(() => {
    if (collapsed) {
      setCollapsed(false)
      setWidth(widthBeforeCollapse.current)
    } else {
      widthBeforeCollapse.current = width
      setCollapsed(true)
    }
  }, [collapsed, width])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // If it's just a click (no drag), toggle will fire on pointerup
    isDraggingHandle.current = false
    startX.current = e.clientX
    startWidth.current = collapsed ? widthBeforeCollapse.current : width

    let lastWidth = startWidth.current

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX.current
      if (!isDraggingHandle.current && Math.abs(dx) > 3) {
        isDraggingHandle.current = true
        setIsResizing(true)
        if (collapsed) {
          setCollapsed(false)
        }
      }
      if (isDraggingHandle.current) {
        const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + dx))
        lastWidth = newW
        setWidth(newW)
      }
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      setIsResizing(false)
      if (!isDraggingHandle.current) {
        handleToggle()
      } else {
        widthBeforeCollapse.current = lastWidth
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [collapsed, width, handleToggle])

  return (
    <div
      className={`map-tree-sidebar${collapsed ? ' collapsed' : ''}${isResizing ? ' resizing' : ''}`}
      style={collapsed ? undefined : { width }}
    >
      {/* Sidebar content — hidden when collapsed */}
      <div className="map-tree-sidebar-content">
        {/* Workspace menu */}
        <button
          className="map-tree-workspace-btn"
          onClick={onOpenNav}
          title="Open workspace menu"
        >
          <span className="map-tree-workspace-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#2A4A5E" />
              <path d="M7 14L14 7L21 14L14 21L7 14Z" fill="white" fillOpacity="0.9" />
              <path d="M14 10L18 14L14 18L10 14L14 10Z" fill="white" />
            </svg>
          </span>
          <span className="map-tree-workspace-label">Nodestra</span>
        </button>

        <div className="map-tree-header">
          <span className="map-tree-title">Maps</span>
          <button
            className="map-tree-add-btn"
            onClick={() => createMap(null, 'Untitled Map')}
            title="Add root map"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="map-tree-scroll">
          {isLoading ? (
            <div className="map-tree-empty">Loading...</div>
          ) : nodes.length === 0 ? (
            <div className="map-tree-empty">
              <p>No maps yet</p>
              <button
                className="map-tree-empty-btn"
                onClick={() => createMap(null, 'Terminal A')}
              >
                <Plus size={14} />
                Create first map
              </button>
            </div>
          ) : (
            <>
              {tree.map((node) => (
                <MapTreeItem key={node.id} node={node} depth={0} />
              ))}
              <RootDropZone />
            </>
          )}
        </div>
      </div>

      {/* Resize / toggle handle */}
      <div
        className="map-tree-resize-handle"
        onPointerDown={handlePointerDown}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <div className="map-tree-resize-handle-line" />
      </div>
    </div>
  )
}
