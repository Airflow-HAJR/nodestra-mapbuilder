import type { MapDocument } from '../types'

interface Props {
  doc: MapDocument
  saveStatus: string
  saveError: string | null
  isDirty: boolean
  isUploadingImage: boolean
  onSave: () => void
  onExport: () => void
  onClearAll: () => void
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  saving:    { color: '#2A4A5E', label: 'Saving…' },
  saved:     { color: '#16a34a', label: 'Saved' },
  error:     { color: '#dc2626', label: 'Error' },
  dirty:     { color: '#d97706', label: 'Unsaved' },
  uploading: { color: '#2A4A5E', label: 'Processing…' },
}

export function TopBar({
  doc, saveStatus, saveError, isDirty, isUploadingImage,
  onSave, onExport, onClearAll,
}: Props) {
  const status = isUploadingImage ? 'uploading'
    : saveStatus === 'saving' ? 'saving'
    : saveStatus === 'saved' ? 'saved'
    : saveStatus === 'error' ? 'error'
    : isDirty ? 'dirty'
    : null

  const cfg = status ? STATUS_MAP[status] : null

  return (
    <>
      <div className="editor-floating-right">
        <div className="editor-action-pill">
          <div className="editor-action-context">
            <span className="editor-action-context-label">
              {doc.imageUrl ? `Floor ${doc.activeFloor}` : 'No floor plan'}
            </span>
            <span className="editor-action-context-meta">
              {doc.waypoints.length} W · {doc.edges.length} E · {doc.pois.length} P
            </span>
          </div>

          {cfg && (
            <>
              <span className="editor-action-divider" />
              <div className="editor-action-status">
                <span className="editor-topbar-status-dot" style={{ background: cfg.color }} />
                <span className="editor-topbar-status-text" style={{ color: cfg.color }}>
                  {status === 'error' && saveError ? saveError : cfg.label}
                </span>
              </div>
            </>
          )}

          <span className="editor-action-divider" />
          <button className="editor-topbar-btn ghost" onClick={onExport}>
            Export
          </button>
          <button className="editor-topbar-btn ghost" onClick={onClearAll}>
            Clear All
          </button>

          <button
            className={`editor-topbar-btn${isDirty ? ' accent' : ''}`}
            onClick={onSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
