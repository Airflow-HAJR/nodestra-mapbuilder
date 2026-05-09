# Nodestra Map Builder Agent Guide

This repository is only the Nodestra map builder app. The original monorepo was split into:

- `nodestra-signin`
- `nodestra-mapbuilder` (this repo)
- `nodestra-gategetter`
- `nodestra-landing`

Do not add landing page, sign-in page, dashboard marketing, or passenger-facing GateGetter code here. This app is the authenticated editor used by airport operators to create indoor airport maps.

## App Overview

Nodestra Map Builder is a React + TypeScript + Vite editor for drawing a walkable indoor airport graph on top of a floor plan image or PDF. Operators create:

- waypoints for path geometry and decision points
- edges for walkable movement
- POIs for gates, restrooms, baggage, portals, shops, services, and similar airport locations
- multi-level map hierarchies stored in Supabase

The exported JSON feeds downstream navigation/pathfinding systems.

## Stack

- Framework: React 19 + TypeScript + Vite
- Routing: `react-router-dom`
- Styling: Tailwind CSS, shadcn/ui primitives, custom CSS in `src/styles/map-builder.css`
- Icons: `lucide-react`
- State: custom reducer-style store in `src/features/map-builder/useMapStore.ts` using `use-immer`
- Map tree state: vanilla `useSyncExternalStore` store in `src/features/map-builder/useMapTreeStore.ts`
- Persistence/auth: Supabase via `src/lib/supabase.ts` and shared auth cookie from the signin app
- Tests: Vitest

## Commands

```bash
npm install
npm run dev        # Vite dev server, usually http://localhost:5173
npm run build      # TypeScript build + Vite production build
npm test -- --run  # Run Vitest once
npm run lint
```

The app route is `/map`; `/` redirects to `/map`.

## Environment

Required variables are documented in `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SIGNIN_URL`
- `VITE_GATEGETTER_URL`
- `VITE_MAPBUILDER_URL`

Auth is shared with `nodestra-signin` through the `nodestra-auth` Supabase storage key. Keep that storage key in sync with the signin app.

Unauthenticated users are redirected to `VITE_SIGNIN_URL`, falling back to `https://signin.nodestra.com`.

## Important Files

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Routes `/` and `/map`. |
| `src/pages/MapBuilderPage.tsx` | Main screen composition, keyboard shortcuts, auth redirect, layer controls, duplicate warnings. |
| `src/features/map-builder/types.ts` | Core types, node/edge labels, colors, glyphs, map tree type, cross-floor weights. |
| `src/features/map-builder/useMapStore.ts` | Editor document reducer, undo/redo, graph invariants, projection updates. |
| `src/features/map-builder/useAirportMap.ts` | Load/save active map, floor plan upload, auto-save, JSON export. |
| `src/features/map-builder/useMapTreeStore.ts` | Multi-map tree CRUD, active map selection, drag/drop ordering, cross-map portals. |
| `src/features/map-builder/map/ImageCanvas.tsx` | Floor plan rendering, zoom/pan, mouse interactions, waypoint/edge/POI placement. |
| `src/features/map-builder/map/EdgeLayer.tsx` | SVG edge rendering. |
| `src/features/map-builder/map/NodeIcon.tsx` | Visible POI/waypoint icons and labels. |
| `src/features/map-builder/ui/PropertiesPanel.tsx` | Right-side inspector for selected waypoints, edges, POIs, layers, shortcuts. |
| `src/features/map-builder/ui/LeftToolRail.tsx` | Main POI/tool rail. |
| `src/features/map-builder/ui/BottomDock.tsx` | Bottom tool controls. |
| `src/features/map-builder/ui/MapTreeSidebar.tsx` | Map/level hierarchy sidebar. |
| `src/features/map-builder/utils/exportMap.ts` | Converts editor documents into downstream export JSON. |
| `src/features/map-builder/utils/projection.ts` | POI-to-edge projection math. |
| `src/features/map-builder/utils/projection.test.ts` | Projection unit tests. |
| `src/features/map-builder/utils/pdfToImage.ts` | Converts uploaded PDF floor plans to images. |
| `src/styles/map-builder.css` | Main scoped stylesheet for this app. |

## Data Model

Core types live in `src/features/map-builder/types.ts`.

```ts
Waypoint {
  id: string
  name: string
  x: number
  y: number
  floor: number
}

Edge {
  id: string
  name: string
  from: string
  to: string
  type: EdgeType
  weight: number
  accessible: boolean
}

POI {
  id: string
  type: NodeType
  name: string
  keywords: string[]
  waypointId: string | null
  projectedEdgeId: string | null
  projectedT: number | null
  linkedPortalIds: string[]
  x: number
  y: number
  floor: number
}

MapDocument {
  waypoints: Waypoint[]
  edges: Edge[]
  pois: POI[]
  imageUrl: string | null
  pixelsPerMeter: number | null
  floors: number[]
  activeFloor: number
}
```

Coordinates are normalized `0..1` relative to the floor plan image.

## Supabase Persistence

The map tree is stored in the `maps` table. Important columns used by this app:

- `id`
- `airport_id`
- `parent_id`
- `name`
- `sort_order`
- `graph_map`
- `floor_plan_data`
- `created_at`
- `updated_at`

`graph_map` stores the editor graph without `imageUrl`. `floor_plan_data` stores the floor plan data URL separately.

`airport_users` maps the signed-in Supabase user id to an `airport_id`; the map builder uses that airport id to fetch and export maps.

## Graph Rules And Invariants

Most invariants are enforced in `useMapStore.ts`. Preserve them when editing graph behavior.

- Waypoint classification is computed from graph degree, not stored:
  - degree `>= 3` means `intersection`
  - degree `<= 2` means `curve`
- POIs project onto the nearest edge using `projectedEdgeId` and `projectedT`.
- `waypointId` on POIs is derived from projection and kept for backward compatibility.
- Deleting a waypoint cascades by removing touching edges and re-projecting affected POIs.
- Finalizing a waypoint move recalculates edge weights and re-projects floor POIs.
- Live waypoint drag updates position only and should not create undo snapshots.
- Self-loop edges are rejected.
- Duplicate edges are rejected regardless of direction.
- Adding or deleting an edge re-projects floor POIs because the nearest edge may change.
- If a floor has no edges, POIs on that floor become unlinked with `projectedEdgeId: null` and `waypointId: null`.
- Edge weight is normally computed from distance and `pixelsPerMeter`.
- Old monorepo `nodes[]` / `paths[]` formats are intentionally discarded on load; do not reintroduce old migrations unless explicitly requested.

## Export Format

`buildExportPayload(doc)` in `src/features/map-builder/utils/exportMap.ts` creates the downstream graph payload.

Single-map export shape:

```json
{
  "waypoints": [{ "id": "...", "x": 0, "y": 0, "floor": 0, "kind": "intersection" }],
  "edges": [{ "id": "...", "from": "...", "to": "...", "weight": 1, "accessible": true }],
  "pois": [{
    "id": "...",
    "type": "gate",
    "name": "A12",
    "keywords": [],
    "waypointId": "...",
    "projectedEdgeId": "...",
    "projectedT": 0.5,
    "projectedX": 0,
    "projectedY": 0,
    "x": 0,
    "y": 0,
    "floor": 0
  }]
}
```

`useAirportMap.exportJson()` exports all maps for the airport as:

```json
{
  "levels": [
    {
      "id": "...",
      "name": "Terminal 1",
      "parentId": null,
      "sortOrder": 0,
      "waypoints": [],
      "edges": [],
      "pois": []
    }
  ]
}
```

`exportMap.ts` may split edges at projected POIs for pathfinding. Review its behavior before changing export contracts.

## UI Behavior

Primary editor tools:

- `select`
- `add-waypoint`
- `draw-edge`
- `add-poi`

Common shortcuts are in `MapBuilderPage.tsx` and include:

- `Cmd/Ctrl+S`: save
- `Cmd/Ctrl+F`: focus search
- `Cmd/Ctrl+Z`: undo
- `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y`: redo
- `?`: shortcuts dialog
- `Escape`: clear active selections/dialog state

Gate POIs use `poi.name` as the visible gate label. Keep this in sync between `PropertiesPanel.tsx` and `NodeIcon.tsx`.

## Styling Notes

Most map builder styling is scoped under `.map-builder` in `src/styles/map-builder.css`.

Do not remove this scoped accent override:

```css
.map-builder {
  --accent: #2A4A5E;
  --accent-hover: #1F3A4C;
}
```

shadcn defines `--accent` globally as a near-white value, so buttons and active states can become invisible if map builder components rely on the global value.

Prefer existing CSS classes and local component patterns before adding new styling systems. This app already uses custom CSS heavily.

## Development Guidance For AI Agents

- Keep changes scoped to `nodestra-mapbuilder`; do not add code for the other split repos.
- Prefer existing reducer actions and graph utilities over ad hoc state updates.
- When changing graph mutation behavior, inspect `useMapStore.ts`, `projection.ts`, and `exportMap.ts` together.
- When changing rendering behavior, inspect both the editor panel and map renderer; field values are often edited in `PropertiesPanel.tsx` and displayed in `NodeIcon.tsx` or `EdgeLayer.tsx`.
- When changing persistence, inspect `useAirportMap.ts`, `useMapTreeStore.ts`, `src/lib/supabase.ts`, and `.env.example`.
- Run `npm run build` for TypeScript safety after edits.
- Run `npm test -- --run` after changes to projection, export, or graph reducer behavior.
- Preserve user data compatibility in `LOAD_DOCUMENT`; map rows in Supabase may be missing newer fields.
- Avoid broad refactors unless specifically requested. This app has several large UI files where small behavior changes are safer.

## Out Of Scope In This Repo

- Sign-in UI and account setup flows: `nodestra-signin`
- Passenger navigation/GateGetter experience: `nodestra-gategetter`
- Marketing homepage and landing animations: `nodestra-landing`
- Backend pathfinding service changes unless explicitly added to this repo later
