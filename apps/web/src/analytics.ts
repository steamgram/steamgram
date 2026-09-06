/**
 * Google Analytics 4. Loaded only in production builds and only when a
 * measurement id is configured (VITE_GA_ID in .env.production).
 */
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined
const enabled = import.meta.env.PROD && !!GA_ID

export function initAnalytics() {
  if (!enabled) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, { send_page_view: true })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)
}

export type EventName = 'game_view' | 'share' | 'open_steam' | 'unmute' | 'media_swipe' | 'expand_description' | 'open_about' | 'toggle_info'

export function track(name: EventName, params: Record<string, string | number | boolean> = {}) {
  if (!enabled || !window.gtag) return
  window.gtag('event', name, params)
}
