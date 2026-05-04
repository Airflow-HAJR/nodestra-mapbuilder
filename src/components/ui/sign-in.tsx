import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpring, animated, config } from '@react-spring/web';
import { Eye, EyeOff, ArrowRight, Navigation } from 'lucide-react';

// ── Colors (matching map-builder accent palette) ──────────────────────────

const ACCENT = '#2A4A5E';
const ACCENT_HOVER = '#1F3A4C';
const ACCENT_LIGHT = 'rgba(42, 74, 94, 0.08)';
const SURFACE_BG = '#FAFAF8';

// ── Type Definitions ──────────────────────────────────────────────────────

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
}

interface SignInFormProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  error?: string | null;
  submitting?: boolean;
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onCreateAccount?: () => void;
}

// ── Google Icon ───────────────────────────────────────────────────────────

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

// ── Dot Grid — fills container dynamically ───────────────────────────────

const SPACING = 24;
const DOT_BASE = 1.8;
const MORPH_RADIUS = 130;

function DotGridCanvas({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animFrameRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    if (sizeRef.current.w !== rect.width || sizeRef.current.h !== rect.height) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      sizeRef.current = { w: rect.width, h: rect.height };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    const pad = 12;
    const cols = Math.floor((rect.width - pad * 2) / SPACING) + 1;
    const rows = Math.floor((rect.height - pad * 2) / SPACING) + 1;
    const offsetX = (rect.width - (cols - 1) * SPACING) / 2;
    const offsetY = (rect.height - (rows - 1) * SPACING) / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const baseX = offsetX + col * SPACING;
        const baseY = offsetY + row * SPACING;

        const dx = mx - baseX;
        const dy = my - baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let x = baseX;
        let y = baseY;
        let radius = DOT_BASE;
        let alpha = 0.12;

        if (dist < MORPH_RADIUS) {
          const t = 1 - dist / MORPH_RADIUS;
          const ease = t * t * (3 - 2 * t);
          const pushStrength = ease * 20;
          const angle = Math.atan2(dy, dx);
          x -= Math.cos(angle) * pushStrength;
          y -= Math.sin(angle) * pushStrength;
          radius = DOT_BASE + ease * 4;
          alpha = 0.12 + ease * 0.5;
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(42, 74, 94, ${alpha})`;
        ctx.fill();
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw, containerRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none"
    />
  );
}

// ── Departure Board ──────────────────────────────────────────────────────

interface Flight {
  gate: string;
  destination: string;
  time: string;
  code: string;
  status: 'ON TIME' | 'BOARDING' | 'DELAYED' | 'DEPARTED' | 'FINAL CALL';
  airline: string;
}

const FLIGHTS: Flight[] = [
  { gate: 'B22', destination: 'Miami',        time: '07:55', code: 'MIA', status: 'ON TIME',    airline: 'AA 1247' },
  { gate: 'C18', destination: 'Frankfurt',     time: '08:10', code: 'FRA', status: 'BOARDING',   airline: 'LH 471'  },
  { gate: 'A05', destination: 'Seattle',       time: '08:30', code: 'SEA', status: 'ON TIME',    airline: 'DL 884'  },
  { gate: 'D14', destination: 'Dallas',        time: '08:50', code: 'DFW', status: 'DELAYED',    airline: 'UA 305'  },
  { gate: 'A12', destination: 'London',        time: '09:05', code: 'LHR', status: 'ON TIME',    airline: 'BA 178'  },
  { gate: 'B08', destination: 'Tokyo',         time: '09:20', code: 'NRT', status: 'FINAL CALL', airline: 'JL 62'   },
  { gate: 'C03', destination: 'São Paulo',     time: '09:45', code: 'GRU', status: 'ON TIME',    airline: 'LA 8045' },
  { gate: 'D21', destination: 'Dubai',         time: '10:00', code: 'DXB', status: 'BOARDING',   airline: 'EK 204'  },
  { gate: 'A17', destination: 'Paris',         time: '10:15', code: 'CDG', status: 'ON TIME',    airline: 'AF 23'   },
  { gate: 'B31', destination: 'Singapore',     time: '10:30', code: 'SIN', status: 'DEPARTED',   airline: 'SQ 25'   },
  { gate: 'C09', destination: 'Toronto',       time: '10:50', code: 'YYZ', status: 'ON TIME',    airline: 'AC 735'  },
  { gate: 'A02', destination: 'Mexico City',   time: '11:10', code: 'MEX', status: 'DELAYED',    airline: 'AM 401'  },
  { gate: 'D06', destination: 'Sydney',        time: '11:25', code: 'SYD', status: 'ON TIME',    airline: 'QF 12'   },
  { gate: 'B15', destination: 'Amsterdam',     time: '11:40', code: 'AMS', status: 'BOARDING',   airline: 'KL 644'  },
  { gate: 'C22', destination: 'Hong Kong',     time: '11:55', code: 'HKG', status: 'ON TIME',    airline: 'CX 831'  },
  { gate: 'A09', destination: 'Chicago',       time: '12:10', code: 'ORD', status: 'ON TIME',    airline: 'UA 512'  },
  { gate: 'D19', destination: 'Istanbul',      time: '12:30', code: 'IST', status: 'FINAL CALL', airline: 'TK 2'    },
  { gate: 'B04', destination: 'Los Angeles',   time: '12:45', code: 'LAX', status: 'ON TIME',    airline: 'DL 178'  },
];

const STATUS_COLORS: Record<Flight['status'], { bg: string; text: string }> = {
  'ON TIME':    { bg: 'rgba(34,197,94,0.1)',  text: '#16a34a' },
  'BOARDING':   { bg: 'rgba(42,74,94,0.12)',  text: '#2A4A5E' },
  'DELAYED':    { bg: 'rgba(239,68,68,0.1)',  text: '#dc2626' },
  'DEPARTED':   { bg: 'rgba(0,0,0,0.04)',     text: '#9299b8' },
  'FINAL CALL': { bg: 'rgba(234,179,8,0.12)', text: '#b45309' },
};

function DepartureBoard() {
  // Double the list for seamless loop
  const doubled = [...FLIGHTS, ...FLIGHTS];

  return (
    <div className="fids-board">
      {/* Header */}
      <div className="fids-header">
        <div className="fids-header-left">
          <div className="fids-dot" />
          <span className="fids-title">DEPARTURES</span>
          <span className="fids-subtitle">ALL GATES</span>
        </div>
        <div className="fids-live-pill">
          <div className="fids-live-dot" />
          LIVE
        </div>
      </div>

      {/* Column headers */}
      <div className="fids-cols">
        <span className="fids-col fids-col-gate">GATE</span>
        <span className="fids-col fids-col-dest">DESTINATION</span>
        <span className="fids-col fids-col-flight">FLIGHT</span>
        <span className="fids-col fids-col-time">TIME</span>
        <span className="fids-col fids-col-code">CODE</span>
        <span className="fids-col fids-col-status">STATUS</span>
      </div>

      {/* Scrolling rows */}
      <div className="fids-scroll-mask">
        <div className="fids-scroll-track">
          {doubled.map((f, i) => (
            <div className="fids-row" key={i}>
              <span className="fids-cell fids-cell-gate">
                <span className="fids-gate-badge">{f.gate}</span>
              </span>
              <span className="fids-cell fids-cell-dest">{f.destination}</span>
              <span className="fids-cell fids-cell-flight">{f.airline}</span>
              <span className="fids-cell fids-cell-time">{f.time}</span>
              <span className="fids-cell fids-cell-code">{f.code}</span>
              <span className="fids-cell fids-cell-status">
                <span
                  className="fids-status-pill"
                  style={{
                    background: STATUS_COLORS[f.status].bg,
                    color: STATUS_COLORS[f.status].text,
                  }}
                >
                  {f.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer accent */}
      <div className="fids-footer">
        <span>Simulated data</span>
        <span>Powered by Nodestra</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export const SignInForm: React.FC<SignInFormProps> = ({
  error,
  submitting,
  onSignIn,
  onGoogleSignIn,
  onCreateAccount,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formSpring = useSpring({
    from: { opacity: 0, transform: 'translateX(-30px)' },
    to: mounted
      ? { opacity: 1, transform: 'translateX(0px)' }
      : { opacity: 0, transform: 'translateX(-30px)' },
    config: { tension: 160, friction: 24 },
    delay: 100,
  });

  const badgeSpring = useSpring({
    from: { opacity: 0, transform: 'scale(0.8)' },
    to: mounted
      ? { opacity: 1, transform: 'scale(1)' }
      : { opacity: 0, transform: 'scale(0.8)' },
    config: config.wobbly,
    delay: 200,
  });

  const boardSpring = useSpring({
    from: { opacity: 0, transform: 'translateY(24px)' },
    to: mounted
      ? { opacity: 1, transform: 'translateY(0px)' }
      : { opacity: 0, transform: 'translateY(24px)' },
    config: { tension: 140, friction: 22 },
    delay: 400,
  });

  return (
    <div
      className="h-[100dvh] w-[100dvw] flex flex-col lg:flex-row overflow-hidden"
      style={{ fontFamily: "'PP Neue York', 'Geist Variable', system-ui, -apple-system, sans-serif" }}
    >
      {/* ── Left Side: Sign-in Form ── */}
      <animated.div
        className="w-full lg:w-[44%] flex flex-col items-center justify-center px-6 lg:px-16 relative z-10 overflow-y-auto"
        style={{ background: SURFACE_BG, ...formSpring }}
      >
        <header className="absolute top-0 left-0 w-full p-8">
          <animated.div className="flex items-center gap-2.5" style={badgeSpring}>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ background: ACCENT }}
            >
              <Navigation className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </div>
            <span className="text-lg font-bold tracking-tight" style={{ color: ACCENT }}>
              Nodestra
            </span>
          </animated.div>
        </header>

        <div className="w-full max-w-[400px] py-20">
          <div
            className="bg-white p-10 rounded-2xl"
            style={{
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <div className="mb-9">
              <h1
                className="text-[28px] font-bold tracking-tight mb-2"
                style={{ color: '#0f1423', letterSpacing: '-0.03em' }}
              >
                Welcome back
              </h1>
              <p className="text-sm font-medium" style={{ color: '#9299b8' }}>
                Sign in to your navigation dashboard
              </p>
            </div>

            {error && (
              <div
                className="mb-6 rounded-xl px-4 py-3 text-sm font-medium sign-in-error-shake"
                style={{
                  background: 'rgba(220,38,38,0.06)',
                  color: '#dc2626',
                  border: '1px solid rgba(220,38,38,0.12)',
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={onGoogleSignIn}
              disabled={submitting}
              className="sign-in-google-btn"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-4 my-7">
              <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: '#9299b8' }}
              >
                or
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />
            </div>

            <form className="space-y-5" onSubmit={onSignIn}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-2"
                  style={{ color: '#9299b8' }}
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@nodestra.com"
                  required
                  className="sign-in-input"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-2"
                  style={{ color: '#9299b8' }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    required
                    className="sign-in-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors"
                    style={{ color: '#c1c7d8' }}
                  >
                    {showPassword
                      ? <EyeOff className="w-4 h-4 hover:text-[#2A4A5E]" />
                      : <Eye className="w-4 h-4 hover:text-[#2A4A5E]" />
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="sign-in-submit-btn"
              >
                <span className="text-[13px] font-bold tracking-wide">
                  {submitting ? 'Signing in...' : 'Sign In'}
                </span>
                {!submitting && <ArrowRight className="w-4 h-4" />}
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
              </button>
            </form>

            <div className="mt-7 text-center">
              <p className="text-[13px] font-medium" style={{ color: '#9299b8' }}>
                No account?{' '}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onCreateAccount?.(); }}
                  className="font-bold transition-colors hover:underline"
                  style={{ color: ACCENT }}
                >
                  Create one
                </a>
              </p>
            </div>
          </div>
        </div>

        <footer
          className="absolute bottom-0 left-0 w-full px-8 py-6 flex justify-between items-center text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: '#c1c7d8' }}
        >
          <div>&copy; 2025 Nodestra</div>
          <div className="flex gap-4">
            <a href="#" className="hover:opacity-60 transition-opacity">Privacy</a>
            <a href="#" className="hover:opacity-60 transition-opacity">Terms</a>
          </div>
        </footer>
      </animated.div>

      {/* ── Right Side ── */}
      <div
        ref={rightPanelRef}
        className="hidden lg:flex w-[56%] relative overflow-hidden items-center justify-center"
        style={{ background: '#eef0f5' }}
      >
        {/* Fluid gradient blobs */}
        <div className="sign-in-fluid-wrap">
          <div className="sign-in-fluid-blob sign-in-fluid-blob-1" />
          <div className="sign-in-fluid-blob sign-in-fluid-blob-2" />
          <div className="sign-in-fluid-blob sign-in-fluid-blob-3" />
        </div>

        {/* Dot grid */}
        <DotGridCanvas containerRef={rightPanelRef} />

        {/* Departure board */}
        <animated.div className="relative z-20 w-full max-w-[640px] px-6" style={boardSpring}>
          <DepartureBoard />
        </animated.div>
      </div>

      {/* ── Styles ── */}
      <style>{`
        .sign-in-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1.5px solid rgba(0,0,0,0.07);
          background: #f7f7f5;
          color: #0f1423;
          font-size: 14px;
          font-weight: 500;
          font-family: inherit;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          outline: none;
        }
        .sign-in-input::placeholder { color: #c1c7d8; }
        .sign-in-input:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px ${ACCENT_LIGHT};
          background: #fff;
        }

        .sign-in-google-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; width: 100%; padding: 12px; border-radius: 12px;
          border: 1.5px solid rgba(0,0,0,0.08); background: #fff;
          color: #0f1423; font-size: 14px; font-weight: 600;
          font-family: inherit; cursor: pointer; transition: all 0.2s ease;
        }
        .sign-in-google-btn:hover {
          border-color: rgba(0,0,0,0.14);
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        .sign-in-google-btn:active { transform: scale(0.98); }
        .sign-in-google-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .sign-in-submit-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 8px; width: 100%; padding: 13px; border-radius: 12px;
          border: none; background: ${ACCENT}; color: #fff;
          font-family: inherit; cursor: pointer;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 4px 16px rgba(42,74,94,0.25);
        }
        .sign-in-submit-btn:hover:not(:disabled) {
          background: ${ACCENT_HOVER};
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(42,74,94,0.3);
        }
        .sign-in-submit-btn:active:not(:disabled) { transform: scale(0.98); }
        .sign-in-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Fluid blobs ── */
        .sign-in-fluid-wrap {
          position: absolute; inset: 0; z-index: 1; overflow: hidden;
          filter: blur(100px);
        }
        .sign-in-fluid-blob { position: absolute; border-radius: 50%; }
        .sign-in-fluid-blob-1 {
          width: 60%; height: 60%; bottom: -20%; left: -15%;
          background: radial-gradient(circle, rgba(42,74,94,0.35), rgba(42,74,94,0.15) 50%, transparent 70%);
          animation: fd1 5s ease-in-out infinite;
        }
        .sign-in-fluid-blob-2 {
          width: 55%; height: 55%; top: -15%; right: -15%;
          background: radial-gradient(circle, rgba(80,120,200,0.28), rgba(80,120,200,0.1) 50%, transparent 70%);
          animation: fd2 6s ease-in-out infinite;
        }
        .sign-in-fluid-blob-3 {
          width: 45%; height: 45%; bottom: 5%; right: 0%;
          background: radial-gradient(circle, rgba(120,80,190,0.22), rgba(120,80,190,0.06) 50%, transparent 70%);
          animation: fd3 4s ease-in-out infinite;
        }
        @keyframes fd1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(20%,-15%) scale(1.15); }
          66% { transform: translate(8%,-25%) scale(0.9); }
        }
        @keyframes fd2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(-18%,20%) scale(1.2); }
          66% { transform: translate(12%,10%) scale(0.85); }
        }
        @keyframes fd3 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(-22%,-12%) scale(1.1); }
          66% { transform: translate(18%,-20%) scale(1.15); }
        }

        /* ── FIDS Board ── */
        .fids-board {
          background: rgba(255,255,255,0.65);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 20px;
          overflow: hidden;
          box-shadow:
            0 8px 40px rgba(0,0,0,0.07),
            0 1px 3px rgba(0,0,0,0.03);
        }

        .fids-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .fids-header-left {
          display: flex; align-items: center; gap: 10px;
        }
        .fids-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #16a34a;
          box-shadow: 0 0 6px rgba(22,163,74,0.4);
          animation: dotBlink 2s ease-in-out infinite;
        }
        @keyframes dotBlink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .fids-title {
          font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
          color: #0f1423;
        }
        .fids-subtitle {
          font-size: 10px; font-weight: 600; color: #9299b8;
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .fids-live-pill {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 999px;
          background: rgba(0,0,0,0.04);
          font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
          color: #9299b8;
        }
        .fids-live-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #ef4444;
          animation: dotBlink 1.5s ease-in-out infinite;
        }

        .fids-cols {
          display: grid;
          grid-template-columns: 58px 1fr 72px 52px 44px 90px;
          gap: 0;
          padding: 8px 20px;
          border-bottom: 1px solid rgba(0,0,0,0.04);
        }
        .fids-col {
          font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
          color: #b0b5c8; text-transform: uppercase;
        }

        .fids-scroll-mask {
          height: 312px;
          overflow: hidden;
          position: relative;
        }
        /* Top + bottom fade masks */
        .fids-scroll-mask::before,
        .fids-scroll-mask::after {
          content: '';
          position: absolute; left: 0; right: 0; height: 40px;
          z-index: 2; pointer-events: none;
        }
        .fids-scroll-mask::before {
          top: 0;
          background: linear-gradient(to bottom, rgba(255,255,255,0.65), transparent);
        }
        .fids-scroll-mask::after {
          bottom: 0;
          background: linear-gradient(to top, rgba(255,255,255,0.65), transparent);
        }

        .fids-scroll-track {
          animation: fidsScroll 40s linear infinite;
        }
        @keyframes fidsScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }

        .fids-row {
          display: grid;
          grid-template-columns: 58px 1fr 72px 52px 44px 90px;
          gap: 0;
          padding: 0 20px;
          height: 44px;
          align-items: center;
          border-bottom: 1px solid rgba(0,0,0,0.03);
          transition: background 0.15s ease;
        }

        .fids-cell {
          font-size: 13px; font-weight: 500; color: #0f1423;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fids-cell-gate { font-weight: 600; }
        .fids-cell-dest { font-weight: 600; letter-spacing: -0.01em; }
        .fids-cell-flight {
          font-size: 11px; font-weight: 600; color: #9299b8;
          font-variant-numeric: tabular-nums;
        }
        .fids-cell-time {
          font-variant-numeric: tabular-nums;
          font-weight: 600; font-size: 13px; color: #4a5278;
        }
        .fids-cell-code {
          font-size: 11px; font-weight: 700; color: #9299b8;
          letter-spacing: 0.04em;
        }

        .fids-gate-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 36px; padding: 3px 8px; border-radius: 8px;
          background: rgba(42,74,94,0.08);
          font-size: 12px; font-weight: 700; color: ${ACCENT};
          letter-spacing: 0.02em;
        }

        .fids-status-pill {
          display: inline-flex; align-items: center;
          padding: 3px 8px; border-radius: 6px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .fids-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 20px;
          border-top: 1px solid rgba(0,0,0,0.04);
          font-size: 9px; font-weight: 600; color: #b0b5c8;
          letter-spacing: 0.04em;
        }

        @keyframes errorShake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(2px); }
        }
        .sign-in-error-shake { animation: errorShake 0.4s ease-out; }
      `}</style>
    </div>
  );
};
