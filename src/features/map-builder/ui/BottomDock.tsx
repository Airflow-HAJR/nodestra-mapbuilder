import { useRef, useState, useLayoutEffect, useCallback, useEffect } from 'react'
import type { Tool } from '../types'
import type { MapDispatch } from '../useMapStore'

interface Props {
  activeTool: Tool
  dispatch: MapDispatch
  onUploadImage: () => void
}

const TOOLS: { tool: Tool; key: string; label: string }[] = [
  { tool: 'select', key: 'V', label: 'Select' },
  // COMMENTED OUT: Waypoint tool — edges now auto-create waypoints
  // { tool: 'add-waypoint', key: 'W', label: 'Waypoint' },
  { tool: 'draw-edge', key: 'M', label: 'Movement' },
  { tool: 'add-poi', key: 'N', label: 'POI' },
]

function SelectIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
      <path d="M4 2l13 9.5-6.5 1.5L12.5 19l-2 1L8 13.5 3 17.5V2z" />
    </svg>
  )
}

/* COMMENTED OUT: Waypoint icon — edges now auto-create waypoints
function WaypointIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="10" r="4" />
      <path d="M10 3v3M10 14v3M3 10h3M14 10h3" />
    </svg>
  )
}
*/

function EdgeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="4" y1="16" x2="16" y2="4" />
      <circle cx="4" cy="16" r="2.5" fill="currentColor" />
      <circle cx="16" cy="4" r="2.5" fill="currentColor" />
    </svg>
  )
}

function POIIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.5v7M6.5 10h7" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V4.5M6.5 7.5l3.5-4 3.5 4" />
      <path d="M4 16h12" />
    </svg>
  )
}

const TOOL_ICONS: Record<Tool, () => any> = {
  'select': SelectIcon,
  'add-waypoint': SelectIcon,  // placeholder, not displayed
  'draw-edge': EdgeIcon,
  'add-poi': POIIcon,
}

export function BottomDock({ activeTool, dispatch, onUploadImage }: Props) {
  const btnRefs = useRef<Map<Tool, HTMLButtonElement>>(new Map())
  const hasAnimated = useRef(false)
  const [pillPos, setPillPos] = useState<{ left: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const btn = btnRefs.current.get(activeTool)
    if (!btn) return
    setPillPos({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [activeTool])

  // Measure on tool change and initial mount
  useLayoutEffect(() => {
    measure()
    // Enable transitions only after the first measurement
    requestAnimationFrame(() => { hasAnimated.current = true })
  }, [measure])

  // Re-measure when layout shifts (e.g. rail animation resizing the canvas area)
  useEffect(() => {
    const btn = btnRefs.current.get(activeTool)
    if (!btn) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(btn)
    return () => observer.disconnect()
  }, [activeTool, measure])

  return (
    <div className="dock-wrapper">
      <div className="dock-pill">
        {/* Sliding active indicator — positioned via offsetLeft/offsetWidth */}
        {pillPos && (
          <div
            className="dock-active-pill"
            style={{
              left: pillPos.left,
              width: pillPos.width,
              transition: hasAnimated.current ? 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            }}
          />
        )}

        {TOOLS.map(({ tool, key, label }) => {
          const Icon = TOOL_ICONS[tool]
          const isActive = activeTool === tool
          return (
            <button
              key={tool}
              ref={el => { if (el) btnRefs.current.set(tool, el) }}
              className={`dock-btn${isActive ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'SET_TOOL', tool })}
              title={`${label}  ${key}`}
            >
              <Icon />
              <span className="dock-btn-label">{label}</span>
              <kbd className="dock-btn-key">{key}</kbd>
            </button>
          )
        })}

        <div className="dock-sep" />

        <button className="dock-btn dock-btn-upload" onClick={onUploadImage} title="Upload floor plan">
          <UploadIcon />
        </button>
      </div>
    </div>
  )
}
