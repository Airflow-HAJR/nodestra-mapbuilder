export type NodeType =
  // Core facilities
  | 'gate' | 'exit' | 'entrance'
  // Baggage
  | 'baggage' | 'baggage-drop' | 'oversized-baggage' | 'luggage-storage' | 'luggage-wrap'
  // Dining & retail
  | 'restaurant' | 'cafe' | 'bar' | 'shop' | 'duty-free' | 'bookstore'
  // Services
  | 'lounge' | 'customer-service' | 'info-desk' | 'hotel-desk' | 'car-rental'
  // Food & beverage
  | 'food-court' | 'vending' | 'water-fountain'
  // Health & wellness
  | 'restroom' | 'nursing-room' | 'shower-facility'
  | 'medical-clinic' | 'aed' | 'pharmacy'
  // Amenities
  | 'charging-station' | 'atm' | 'currency-exchange' | 'telephone' | 'business-center'
  | 'seating-area' | 'smoking-room' | 'prayer-room' | 'meditation-room' | 'lost-found'
  | 'mail-drop'
  // Movement nodes (same-floor transit)
  | 'tram-station' | 'train-platform' | 'moving-walkway-station'
  // Security & operations
  | 'security' | 'customs' | 'immigration' | 'precheck'
  // Portals (cross-level)
  | 'escalator' | 'elevator' | 'stairs' | 'ramp'
  // Ground transport
  | 'shuttle' | 'taxi' | 'rideshare' | 'bus-stop' | 'parking'
  // Misc
  | 'newspaper' | 'pickup' | 'smarte-carte' | 'other'

export type EdgeType =
  // Basic movement (same floor)
  | 'walkway' | 'corridor' | 'outdoor-path'
  // Assisted movement (same floor)
  | 'moving-walkway' | 'tram' | 'train' | 'monorail' | 'bus-route'
  | 'shuttle-corridor'
  // Cross-floor (portals)
  | 'escalator-passage' | 'elevator-shaft' | 'stairs-passage' | 'ramp-passage'
  // Specialized
  | 'security-lane' | 'baggage-claim-belt'

export type Tool = 'select' | 'add-waypoint' | 'draw-edge' | 'add-poi'

export interface Waypoint {
  id: string
  name: string
  x: number   // normalized 0–1 relative to image width
  y: number   // normalized 0–1 relative to image height
  floor: number
}

export interface Edge {
  id: string
  name: string
  from: string   // waypoint id
  to: string     // waypoint id
  type: EdgeType // walkway, moving-walkway, etc
  weight: number // meters (Euclidean × pixelsPerMeter), or normalized if no scale
  accessible: boolean
}

/** Portal node types — cross-level transit POIs */
export const PORTAL_NODE_TYPES: NodeType[] = ['elevator', 'escalator', 'stairs', 'ramp', 'shuttle']

export interface POI {
  id: string
  type: NodeType
  name: string
  keywords: string[]
  waypointId: string | null  // attached waypoint (null = unlinked)
  projectedEdgeId: string | null  // edge this POI projects onto
  projectedT: number | null       // 0–1 parametric position along edge
  linkedPortalIds: string[]  // IDs of other portal POIs this connects to
  x: number   // own render position
  y: number
  floor: number
}

export interface MapDocument {
  waypoints: Waypoint[]
  edges: Edge[]
  pois: POI[]
  imageUrl: string | null
  pixelsPerMeter: number | null
  floors: number[]
  activeFloor: number
}

export interface EditorState {
  doc: MapDocument
  past: { doc: MapDocument; label: string }[]
  future: { doc: MapDocument; label: string }[]
  selectedId: string | null
  selectedType: 'waypoint' | 'edge' | 'poi' | null
  activeTool: Tool
  activeNodeType: NodeType
  activeEdgeType: EdgeType  // current edge type selected
  edgeSource: string | null  // first waypoint clicked in draw-edge mode
  previewHighlightEdgeId: string | null
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  lastUndoLabel: string | null  // human-readable label for toast feedback
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  // Core
  gate:        'Gate',
  exit:        'Exit',
  entrance:    'Entrance',
  // Baggage
  baggage:     'Baggage Claim',
  'baggage-drop': 'Bag Drop',
  'oversized-baggage': 'Oversized Baggage',
  'luggage-storage': 'Luggage Storage',
  'luggage-wrap': 'Luggage Wrap',
  // Dining & retail
  restaurant:  'Restaurant',
  cafe:        'Café',
  bar:         'Bar',
  shop:        'Shop',
  'duty-free': 'Duty Free',
  bookstore:   'Bookstore',
  // Services
  lounge:      'Lounge',
  'customer-service': 'Customer Service',
  'info-desk': 'Info Desk',
  'hotel-desk': 'Hotel Desk',
  'car-rental': 'Car Rental',
  // Food & beverage
  'food-court': 'Food Court',
  vending:     'Vending Machine',
  'water-fountain': 'Water Fountain',
  // Health & wellness
  restroom:    'Restroom',
  'nursing-room': 'Nursing Room',
  'shower-facility': 'Shower',
  'medical-clinic': 'Medical Clinic',
  aed:         'AED',
  pharmacy:    'Pharmacy',
  // Amenities
  'charging-station': 'Charging Station',
  atm:         'ATM',
  'currency-exchange': 'Currency Exchange',
  telephone:   'Telephone',
  'business-center': 'Business Center',
  'seating-area': 'Seating',
  'smoking-room': 'Smoking Room',
  'prayer-room': 'Prayer Room',
  'meditation-room': 'Meditation Room',
  'lost-found': 'Lost & Found',
  'mail-drop': 'Mail Drop',
  // Movement (same-floor)
  'tram-station': 'Tram Station',
  'train-platform': 'Train Platform',
  'moving-walkway-station': 'Moving Walkway',
  // Security
  security:    'Security',
  customs:     'Customs',
  immigration: 'Immigration',
  precheck:    'TSA PreCheck',
  // Portals (cross-level)
  escalator:   'Escalator',
  elevator:    'Elevator',
  stairs:      'Stairs',
  ramp:        'Ramp',
  // Ground transport
  shuttle:     'Shuttle',
  taxi:        'Taxi',
  rideshare:   'Rideshare',
  'bus-stop':  'Bus Stop',
  parking:     'Parking',
  // Misc
  newspaper:   'Newspaper',
  pickup:      'Pickup',
  'smarte-carte': 'Smarte Carte',
  other:       'Other',
}

export const NODE_COLORS: Record<NodeType, { bg: string; text: string }> = {
  // Core
  gate:        { bg: '#1a3fa3', text: '#ffffff' },
  exit:        { bg: '#166534', text: '#ffffff' },
  entrance:    { bg: '#0e7490', text: '#ffffff' },
  // Baggage
  baggage:     { bg: '#6d28d9', text: '#ffffff' },
  'baggage-drop': { bg: '#7c3aed', text: '#ffffff' },
  'oversized-baggage': { bg: '#5b21b6', text: '#ffffff' },
  'luggage-storage': { bg: '#7c3aed', text: '#ffffff' },
  'luggage-wrap': { bg: '#8b5cf6', text: '#ffffff' },
  // Dining & retail
  restaurant:  { bg: '#ea580c', text: '#ffffff' },
  cafe:        { bg: '#92400e', text: '#ffffff' },
  bar:         { bg: '#7c2d12', text: '#ffffff' },
  shop:        { bg: '#c2410c', text: '#ffffff' },
  'duty-free': { bg: '#d97706', text: '#ffffff' },
  bookstore:   { bg: '#b45309', text: '#ffffff' },
  // Services
  lounge:      { bg: '#9333ea', text: '#ffffff' },
  'customer-service': { bg: '#0ea5e9', text: '#ffffff' },
  'info-desk': { bg: '#0369a1', text: '#ffffff' },
  'hotel-desk': { bg: '#1d4ed8', text: '#ffffff' },
  'car-rental': { bg: '#1d4ed8', text: '#ffffff' },
  // Food & beverage
  'food-court': { bg: '#d97706', text: '#ffffff' },
  vending:     { bg: '#a16207', text: '#ffffff' },
  'water-fountain': { bg: '#0ea5e9', text: '#ffffff' },
  // Health & wellness
  restroom:    { bg: '#374151', text: '#ffffff' },
  'nursing-room': { bg: '#db2777', text: '#ffffff' },
  'shower-facility': { bg: '#06b6d4', text: '#ffffff' },
  'medical-clinic': { bg: '#dc2626', text: '#ffffff' },
  aed:         { bg: '#dc2626', text: '#ffffff' },
  pharmacy:    { bg: '#059669', text: '#ffffff' },
  // Amenities
  'charging-station': { bg: '#0ea5e9', text: '#ffffff' },
  atm:         { bg: '#059669', text: '#ffffff' },
  'currency-exchange': { bg: '#059669', text: '#ffffff' },
  telephone:   { bg: '#2563eb', text: '#ffffff' },
  'business-center': { bg: '#1f2937', text: '#ffffff' },
  'seating-area': { bg: '#6b7280', text: '#ffffff' },
  'smoking-room': { bg: '#7c3aed', text: '#ffffff' },
  'prayer-room': { bg: '#9333ea', text: '#ffffff' },
  'meditation-room': { bg: '#8b5cf6', text: '#ffffff' },
  'lost-found': { bg: '#6b7280', text: '#ffffff' },
  'mail-drop': { bg: '#2563eb', text: '#ffffff' },
  // Movement (same-floor)
  'tram-station': { bg: '#0284c7', text: '#ffffff' },
  'train-platform': { bg: '#0369a1', text: '#ffffff' },
  'moving-walkway-station': { bg: '#38bdf8', text: '#000000' },
  // Security
  security:    { bg: '#b91c1c', text: '#ffffff' },
  customs:     { bg: '#b91c1c', text: '#ffffff' },
  immigration: { bg: '#b91c1c', text: '#ffffff' },
  precheck:    { bg: '#16a34a', text: '#ffffff' },
  // Portals (cross-level)
  escalator:   { bg: '#065f46', text: '#ffffff' },
  elevator:    { bg: '#1e3a8a', text: '#ffffff' },
  stairs:      { bg: '#3730a3', text: '#ffffff' },
  ramp:        { bg: '#16a34a', text: '#ffffff' },
  // Ground transport
  shuttle:     { bg: '#4b5563', text: '#ffffff' },
  taxi:        { bg: '#facc15', text: '#000000' },
  rideshare:   { bg: '#9333ea', text: '#ffffff' },
  'bus-stop':  { bg: '#475569', text: '#ffffff' },
  parking:     { bg: '#475569', text: '#ffffff' },
  // Misc
  newspaper:   { bg: '#475569', text: '#ffffff' },
  pickup:      { bg: '#0d9488', text: '#ffffff' },
  'smarte-carte': { bg: '#7c3aed', text: '#ffffff' },
  other:       { bg: '#6b7280', text: '#ffffff' },
}

export const NODE_GLYPHS: Record<NodeType, string> = {
  // Core
  gate:        'G',
  exit:        '→',
  entrance:    '←',
  // Baggage
  baggage:     '⊡',
  'baggage-drop': '↓',
  'oversized-baggage': '⬛',
  'luggage-storage': '📦',
  'luggage-wrap': '🔄',
  // Dining & retail
  restaurant:  '🍽',
  cafe:        '☕',
  bar:         '🍸',
  shop:        '⊞',
  'duty-free': '$',
  bookstore:   '📚',
  // Services
  lounge:      'L',
  'customer-service': 'CS',
  'info-desk': 'i',
  'hotel-desk': 'H',
  'car-rental': '🚗',
  // Food & beverage
  'food-court': '🍽',
  vending:     '▣',
  'water-fountain': '⛲',
  // Health & wellness
  restroom:    'WC',
  'nursing-room': '🍼',
  'shower-facility': '🚿',
  'medical-clinic': '⊕',
  aed:         'AED',
  pharmacy:    '✚',
  // Amenities
  'charging-station': '🔌',
  atm:         '$',
  'currency-exchange': '💱',
  telephone:   '☎',
  'business-center': '💼',
  'seating-area': '▤',
  'smoking-room': '🚬',
  'prayer-room': '🙏',
  'meditation-room': '☮',
  'lost-found': '?',
  'mail-drop': '📬',
  // Movement (same-floor)
  'tram-station': '🚋',
  'train-platform': '🚆',
  'moving-walkway-station': '⇄',
  // Security
  security:    '⛨',
  customs:     '🛃',
  immigration: '🛂',
  precheck:    '✓',
  // Portals (cross-level)
  escalator:   '≋',
  elevator:    '⇅',
  stairs:      '⊏',
  ramp:        '∕',
  // Ground transport
  shuttle:     '⊟',
  taxi:        '🚕',
  rideshare:   'R',
  'bus-stop':  '🚌',
  parking:     'P',
  // Misc
  newspaper:   '📰',
  pickup:      '📦',
  'smarte-carte': '🛒',
  other:       '●',
}

export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  // Basic movement
  'walkway': 'Walkway',
  'corridor': 'Corridor',
  'outdoor-path': 'Outdoor Path',
  // Assisted movement
  'moving-walkway': 'Moving Walkway',
  'tram': 'Tram',
  'train': 'Train/Rail',
  'monorail': 'Monorail',
  'bus-route': 'Bus Route',
  'shuttle-corridor': 'Shuttle',
  // Portals (cross-floor)
  'escalator-passage': 'Escalator',
  'elevator-shaft': 'Elevator',
  'stairs-passage': 'Stairs',
  'ramp-passage': 'Ramp',
  // Specialized
  'security-lane': 'Security Lane',
  'baggage-claim-belt': 'Baggage Belt',
}

export const EDGE_STYLES: Record<EdgeType, { color: string; secondaryColor?: string; strokeWidth: number; animationType: 'dot' | 'stripe' | 'none' }> = {
  // Basic movement
  'walkway': {
    color: '#3b82f6',
    strokeWidth: 6.75,
    animationType: 'none',
  },
  'corridor': {
    color: '#5b6f82',
    strokeWidth: 6.75,
    animationType: 'none',
  },
  'outdoor-path': {
    color: '#22c55e',
    strokeWidth: 6.75,
    animationType: 'none',
  },
  // Assisted movement
  'moving-walkway': {
    color: '#60a5fa',
    secondaryColor: '#93c5fd',
    strokeWidth: 6.75,
    animationType: 'stripe',
  },
  'tram': {
    color: '#0284c7',
    strokeWidth: 9,
    animationType: 'dot',
  },
  'train': {
    color: '#0369a1',
    strokeWidth: 10,
    animationType: 'dot',
  },
  'monorail': {
    color: '#0284c7',
    strokeWidth: 8,
    animationType: 'stripe',
  },
  'bus-route': {
    color: '#475569',
    strokeWidth: 8,
    animationType: 'none',
  },
  'shuttle-corridor': {
    color: '#0ea5e9',
    strokeWidth: 9,
    animationType: 'none',
  },
  // Portals (cross-floor)
  'escalator-passage': {
    color: '#065f46',
    secondaryColor: '#34d399',
    strokeWidth: 7,
    animationType: 'stripe',
  },
  'elevator-shaft': {
    color: '#1e3a8a',
    strokeWidth: 7,
    animationType: 'dot',
  },
  'stairs-passage': {
    color: '#3730a3',
    strokeWidth: 6.75,
    animationType: 'none',
  },
  'ramp-passage': {
    color: '#16a34a',
    strokeWidth: 6.75,
    animationType: 'none',
  },
  // Specialized
  'security-lane': {
    color: '#b91c1c',
    strokeWidth: 7,
    animationType: 'dot',
  },
  'baggage-claim-belt': {
    color: '#6d28d9',
    secondaryColor: '#a78bfa',
    strokeWidth: 7,
    animationType: 'stripe',
  },
}

// ── Map tree (multi-map hierarchy) ────────────────────────────────────────
export interface MapTreeNode {
  id: string
  airportId: string
  parentId: string | null
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// Cross-floor transit times (seconds) for auto-linked edges
export const CROSS_FLOOR_WEIGHTS: Record<string, number> = {
  elevator:    30,    // seconds to ride
  escalator:   15,
  stairs:      20,
  ramp:        25,    // accessibility ramp, slightly slower
  shuttle:     60,    // shuttle between levels
}
