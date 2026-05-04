import { useEffect, useState } from "react";

interface MapOnboardingProps {
  onComplete?: () => void;
}

const SHORTCUTS = [
  { key: "V", label: "Select and edit" },
  { key: "M", label: "Draw movement paths" },
  { key: "N", label: "Place POIs" },
  { key: "⌘S", label: "Save changes" },
  { key: "?", label: "Open shortcuts" },
];

export function MapOnboarding({ onComplete }: MapOnboardingProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = window.sessionStorage.getItem("map-builder-onboarding-dismissed");
    if (!dismissed) {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    window.sessionStorage.setItem("map-builder-onboarding-dismissed", "1");
    setOpen(false);
    onComplete?.();
  }

  if (!open) return null;

  return (
    <div className="onboarding-overlay" onClick={dismiss}>
      <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-hero">
          <div className="onboarding-hero-copy">
            <div className="onboarding-kicker">Map Builder</div>
            <h2 className="onboarding-title">Build the path network directly on the floor plan.</h2>
            <p className="onboarding-desc">
              Drop in a plan, draw movement edges with the rail on the left, and edit any
              waypoint or POI from the inspector on the right. The canvas stays primary and
              the chrome stays out of the way.
            </p>
          </div>

          <div className="onboarding-diagram" aria-hidden="true">
            <svg viewBox="0 0 260 190" fill="none">
              <rect x="18" y="22" width="224" height="146" rx="26" fill="#F5EEE3" stroke="rgba(42,74,94,0.12)" />
              <path d="M56 98C86 56 120 52 154 74C176 88 190 102 214 92" stroke="#94A3B8" strokeWidth="6" strokeLinecap="round" />
              <path d="M56 98C80 124 118 134 162 126C183 122 196 110 214 92" stroke="#2A4A5E" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 8" />
              <circle cx="56" cy="98" r="8" fill="#2A4A5E" />
              <circle cx="105" cy="74" r="5.5" fill="rgba(42,74,94,0.32)" stroke="rgba(42,74,94,0.15)" />
              <circle cx="162" cy="126" r="8" fill="#2A4A5E" />
              <circle cx="214" cy="92" r="8" fill="#2A4A5E" />
              <rect x="124" y="44" width="38" height="24" rx="10" fill="#1A3FA3" />
              <text x="143" y="60" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">A12</text>
              <rect x="178" y="122" width="26" height="26" rx="11" fill="#C2410C" />
              <path d="M186 135H196" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M191 130V140" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="onboarding-shortcuts">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.key} className="onboarding-shortcut">
              <kbd>{shortcut.key}</kbd>
              <span>{shortcut.label}</span>
            </div>
          ))}
        </div>

        <div className="onboarding-actions">
          <button className="onboarding-dismiss secondary" onClick={dismiss}>
            Dismiss
          </button>
          <button className="onboarding-dismiss" onClick={dismiss}>
            Start mapping
          </button>
        </div>
      </div>
    </div>
  );
}
