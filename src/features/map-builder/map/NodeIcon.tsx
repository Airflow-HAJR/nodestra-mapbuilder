import { useState, useRef } from 'react'
import type { POI, NodeType } from '../types'
import { NODE_COLORS, NODE_TYPE_LABELS, PORTAL_NODE_TYPES } from '../types'

interface Props {
  poi: POI
  imgWidth: number
  imgHeight: number
  selected: boolean
  isUnlinked: boolean
  isJustPlaced?: boolean
  zoomScale?: number
  sizeScale?: number
  overridePos?: { x: number; y: number }
  searchOpacity?: number
  onSelect: (e: React.MouseEvent) => void
  onDragStart: (poiId: string, e: React.MouseEvent) => void
}

// Badge size (px) per type at zoom = 1
const NODE_SIZE: Record<NodeType, number> = {
  // Core
  gate:        36,
  exit:        39,
  entrance:    39,
  // Baggage
  baggage:     42,
  'baggage-drop': 36,
  'oversized-baggage': 42,
  'luggage-storage': 36,
  'luggage-wrap': 36,
  // Dining & retail
  restaurant:  42,
  cafe:        42,
  bar:         42,
  shop:        42,
  'duty-free': 42,
  bookstore:   36,
  // Services
  lounge:      42,
  'customer-service': 39,
  'info-desk': 39,
  'hotel-desk': 39,
  'car-rental': 42,
  // Food & beverage
  'food-court': 42,
  vending:     36,
  'water-fountain': 36,
  // Health & wellness
  restroom:    39,
  'nursing-room': 42,
  'baby-changing-station': 42,
  'animal-relief': 42,
  'shower-facility': 36,
  'medical-clinic': 36,
  aed:         36,
  pharmacy:    36,
  // Amenities
  'charging-station': 36,
  atm:         36,
  'currency-exchange': 39,
  telephone:   36,
  'business-center': 39,
  'seating-area': 39,
  'smoking-room': 39,
  'prayer-room': 39,
  'meditation-room': 39,
  'lost-found': 36,
  'mail-drop': 36,
  // Movement (same-floor)
  'tram-station': 42,
  'train-platform': 42,
  'moving-walkway-station': 36,
  // Security
  security:    39,
  customs:     39,
  immigration: 39,
  precheck:    39,
  // Portals (cross-level)
  escalator:   36,
  elevator:    36,
  stairs:      36,
  ramp:        36,
  // Ground transport
  shuttle:     40,
  taxi:        36,
  rideshare:   39,
  'bus-stop':  39,
  parking:     39,
  // Misc
  newspaper:   36,
  pickup:      39,
  'smarte-carte': 39,
  other:       36,
}

const CIRCLE_NODES = new Set<NodeType>(['restroom', 'info-desk'])

// ── SVG icons (24×24 viewBox, fill="currentColor") ─────────────────────────

function Icon({ size, children }: { size: number; children: React.ReactNode }) {
  const s = Math.round(size * 0.72)
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}>
      {children}
    </svg>
  )
}

export function NodeSVGIcon({ type, size }: { type: NodeType; size: number }) {
  switch (type) {

    case 'shop': return (
      <Icon size={size}>
        <path d="M4.5 10h15L18 21H6L4.5 10z" />
        <path d="M8 10V7.5C8 5.2 9.3 4 12 4s4 1.2 4 3.5V10h-2V7.5C14 6.2 13.2 5.5 12 5.5S10 6.2 10 7.5V10z" />
      </Icon>
    )

    case 'restroom': return (
      <Icon size={size}>
        <circle cx="12" cy="5.5" r="3" />
        <path d="M7.5 10.5h9L14 22h-4L7.5 10.5z" />
      </Icon>
    )

    case 'security': return (
      <Icon size={size}>
        <path d="M12 2L3.5 6v5.5C3.5 16.5 7.2 20.5 12 22.5c4.8-2 8.5-6 8.5-11V6z" />
      </Icon>
    )

    case 'elevator': return (
      <Icon size={size}>
        <path d="M7 12.5l5-7.5 5 7.5H7z" />
        <path d="M17 11.5l-5 7.5-5-7.5H17z" />
      </Icon>
    )

    case 'escalator': return (
      <Icon size={size}>
        <circle cx="16" cy="4.5" r="2.8" />
        <path d="M3.5 20.5l7-9L13 14l7-10.5h3L15.5 16.5 13 14z" />
      </Icon>
    )

    case 'stairs': return (
      <Icon size={size}>
        <path d="M3 22V18h5v-4h5v-4h5V6h2v4h-2v4h-5v4H8v4z" />
      </Icon>
    )

    case 'exit': return (
      <Icon size={size}>
        <path d="M3.5 10.5h12.5L11.5 5l2-2 9 9-9 9-2-2 4.5-5.5H3.5z" />
      </Icon>
    )

    case 'entrance': return (
      <Icon size={size}>
        <path d="M20.5 10.5H8L12.5 5l-2-2-9 9 9 9 2-2L8 13.5h12.5z" />
      </Icon>
    )

    case 'baggage': return (
      <Icon size={size}>
        <rect x="3" y="9.5" width="18" height="12" rx="2" />
        <path d="M8.5 9.5V7.5C8.5 5.8 9.7 5 12 5s3.5.8 3.5 2.5v2H14V8C14 7 13.3 6.5 12 6.5S10 7 10 8v1.5z" />
        <rect x="6.5" y="13" width="2" height="5" rx="1" />
        <rect x="15.5" y="13" width="2" height="5" rx="1" />
      </Icon>
    )

    case 'info-desk': return (
      <Icon size={size}>
        <circle cx="12" cy="6" r="2.8" />
        <rect x="10.5" y="10.5" width="3" height="11" rx="1.5" />
      </Icon>
    )

    case 'shuttle': return (
      <Icon size={size}>
        <rect x="2.5" y="6" width="19" height="10" rx="3.5" />
        <circle cx="7.5" cy="17.5" r="2.5" />
        <circle cx="16.5" cy="17.5" r="2.5" />
        <rect x="2.5" y="11" width="19" height="2" />
        <rect x="5.5" y="7.5" width="3.5" height="3" rx=".8" fillOpacity={0.4} />
        <rect x="10.25" y="7.5" width="3.5" height="3" rx=".8" fillOpacity={0.4} />
        <rect x="15" y="7.5" width="3.5" height="3" rx=".8" fillOpacity={0.4} />
      </Icon>
    )

    // Simple placeholder icons for missing types
    case 'cafe':
    case 'restaurant': return <Icon size={size}><rect x="6" y="7" width="12" height="10" rx="1" /><path d="M10 7V5h4v2" /></Icon>
    case 'bar': return <Icon size={size}><rect x="9" y="4" width="6" height="15" /><circle cx="7" cy="6" r="2" /><circle cx="17" cy="6" r="2" /></Icon>
    case 'lounge': return <Icon size={size}><path d="M4 10h16v8H4z" /><circle cx="7" cy="16" r="1.5" /><circle cx="17" cy="16" r="1.5" /></Icon>
    case 'atm': return <Icon size={size}><rect x="5" y="4" width="14" height="16" rx="2" /></Icon>
    case 'telephone': return <Icon size={size}><rect x="9" y="3" width="6" height="16" rx="2" /><circle cx="12" cy="19" r="1" /></Icon>
    case 'parking': return <Icon size={size}><rect x="5" y="3" width="14" height="18" rx="1" /><text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold">P</text></Icon>
    case 'aed': return <Icon size={size}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M12 9v6M9 12h6" /></Icon>
    case 'pharmacy': return <Icon size={size}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M12 8v8M8 12h8" /></Icon>
    case 'ramp': return <Icon size={size}><path d="M3 18h18V6L7 18" /></Icon>
    case 'baggage-drop': return <Icon size={size}><rect x="5" y="8" width="14" height="10" rx="1" /><path d="M8 8V6h8v2" /></Icon>
    case 'luggage-storage':
    case 'luggage-wrap': return <Icon size={size}><rect x="5" y="4" width="5" height="12" /><rect x="14" y="4" width="5" height="12" /></Icon>
    case 'customs':
    case 'immigration': return <Icon size={size}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10h8M8 14h8M8 17h6" /></Icon>
    case 'charging-station': return <Icon size={size}><path d="M9 2v6M15 2v6M8 10h8v9H8z" /></Icon>
    case 'currency-exchange': return <Icon size={size}><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M11 11l6 6" /></Icon>
    case 'water-fountain': return <Icon size={size}><circle cx="12" cy="10" r="3" /><rect x="10" y="14" width="4" height="6" /></Icon>
    case 'vending': return <Icon size={size}><rect x="5" y="4" width="14" height="16" rx="2" /><rect x="7" y="6" width="10" height="8" opacity="0.3" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></Icon>
    case 'customer-service':
    case 'hotel-desk':
    case 'business-center': return <Icon size={size}><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M8 10h2M8 14h2M12 10h4M12 14h4" /></Icon>
    case 'car-rental': return <Icon size={size}><path d="M4 13h16v5H4z" /><path d="M6 13L8 7h8l2 6" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /></Icon>
    case 'food-court': return <Icon size={size}><rect x="3" y="8" width="6" height="10" rx="1" /><rect x="15" y="8" width="6" height="10" rx="1" /><line x1="3" y1="18" x2="21" y2="18" /></Icon>
    case 'seating-area': return <Icon size={size}><path d="M4 14h16v4H4zM6 10v4M12 10v4M18 10v4" /></Icon>
    case 'smoking-room':
    case 'prayer-room':
    case 'meditation-room': return <Icon size={size}><rect x="5" y="4" width="14" height="16" rx="2" /><circle cx="12" cy="12" r="3" opacity="0.5" /></Icon>
    case 'lost-found': return <Icon size={size}><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M8 10h2M14 10h2M8 14h8" /></Icon>
    case 'mail-drop': return <Icon size={size}><path d="M6 7h12v2H6z" /><path d="M7 9h10v8H7z" /><line x1="8" y1="18" x2="16" y2="18" /></Icon>
    case 'duty-free': return <Icon size={size}><path d="M4.5 10h15L18 21H6L4.5 10z" /><path d="M8 10V7.5C8 5.2 9.3 4 12 4s4 1.2 4 3.5V10h-2V7.5C14 6.2 13.2 5.5 12 5.5S10 6.2 10 7.5V10z" /></Icon>
    case 'bookstore': return <Icon size={size}><rect x="4" y="4" width="7" height="16" rx="1" /><rect x="13" y="4" width="7" height="16" rx="1" /></Icon>
    case 'tram-station':
    case 'train-platform': return <Icon size={size}><rect x="3" y="8" width="18" height="9" rx="1" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /></Icon>
    case 'moving-walkway-station': return <Icon size={size}><path d="M2 12h20M5 9l-2 3 2 3M19 9l2 3-2 3" /></Icon>
    case 'nursing-room': return <Icon size={size}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M12 8v8M8 12h8" /></Icon>
    case 'baby-changing-station': return <Icon size={size}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M12 13h4.5l2 2H13z" /></Icon>
    case 'animal-relief': return <Icon size={size}><circle cx="8" cy="9" r="2.1" /><circle cx="13" cy="7.5" r="1.8" /><circle cx="16.5" cy="10" r="1.7" /><circle cx="11.5" cy="11.5" r="1.7" /><path d="M6.8 16c0-2 1.6-3.5 3.7-3.5h2.2c2.1 0 3.7 1.5 3.7 3.5v1.5H6.8z" /></Icon>
    case 'shower-facility': return <Icon size={size}><circle cx="7" cy="7" r="1" /><circle cx="12" cy="7" r="1" /><circle cx="17" cy="7" r="1" /><path d="M10 12h4v8h-4z" /></Icon>
    case 'medical-clinic': return <Icon size={size}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M12 9v6M9 12h6" /></Icon>
    case 'oversized-baggage': return <Icon size={size}><rect x="2" y="8" width="20" height="12" rx="2" /><path d="M7 8V6h10v2" /></Icon>
    case 'precheck': return <Icon size={size}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 12l3 3 5-5" /></Icon>
    case 'taxi':
    case 'rideshare':
    case 'bus-stop': return <Icon size={size}><path d="M4 13h16v5H4z" /><path d="M6 13L8 7h8l2 6" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /></Icon>

    case 'pickup': return <Icon size={size}><path d="M12 3v14M12 17l-4-4M12 17l4-4" /><path d="M5 21h14" /></Icon>
    case 'smarte-carte': return <Icon size={size}><rect x="6" y="8" width="12" height="10" rx="1" /><circle cx="8" cy="20" r="1.5" /><circle cx="16" cy="20" r="1.5" /><path d="M9 8V5h6v3" /></Icon>
    case 'other': return <Icon size={size}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /></Icon>

    default:
      return null
  }
}

// ── Main component ──────────────────────────────────────────────────────────

export function NodeIcon({
  poi, imgWidth, imgHeight, selected,
  isUnlinked, isJustPlaced, zoomScale = 1, sizeScale = 1, overridePos, searchOpacity = 1, onSelect, onDragStart,
}: Props) {
  const [hovered, setHovered] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isPortal = PORTAL_NODE_TYPES.includes(poi.type)
  const isPortalUnlinked = isPortal && (!poi.linkedPortalIds || poi.linkedPortalIds.length === 0)

  const pos = overridePos ?? { x: poi.x, y: poi.y }
  const px = pos.x * imgWidth
  const py = pos.y * imgHeight

  const { bg, text } = NODE_COLORS[poi.type] ?? NODE_COLORS['gate']
  const baseSize   = NODE_SIZE[poi.type] ?? 22
  const size       = Math.round(baseSize * sizeScale)
  const isGate     = poi.type === 'gate'
  const gateLabel  = isGate ? (poi.name.trim() || 'G') : ''
  const isCircle   = CIRCLE_NODES.has(poi.type)

  const borderRadius = isCircle ? '50%' : isGate ? '4px' : `${Math.round(size * 0.3)}px`

  const shadow = selected
    ? `0 0 0 2px white, 0 0 0 4.5px ${bg}, 0 4px 14px rgba(0,0,0,0.35)`
    : `inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.32), 0 1px 2px rgba(0,0,0,0.18)`
  const gateBorderShadow = `0 0 0 2px white, 0 0 0 4.5px ${bg}`

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    onDragStart(poi.id, e)
  }
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect(e)
  }
  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => setHovered(true), 200)
  }
  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHovered(false)
  }

  // Inverse scale so POIs stay visually consistent across zoom levels
  const inverseScale = 1 / zoomScale

  const isCombo = poi.memberPois && poi.memberPois.length > 0

  return (
    <div
      className={`node-icon-wrapper${isJustPlaced ? ' just-placed' : ''}`}
      style={{ left: px, top: py, transform: `translate(-50%, -50%) scale(${inverseScale})`, opacity: searchOpacity, transition: 'opacity 0.2s' }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isCombo && (() => {
        const members = poi.memberPois!
        const displayed = members.slice(0, 3)
        const overflow = members.length - displayed.length
        const comboBaseSize = 40
        const comboSize = Math.round(comboBaseSize * sizeScale)
        const iconSize = Math.round(comboSize * 0.5)
        return (
          <>
            {(hovered || selected) && (
              <div className="node-tooltip">
                <div className="node-tooltip-name">Combo POI ({members.length})</div>
                <div className="node-tooltip-type">{members.map(m => NODE_TYPE_LABELS[m.type]).join(', ')}</div>
              </div>
            )}
            <div
              className={`node-badge-combo${selected ? ' selected' : ''}`}
              style={{
                boxShadow: shadow,
                gap: `${Math.round(3 * sizeScale)}px`,
                padding: `${Math.round(4 * sizeScale)}px ${Math.round(6 * sizeScale)}px`,
              }}
            >
              {displayed.map(m => {
                const { bg: mBg, text: mText } = NODE_COLORS[m.type] ?? NODE_COLORS['gate']
                return (
                  <div
                    key={m.id}
                    className="node-badge-combo-item"
                    style={{
                      background: mBg,
                      color: mText,
                      width: `${comboSize}px`,
                      height: `${comboSize}px`,
                      borderRadius: `${Math.round(comboSize * 0.23)}px`,
                    }}
                  >
                    <NodeSVGIcon type={m.type} size={iconSize} />
                  </div>
                )
              })}
              {overflow > 0 && (
                <div
                  className="node-badge-combo-overflow"
                  style={{ fontSize: `${Math.round(11 * sizeScale)}px` }}
                >
                  +{overflow}
                </div>
              )}
            </div>
            {isUnlinked && (
              <div style={{
                position: 'absolute', top: -3, right: -3,
                width: 8, height: 8, borderRadius: '50%',
                background: '#ef4444', border: '1.5px solid white',
              }} />
            )}
          </>
        )
      })()}

      {!isCombo && (<>
      {/* Tooltip — hover or selected */}
      {(hovered || selected) && (
        <div className="node-tooltip">
          <div className="node-tooltip-name">{poi.name || NODE_TYPE_LABELS[poi.type]}</div>
          <div className="node-tooltip-type">
            {NODE_TYPE_LABELS[poi.type]}
            {isPortalUnlinked && <span style={{ color: '#ef4444' }}> · No portal link</span>}
            {isUnlinked && !isPortalUnlinked && <span style={{ color: '#ef4444' }}> · Unlinked</span>}
          </div>
        </div>
      )}

      {/* ── Badge ── */}
      {isGate ? (
        <div
          className={`node-badge node-badge-gate${selected ? ' selected' : ''}`}
          style={{
            background: bg, color: text,
            borderRadius,
            height: size,
            minWidth: size,
            padding: '0 5px',
            fontSize: Math.round(size * 0.68),
            fontWeight: 800,
            fontFamily: '"PP Neue York", system-ui, sans-serif',
            letterSpacing: '-0.02em',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            whiteSpace: 'nowrap',
            lineHeight: 1,
            transform: selected ? 'translateY(-2px) scale(1.08)' : 'none',
            boxShadow: selected
              ? `${gateBorderShadow}, 0 4px 14px rgba(0,0,0,0.35)`
              : `${gateBorderShadow}, inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.32), 0 1px 2px rgba(0,0,0,0.18)`,
            transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s',
          }}
        >
          <span className="node-gate-label" title={`Gate ${gateLabel}`}>
            {gateLabel}
          </span>
        </div>

      ) : (
        <div
          className={`node-badge node-badge-${poi.type}${selected ? ' selected' : ''}`}
          style={{
            width: size, height: size,
            background: bg, color: text,
            borderRadius,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: selected ? 'translateY(-2px) scale(1.08)' : 'none',
            boxShadow: shadow,
            transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s',
          }}
        >
          <NodeSVGIcon type={poi.type} size={size} />
        </div>
      )}

      {/* Portal unlinked warning icon */}
      {isPortalUnlinked && (
        <div className="portal-warning-badge" title="Portal not linked">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M8 1.5L14.5 13H1.5L8 1.5Z" fill="#ef4444" stroke="white" strokeWidth="1.2" />
            <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="system-ui">!</text>
          </svg>
        </div>
      )}

      {/* Portal linked success icon */}
      {isPortal && !isPortalUnlinked && (
        <div className="portal-warning-badge" title="Portal linked">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="7" fill="#22c55e" stroke="white" strokeWidth="1.2" />
            <path d="M5 8L7 10L11 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
      )}

      {/* Unlinked warning dot (edge projection) */}
      {isUnlinked && !isPortalUnlinked && (
        <div style={{
          position: 'absolute', top: -3, right: -3,
          width: 8, height: 8, borderRadius: '50%',
          background: '#ef4444', border: '1.5px solid white',
        }} />
      )}
      </>)}
    </div>
  )
}
