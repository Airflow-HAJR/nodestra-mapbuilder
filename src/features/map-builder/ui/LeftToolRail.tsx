import { useRef, useCallback, useEffect, useState } from 'react'
import { animated, useSpring } from '@react-spring/web'
import type { Tool, NodeType, EdgeType } from '../types'
import { NODE_COLORS, NODE_TYPE_LABELS, EDGE_TYPE_LABELS, EDGE_STYLES } from '../types'
import type { MapDispatch } from '../useMapStore'
import { NodeSVGIcon } from '../map/NodeIcon'
import { Search, X } from 'lucide-react'

const POI_CATEGORIES: { label: string; types: NodeType[] }[] = [
  { label: 'Core', types: ['gate', 'exit', 'entrance'] },
  { label: 'Baggage', types: ['baggage', 'baggage-drop', 'oversized-baggage', 'luggage-storage', 'luggage-wrap'] },
  { label: 'Dining & Retail', types: ['restaurant', 'cafe', 'bar', 'shop', 'duty-free', 'bookstore'] },
  { label: 'Services', types: ['lounge', 'customer-service', 'info-desk', 'hotel-desk', 'car-rental'] },
  { label: 'Food & Beverage', types: ['food-court', 'vending', 'water-fountain'] },
  { label: 'Health & Wellness', types: ['restroom', 'nursing-room', 'shower-facility', 'medical-clinic', 'aed', 'pharmacy'] },
  { label: 'Amenities', types: ['charging-station', 'atm', 'currency-exchange', 'telephone', 'business-center', 'seating-area', 'smoking-room', 'prayer-room', 'meditation-room', 'lost-found', 'mail-drop'] },
  { label: 'Movement', types: ['tram-station', 'train-platform', 'moving-walkway-station'] },
  { label: 'Security', types: ['security', 'customs', 'immigration', 'precheck'] },
  { label: 'Portals', types: ['escalator', 'elevator', 'stairs', 'ramp'] },
  { label: 'Ground Transport', types: ['shuttle', 'taxi', 'rideshare', 'bus-stop', 'parking'] },
  { label: 'Misc', types: ['newspaper', 'pickup', 'smarte-carte', 'other'] },
]

const EDGE_TYPES: EdgeType[] = [
  // Basic movement (same floor)
  'walkway', 'outdoor-path',
  // Assisted movement (same floor)
  'moving-walkway',
  // Cross-floor (portals)
  'escalator-passage', 'elevator-shaft', 'stairs-passage', 'ramp-passage',
  // Specialized
  'security-lane',
]

interface Props {
  activeTool: Tool
  activeNodeType: NodeType
  activeEdgeType: EdgeType
  dispatch: MapDispatch
}

// ── Spring physics for blob animation ────────────────────────────────────

const STIFFNESS = 200
const DAMPING = 22
const MASS = 1

function springStep(pos: number, vel: number, target: number, dt: number) {
  const force = -STIFFNESS * (pos - target) - DAMPING * vel
  const newVel = vel + (force / MASS) * dt
  const newPos = pos + newVel * dt
  return { pos: newPos, vel: newVel }
}

function makePath(w: number, h: number, p: number, fromTop: boolean): string {
  const cp = Math.max(0, Math.min(1.08, p))
  const bulge = Math.sin(Math.min(cp, 1) * Math.PI) * 10
  const squish = cp > 1 ? (cp - 1) * 4 : 0
  const dir = fromTop ? 1 : -1

  if (fromTop) {
    const top = (1 - cp) * -h - squish
    const bot = top + h + squish * 2
    const topMid = top + bulge * dir
    const botMid = bot + bulge * dir
    return `M0,${top} Q${w / 2},${topMid} ${w},${top} L${w},${bot} Q${w / 2},${botMid} 0,${bot} Z`
  } else {
    const bot = h + (1 - cp) * h + squish
    const top2 = bot - h - squish * 2
    const topMid = top2 + bulge * dir
    const botMid = bot + bulge * dir
    return `M0,${top2} Q${w / 2},${topMid} ${w},${top2} L${w},${bot} Q${w / 2},${botMid} 0,${bot} Z`
  }
}

// Global rAF loop — shared across all blob items
interface BlobState {
  el: HTMLButtonElement
  pathEl: SVGPathElement
  innerEl: HTMLDivElement
  labelEl: HTMLSpanElement
  pos: number
  vel: number
  target: number
  fromTop: boolean
  isActive: boolean
}

const blobStates: BlobState[] = []
let globalRaf: number | null = null
let lastTime: number | null = null

function globalTick(ts: number) {
  const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 0.016
  lastTime = ts
  let anyActive = false

  for (const s of blobStates) {
    const r = springStep(s.pos, s.vel, s.target, dt)
    s.pos = r.pos
    s.vel = r.vel
    const settled = Math.abs(s.pos - s.target) < 0.002 && Math.abs(s.vel) < 0.002
    if (!settled) anyActive = true

    if (s.pos < 0.004 && s.target === 0 && settled) {
      s.pathEl.setAttribute('d', '')
      s.innerEl.style.transform = ''
      s.labelEl.style.color = ''
      continue
    }

    const rect = s.el.getBoundingClientRect()
    const w = rect.width || 200
    const h = rect.height || 56
    s.pathEl.setAttribute('d', makePath(w, h, s.pos, s.fromTop))

    if (s.pos > 0.42) {
      s.innerEl.style.transform = 'translateX(14px)'
      s.labelEl.style.color = '#F9F3EF'
    } else {
      s.innerEl.style.transform = ''
      s.labelEl.style.color = ''
    }
  }

  if (anyActive) {
    globalRaf = requestAnimationFrame(globalTick)
  } else {
    globalRaf = null
    lastTime = null
  }
}

function ensureRunning() {
  if (!globalRaf) {
    lastTime = null
    globalRaf = requestAnimationFrame(globalTick)
  }
}

// ── POI blob item — imperative DOM manipulation like the prototype ──────

function POIBlobItem({ type, isActive, onSelect }: {
  type: NodeType
  isActive: boolean
  onSelect: () => void
}) {
  const elRef = useRef<HTMLButtonElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const stateRef = useRef<BlobState | null>(null)

  useEffect(() => {
    const el = elRef.current
    const pathEl = pathRef.current
    const innerEl = innerRef.current
    const labelEl = labelRef.current
    if (!el || !pathEl || !innerEl || !labelEl) return

    const state: BlobState = {
      el, pathEl, innerEl, labelEl,
      pos: isActive ? 1 : 0,
      vel: 0,
      target: isActive ? 1 : 0,
      fromTop: true,
      isActive,
    }
    stateRef.current = state
    blobStates.push(state)

    if (isActive) {
      const rect = el.getBoundingClientRect()
      pathEl.setAttribute('d', makePath(rect.width || 200, rect.height || 56, 1, true))
      innerEl.style.transform = 'translateX(14px)'
      labelEl.style.color = '#F9F3EF'
    }

    const ro = new ResizeObserver(() => {
      if (state.pos > 0.5 && Math.abs(state.pos - state.target) < 0.01) {
        const rect = el.getBoundingClientRect()
        pathEl.setAttribute('d', makePath(rect.width || 200, rect.height || 56, state.pos, state.fromTop))
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      const idx = blobStates.indexOf(state)
      if (idx >= 0) blobStates.splice(idx, 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.isActive = isActive
    s.target = isActive ? 1 : 0
    ensureRunning()
  }, [isActive])

  const handleEnter = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current
    if (!s) return
    const rect = s.el.getBoundingClientRect()
    s.fromTop = (e.clientY - rect.top) < rect.height / 2
    s.target = 1
    ensureRunning()
  }, [])

  const handleLeave = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current
    if (!s || s.isActive) return
    const rect = s.el.getBoundingClientRect()
    s.fromTop = (e.clientY - rect.top) < rect.height / 2
    s.target = 0
    ensureRunning()
  }, [])

  const { bg, text } = NODE_COLORS[type]

  return (
    <button
      ref={elRef}
      className={`rail-poi-item${isActive ? ' active' : ''}`}
      onClick={onSelect}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <svg className="rail-poi-blob-svg" preserveAspectRatio="none">
        <path ref={pathRef} fill="#2A4A5E" />
      </svg>
      <div ref={innerRef} className="rail-poi-inner">
        <div className="rail-poi-icon" style={{ background: bg, color: text }}>
          {type === 'gate'
            ? <GateMiniIcon />
            : <NodeSVGIcon type={type} size={28} />
          }
        </div>
        <span ref={labelRef} className="rail-poi-label">
          {NODE_TYPE_LABELS[type]}
        </span>
      </div>
    </button>
  )
}

function EdgePreviewChip({ type }: { type: EdgeType }) {
  const style = EDGE_STYLES[type]
  const dashArray = type === 'moving-walkway' ? '7 5' : undefined

  return (
    <div className="rail-edge-chip" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <line
          x1="7"
          y1="24"
          x2="25"
          y2="8"
          stroke={style.color}
          strokeWidth={style.strokeWidth + 1}
          strokeLinecap="round"
          strokeDasharray={dashArray}
        />
        <circle cx="7" cy="24" r="3" fill={style.color} />
        <circle cx="25" cy="8" r="3" fill={style.color} />
      </svg>
    </div>
  )
}

// ── Edge blob item — same spring physics as POI ───────────────────────────

function EdgeBlobItem({ type, isActive, onSelect }: {
  type: EdgeType
  isActive: boolean
  onSelect: () => void
}) {
  const elRef = useRef<HTMLButtonElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const stateRef = useRef<BlobState | null>(null)

  useEffect(() => {
    const el = elRef.current
    const pathEl = pathRef.current
    const innerEl = innerRef.current
    const labelEl = labelRef.current
    if (!el || !pathEl || !innerEl || !labelEl) return

    const state: BlobState = {
      el, pathEl, innerEl, labelEl,
      pos: isActive ? 1 : 0,
      vel: 0,
      target: isActive ? 1 : 0,
      fromTop: true,
      isActive,
    }
    stateRef.current = state
    blobStates.push(state)

    if (isActive) {
      const rect = el.getBoundingClientRect()
      pathEl.setAttribute('d', makePath(rect.width || 200, rect.height || 56, 1, true))
      innerEl.style.transform = 'translateX(14px)'
      labelEl.style.color = '#F9F3EF'
    }

    const ro = new ResizeObserver(() => {
      if (state.pos > 0.5 && Math.abs(state.pos - state.target) < 0.01) {
        const rect = el.getBoundingClientRect()
        pathEl.setAttribute('d', makePath(rect.width || 200, rect.height || 56, state.pos, state.fromTop))
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      const idx = blobStates.indexOf(state)
      if (idx >= 0) blobStates.splice(idx, 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.isActive = isActive
    s.target = isActive ? 1 : 0
    ensureRunning()
  }, [isActive])

  const handleEnter = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current
    if (!s) return
    const rect = s.el.getBoundingClientRect()
    s.fromTop = (e.clientY - rect.top) < rect.height / 2
    s.target = 1
    ensureRunning()
  }, [])

  const handleLeave = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current
    if (!s || s.isActive) return
    const rect = s.el.getBoundingClientRect()
    s.fromTop = (e.clientY - rect.top) < rect.height / 2
    s.target = 0
    ensureRunning()
  }, [])

  return (
    <button
      ref={elRef}
      className={`rail-poi-item${isActive ? ' active' : ''}`}
      onClick={onSelect}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <svg className="rail-poi-blob-svg" preserveAspectRatio="none">
        <path ref={pathRef} fill="#2A4A5E" />
      </svg>
      <div ref={innerRef} className="rail-poi-inner">
        <EdgePreviewChip type={type} />
        <span ref={labelRef} className="rail-poi-label">
          {EDGE_TYPE_LABELS[type]}
        </span>
      </div>
    </button>
  )
}

function GateMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M12 3c-1 0-1.7.8-1.7 2.2V8.5L3 13v2l7.3-2.1V18L8 19.3V21.5L12 20.5l4 1V19.3L13.7 18v-4.5L21 15v-2l-7.3-4.5V5.2C13.7 3.8 13 3 12 3z" />
    </svg>
  )
}

// ── Collapsed rail icon for non-POI modes ─────────────────────────────────

function CollapsedToolInfo({ activeTool }: { activeTool: Tool }) {
  if (activeTool === 'select') return (
    <div className="rail-collapsed-shell">
      <div className="rail-collapsed-info">
        <span className="rail-collapsed-kicker">Mode</span>
        <span className="rail-collapsed-title">Select</span>
        <span className="rail-collapsed-hint">Pick and edit nodes</span>
      </div>
      <svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor" style={{ opacity: 0.5 }}>
        <path d="M4 2l13 9.5-6.5 1.5L12.5 19l-2 1L8 13.5 3 17.5V2z" />
      </svg>
      <span className="rail-collapsed-label">V</span>
    </div>
  )
  if (activeTool === 'draw-edge') return (
    <div className="rail-collapsed-shell">
      <div className="rail-collapsed-info">
        <span className="rail-collapsed-kicker">Mode</span>
        <span className="rail-collapsed-title">Movement</span>
        <span className="rail-collapsed-hint">Click two waypoints</span>
      </div>
      <svg viewBox="0 0 20 20" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.5 }}>
        <line x1="4" y1="16" x2="16" y2="4" />
        <circle cx="4" cy="16" r="2.5" fill="currentColor" />
        <circle cx="16" cy="4" r="2.5" fill="currentColor" />
      </svg>
      <span className="rail-collapsed-label">M</span>
    </div>
  )
  if (activeTool === 'add-poi') return (
    <div className="rail-collapsed-shell">
      <div className="rail-collapsed-info">
        <span className="rail-collapsed-kicker">Mode</span>
        <span className="rail-collapsed-title">POI</span>
        <span className="rail-collapsed-hint">Choose a point type</span>
      </div>
      <svg viewBox="0 0 20 20" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="10" cy="10" r="6.8" />
        <path d="M10 6.8v6.4M6.8 10h6.4" />
      </svg>
      <span className="rail-collapsed-label">N</span>
    </div>
  )
  if (activeTool === 'add-waypoint') return (
    <div className="rail-collapsed-shell">
      <div className="rail-collapsed-info">
        <span className="rail-collapsed-kicker">Mode</span>
        <span className="rail-collapsed-title">Waypoint</span>
        <span className="rail-collapsed-hint">Place navigation nodes</span>
      </div>
      <svg viewBox="0 0 20 20" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="10" cy="10" r="3.5" />
        <path d="M10 3.5v3M10 13.5v3M3.5 10h3M13.5 10h3" />
      </svg>
      <span className="rail-collapsed-label">W</span>
    </div>
  )
  return null
}

function RailContext({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div className="rail-context">
      <span className="rail-context-kicker">{kicker}</span>
      <span className="rail-context-title">{title}</span>
      <span className="rail-context-subtitle">{subtitle}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function LeftToolRail({ activeTool, activeNodeType, activeEdgeType, dispatch }: Props) {
  const expanded = activeTool === 'add-poi' || activeTool === 'draw-edge'
  const [searchQuery, setSearchQuery] = useState('')

  const widthSpring = useSpring({
    width: expanded ? 228 : 64,
    config: { tension: 280, friction: 26 },
  })

  // Filter POI categories by search query
  const filteredCategories = POI_CATEGORIES.map(cat => ({
    ...cat,
    types: cat.types.filter(t =>
      NODE_TYPE_LABELS[t].toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.types.length > 0)

  // Filter Edge types by search query
  const filteredEdgeTypes = searchQuery
    ? EDGE_TYPES.filter(type => EDGE_TYPE_LABELS[type].toLowerCase().includes(searchQuery.toLowerCase()))
    : EDGE_TYPES

  return (
    <animated.div
      className="tool-rail"
      style={{ width: widthSpring.width }}
    >
      {activeTool === 'add-poi' && expanded ? (
        <div className="rail-panel">
          <RailContext
            kicker="Palette"
            title="POI Types"
            subtitle="Select what to place on the map"
          />
          {/* Search bar */}
          <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search POIs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '28px',
                  paddingRight: searchQuery ? '28px' : '8px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  fontSize: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="rail-poi-list">
            {filteredCategories.map(cat => (
              <div key={cat.label}>
                <div className="rail-section-label">{cat.label}</div>
                {cat.types.map((type, i) => (
                  <div key={type} style={{ animationDelay: `${i * 20}ms` }} className="rail-poi-item-wrap">
                    <POIBlobItem
                      type={type}
                      isActive={activeNodeType === type}
                      onSelect={() => dispatch({ type: 'SET_NODE_TYPE', nodeType: type })}
                    />
                  </div>
                ))}
              </div>
            ))}
            {searchQuery && filteredCategories.length === 0 && (
              <div style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No matching POI types
              </div>
            )}
          </div>
        </div>
      ) : activeTool === 'draw-edge' && expanded ? (
        <div className="rail-panel">
          <RailContext
            kicker="Movement"
            title="Edge Types"
            subtitle="Choose how the route behaves"
          />
          {/* Search bar */}
          <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search movements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '28px',
                  paddingRight: searchQuery ? '28px' : '8px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  fontSize: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="rail-poi-list">
            {filteredEdgeTypes.length > 0 ? (
              filteredEdgeTypes.map((type, i) => (
                <div key={type} style={{ animationDelay: `${i * 20}ms` }} className="rail-poi-item-wrap">
                  <EdgeBlobItem
                    type={type}
                    isActive={activeEdgeType === type}
                    onSelect={() => dispatch({ type: 'SET_EDGE_TYPE', edgeType: type })}
                  />
                </div>
              ))
            ) : (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No results for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      ) : (
        <CollapsedToolInfo activeTool={activeTool} />
      )}
    </animated.div>
  )
}
