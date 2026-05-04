import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { pdfFirstPageToImageFile } from "./utils/pdfToImage";
import { buildExportPayload } from "./utils/exportMap";
import type { MapDispatch } from "./useMapStore";
import type { EditorState, MapDocument, NodeType, EdgeType } from "./types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// ── Image → Base64 data URI ────────────────────────────────────────────────
async function fileToDataUrl(
  file: File,
  scaleMultiplier: number = 1,
  maxDim = 4096,
): Promise<string> {
  let imgFile = file;
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    imgFile = await pdfFirstPageToImageFile(file, 2 * scaleMultiplier);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imgFile);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, (maxDim * scaleMultiplier) / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = imgFile.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = mime === "image/jpeg" ? 0.92 : undefined;
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image"));
    };
    img.src = objectUrl;
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAirportMap(
  state: EditorState,
  dispatch: MapDispatch,
  activeMapId: string | null = null,
) {
  const { user } = useAuth();
  const airportIdRef = useRef<string | null>(null);
  const activeMapIdRef = useRef<string | null>(activeMapId);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Keep ref in sync
  activeMapIdRef.current = activeMapId;

  // ── Resolve airportId on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: airportUser } = await supabase
        .from("airport_users")
        .select("airport_id")
        .eq("id", user.id)
        .maybeSingle();
      if (airportUser) {
        airportIdRef.current = airportUser.airport_id;
      }
    })();
  }, [user]);

  // ── Save current map before switching + load new map ────────────────────
  const prevMapIdRef = useRef<string | null>(null);
  const prevDocRef = useRef<MapDocument | null>(null);
  const prevDirtyRef = useRef(false);
  const loadingAbortRef = useRef<AbortController | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState(false);

  // Keep doc/dirty refs in sync so the switchMap effect can read latest values
  // without needing them as dependencies (which would cause infinite loops).
  prevDocRef.current = state.doc;
  prevDirtyRef.current = state.isDirty;

  useEffect(() => {
    if (!user) return;

    // Cancel any in-flight requests from previous map loads
    if (loadingAbortRef.current) {
      loadingAbortRef.current.abort();
    }
    const abortController = new AbortController();
    loadingAbortRef.current = abortController;

    async function switchMap() {
      try {
        const prevId = prevMapIdRef.current;

        // Auto-save the previous map if it was dirty (use refs for latest state)
        if (prevId && prevDirtyRef.current && !abortController.signal.aborted) {
          const { imageUrl: _omit, ...graphData } = prevDocRef.current!;
          await supabase
            .from("maps")
            .update({ graph_map: graphData, updated_at: new Date().toISOString() })
            .eq("id", prevId);
        }

        if (abortController.signal.aborted) return;

        prevMapIdRef.current = activeMapId;
        setIsLoadingMap(true);

        // Load the map from the maps table
        if (activeMapId) {
          const { data: mapRow } = await supabase
            .from("maps")
            .select("graph_map, floor_plan_data")
            .eq("id", activeMapId)
            .maybeSingle();

          if (abortController.signal.aborted) return;

          dispatch({ type: "LOAD_DOCUMENT", payload: mapRow?.graph_map ?? null });
          dispatch({ type: "SET_IMAGE_URL", url: mapRow?.floor_plan_data ?? null, fromLoad: true });
        } else {
          // No active map — reset to empty
          dispatch({ type: "LOAD_DOCUMENT", payload: null });
          dispatch({ type: "SET_IMAGE_URL", url: null, fromLoad: true });
        }

        setIsLoadingMap(false);
      } catch (err) {
        // Ignore errors from aborted requests
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('Error switching map:', err);
          setIsLoadingMap(false);
        }
      }
    }
    switchMap();

    return () => {
      abortController.abort();
    };
  }, [user, activeMapId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save graph data ─────────────────────────────────────────────────────
  async function save() {
    const mapId = activeMapIdRef.current;

    if (!mapId) {
      setSaveStatus("error");
      setSaveError("No active map selected");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    dispatch({ type: "SET_SAVING", saving: true });

    // Strip imageUrl from what we write to graph_map
    const { imageUrl: _omit, ...graphData } = state.doc;

    const { error } = await supabase
      .from("maps")
      .update({ graph_map: graphData, updated_at: new Date().toISOString() })
      .eq("id", mapId);

    if (error) {
      setSaveStatus("error");
      setSaveError(error.message);
      dispatch({ type: "SET_SAVING", saving: false });
    } else {
      setSaveStatus("saved");
      dispatch({ type: "SET_SAVED" });
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  // ── Upload image ──────────────────────────────────────────────────────────
  async function uploadImage(rawFile: File, scaleMultiplier: number = 1) {
    const mapId = activeMapIdRef.current;

    if (!mapId) {
      setSaveStatus("error");
      setSaveError("No active map selected");
      return;
    }
    setIsUploadingImage(true);
    setSaveError(null);

    try {
      const dataUrl = await fileToDataUrl(rawFile, scaleMultiplier);

      const { error } = await supabase
        .from("maps")
        .update({ floor_plan_data: dataUrl, updated_at: new Date().toISOString() })
        .eq("id", mapId);

      if (error) {
        setSaveStatus("error");
        setSaveError(`Image save failed: ${error.message}`);
        return;
      }

      dispatch({ type: "SET_IMAGE_URL", url: dataUrl });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(
        `Image processing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  // ── Export JSON (all maps as levels) ─────────────────────────────────────
  async function exportJson() {
    const airportId = airportIdRef.current;
    if (!airportId) return;

    // Save current map if dirty before exporting
    if (activeMapId && state.isDirty) {
      const { imageUrl: _omit, ...graphData } = state.doc;
      await supabase
        .from("maps")
        .update({ graph_map: graphData, updated_at: new Date().toISOString() })
        .eq("id", activeMapId);
    }

    // Fetch all maps for this airport
    const { data: allMaps, error } = await supabase
      .from("maps")
      .select("id, name, parent_id, sort_order, graph_map")
      .eq("airport_id", airportId)
      .order("sort_order");

    if (error || !allMaps) return;

    const levels = allMaps.map((m) => {
      const graph = m.graph_map as Record<string, unknown> | null;

      // Reconstruct a MapDocument so buildExportPayload can split edges at POIs
      const doc: MapDocument = {
        waypoints: ((graph?.waypoints ?? []) as Array<Record<string, unknown>>).map((wp) => ({
          id: wp.id as string, name: (wp.name ?? '') as string,
          x: wp.x as number, y: wp.y as number, floor: (wp.floor ?? 0) as number,
        })),
        edges: ((graph?.edges ?? []) as Array<Record<string, unknown>>).map((e) => ({
          id: e.id as string, name: (e.name ?? '') as string,
          from: e.from as string, to: e.to as string,
          type: (e.type ?? 'walkway') as EdgeType,
          weight: (e.weight ?? 0) as number, accessible: (e.accessible ?? true) as boolean,
        })),
        pois: ((graph?.pois ?? []) as Array<Record<string, unknown>>).map((p) => ({
          id: p.id as string, type: (p.type ?? 'gate') as NodeType,
          name: (p.name ?? '') as string, keywords: (p.keywords ?? []) as string[],
          waypointId: (p.waypointId ?? null) as string | null,
          projectedEdgeId: (p.projectedEdgeId ?? null) as string | null,
          projectedT: (p.projectedT ?? null) as number | null,
          linkedPortalIds: (p.linkedPortalIds ?? []) as string[],
          x: (p.x ?? 0) as number, y: (p.y ?? 0) as number, floor: (p.floor ?? 0) as number,
        })),
        imageUrl: null,
        pixelsPerMeter: (graph?.pixelsPerMeter ?? null) as number | null,
        floors: (graph?.floors ?? [0]) as number[],
        activeFloor: (graph?.activeFloor ?? 0) as number,
      };

      const exported = buildExportPayload(doc);

      return {
        id: m.id,
        name: m.name,
        parentId: m.parent_id,
        sortOrder: m.sort_order,
        waypoints: exported.waypoints,
        edges: exported.edges,
        pois: exported.pois,
      };
    });

    const payload = { levels };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "airport-map.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Auto-save 30s after last change ────────────────────────────────────
  useEffect(() => {
    if (!state.isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(save, 30_000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [state.isDirty, state.doc]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    save,
    uploadImage,
    exportJson,
    saveStatus,
    saveError,
    isUploadingImage,
    isLoadingMap,
    airportId: airportIdRef.current,
  };
}
