// Singleton TTS coordinator — prevents PDF and Notes from speaking simultaneously.
type TTSSource = 'pdf' | 'notes'
type Listener = (source: TTSSource | null) => void

let _active: TTSSource | null = null
const _listeners = new Set<Listener>()
let _sessionId = 0
let _lifecycleBound = false

function notify() {
  _listeners.forEach(fn => fn(_active))
}

function ensureLifecycleListeners() {
  if (_lifecycleBound || typeof window === 'undefined') return

  const stop = () => {
    stopAllTTS()
  }

  window.addEventListener('beforeunload', stop)
  window.addEventListener('pagehide', stop)
  _lifecycleBound = true
}

export function startTTS(source: TTSSource, utterance: SpeechSynthesisUtterance): void {
  ensureLifecycleListeners()
  _sessionId += 1
  const sessionId = _sessionId

  window.speechSynthesis.cancel()
  _active = source
  notify()

  const origEnd = utterance.onend
  const origErr = utterance.onerror
  utterance.onend = (e) => {
    if (sessionId !== _sessionId) return
    if (_active === source) { _active = null; notify() }
    if (typeof origEnd === 'function') (origEnd as EventListener).call(utterance, e)
  }
  utterance.onerror = (e) => {
    if (sessionId !== _sessionId) return
    if (_active === source) { _active = null; notify() }
    if (typeof origErr === 'function') (origErr as EventListener).call(utterance, e)
  }
  window.speechSynthesis.speak(utterance)
}

export function stopTTS(source?: TTSSource): void {
  if (!source || _active === source) {
    _sessionId += 1
    window.speechSynthesis.cancel()
    _active = null
    notify()
  }
}

export function stopAllTTS(): void {
  _sessionId += 1
  window.speechSynthesis.cancel()
  _active = null
  notify()
}

export function pauseTTS(): void {
  window.speechSynthesis.pause()
}

export function resumeTTS(): void {
  window.speechSynthesis.resume()
}

export function getActiveSource(): TTSSource | null {
  return _active
}

export function subscribeTTS(fn: Listener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}
