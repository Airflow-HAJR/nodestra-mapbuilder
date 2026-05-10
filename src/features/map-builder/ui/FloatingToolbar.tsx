import type { Tool, NodeType, EdgeType } from '../types'
import { NODE_COLORS, NODE_TYPE_LABELS, EDGE_TYPE_LABELS, EDGE_STYLES } from '../types'
import type { MapDispatch } from '../useMapStore'
import { NodeSVGIcon } from '../map/NodeIcon'

// Most common POI types for quick access in floating toolbar (use LeftToolRail for full list)
const POI_TYPES: NodeType[] = [
  'gate', 'exit', 'entrance',
  'baggage', 'restroom', 'baby-changing-station', 'security',
  'escalator', 'elevator', 'stairs',
  'shop', 'lounge', 'info-desk',
]

const EDGE_TYPES: EdgeType[] = [
  // Basic movement (same floor)
  'walkway', 'corridor', 'outdoor-path',
  // Assisted movement (same floor)
  'moving-walkway', 'tram', 'train', 'monorail', 'bus-route',
  'shuttle-corridor',
  // Cross-floor (portals)
  'escalator-passage', 'elevator-shaft', 'stairs-passage', 'ramp-passage',
  // Specialized
  'security-lane', 'baggage-claim-belt',
]

interface Props {
  activeTool: Tool
  activeNodeType: NodeType
  activeEdgeType: EdgeType
  dispatch: MapDispatch
  onUploadImage: () => void
}

// ── Tool icons ──────────────────────────────────────────────────────────────

function SelectIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor">
      <path d="M4 2l13 9.5-6.5 1.5L12.5 19l-2 1L8 13.5 3 17.5V2z" />
    </svg>
  )
}

// COMMENTED OUT: Waypoint icon — edges now auto-create waypoints
// function WaypointIcon() {
//   return (
//     <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
//       <circle cx="10" cy="10" r="4" />
//       <path d="M10 3v3M10 14v3M3 10h3M14 10h3" />
//     </svg>
//   )
// }

function EdgeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="4" y1="16" x2="16" y2="4" />
      <circle cx="4" cy="16" r="2.5" fill="currentColor" />
      <circle cx="16" cy="4" r="2.5" fill="currentColor" />
    </svg>
  )
}

function POIIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.5v7M6.5 10h7" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V4.5M6.5 7.5l3.5-4 3.5 4" />
      <path d="M4 16h12" />
    </svg>
  )
}

// ── Tiny icon for gate in POI picker ─────────────────────────────────────

function GateMiniIcon({ size }: { size: number }) {
  const s = Math.round(size * 0.66)
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}>
      <path d="M12 3c-1 0-1.7.8-1.7 2.2V8.5L3 13v2l7.3-2.1V18L8 19.3V21.5L12 20.5l4 1V19.3L13.7 18v-4.5L21 15v-2l-7.3-4.5V5.2C13.7 3.8 13 3 12 3z" />
    </svg>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export function FloatingToolbar({ activeTool, activeNodeType, activeEdgeType, dispatch, onUploadImage }: Props) {
  return (
    <div className="map-float-tools">
      {/* Main tools */}
      <div className="map-ft-group">
        <button
          className={`map-ft-btn${activeTool === 'select' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_TOOL', tool: 'select' })}
          title="Select  V"
        ><SelectIcon /></button>

        {/* COMMENTED OUT: Waypoint tool — edges now auto-create waypoints
        <button
          className={`map-ft-btn${activeTool === 'add-waypoint' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_TOOL', tool: 'add-waypoint' })}
          title="Add Waypoint  W"
        ><WaypointIcon /></button>
        */}

        <button
          className={`map-ft-btn${activeTool === 'draw-edge' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_TOOL', tool: 'draw-edge' })}
          title="Movement  M"
        ><EdgeIcon /></button>

        <button
          className={`map-ft-btn${activeTool === 'add-poi' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_TOOL', tool: 'add-poi' })}
          title="Add POI  N"
        ><POIIcon /></button>

        <div className="map-ft-sep" />

        <button className="map-ft-btn" onClick={onUploadImage} title="Upload floor plan">
          <UploadIcon />
        </button>
      </div>

      {/* POI type picker — animated icon list */}
      {activeTool === 'add-poi' && (
        <div className="map-ft-poi-picker">
          {POI_TYPES.map((type, i) => {
            const { bg, text } = NODE_COLORS[type]
            const isActive = activeNodeType === type
            return (
              <button
                key={type}
                className={`map-ft-poi-item${isActive ? ' active' : ''}`}
                style={{
                  animationDelay: `${i * 20}ms`,
                  ['--poi-color' as string]: bg,
                }}
                onClick={() => dispatch({ type: 'SET_NODE_TYPE', nodeType: type })}
              >
                <div
                  className="map-ft-poi-item-icon"
                  style={{ background: bg, color: text }}
                >
                  {type === 'gate'
                    ? <GateMiniIcon size={24} />
                    : <NodeSVGIcon type={type} size={24} />
                  }
                </div>
                {NODE_TYPE_LABELS[type]}
              </button>
            )
          })}
        </div>
      )}

      {/* Edge type picker */}
      {activeTool === 'draw-edge' && (
        <div className="map-ft-edge-picker">
          <div className="map-ft-edge-header">Choose edge type</div>
          {EDGE_TYPES.map((type) => {
            const style = EDGE_STYLES[type]
            const isActive = activeEdgeType === type
            return (
              <button
                key={type}
                className={`map-ft-edge-item${isActive ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SET_EDGE_TYPE', edgeType: type })}
              >
                <div
                  className="map-ft-edge-preview"
                  style={{ background: style.color }}
                />
                <span>{EDGE_TYPE_LABELS[type]}</span>
                {isActive && <div className="map-ft-edge-active-ring" />}
              </button>
            )
          })}
          <div className="map-ft-edge-hint">
            <p>Click to place start point, then end point</p>
            <p><strong>Esc</strong> to cancel</p>
          </div>
        </div>
      )}
    </div>
  )
}
