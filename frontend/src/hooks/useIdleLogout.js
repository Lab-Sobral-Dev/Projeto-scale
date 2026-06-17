import { useEffect, useRef } from 'react'

// 10 minutos de inatividade até o logout automático
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000

// Eventos que contam como "atividade" do usuário
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

// Intervalo mínimo entre reinícios do timer, para não reagendar a cada pixel de mouse
const THROTTLE_MS = 1000

/**
 * Dispara onIdle após `timeoutMs` sem qualquer interação do usuário.
 * Qualquer atividade (mouse, teclado, clique, scroll, toque) reinicia a contagem.
 *
 * @param {{ timeoutMs?: number, onIdle: () => void }} params
 */
export default function useIdleLogout({ timeoutMs = IDLE_TIMEOUT_MS, onIdle }) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    let timerId
    let lastReset = 0

    const start = () => {
      clearTimeout(timerId)
      timerId = setTimeout(() => onIdleRef.current?.(), timeoutMs)
    }

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastReset < THROTTLE_MS) return
      lastReset = now
      start()
    }

    start()
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    )

    return () => {
      clearTimeout(timerId)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity))
    }
  }, [timeoutMs])
}
