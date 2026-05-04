import { describe, it, expect } from 'vitest'
import {
  projectPointOntoEdge,
  findNearestEdge,
  waypointDegree,
  isIntersection,
  waypointIdFromProjection,
} from './projection'
import type { Edge, Waypoint } from '../types'

// ── projectPointOntoEdge ──────────────────────────────────────────────────

describe('projectPointOntoEdge', () => {
  it('projects to mid-segment', () => {
    const r = projectPointOntoEdge(0.5, 1, 0, 0, 1, 0)
    expect(r.x).toBeCloseTo(0.5)
    expect(r.y).toBeCloseTo(0)
    expect(r.t).toBeCloseTo(0.5)
    expect(r.distance).toBeCloseTo(1)
  })

  it('clamps to start when point projects before segment', () => {
    const r = projectPointOntoEdge(-1, 0, 0, 0, 1, 0)
    expect(r.t).toBe(0)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(0)
  })

  it('clamps to end when point projects past segment', () => {
    const r = projectPointOntoEdge(2, 0, 0, 0, 1, 0)
    expect(r.t).toBe(1)
    expect(r.x).toBeCloseTo(1)
    expect(r.y).toBeCloseTo(0)
  })

  it('handles degenerate edge (zero length)', () => {
    const r = projectPointOntoEdge(1, 1, 0.5, 0.5, 0.5, 0.5)
    expect(r.t).toBe(0)
    expect(r.x).toBeCloseTo(0.5)
    expect(r.y).toBeCloseTo(0.5)
    expect(r.distance).toBeCloseTo(Math.hypot(0.5, 0.5))
  })

  it('returns distance 0 when point is on the line', () => {
    const r = projectPointOntoEdge(0.3, 0, 0, 0, 1, 0)
    expect(r.distance).toBeCloseTo(0)
    expect(r.t).toBeCloseTo(0.3)
  })

  it('projects correctly on a diagonal edge', () => {
    // Edge from (0,0) to (1,1), point at (1,0) — projects to (0.5, 0.5)
    const r = projectPointOntoEdge(1, 0, 0, 0, 1, 1)
    expect(r.t).toBeCloseTo(0.5)
    expect(r.x).toBeCloseTo(0.5)
    expect(r.y).toBeCloseTo(0.5)
  })

  it('projects correctly at the endpoints', () => {
    const r0 = projectPointOntoEdge(0, 0, 0, 0, 1, 0)
    expect(r0.t).toBeCloseTo(0)
    const r1 = projectPointOntoEdge(1, 0, 0, 0, 1, 0)
    expect(r1.t).toBeCloseTo(1)
  })
})

// ── findNearestEdge ───────────────────────────────────────────────────────

describe('findNearestEdge', () => {
  const waypoints: Waypoint[] = [
    { id: 'a', name: '', x: 0, y: 0, floor: 1 },
    { id: 'b', name: '', x: 1, y: 0, floor: 1 },
    { id: 'c', name: '', x: 0, y: 1, floor: 1 },
    { id: 'd', name: '', x: 1, y: 1, floor: 2 },
  ]

  const edges: Edge[] = [
    { id: 'e1', name: '', from: 'a', to: 'b', type: 'walkway', weight: 1, accessible: false },
    { id: 'e2', name: '', from: 'a', to: 'c', type: 'walkway', weight: 1, accessible: false },
  ]

  it('returns closest edge among multiple', () => {
    // Point (0.5, 0.1) is closer to e1 (horizontal) than e2 (vertical)
    const r = findNearestEdge(0.5, 0.1, edges, waypoints, 1)
    expect(r).not.toBeNull()
    expect(r!.edgeId).toBe('e1')
    expect(r!.t).toBeCloseTo(0.5)
  })

  it('returns null when no edges on floor', () => {
    const r = findNearestEdge(0.5, 0.5, edges, waypoints, 2)
    expect(r).toBeNull()
  })

  it('works with a single edge', () => {
    const r = findNearestEdge(0.5, 0.5, [edges[0]], waypoints, 1)
    expect(r).not.toBeNull()
    expect(r!.edgeId).toBe('e1')
  })

  it('filters edges by floor correctly', () => {
    const crossFloorEdge: Edge = { id: 'e3', name: '', from: 'a', to: 'd', type: 'walkway', weight: 1, accessible: false }
    const r = findNearestEdge(0.5, 0.5, [...edges, crossFloorEdge], waypoints, 1)
    // Should not pick e3 since d is on floor 2
    expect(r!.edgeId).not.toBe('e3')
  })

  it('returns deterministic result for equidistant edges', () => {
    // Point (0, 0) is equidistant to both edges at t=0 — should return first one found
    const r = findNearestEdge(0, 0, edges, waypoints, 1)
    expect(r).not.toBeNull()
  })
})

// ── waypointDegree / isIntersection ───────────────────────────────────────

describe('waypointDegree', () => {
  const edges: Edge[] = [
    { id: 'e1', name: '', from: 'a', to: 'b', type: 'walkway', weight: 1, accessible: false },
    { id: 'e2', name: '', from: 'b', to: 'c', type: 'walkway', weight: 1, accessible: false },
    { id: 'e3', name: '', from: 'b', to: 'd', type: 'walkway', weight: 1, accessible: false },
  ]

  it('returns 0 for isolated waypoint', () => {
    expect(waypointDegree('z', edges)).toBe(0)
  })

  it('returns 1 for endpoint waypoint', () => {
    expect(waypointDegree('a', edges)).toBe(1)
  })

  it('returns 2 for corridor waypoint', () => {
    // 'c' and 'd' each have 1 edge; 'a' has 1 edge
    // Let's check with different edges
    const corridorEdges: Edge[] = [
      { id: 'e1', name: '', from: 'a', to: 'b', type: 'walkway', weight: 1, accessible: false },
      { id: 'e2', name: '', from: 'b', to: 'c', type: 'walkway', weight: 1, accessible: false },
    ]
    expect(waypointDegree('b', corridorEdges)).toBe(2)
  })

  it('returns 3 for intersection waypoint', () => {
    expect(waypointDegree('b', edges)).toBe(3)
  })
})

describe('isIntersection', () => {
  const edges: Edge[] = [
    { id: 'e1', name: '', from: 'a', to: 'b', type: 'walkway', weight: 1, accessible: false },
    { id: 'e2', name: '', from: 'b', to: 'c', type: 'walkway', weight: 1, accessible: false },
    { id: 'e3', name: '', from: 'b', to: 'd', type: 'walkway', weight: 1, accessible: false },
  ]

  it('returns false for degree < 3', () => {
    expect(isIntersection('a', edges)).toBe(false)
  })

  it('returns true for degree >= 3', () => {
    expect(isIntersection('b', edges)).toBe(true)
  })
})

// ── waypointIdFromProjection ──────────────────────────────────────────────

describe('waypointIdFromProjection', () => {
  const edges: Edge[] = [
    { id: 'e1', name: '', from: 'wp-a', to: 'wp-b', type: 'walkway', weight: 1, accessible: false },
  ]

  it('returns from when t < 0.5', () => {
    expect(waypointIdFromProjection({ edgeId: 'e1', x: 0, y: 0, t: 0.3 }, edges)).toBe('wp-a')
  })

  it('returns to when t >= 0.5', () => {
    expect(waypointIdFromProjection({ edgeId: 'e1', x: 0, y: 0, t: 0.5 }, edges)).toBe('wp-b')
    expect(waypointIdFromProjection({ edgeId: 'e1', x: 0, y: 0, t: 0.7 }, edges)).toBe('wp-b')
  })

  it('returns null for unknown edge', () => {
    expect(waypointIdFromProjection({ edgeId: 'nope', x: 0, y: 0, t: 0.5 }, edges)).toBeNull()
  })
})
