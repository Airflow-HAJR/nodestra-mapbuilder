import { useState, useRef, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { animated, useSpring, useTransition } from '@react-spring/web'
import { ChevronDown, CircleDot, Footprints, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EditorState, NodeType, POI, MapDocument, Waypoint, Edge } from '../types'
import { NODE_TYPE_LABELS, NODE_COLORS, EDGE_TYPE_LABELS, EDGE_STYLES, PORTAL_NODE_TYPES } from '../types'
import type { MapDispatch } from '../useMapStore'
import { mapTreeActions, type CrossMapPortal } from '../useMapTreeStore'
import { supabase } from '../../../lib/supabase'
import { NodeSVGIcon } from '../map/NodeIcon'
import { projectPointOntoEdge } from '../utils/projection'

const ALL_TYPES: NodeType[] = [
  // Core
  'gate', 'exit', 'entrance',
  // Baggage
  'baggage', 'baggage-drop', 'oversized-baggage', 'luggage-storage', 'luggage-wrap',
  // Dining & retail
  'restaurant', 'cafe', 'bar', 'shop', 'duty-free', 'bookstore',
  // Services
  'lounge', 'customer-service', 'info-desk', 'hotel-desk', 'car-rental',
  // Food & beverage
  'food-court', 'vending', 'water-fountain',
  // Health & wellness
  'restroom', 'nursing-room', 'baby-changing-station', 'animal-relief', 'shower-facility', 'medical-clinic', 'aed', 'pharmacy',
  // Amenities
  'charging-station', 'atm', 'currency-exchange', 'telephone', 'business-center',
  'seating-area', 'smoking-room', 'prayer-room', 'meditation-room', 'lost-found', 'mail-drop',
  // Movement (same-floor)
  'tram-station', 'train-platform', 'moving-walkway-station',
  // Security
  'security', 'customs', 'immigration', 'precheck',
  // Portals (cross-level)
  'escalator', 'elevator', 'stairs', 'ramp',
  // Ground transport
  'shuttle', 'taxi', 'rideshare', 'bus-stop', 'parking',
  // Misc
  'newspaper', 'pickup', 'smarte-carte', 'other',
]

interface Props {
  state: EditorState
  dispatch: MapDispatch
  hiddenTypes?: NodeType[]
  onToggleType?: (type: NodeType) => void
  hideEdges?: boolean
  onToggleEdges?: () => void
  poiScale?: number
  onPoiScaleChange?: (scale: number) => void
  portalScale?: number
  onPortalScaleChange?: (scale: number) => void
  movementScale?: number
  onMovementScaleChange?: (scale: number) => void
  layerOrder?: ('pois' | 'movement' | 'portals')[]
  onLayerOrderChange?: (order: ('pois' | 'movement' | 'portals')[]) => void
}

export function PropertiesPanel({
  state, dispatch, hiddenTypes = [], onToggleType, hideEdges = false, onToggleEdges,
  poiScale = 100, onPoiScaleChange, portalScale = 100, onPortalScaleChange, movementScale = 100, onMovementScaleChange,
  layerOrder = ['movement', 'portals', 'pois'], onLayerOrderChange,
}: Props) {
  const { selectedId, selectedType, doc } = state
  const isOpen = !!(selectedId && selectedType)

  const inspectorAccent = (() => {
    if (!selectedId || !selectedType) return null

    if (selectedType === 'poi') {
      return (NODE_COLORS[doc.pois.find(p => p.id === selectedId)?.type ?? 'gate'] ?? NODE_COLORS.gate).bg
    }

    if (selectedType === 'edge') {
      const edge = doc.edges.find(e => e.id === selectedId)
      return edge ? EDGE_STYLES[edge.type].color : '#6b7280'
    }

    return '#6b7280'
  })()

  // Slide-in/out with spring physics
  const slideSpring = useSpring({
    transform: isOpen ? 'translateX(0%)' : 'translateX(100%)',
    config: { tension: 200, friction: 22 },
  })

  // Cross-fade between selected items
  const contentTransitions = useTransition(selectedId, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { tension: 200, friction: 22 },
    keys: selectedId,
  })

  const handleClose = () => {
    dispatch({ type: 'SET_SELECTION', id: null, selType: null })
  }

  const renderContent = () => {
    if (!selectedId || !selectedType) return null

    if (selectedType === 'waypoint') {
      const wp = doc.waypoints.find(w => w.id === selectedId)
      if (!wp) return null
      return <WaypointInspector wp={wp} doc={doc} dispatch={dispatch} onClose={handleClose} />
    }

    if (selectedType === 'edge') {
      const edge = doc.edges.find(e => e.id === selectedId)
      if (!edge) return null
      return <EdgeInspector edge={edge} doc={doc} dispatch={dispatch} onClose={handleClose} />
    }

    if (selectedType === 'poi') {
      const poi = doc.pois.find(p => p.id === selectedId)
      if (!poi) return null
      return <POIInspector poi={poi} doc={doc} dispatch={dispatch} onClose={handleClose} />
    }

    return null
  }

  return (
    <>
      {/* Layers button — bottom-right floating */}
      {onToggleType && (
        <LayersButton
          hiddenTypes={hiddenTypes}
          onToggleType={onToggleType}
          hideEdges={hideEdges}
          onToggleEdges={onToggleEdges}
          poiScale={poiScale}
          onPoiScaleChange={onPoiScaleChange}
          portalScale={portalScale}
          onPortalScaleChange={onPortalScaleChange}
          movementScale={movementScale}
          onMovementScaleChange={onMovementScaleChange}
          layerOrder={layerOrder}
          onLayerOrderChange={onLayerOrderChange}
        />
      )}

      {/* Inspector panel — slides in from right when an item is selected */}
      <animated.div
        className="inspector-panel"
        style={slideSpring}
      >
        {inspectorAccent && (
          <div
            className="inspector-accent-line"
            style={{ '--inspector-accent': inspectorAccent } as CSSProperties}
            aria-hidden="true"
          />
        )}
        {contentTransitions((style, id) => (
          id && (
            <animated.div className="inspector-content" style={style}>
              {renderContent()}
            </animated.div>
          )
        ))}
      </animated.div>
    </>
  )
}

function InspectorCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="map-props-close-btn"
      onClick={onClick}
      title="Close"
      aria-label="Close"
    >
      <X strokeWidth={2.2} />
    </Button>
  )
}

function InspectorDeleteButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="destructive"
      className="map-props-danger-btn"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

// ── Waypoint Inspector ──────────────────────────────────────────────────────

function WaypointInspector({ wp, doc, dispatch, onClose }: {
  wp: Waypoint
  doc: MapDocument
  dispatch: MapDispatch
  onClose: () => void
}) {
  const connectedEdges = doc.edges.filter(e => e.from === wp.id || e.to === wp.id)
  const attachedPois = doc.pois.filter(p => p.waypointId === wp.id)

  return (
    <>
      <div className="map-props-node-header">
        <div className="map-props-node-icon map-props-node-icon-waypoint">
          <CircleDot strokeWidth={2.25} />
        </div>
        <div className="map-props-header-copy">
          <div className="map-props-type-chip map-props-type-chip-waypoint">
            Waypoint
          </div>
          <div className="map-props-item-id">
            {wp.id}
          </div>
        </div>
        <InspectorCloseButton onClick={onClose} />
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <InspectorDeleteButton onClick={() => dispatch({ type: 'DELETE_WAYPOINT', id: wp.id })}>
          Delete Waypoint
        </InspectorDeleteButton>
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <label>Name</label>
        <input
          className="map-props-input"
          value={wp.name}
          onChange={e => dispatch({ type: 'UPDATE_WAYPOINT', id: wp.id, patch: { name: e.target.value } })}
          placeholder="e.g. Terminal A, Main Entrance"
        />
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <label>Position</label>
        <div className="map-props-coord-row">
          <div className="map-props-coord">
            <span className="map-props-coord-axis">X</span>
            <span className="map-props-coord-val">{(wp.x * 100).toFixed(1)}%</span>
          </div>
          <div className="map-props-coord">
            <span className="map-props-coord-axis">Y</span>
            <span className="map-props-coord-val">{(wp.y * 100).toFixed(1)}%</span>
          </div>
          <div className="map-props-coord">
            <span className="map-props-coord-axis">Fl</span>
            <span className="map-props-coord-val">{wp.floor}</span>
          </div>
        </div>
      </div>

      {connectedEdges.length > 0 && (
        <>
          <div className="map-props-divider" />
          <div className="map-props-field">
            <label>Edges ({connectedEdges.length})</label>
            <div className="map-props-mini-list">
              {connectedEdges.map(edge => {
                const otherId = edge.from === wp.id ? edge.to : edge.from
                const other = doc.waypoints.find(w => w.id === otherId)
                return (
                  <div key={edge.id} className="map-props-mini-row">
                    <span className="map-props-mini-bullet" aria-hidden="true" />
                    <span className="map-props-mini-text">
                      {other?.id.slice(0, 12) ?? 'unknown'} ({edge.weight.toFixed(1)}
                      {doc.pixelsPerMeter ? 'm' : ''})
                      {edge.accessible ? ' accessible' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {attachedPois.length > 0 && (
        <>
          <div className="map-props-divider" />
          <div className="map-props-field">
            <label>Attached POIs ({attachedPois.length})</label>
            <div className="map-props-mini-list">
              {attachedPois.map(poi => (
                <div key={poi.id} className="map-props-mini-row">
                  <span
                    className="map-props-mini-dot"
                    style={{ '--mini-dot-color': NODE_COLORS[poi.type].bg } as CSSProperties}
                  />
                  <span className="map-props-mini-text">{poi.name || NODE_TYPE_LABELS[poi.type]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Edge Inspector ──────────────────────────────────────────────────────────

function EdgeInspector({ edge, doc, dispatch, onClose }: {
  edge: Edge
  doc: MapDocument
  dispatch: MapDispatch
  onClose: () => void
}) {
  const fromWp = doc.waypoints.find(w => w.id === edge.from)
  const toWp = doc.waypoints.find(w => w.id === edge.to)

  return (
    <>
      <div className="map-props-node-header">
        <div className="map-props-path-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="20" x2="20" y2="4" />
            <circle cx="4" cy="20" r="3" fill="currentColor" />
            <circle cx="20" cy="4" r="3" fill="currentColor" />
          </svg>
        </div>
        <div className="map-props-header-copy">
          <div className="map-props-type-chip map-props-type-chip-edge">
            Edge
          </div>
          <div className="map-props-item-id">
            {edge.id}
          </div>
        </div>
        <InspectorCloseButton onClick={onClose} />
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <InspectorDeleteButton onClick={() => dispatch({ type: 'DELETE_EDGE', id: edge.id })}>
          Delete Edge
        </InspectorDeleteButton>
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <label>Name</label>
        <input
          className="map-props-input"
          value={edge.name || ''}
          onChange={e => dispatch({ type: 'UPDATE_EDGE', id: edge.id, patch: { name: e.target.value } })}
          placeholder={`e.g. "Corridor A" or leave blank`}
        />
      </div>

      <div className="map-props-field">
        <label>Type</label>
        <div className="map-props-static-value map-props-static-value-strong">{EDGE_TYPE_LABELS[edge.type]}</div>
      </div>

      <div className="map-props-field">
        <label>From</label>
        <div className="map-props-static-value">{fromWp?.id.slice(0, 16) ?? 'unknown'}</div>
      </div>

      <div className="map-props-field">
        <label>To</label>
        <div className="map-props-static-value">{toWp?.id.slice(0, 16) ?? 'unknown'}</div>
      </div>

      <div className="map-props-field">
        <label>Weight</label>
        <div className="map-props-walk-time">
          <Footprints className="map-props-walk-icon" strokeWidth={2.15} />
          <span className="map-props-walk-value">{edge.weight.toFixed(1)}{doc.pixelsPerMeter ? 'm' : ''}</span>
          <span className="map-props-walk-hint">computed</span>
        </div>
      </div>

      <div className="map-props-toggle-row">
        <div>
          <div className="map-props-toggle-label">Accessible route</div>
          <div className="map-props-toggle-hint">Wheelchair / mobility accessible</div>
        </div>
        <label className="map-props-toggle">
          <input
            type="checkbox"
            checked={edge.accessible}
            onChange={e => dispatch({ type: 'UPDATE_EDGE', id: edge.id, patch: { accessible: e.target.checked } })}
          />
          <span className="map-props-toggle-track" />
        </label>
      </div>
    </>
  )
}

// ── POI Inspector ───────────────────────────────────────────────────────────

function POIInspector({ poi, doc, dispatch, onClose }: { poi: POI; doc: MapDocument; dispatch: MapDispatch; onClose: () => void }) {
  const { bg, text } = NODE_COLORS[poi.type] ?? NODE_COLORS['gate']
  const attachedWp = poi.waypointId ? doc.waypoints.find(w => w.id === poi.waypointId) : null
  const [keywordInput, setKeywordInput] = useState('')
  const [typeGridExpanded, setTypeGridExpanded] = useState(false)
  const keywordInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const COLLAPSED_TYPE_COUNT = 10  // 2.5 rows of 4 columns

  // Focus name input after panel slide-in animation completes,
  // using preventScroll to avoid the browser scrolling the canvas
  useEffect(() => {
    const timer = setTimeout(() => {
      nameInputRef.current?.focus({ preventScroll: true })
    }, 200)
    return () => clearTimeout(timer)
  }, [poi.id])

  const handleKeywordKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const value = keywordInput.trim()
      if (value && !poi.keywords.includes(value)) {
        dispatch({ type: 'UPDATE_POI', id: poi.id, patch: { keywords: [...poi.keywords, value] } })
      }
      setKeywordInput('')
    }
    if (e.key === 'Backspace' && keywordInput === '' && poi.keywords.length > 0) {
      dispatch({ type: 'UPDATE_POI', id: poi.id, patch: { keywords: poi.keywords.slice(0, -1) } })
    }
  }, [keywordInput, poi.keywords, poi.id, dispatch])

  const removeKeyword = useCallback((kw: string) => {
    dispatch({ type: 'UPDATE_POI', id: poi.id, patch: { keywords: poi.keywords.filter(k => k !== kw) } })
  }, [poi.keywords, poi.id, dispatch])

  return (
    <>
      <div className="map-poi-header">
        <div
          className="map-poi-header-icon"
          style={{ '--poi-icon-bg': bg, '--poi-icon-text': text } as CSSProperties}
        >
          {poi.type === 'gate'
            ? <span className="map-poi-header-gate">
                {poi.name ? poi.name.slice(0, 3) : 'G'}
              </span>
            : <NodeSVGIcon type={poi.type} size={40} />
          }
        </div>
        <div className="map-poi-header-info">
          <div className={`map-poi-header-name${poi.name ? '' : ' placeholder'}`}>
            {poi.name || NODE_TYPE_LABELS[poi.type]}
          </div>
          <div
            className="map-props-type-chip map-props-type-chip-dynamic"
            style={{ '--type-chip-bg': `${bg}20`, '--type-chip-text': bg } as CSSProperties}
          >
            {NODE_TYPE_LABELS[poi.type]}
          </div>
          <div className="map-props-item-id">
            {poi.id}
          </div>
        </div>
        <InspectorCloseButton onClick={onClose} />
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <InspectorDeleteButton onClick={() => dispatch({ type: 'DELETE_POI', id: poi.id })}>
          Delete POI
        </InspectorDeleteButton>
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <label>{poi.type === 'gate' ? 'Gate number' : 'Name'}</label>
        <input
          ref={nameInputRef}
          className="map-props-input"
          value={poi.name}
          onChange={e => dispatch({ type: 'UPDATE_POI', id: poi.id, patch: { name: e.target.value } })}
          placeholder={poi.type === 'gate' ? 'A12' : NODE_TYPE_LABELS[poi.type]}
        />
        {poi.type === 'gate' && (
          <span className="map-props-hint">Gate ID shown directly on the badge (e.g. A12)</span>
        )}
      </div>

      <div className="map-props-field">
        <label>Type</label>
        <div className={`map-poi-type-grid-container${typeGridExpanded ? ' expanded' : ''}`}>
          <div className="map-poi-type-grid">
            {ALL_TYPES.slice(0, typeGridExpanded ? undefined : COLLAPSED_TYPE_COUNT).map(t => {
              const c = NODE_COLORS[t]
              const isActive = poi.type === t
              return (
                <button
                  key={t}
                  className={`map-poi-type-btn${isActive ? ' active' : ''}`}
                  style={{
                    '--poi-btn-color': c.bg,
                    '--poi-btn-bg': c.bg,
                    '--poi-btn-text': c.text,
                  } as CSSProperties}
                  onClick={() => dispatch({ type: 'UPDATE_POI', id: poi.id, patch: { type: t } })}
                  title={NODE_TYPE_LABELS[t]}
                >
                  <div className="map-poi-type-btn-icon">
                    {t === 'gate'
                      ? <span className="map-poi-type-btn-gate">G</span>
                      : <NodeSVGIcon type={t} size={22} />
                    }
                  </div>
                  <span className="map-poi-type-btn-label">{NODE_TYPE_LABELS[t].slice(0, 6)}</span>
                </button>
              )
            })}
          </div>
          {!typeGridExpanded && ALL_TYPES.length > COLLAPSED_TYPE_COUNT && (
            <div className="map-poi-type-grid-fade" />
          )}
        </div>
        {ALL_TYPES.length > COLLAPSED_TYPE_COUNT && (
          <button
            className="map-poi-type-expand-btn"
            onClick={() => setTypeGridExpanded(!typeGridExpanded)}
          >
            {typeGridExpanded ? '▲ Show less types' : '▼ Show all types'}
          </button>
        )}
      </div>

      <div className="map-props-field">
        <label>Keywords</label>
        <div
          className="map-poi-keywords"
          onClick={() => keywordInputRef.current?.focus()}
        >
          {poi.keywords.map(kw => (
            <span key={kw} className="map-poi-keyword-pill">
              {kw}
              <button
                type="button"
                className="map-poi-keyword-pill-remove"
                onClick={(e) => { e.stopPropagation(); removeKeyword(kw) }}
                aria-label={`Remove keyword ${kw}`}
              >
                <X strokeWidth={2.4} />
              </button>
            </span>
          ))}
          <input
            ref={keywordInputRef}
            className="map-poi-keyword-input"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            placeholder={poi.keywords.length === 0 ? 'Type + Enter to add' : ''}
          />
        </div>
        <span className="map-props-hint">Used for wayfinding search</span>
      </div>

      <div className="map-props-divider" />

      <div className="map-props-field">
        <label>Attached Waypoint</label>
        {attachedWp ? (
          <div
            className="map-poi-waypoint-link"
            onClick={() => dispatch({ type: 'SET_SELECTION', id: attachedWp.id, selType: 'waypoint' })}
          >
            <span className="map-poi-waypoint-link-dot" />
            {attachedWp.id.slice(0, 16)}
          </div>
        ) : (
          <div className="map-poi-unlinked">
            <span className="map-poi-unlinked-dot" />
            Unlinked — no nearby waypoint
          </div>
        )}
      </div>

      <div className="map-props-field">
        <label>Attached Edge</label>
        <EdgeAttachmentSelector poi={poi} doc={doc} dispatch={dispatch} />
      </div>

      {/* Portal linking section — only for portal node types */}
      {PORTAL_NODE_TYPES.includes(poi.type) && (
        <>
          <div className="map-props-divider" />

          {(!poi.linkedPortalIds || poi.linkedPortalIds.length === 0) && (
            <div className="map-portal-warning">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M8 1.5L14.5 13H1.5L8 1.5Z" fill="#ef4444" stroke="#ef4444" strokeWidth="0.5" />
                <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="system-ui">!</text>
              </svg>
              <span>Portal node is not linked to another {NODE_TYPE_LABELS[poi.type].toLowerCase()}</span>
            </div>
          )}

          <div className="map-props-field">
            <label>Linked Portals</label>
            <PortalLinkSelector poi={poi} doc={doc} dispatch={dispatch} />
          </div>
        </>
      )}

      <div className="map-props-field">
        <label>Position</label>
        <div className="map-props-coord-row">
          <div className="map-props-coord">
            <span className="map-props-coord-axis">X</span>
            <span className="map-props-coord-val">{(poi.x * 100).toFixed(1)}%</span>
          </div>
          <div className="map-props-coord">
            <span className="map-props-coord-axis">Y</span>
            <span className="map-props-coord-val">{(poi.y * 100).toFixed(1)}%</span>
          </div>
          <div className="map-props-coord">
            <span className="map-props-coord-axis">Fl</span>
            <span className="map-props-coord-val">{poi.floor}</span>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Edge Attachment Selector ────────────────────────────────────────────────

function EdgeAttachmentSelector({ poi, doc, dispatch }: {
  poi: POI
  doc: MapDocument
  dispatch: MapDispatch
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const attachedEdge = poi.projectedEdgeId ? doc.edges.find(e => e.id === poi.projectedEdgeId) : null
  const dropdownRef = useRef<HTMLDivElement>(null)

  const floorEdges = doc.edges.filter(e => {
    const from = doc.waypoints.find(w => w.id === e.from)
    const to = doc.waypoints.find(w => w.id === e.to)
    return from?.floor === poi.floor && to?.floor === poi.floor
  })

  const handleEdgeChange = (edgeId: string) => {
    const edge = doc.edges.find(e => e.id === edgeId)
    if (!edge) return

    const from = doc.waypoints.find(w => w.id === edge.from)
    const to = doc.waypoints.find(w => w.id === edge.to)
    if (!from || !to) return

    // Project POI onto the selected edge
    const proj = projectPointOntoEdge(poi.x, poi.y, from.x, from.y, to.x, to.y)
    dispatch({
      type: 'UPDATE_POI',
      id: poi.id,
      patch: { projectedEdgeId: edgeId, projectedT: proj.t },
    })
    setIsOpen(false)
    setHoveredEdgeId(null)
  }

  const handleMouseEnter = (edgeId: string) => {
    setHoveredEdgeId(edgeId)
    dispatch({ type: 'SET_PREVIEW_HIGHLIGHT_EDGE', id: edgeId })
  }

  const handleMouseLeave = useCallback(() => {
    setHoveredEdgeId(null)
    dispatch({ type: 'SET_PREVIEW_HIGHLIGHT_EDGE', id: null })
  }, [dispatch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        handleMouseLeave()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleMouseLeave])

  if (floorEdges.length === 0) {
    return (
      <div className="map-poi-unlinked">
        <span className="map-poi-unlinked-dot" />
        No edges on this floor
      </div>
    )
  }

  const getEdgeLabel = (edge: Edge) => {
    if (edge.name) return edge.name
    return `[Unnamed] ${EDGE_TYPE_LABELS[edge.type]}`
  }

  return (
    <div ref={dropdownRef} className="map-props-select">
      <Button
        type="button"
        variant="outline"
        className={`map-props-select-trigger${isOpen ? ' open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>{attachedEdge ? getEdgeLabel(attachedEdge) : 'Select edge'}</span>
        <ChevronDown className="map-props-select-caret" strokeWidth={2.2} />
      </Button>

      {isOpen && (
        <div className="map-props-select-menu">
          {floorEdges.map(edge => (
            <button
              key={edge.id}
              type="button"
              className={`map-props-select-option${hoveredEdgeId === edge.id ? ' is-hovered' : ''}${attachedEdge?.id === edge.id ? ' is-selected' : ''}`}
              onMouseEnter={() => handleMouseEnter(edge.id)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleEdgeChange(edge.id)}
            >
              {getEdgeLabel(edge)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Portal Link Selector (multi-select) ───────────────────────────────────

function PortalLinkSelector({ poi, doc, dispatch }: {
  poi: POI
  doc: MapDocument
  dispatch: MapDispatch
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [crossMapPortals, setCrossMapPortals] = useState<CrossMapPortal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch cross-map portals when dropdown opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      const portals = await mapTreeActions.fetchAllPortals()
      if (!cancelled) {
        setCrossMapPortals(portals)
        setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  // Also fetch on mount for pills display
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const portals = await mapTreeActions.fetchAllPortals()
      if (!cancelled) setCrossMapPortals(portals)
    })()
    return () => { cancelled = true }
  }, [])

  const linkedIds = new Set(poi.linkedPortalIds ?? [])

  // Same type, exclude self
  const candidates = crossMapPortals.filter(
    p => p.poiId !== poi.id && p.type === poi.type
  )

  // Group by map
  const byMap = new Map<string, { mapName: string; portals: CrossMapPortal[] }>()
  for (const c of candidates) {
    if (!byMap.has(c.mapId)) {
      byMap.set(c.mapId, { mapName: c.mapName, portals: [] })
    }
    byMap.get(c.mapId)!.portals.push(c)
  }

  const toggleLink = async (targetPoiId: string) => {
    const current = poi.linkedPortalIds ?? []
    const removing = current.includes(targetPoiId)
    const next = removing
      ? current.filter(id => id !== targetPoiId)
      : [...current, targetPoiId]

    // Update this POI locally
    dispatch({ type: 'UPDATE_POI', id: poi.id, patch: { linkedPortalIds: next } })

    // Update the other side in its map via Supabase
    const targetPortal = crossMapPortals.find(p => p.poiId === targetPoiId)
    if (targetPortal) {
      // If target is on the same map, also dispatch locally
      const localTarget = doc.pois.find(p => p.id === targetPoiId)
      if (localTarget) {
        const targetLinks = localTarget.linkedPortalIds ?? []
        dispatch({
          type: 'UPDATE_POI',
          id: targetPoiId,
          patch: {
            linkedPortalIds: removing
              ? targetLinks.filter(id => id !== poi.id)
              : targetLinks.includes(poi.id) ? targetLinks : [...targetLinks, poi.id],
          },
        })
      } else {
        // Cross-map: update via Supabase
        await updateCrossMapLink(targetPortal, poi.id, !removing)
      }
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className="map-props-select">
      <Button
        type="button"
        variant="outline"
        className={`map-props-select-trigger${isOpen ? ' open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>
          {linkedIds.size > 0
            ? `${linkedIds.size} linked`
            : 'Select portals'}
        </span>
        <ChevronDown className="map-props-select-caret" strokeWidth={2.2} />
      </Button>

      {isOpen && (
        <div className="map-props-select-menu">
          {isLoading ? (
            <div className="map-props-select-option" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading...
            </div>
          ) : candidates.length === 0 ? (
            <div className="map-props-select-option" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              No other {NODE_TYPE_LABELS[poi.type].toLowerCase()}s across any map
            </div>
          ) : (
            Array.from(byMap.entries()).map(([mapId, { mapName, portals }]) => (
              <div key={mapId}>
                <div className="portal-link-popup-map-label">{mapName}</div>
                {portals.map(p => {
                  const isLinked = linkedIds.has(p.poiId)
                  const namePart = p.name ? `${p.name}, ` : ''
                  const label = `${namePart}${NODE_TYPE_LABELS[p.type]}, ${mapName}`
                  return (
                    <button
                      key={p.poiId}
                      type="button"
                      className={`map-props-select-option portal-option${isLinked ? ' is-selected' : ''}`}
                      onClick={() => toggleLink(p.poiId)}
                    >
                      <span
                        className="portal-option-check"
                        style={{ background: isLinked ? NODE_COLORS[p.type].bg : 'transparent' }}
                      >
                        {isLinked && (
                          <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="portal-option-label">{label}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}

      {/* Show linked portals as pills */}
      {linkedIds.size > 0 && (
        <div className="portal-linked-pills">
          {Array.from(linkedIds).map(id => {
            const crossPortal = crossMapPortals.find(p => p.poiId === id)
            const localPoi = doc.pois.find(p => p.id === id)
            const label = crossPortal
              ? `${crossPortal.name ? crossPortal.name + ', ' : ''}${NODE_TYPE_LABELS[crossPortal.type]}, ${crossPortal.mapName}`
              : localPoi
              ? `${localPoi.name ? localPoi.name + ', ' : ''}${NODE_TYPE_LABELS[localPoi.type]}`
              : id.slice(0, 8)
            const color = crossPortal
              ? NODE_COLORS[crossPortal.type].bg
              : localPoi
              ? NODE_COLORS[localPoi.type].bg
              : '#94a3b8'
            return (
              <div key={id} className="portal-linked-pill">
                <span className="portal-linked-pill-dot" style={{ background: color }} />
                <span className="portal-linked-pill-name">{label}</span>
                <button
                  className="portal-linked-pill-remove"
                  onClick={() => toggleLink(id)}
                  title="Unlink"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Update a portal POI's linkedPortalIds in another map via Supabase */
async function updateCrossMapLink(target: CrossMapPortal, sourcePoiId: string, adding: boolean) {
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
    if (!currentLinks.includes(sourcePoiId)) {
      targetPoi.linkedPortalIds = [...currentLinks, sourcePoiId]
    }
  } else {
    targetPoi.linkedPortalIds = currentLinks.filter(id => id !== sourcePoiId)
  }

  await supabase
    .from('maps')
    .update({ graph_map: graph, updated_at: new Date().toISOString() })
    .eq('id', target.mapId)
}

// ── Layers Button (bottom-right floating) ──────────────────────────────

const POI_TYPES: NodeType[] = ['gate', 'shop', 'restroom', 'baby-changing-station', 'animal-relief', 'security', 'baggage', 'info-desk', 'exit', 'entrance']
const PORTAL_TYPES: NodeType[] = ['elevator', 'escalator', 'stairs', 'ramp', 'shuttle']

type LayerKey = 'pois' | 'movement' | 'portals'

const LAYER_META: Record<LayerKey, { label: string; color: string }> = {
  pois: { label: 'POIs', color: '#2A4A5E' },
  movement: { label: 'Movement', color: '#3b82f6' },
  portals: { label: 'Portal Nodes', color: '#8b5cf6' },
}

function LayersButton({
  hiddenTypes, onToggleType, hideEdges, onToggleEdges,
  poiScale = 100, onPoiScaleChange, portalScale = 100, onPortalScaleChange,
  movementScale = 100, onMovementScaleChange,
  layerOrder = ['movement', 'portals', 'pois'], onLayerOrderChange,
}: {
  hiddenTypes: NodeType[]
  onToggleType: (type: NodeType) => void
  hideEdges?: boolean
  onToggleEdges?: () => void
  poiScale?: number
  onPoiScaleChange?: (scale: number) => void
  portalScale?: number
  onPortalScaleChange?: (scale: number) => void
  movementScale?: number
  onMovementScaleChange?: (scale: number) => void
  layerOrder?: LayerKey[]
  onLayerOrderChange?: (order: LayerKey[]) => void
}) {
  const [layersOpen, setLayersOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const poisHidden = POI_TYPES.every(t => hiddenTypes.includes(t))
  const portalsHidden = PORTAL_TYPES.every(t => hiddenTypes.includes(t))

  function toggleCategory(types: NodeType[], allHidden: boolean) {
    for (const t of types) {
      const isHidden = hiddenTypes.includes(t)
      if (allHidden && isHidden) onToggleType(t)
      else if (!allHidden && !isHidden) onToggleType(t)
    }
  }

  function isLayerHidden(layer: LayerKey) {
    if (layer === 'pois') return poisHidden
    if (layer === 'movement') return !!hideEdges
    if (layer === 'portals') return portalsHidden
    return false
  }

  function toggleLayer(layer: LayerKey) {
    if (layer === 'pois') toggleCategory(POI_TYPES, poisHidden)
    else if (layer === 'movement') onToggleEdges?.()
    else if (layer === 'portals') toggleCategory(PORTAL_TYPES, portalsHidden)
  }

  function getScale(layer: LayerKey) {
    if (layer === 'pois') return poiScale
    if (layer === 'movement') return movementScale
    if (layer === 'portals') return portalScale
    return 100
  }

  function setScale(layer: LayerKey, val: number) {
    if (layer === 'pois') onPoiScaleChange?.(val)
    else if (layer === 'movement') onMovementScaleChange?.(val)
    else if (layer === 'portals') onPortalScaleChange?.(val)
  }

  // Move a layer up or down in z-order (display order is reversed from layerOrder)
  // "up" in display = higher z-index = moving toward end of layerOrder array
  function moveLayer(realIdx: number, direction: 'up' | 'down') {
    const newOrder = [...layerOrder]
    // In display, "up" means higher z-index = swap with next in layerOrder
    // In display, "down" means lower z-index = swap with previous in layerOrder
    const targetIdx = direction === 'up' ? realIdx + 1 : realIdx - 1
    if (targetIdx < 0 || targetIdx >= newOrder.length) return
    ;[newOrder[realIdx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[realIdx]]
    onLayerOrderChange?.(newOrder)
  }

  useEffect(() => {
    if (!layersOpen) return
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setLayersOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [layersOpen])

  // Display order: top of list = highest z-index (rendered last / on top)
  const displayOrder = [...layerOrder].reverse()

  return (
    <div className="layers-float" ref={popoverRef}>
      <button
        className={`layers-float-btn icon-only${layersOpen ? ' open' : ''}`}
        onClick={() => setLayersOpen(!layersOpen)}
        title="Toggle layers"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2L1.5 6 8 10l6.5-4L8 2z" />
          <path d="M1.5 10L8 14l6.5-4" />
        </svg>
      </button>

      {layersOpen && (
        <div className="layers-float-popover">
          <div className="layers-float-title">Layers</div>
          {displayOrder.map((layer, displayIdx) => {
            const realIdx = layerOrder.length - 1 - displayIdx
            const hidden = isLayerHidden(layer)
            const scale = getScale(layer)
            const meta = LAYER_META[layer]
            const canMoveUp = displayIdx > 0
            const canMoveDown = displayIdx < displayOrder.length - 1

            return (
              <div
                key={layer}
                style={{ paddingBottom: displayIdx < displayOrder.length - 1 ? '4px' : 0 }}
              >
                <div className={`layers-float-row${hidden ? ' hidden' : ''}`} style={{ cursor: 'default' }}>
                  <button
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={() => toggleLayer(layer)}
                    title={hidden ? 'Show layer' : 'Hide layer'}
                  >
                    {hidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  <span className="layers-float-dot" style={{ background: meta.color }} />
                  <span className="layers-float-name">{meta.label}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '1px', flexShrink: 0 }}>
                    <button
                      className="layer-order-btn"
                      disabled={!canMoveUp}
                      onClick={() => moveLayer(realIdx, 'up')}
                      title="Move up (higher z-index)"
                    >
                      <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9V3M3.5 5.5L6 3l2.5 2.5" />
                      </svg>
                    </button>
                    <button
                      className="layer-order-btn"
                      disabled={!canMoveDown}
                      onClick={() => moveLayer(realIdx, 'down')}
                      title="Move down (lower z-index)"
                    >
                      <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3v6M3.5 6.5L6 9l2.5-2.5" />
                      </svg>
                    </button>
                  </div>
                </div>
                {!hidden && (
                  <div style={{ paddingLeft: '32px', paddingRight: '8px', paddingTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={scale}
                      onChange={(e) => setScale(layer, Number(e.target.value))}
                      style={{ flex: 1, height: '4px', cursor: 'pointer' }}
                    />
                    <span style={{ minWidth: '28px', textAlign: 'right', fontWeight: 500 }}>{scale}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M1 8C2.5 5 5 3 8 3s5.5 2 7 5c-1.5 3-4 5-7 5S2.5 11 1 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2 2l12 12M6.5 6.6A2 2 0 0110.4 9.5M4 4.8C2.7 5.8 1.7 6.9 1 8c1.5 3 4 5 7 5a7 7 0 003.2-.8M7 3.1C7.3 3 7.6 3 8 3c3 0 5.5 2 7 5a11 11 0 01-1.8 2.6" />
    </svg>
  )
}
