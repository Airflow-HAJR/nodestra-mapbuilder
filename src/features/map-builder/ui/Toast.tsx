import { useState, useEffect, useCallback, useRef } from 'react'
import { subscribeToToasts, type ToastMessage } from './toast-store'

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts(prev => [...prev.slice(-2), msg]) // keep max 3
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== msg.id))
      timersRef.current.delete(msg.id)
    }, 2000)
    timersRef.current.set(msg.id, timer)
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    const unsubscribe = subscribeToToasts(addToast)

    return () => {
      unsubscribe()
      timers.forEach(t => clearTimeout(t))
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="map-toast-stack" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="map-toast">
          {toast.text}
        </div>
      ))}
    </div>
  )
}
