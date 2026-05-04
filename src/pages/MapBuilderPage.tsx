import { useEffect, useRef, useCallback, useState } from "react";
import { useMapStore } from "../features/map-builder/useMapStore";
import { useAirportMap } from "../features/map-builder/useAirportMap";
import { useMapTreeStore } from "../features/map-builder/useMapTreeStore";
import { ImageCanvas } from "../features/map-builder/map/ImageCanvas";
import { BottomDock } from "../features/map-builder/ui/BottomDock";
import { LeftToolRail } from "../features/map-builder/ui/LeftToolRail";
import { PropertiesPanel } from "../features/map-builder/ui/PropertiesPanel";
import { MapOnboarding } from "../features/map-builder/ui/MapOnboarding";
import { TopBar } from "../features/map-builder/ui/TopBar";
import { NavigationOverlay } from "../features/map-builder/ui/NavigationOverlay";
import { ToastProvider } from "../features/map-builder/ui/Toast";
import { showToast } from "../features/map-builder/ui/toast-store";
import { MapTreeSidebar } from "../features/map-builder/ui/MapTreeSidebar";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import type { NodeType } from "../features/map-builder/types";
import { detectDuplicates } from "../features/map-builder/utils/duplicateDetection";
import { AlertCircle, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Slider } from "../components/ui/slider";
import "../styles/map-builder.css";

export function MapBuilderPage() {
  const { state, dispatch } = useMapStore();
  const { user, loading } = useAuth();
  const { activeMapId, fetchTree } = useMapTreeStore();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = import.meta.env.VITE_SIGNIN_URL ?? 'https://signin.nodestra.com'
    }
  }, [user, loading])

  if (loading || !user) return null

  const {
    save,
    uploadImage,
    exportJson,
    saveStatus,
    saveError,
    isUploadingImage,
  } = useAirportMap(state, dispatch, activeMapId);

  // Fetch the map tree on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: airportUser } = await supabase
        .from("airport_users")
        .select("airport_id")
        .eq("id", user.id)
        .maybeSingle();
      if (airportUser) {
        fetchTree(airportUser.airport_id);
      }
    })();
  }, [user, fetchTree]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [hiddenTypes, setHiddenTypes] = useState<NodeType[]>([]);
  const [hideEdges, setHideEdges] = useState(false);
  const [poiScale, setPoiScale] = useState<number>(100);
  const [portalScale, setPortalScale] = useState<number>(100);
  const [movementScale, setMovementScale] = useState<number>(100);
  const [layerOrder, setLayerOrder] = useState<('pois' | 'movement' | 'portals')[]>(['movement', 'portals', 'pois']);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imageScale, setImageScale] = useState<number>(1);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [isDuplicateWarningDismissed, setIsDuplicateWarningDismissed] = useState(false);
  const [addPOIMenuPos, setAddPOIMenuPos] = useState<{ screenX: number; screenY: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const clipboardRef = useRef<{ type: string; data: any } | null>(null);
  const inspectorOpen = !!state.selectedId && !!state.selectedType;

  // Detect duplicates on current floor
  const duplicates = detectDuplicates(state.doc, state.doc.activeFloor);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Toast on undo/redo
  const lastLabelRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.lastUndoLabel && state.lastUndoLabel !== lastLabelRef.current) {
      showToast(state.lastUndoLabel);
      lastLabelRef.current = state.lastUndoLabel;
    }
  }, [state.lastUndoLabel]);

  // Auto-dismiss warning when duplicates are resolved
  useEffect(() => {
    if (!duplicates.hasDuplicates && !isDuplicateWarningDismissed) {
      setIsDuplicateWarningDismissed(false);
    }
  }, [duplicates.hasDuplicates]);

  function handleToggleType(type: NodeType) {
    setHiddenTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }

      // Copy selected element
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && state.selectedId && state.selectedType) {
        e.preventDefault();
        if (state.selectedType === "waypoint") {
          const wp = state.doc.waypoints.find(w => w.id === state.selectedId);
          if (wp) {
            clipboardRef.current = {
              type: "waypoint",
              data: { ...wp, id: undefined },
            };
            showToast("Waypoint copied");
          }
        } else if (state.selectedType === "poi") {
          const poi = state.doc.pois.find(p => p.id === state.selectedId);
          if (poi) {
            clipboardRef.current = {
              type: "poi",
              data: { ...poi, id: undefined },
            };
            showToast("POI copied");
          }
        } else if (state.selectedType === "edge") {
          const edge = state.doc.edges.find(e => e.id === state.selectedId);
          if (edge) {
            clipboardRef.current = {
              type: "edge",
              data: { ...edge, id: undefined },
            };
            showToast("Edge copied");
          }
        }
        return;
      }

      // Paste at mouse position
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboardRef.current) {
        e.preventDefault();
        const { type: clipboardType, data } = clipboardRef.current;
        const { x: screenX, y: screenY } = lastMouseRef.current;
        const norm = { x: screenX / window.innerWidth, y: screenY / window.innerHeight };
        const x = Math.max(0, Math.min(1, norm.x));
        const y = Math.max(0, Math.min(1, norm.y));

        if (clipboardType === "waypoint") {
          const id = `waypoint-${Math.random().toString(36).substr(2, 9)}`;
          dispatch({
            type: "ADD_WAYPOINT",
            waypoint: { ...data, id, x, y, floor: state.doc.activeFloor },
          });
          showToast("Waypoint pasted");
        } else if (clipboardType === "poi") {
          const id = `poi-${Math.random().toString(36).substr(2, 9)}`;
          dispatch({
            type: "ADD_POI",
            poi: { ...data, id, x, y, floor: state.doc.activeFloor },
          });
          showToast("POI pasted");
        }
        return;
      }

      if (e.key === "Escape") {
        if (addPOIMenuPos) { setAddPOIMenuPos(null); return; }
        dispatch({ type: "SET_EDGE_SOURCE", id: null });
        dispatch({ type: "SET_SELECTION", id: null, selType: null });
        setShortcutsOpen(false);
        setNavOpen(false);
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === "a" && state.doc.imageUrl) {
        e.preventDefault();
        // Use last known mouse position from handleCanvasMouseMove
        const x = lastMouseRef.current.x
        const y = lastMouseRef.current.y
        console.log('Shift+A pressed, setting menu pos:', { screenX: x, screenY: y });
        setAddPOIMenuPos({ screenX: x, screenY: y });
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        if (state.selectedType === "waypoint")
          dispatch({ type: "DELETE_WAYPOINT", id: state.selectedId });
        if (state.selectedType === "edge")
          dispatch({ type: "DELETE_EDGE", id: state.selectedId });
        if (state.selectedType === "poi")
          dispatch({ type: "DELETE_POI", id: state.selectedId });
        return;
      }

      if (e.key.toLowerCase() === "v")
        dispatch({ type: "SET_TOOL", tool: "select" });
      if (e.key.toLowerCase() === "m")
        dispatch({ type: "SET_TOOL", tool: "draw-edge" });
      if (e.key.toLowerCase() === "n")
        dispatch({ type: "SET_TOOL", tool: "add-poi" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selectedId, state.selectedType, state.doc, state.doc.imageUrl, addPOIMenuPos, dispatch, save]);

  return (
    <div className={`map-builder${inspectorOpen ? " inspector-open" : ""}`}>
      <MapOnboarding />
      <ToastProvider />

      {/* Duplicate Warning Icon Button (bottom-left) */}
      {duplicates.hasDuplicates && (
        <button
          className="duplicate-warning-icon-btn"
          onClick={() => setIsDuplicateWarningDismissed(!isDuplicateWarningDismissed)}
          title={`${duplicates.pois.reduce((sum, g) => sum + g.count, 0)} duplicate POI${duplicates.pois.reduce((sum, g) => sum + g.count, 0) !== 1 ? 's' : ''}`}
        >
          <AlertCircle size={20} />
        </button>
      )}

      {/* Duplicate Warning Details (toggleable) */}
      {duplicates.hasDuplicates && isDuplicateWarningDismissed && (
        <div className="duplicate-warning-panel">
          <div className="duplicate-warning-panel-header">
            <div className="duplicate-warning-panel-title">Duplicate POIs</div>
            <button
              className="duplicate-warning-panel-close"
              onClick={() => setIsDuplicateWarningDismissed(false)}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="duplicate-warning-panel-hint">
            Often it's helpful to give POIs unique names, but not always necessary.
          </div>
          <div className="duplicate-warning-details-list">
            {duplicates.pois.map(group => (
              <div key={group.normalizedName} className="duplicate-warning-details-item">
                <span className="duplicate-warning-details-name">{group.displayName}</span>
                <div className="duplicate-warning-details-buttons">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      className="duplicate-warning-details-btn"
                      onClick={() => {
                        dispatch({ type: 'SET_SELECTION', id: item.id, selType: 'poi' })
                      }}
                      title={`Select: ${item.id}`}
                    >
                      {item.id.slice(0, 6)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <TopBar
        doc={state.doc}
        saveStatus={saveStatus}
        saveError={saveError}
        isDirty={state.isDirty}
        isUploadingImage={isUploadingImage}
        onSave={save}
        onExport={exportJson}
        onClearAll={() => setClearAllOpen(true)}
      />

      <NavigationOverlay isOpen={navOpen} onClose={() => setNavOpen(false)} />

      <div className="map-builder-body">
        <MapTreeSidebar onOpenNav={() => setNavOpen(true)} />

        <div className="map-editor-area">
          <LeftToolRail
            activeTool={state.activeTool}
            activeNodeType={state.activeNodeType}
            activeEdgeType={state.activeEdgeType}
            dispatch={dispatch}
          />

          <div className="map-canvas-area" onMouseMove={handleCanvasMouseMove}>
            {/* Undo / Redo buttons + Search bar */}
            <div style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 20,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}>
              <button
                className="undo-redo-btn"
                title="Undo (⌘Z)"
                disabled={state.past.length === 0}
                onClick={() => dispatch({ type: 'UNDO' })}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
              <button
                className="undo-redo-btn"
                title="Redo (⌘⇧Z)"
                disabled={state.future.length === 0}
                onClick={() => dispatch({ type: 'REDO' })}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                </svg>
              </button>

              <div className="map-search-bar">
                <Search size={14} className="map-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="map-search-input"
                  placeholder="Search elements, e.g. restroom"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchQuery('');
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                {searchQuery && (
                  <button
                    className="map-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <ImageCanvas
              state={state}
              dispatch={dispatch}
              onUploadImage={setPendingFile}
              hiddenTypes={hiddenTypes}
              hideEdges={hideEdges}
              poiScale={poiScale}
              portalScale={portalScale}
              movementScale={movementScale}
              layerOrder={layerOrder}
              addPOIMenuPos={addPOIMenuPos}
              onCloseAddPOIMenu={() => setAddPOIMenuPos(null)}
              searchQuery={searchQuery}
            />

            <BottomDock
              activeTool={state.activeTool}
              dispatch={dispatch}
              onUploadImage={() => fileInputRef.current?.click()}
            />
          </div>

          <PropertiesPanel
            state={state}
            dispatch={dispatch}
            hiddenTypes={hiddenTypes}
            onToggleType={handleToggleType}
            hideEdges={hideEdges}
            onToggleEdges={() => setHideEdges(prev => !prev)}
            poiScale={poiScale}
            onPoiScaleChange={setPoiScale}
            portalScale={portalScale}
            onPortalScaleChange={setPortalScale}
            movementScale={movementScale}
            onMovementScaleChange={setMovementScale}
            layerOrder={layerOrder}
            onLayerOrderChange={setLayerOrder}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPendingFile(f);
          e.target.value = "";
        }}
      />

      <Dialog
        open={!!pendingFile}
        onOpenChange={(open) => {
          if (!open) {
            setPendingFile(null);
            setImageScale(1);
          }
        }}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Upload Image / PDF</DialogTitle>
            <DialogDescription>
              Adjust the resolution scale before uploading. Higher values give
              better quality but increase file size.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Resolution Scale
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {imageScale}x
              </span>
            </div>
            <Slider
              value={[imageScale]}
              onValueChange={(v) => setImageScale(v[0])}
              min={0.5}
              max={5}
              step={0.5}
            />
          </div>

          <DialogFooter>
            <button
              className="editor-topbar-btn"
              onClick={() => {
                setPendingFile(null);
                setImageScale(1);
              }}
            >
              Cancel
            </button>
            <button
              className="editor-topbar-btn accent"
              onClick={() => {
                if (pendingFile) uploadImage(pendingFile, imageScale);
                setPendingFile(null);
                setImageScale(1);
              }}
            >
              Upload
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Clear All Map Data</DialogTitle>
            <DialogDescription>
              This will permanently remove all waypoints ({state.doc.waypoints.length}), edges ({state.doc.edges.length}), and POIs ({state.doc.pois.length}) from the map. This action can be undone with <strong>Ctrl+Z</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="editor-topbar-btn"
              onClick={() => setClearAllOpen(false)}
            >
              Cancel
            </button>
            <button
              className="editor-topbar-btn"
              style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              onClick={() => {
                dispatch({ type: 'CLEAR_ALL' });
                setClearAllOpen(false);
              }}
            >
              Clear All
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcuts modal */}
      {shortcutsOpen && (
        <div className="shortcuts-modal-overlay" onClick={() => setShortcutsOpen(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-modal-title">Keyboard Shortcuts</div>
            <div className="shortcuts-modal-grid">
              {[
                ['V', 'Select'],
                ['M', 'Movement'],
                ['N', 'Add POI'],
                ['⇧A', 'Quick-add POI at cursor'],
                ['⌘S', 'Save'],
                ['Del', 'Delete selected'],
                ['⌘Z', 'Undo'],
                ['⌘⇧Z', 'Redo'],
                ['Esc', 'Cancel / Deselect'],
                ['?', 'Toggle shortcuts'],
              ].map(([key, label]) => (
                <div key={key} className="shortcuts-modal-row">
                  <kbd>{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
