export interface ToastMessage {
  id: number
  text: string
}

let toastId = 0
const listeners: Set<(msg: ToastMessage) => void> = new Set()

export function showToast(text: string) {
  const msg: ToastMessage = { id: ++toastId, text }
  listeners.forEach(fn => fn(msg))
}

export function subscribeToToasts(listener: (msg: ToastMessage) => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
