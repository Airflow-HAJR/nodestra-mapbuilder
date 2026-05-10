import { useRef, useState, useEffect } from 'react'
import type { NodeType } from '../types'
import { NODE_TYPE_LABELS, NODE_COLORS, NODE_GLYPHS } from '../types'

const POI_CATEGORIES: { label: string; types: NodeType[] }[] = [
  { label: 'Core', types: ['gate', 'exit', 'entrance'] },
  { label: 'Baggage', types: ['baggage', 'baggage-drop', 'oversized-baggage', 'luggage-storage', 'luggage-wrap'] },
  { label: 'Dining & Retail', types: ['restaurant', 'cafe', 'bar', 'shop', 'duty-free', 'bookstore'] },
  { label: 'Services', types: ['lounge', 'customer-service', 'info-desk', 'hotel-desk', 'car-rental'] },
  { label: 'Food & Beverage', types: ['food-court', 'vending', 'water-fountain'] },
  { label: 'Health & Wellness', types: ['restroom', 'nursing-room', 'baby-changing-station', 'shower-facility', 'medical-clinic', 'aed', 'pharmacy'] },
  { label: 'Amenities', types: ['charging-station', 'atm', 'currency-exchange', 'telephone', 'business-center', 'seating-area', 'smoking-room', 'prayer-room', 'meditation-room', 'lost-found', 'mail-drop'] },
  { label: 'Movement', types: ['tram-station', 'train-platform', 'moving-walkway-station'] },
  { label: 'Security', types: ['security', 'customs', 'immigration', 'precheck'] },
  { label: 'Portals', types: ['escalator', 'elevator', 'stairs', 'ramp'] },
  { label: 'Ground Transport', types: ['shuttle', 'taxi', 'rideshare', 'bus-stop', 'parking'] },
  { label: 'Misc', types: ['newspaper', 'pickup', 'smarte-carte', 'other'] },
]

interface AddPOIMenuProps {
  screenX: number
  screenY: number
  onSelectType: (type: NodeType) => void
  onClose: () => void
}

export function AddPOIMenu({ screenX, screenY, onSelectType, onClose }: AddPOIMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')

  // Auto-focus search input
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [])

  // Close on click outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay listener to avoid the same keydown/click closing it immediately
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', onMouseDown)
    }, 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Position using screen coordinates (fixed positioning)
  const MENU_W = 260
  const MENU_MAX_H = 420

  let x = screenX
  let y = screenY

  // Clamp to viewport so menu doesn't overflow window
  if (x + MENU_W > window.innerWidth) x = window.innerWidth - MENU_W - 8
  if (y + MENU_MAX_H > window.innerHeight) y = window.innerHeight - MENU_MAX_H - 8
  if (x < 8) x = 8
  if (y < 8) y = 8

  console.log('AddPOIMenu fixed positioning:', { screenX, screenY, finalX: x, finalY: y, windowSize: { w: window.innerWidth, h: window.innerHeight } })

  const lowerFilter = filter.toLowerCase()

  // Filter categories
  const filteredCategories = POI_CATEGORIES.map(cat => ({
    ...cat,
    types: cat.types.filter(t =>
      NODE_TYPE_LABELS[t].toLowerCase().includes(lowerFilter) ||
      t.toLowerCase().includes(lowerFilter)
    ),
  })).filter(cat => cat.types.length > 0)

  return (
    <div
      ref={menuRef}
      className="add-poi-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="add-poi-menu-header">
        <span className="add-poi-menu-title">Add POI</span>
        <kbd className="add-poi-menu-kbd">Shift A</kbd>
        <button className="add-poi-menu-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>&times;</button>
      </div>

      <div className="add-poi-menu-search-wrap">
        <svg className="add-poi-menu-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchRef}
          className="add-poi-menu-search"
          type="text"
          placeholder="Search types..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      <div className="add-poi-menu-body">
        {filteredCategories.length === 0 && (
          <div className="add-poi-menu-empty">No matching types</div>
        )}
        {filteredCategories.map(cat => (
          <div key={cat.label}>
            <div className="add-poi-menu-category">{cat.label}</div>
            {cat.types.map(type => {
              const colors = NODE_COLORS[type]
              return (
                <button
                  key={type}
                  className="add-poi-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectType(type)
                  }}
                >
                  <span
                    className="add-poi-menu-icon"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {NODE_GLYPHS[type]}
                  </span>
                  <span className="add-poi-menu-label">{NODE_TYPE_LABELS[type]}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
