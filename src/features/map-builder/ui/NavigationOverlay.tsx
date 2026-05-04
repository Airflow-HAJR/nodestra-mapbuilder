import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { animated, useSpring, useTrail } from '@react-spring/web'
import { supabase } from '../../../lib/supabase'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const NAV_ITEMS = [
  { label: 'Flight Tracker', path: '/dashboard' },
  { label: 'Map Builder', path: '/dashboard/map' },
  { label: 'Sign Out', path: '__signout__' },
]

export function NavigationOverlay({ isOpen, onClose }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Spring slide-in from left
  const overlaySpring = useSpring({
    transform: isOpen ? 'translateX(0%)' : 'translateX(-100%)',
    opacity: isOpen ? 1 : 0,
    config: { tension: 120, friction: 20 },
  })

  // Staggered item entrance
  const trail = useTrail(NAV_ITEMS.length, {
    from: { opacity: 0, x: -40 },
    to: { opacity: isOpen ? 1 : 0, x: isOpen ? 0 : -40 },
    config: { tension: 120, friction: 20 },
    delay: isOpen ? 100 : 0,
  })

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  async function handleClick(path: string) {
    onClose()
    if (path === '__signout__') {
      await supabase.auth.signOut()
    } else {
      navigate(path)
    }
  }

  if (!isOpen) return null

  return (
    <animated.div
      ref={overlayRef}
      className="nav-overlay"
      style={{
        opacity: overlaySpring.opacity,
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <animated.div
        className="nav-overlay-panel"
        style={{ transform: overlaySpring.transform }}
      >
        <div className="nav-overlay-header">
          <div className="nav-overlay-brand">
            <span className="nav-overlay-brand-mark" aria-hidden="true" />
            <div>
              <div className="nav-overlay-brand-kicker">Nodestra</div>
              <div className="nav-overlay-brand-title">Workspace</div>
            </div>
          </div>
          <button className="nav-overlay-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="nav-overlay-items">
          {trail.map((springStyle, i) => {
            const item = NAV_ITEMS[i]
            const isActive = location.pathname === item.path
            return (
              <animated.button
                key={item.label}
                className={`nav-overlay-item${isActive ? ' active' : ''}`}
                style={{
                  opacity: springStyle.opacity,
                  transform: springStyle.x.to(x => `translateX(${x}px)`),
                }}
                onClick={() => handleClick(item.path)}
              >
                {item.label}
                {isActive && <span className="nav-overlay-item-dot" />}
              </animated.button>
            )
          })}
        </div>
      </animated.div>
    </animated.div>
  )
}
