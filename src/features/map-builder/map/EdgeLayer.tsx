import type { Edge, Waypoint, POI } from '../types'
import { EDGE_STYLES } from '../types'

interface EdgeLayerProps {
  edges: Edge[]
  waypoints: Waypoint[]
  selectedId: string | null
  previewHighlightEdgeId: string | null
  imgW: number
  imgH: number
  recentIds?: Set<string>
  zoomScale?: number
  sizeScale?: number
  onSelect: (id: string) => void
  searchOpacity?: (id: string) => number
}

function StaticEdge({ edge, from, to, isSelected, isPreviewHighlighted, isNew, imgW, imgH, zoomScale = 1, sizeScale = 1, onSelect }: {
  edge: Edge
  from: Waypoint
  to: Waypoint
  isSelected: boolean
  isPreviewHighlighted: boolean
  isNew: boolean
  imgW: number
  imgH: number
  zoomScale?: number
  sizeScale?: number
  onSelect: (id: string) => void
}) {
  const style = EDGE_STYLES[edge.type] ?? EDGE_STYLES['walkway']
  const x1 = from.x * imgW
  const y1 = from.y * imgH
  const x2 = to.x * imgW
  const y2 = to.y * imgH

  const isHighlighted = isSelected || isPreviewHighlighted
  const inverseZoom = 1 / zoomScale
  const baseStrokeWidth = isHighlighted ? style.strokeWidth + 1 : style.strokeWidth
  const strokeWidth = baseStrokeWidth * inverseZoom * sizeScale
  const color = isHighlighted ? '#2A4A5E' : style.color

  // Dash pattern: moving-walkway gets dashes, others solid
  const dashArray = edge.type === 'moving-walkway' ? `${8 * inverseZoom} ${4 * inverseZoom}` : undefined

  // Constant visual speed — duration scales with path length (commented out with animations)
  // const pathLength = Math.hypot(x2 - x1, y2 - y1)
  // const DOT_SPEED = 80  // pixels per second
  // const walkDur = Math.max(1, pathLength / DOT_SPEED)
  // const shuttleDur = Math.max(1.5, pathLength / 60)

  return (
    <g className={`edge-group${isNew ? ' just-created' : ''}`}>
      {/* Base stroke */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dashArray}
        style={{
          pointerEvents: 'none',
        }}
      />

      {/* --- Edge animations commented out ---
      <defs>
        <path id={`edge-path-${edge.id}-f`} d={`M ${x1} ${y1} L ${x2} ${y2}`} />
        <path id={`edge-path-${edge.id}-b`} d={`M ${x2} ${y2} L ${x1} ${y1}`} />
      </defs>

      {edge.type === 'walkway' && (
        <>
          <g style={{ pointerEvents: 'none' }}>
            <circle r={3} fill="#ffffff" strokeWidth={1.5} stroke={color} opacity={0.9}>
              <animateMotion dur={`${walkDur.toFixed(2)}s`} repeatCount="indefinite">
                <mpath xlinkHref={`#edge-path-${edge.id}-f`} />
              </animateMotion>
            </circle>
          </g>
          <g style={{ pointerEvents: 'none' }}>
            <circle r={3} fill="#ffffff" strokeWidth={1.5} stroke={color} opacity={0.9}>
              <animateMotion dur={`${walkDur.toFixed(2)}s`} repeatCount="indefinite" begin={`${(walkDur / 2).toFixed(2)}s`}>
                <mpath xlinkHref={`#edge-path-${edge.id}-b`} />
              </animateMotion>
            </circle>
          </g>
        </>
      )}

      {edge.type === 'moving-walkway' && (
        <>
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={style.secondaryColor}
            strokeWidth={strokeWidth * 0.4}
            strokeLinecap="round"
            strokeDasharray={`${strokeWidth * 2} ${strokeWidth * 2}`}
            className="edge-stripe-animation"
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}

      {edge.type === 'shuttle-corridor' && (
        <>
          <g style={{ pointerEvents: 'none' }}>
            <g>
              <circle r={5} fill={color} fillOpacity={0.95} stroke="white" strokeWidth={1.5} />
              <line x1={-2} y1={0} x2={2} y2={0} stroke="white" strokeWidth={1} strokeLinecap="round" />
            </g>
            <animateMotion dur={`${shuttleDur.toFixed(2)}s`} repeatCount="indefinite">
              <mpath xlinkHref={`#edge-path-${edge.id}-f`} />
            </animateMotion>
          </g>
        </>
      )}
      --- End edge animations --- */}

      {/* Wide invisible hit area */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent"
        strokeWidth={36 / zoomScale}
        className="edge-hit-area"
        strokeLinecap="round"
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={(e) => { e.stopPropagation(); onSelect(edge.id) }}
      />
    </g>
  )
}

export function EdgeLayer({ edges, waypoints, selectedId, previewHighlightEdgeId, imgW, imgH, recentIds, zoomScale = 1, sizeScale = 1, onSelect, searchOpacity }: EdgeLayerProps) {
  if (!edges.length) return null

  const wpMap = new Map(waypoints.map(w => [w.id, w]))

  return (
    <>
      {edges.map(edge => {
        const from = wpMap.get(edge.from)
        const to = wpMap.get(edge.to)
        if (!from || !to) return null

        const edgeOpacity = searchOpacity ? searchOpacity(edge.id) : 1
        return (
          <g key={edge.id} opacity={edgeOpacity} style={{ transition: 'opacity 0.2s' }}>
            <StaticEdge
              edge={edge}
              from={from}
              to={to}
              isSelected={selectedId === edge.id}
              isPreviewHighlighted={previewHighlightEdgeId === edge.id}
              isNew={recentIds?.has(edge.id) ?? false}
              imgW={imgW}
              imgH={imgH}
              zoomScale={zoomScale}
              sizeScale={sizeScale}
              onSelect={onSelect}
            />
          </g>
        )
      })}
    </>
  )
}

interface GhostEdgeProps {
  from: Waypoint
  cursorNorm: { x: number; y: number } | null
  snapTarget: { x: number; y: number } | null
  edgeSnapTarget?: { edgeId: string; x: number; y: number; t: number } | null
  imgW: number
  imgH: number
  zoomScale?: number
}

export function GhostEdge({ from, cursorNorm, snapTarget, edgeSnapTarget, imgW, imgH, zoomScale = 1 }: GhostEdgeProps) {
  const isSnapped = snapTarget || edgeSnapTarget
  if (!cursorNorm && !isSnapped) return null

  const inverseZoom = 1 / zoomScale
  const endX = (snapTarget?.x ?? edgeSnapTarget?.x) ? (snapTarget?.x ?? edgeSnapTarget?.x)! * imgW : (cursorNorm?.x ?? 0) * imgW
  const endY = (snapTarget?.y ?? edgeSnapTarget?.y) ? (snapTarget?.y ?? edgeSnapTarget?.y)! * imgH : (cursorNorm?.y ?? 0) * imgH

  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={from.x * imgW} y1={from.y * imgH}
        x2={endX} y2={endY}
        stroke={isSnapped ? '#22c55e' : '#2A4A5E'}
        strokeWidth={(isSnapped ? 3.75 : 3) * inverseZoom}
        strokeLinecap="round"
        strokeOpacity={isSnapped ? 0.9 : 0.5}
        strokeDasharray={isSnapped ? undefined : `${12 * inverseZoom} ${9 * inverseZoom}`}
        style={{ transition: 'stroke 0.1s, stroke-opacity 0.1s' }}
      />
      {/* Source waypoint highlight */}
      <circle cx={from.x * imgW} cy={from.y * imgH} r={12 * inverseZoom}
        fill="#2A4A5E" fillOpacity={0.15} stroke="#2A4A5E" strokeWidth={3 * inverseZoom} />

      {/* Snap target indicator for edge snaps */}
      {edgeSnapTarget && (
        <>
          <circle cx={endX} cy={endY} r={14 * inverseZoom}
            fill="none" stroke="#22c55e" strokeWidth={2.5 * inverseZoom} opacity={0.8} />
          <circle cx={endX} cy={endY} r={6 * inverseZoom}
            fill="#22c55e" opacity={1} />
        </>
      )}
    </g>
  )
}

interface POILinkLayerProps {
  pois: POI[]
  waypoints: Waypoint[]
  edges: Edge[]
  imgW: number
  imgH: number
  selectedId: string | null
  zoomScale?: number
  draggingPos?: { id: string; x: number; y: number } | null
}

export function POILinkLayer({ pois, waypoints, edges, imgW, imgH, selectedId, zoomScale = 1, draggingPos }: POILinkLayerProps) {
  const inverseZoom = 1 / zoomScale
  const wpMap = new Map(waypoints.map(w => [w.id, w]))
  const edgeMap = new Map(edges.map(e => [e.id, e]))
  const linkedPois = pois.filter(p => p.projectedEdgeId !== null)
  if (!linkedPois.length) return null

  return (
    <>
      {linkedPois.map(poi => {
        const edge = edgeMap.get(poi.projectedEdgeId!)
        if (!edge) return null
        const from = wpMap.get(edge.from)
        const to = wpMap.get(edge.to)
        if (!from || !to) return null

        const t = poi.projectedT ?? 0
        const projX = (from.x + t * (to.x - from.x)) * imgW
        const projY = (from.y + t * (to.y - from.y)) * imgH

        // Use drag position if this POI is being dragged
        const poiX = (draggingPos?.id === poi.id ? draggingPos.x : poi.x) * imgW
        const poiY = (draggingPos?.id === poi.id ? draggingPos.y : poi.y) * imgH

        const isHighlighted = selectedId === poi.id
        return (
          <g key={`poi-link-${poi.id}`} style={{ pointerEvents: 'none' }}>
            <line
              x1={poiX} y1={poiY}
              x2={projX} y2={projY}
              stroke="#2A4A5E"
              strokeWidth={(isHighlighted ? 2.25 : 1.5) * inverseZoom}
              strokeLinecap="round"
              strokeOpacity={isHighlighted ? 0.55 : 0.24}
              strokeDasharray={`${6 * inverseZoom} ${4.5 * inverseZoom}`}
            />
            <circle
              cx={projX} cy={projY} r={6 * inverseZoom}
              fill="#2A4A5E"
              fillOpacity={isHighlighted ? 0.85 : 0.55}
              stroke="white"
              strokeWidth={1.5 * inverseZoom}
            />
          </g>
        )
      })}
    </>
  )
}
