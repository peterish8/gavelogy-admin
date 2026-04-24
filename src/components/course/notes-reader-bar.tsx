'use client'

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Play, Pause, Square, Timer, Gauge } from 'lucide-react'
import { startTTS, stopTTS, pauseTTS, resumeTTS, subscribeTTS } from '@/lib/tts-manager'
import type { TTSSnapshot, TTSToken } from '@/lib/tts-processor'
import { findTokenIndexByPmPos, findTokenIndexByTextOffset } from '@/lib/tts-processor'

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const

interface NotesReaderBarProps {
  snapshot: TTSSnapshot | null
  onActiveTokenChange?: (token: TTSToken | null) => void
  onSeekPmPosition?: (pmPos: number, meta?: { fromScrub?: boolean }) => void
}

export interface NotesReaderBarRef {
  playFromPmPosition: (pmPos: number) => void
}

export const NotesReaderBar = forwardRef<NotesReaderBarRef, NotesReaderBarProps>(
  ({ snapshot, onActiveTokenChange, onSeekPmPosition }, ref) => {
    const [isPlaying, setIsPlaying] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [speedIdx, setSpeedIdx] = useState(1)
    const [elapsed, setElapsed] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [scrubValue, setScrubValue] = useState(0)

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pausedAtRef = useRef(0)
    const startAtRef = useRef(0)
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
    const activeSnapshotRef = useRef<TTSSnapshot | null>(snapshot)
    const activeTokenIndexRef = useRef(-1)
    const currentStartTokenIndexRef = useRef(0)
    const scrubValueRef = useRef(0)
    const scrubRafRef = useRef<number | null>(null)

    useEffect(() => {
      activeSnapshotRef.current = snapshot
    }, [snapshot])

    useEffect(() => {
      return () => {
        if (scrubRafRef.current !== null) {
          window.cancelAnimationFrame(scrubRafRef.current)
          scrubRafRef.current = null
        }
      }
    }, [])

    const stopTimer = useCallback(() => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }, [])

    const resetPlaybackState = useCallback(() => {
      setIsPlaying(false)
      setIsPaused(false)
      stopTimer()
      setElapsed(0)
      pausedAtRef.current = 0
      utteranceRef.current = null
      activeTokenIndexRef.current = -1
      currentStartTokenIndexRef.current = 0
      onActiveTokenChange?.(null)
    }, [onActiveTokenChange, stopTimer])

    useEffect(() => {
      return subscribeTTS((source) => {
        if (source !== 'notes') {
          resetPlaybackState()
        }
      })
    }, [resetPlaybackState])

    useEffect(() => {
      return () => {
        stopTTS('notes')
        resetPlaybackState()
      }
    }, [resetPlaybackState])

    useEffect(() => {
      if (!snapshot && isPlaying) {
        stopTTS('notes')
        resetPlaybackState()
      }
    }, [isPlaying, resetPlaybackState, snapshot])

    const startTimer = useCallback(() => {
      stopTimer()
      startAtRef.current = Date.now() - pausedAtRef.current * 1000
      timerRef.current = setInterval(() => {
        const elapsedSec = (Date.now() - startAtRef.current) / 1000
        setElapsed(Math.floor(elapsedSec))
      }, 200)
    }, [stopTimer])

    const handlePlayFromToken = useCallback((requestedTokenIndex = 0, requestedSpeedIdx = speedIdx) => {
      const currentSnapshot = activeSnapshotRef.current
      if (!currentSnapshot || currentSnapshot.tokens.length === 0 || !currentSnapshot.fullText.trim()) return

      const tokenIndex = Math.max(0, Math.min(requestedTokenIndex, currentSnapshot.tokens.length - 1))
      const startToken = currentSnapshot.tokens[tokenIndex]
      const estimatedDuration = Math.ceil(currentSnapshot.tokens.length / (3.5 * SPEEDS[requestedSpeedIdx]))
      const textToSpeak = currentSnapshot.fullText.slice(startToken.textStart)
      const utterance = new SpeechSynthesisUtterance(textToSpeak)

      utterance.rate = SPEEDS[requestedSpeedIdx]
      currentStartTokenIndexRef.current = tokenIndex
      setDuration(estimatedDuration)

      utterance.onstart = () => {
        setIsPlaying(true)
        setIsPaused(false)
        pausedAtRef.current = tokenIndex > 0
          ? (tokenIndex / Math.max(1, currentSnapshot.tokens.length)) * estimatedDuration
          : 0
        setElapsed(Math.floor(pausedAtRef.current))
        activeTokenIndexRef.current = tokenIndex
        onActiveTokenChange?.(startToken)
        startTimer()
      }

      utterance.onboundary = (event) => {
        if (typeof event.charIndex !== 'number' || event.charIndex < 0) return

        const liveSnapshot = activeSnapshotRef.current
        if (!liveSnapshot || liveSnapshot.versionKey !== currentSnapshot.versionKey) return

        const absoluteOffset = startToken.textStart + event.charIndex
        const nextTokenIndex = findTokenIndexByTextOffset(liveSnapshot, absoluteOffset)
        if (nextTokenIndex === -1 || nextTokenIndex === activeTokenIndexRef.current) return

        activeTokenIndexRef.current = nextTokenIndex
        onActiveTokenChange?.(liveSnapshot.tokens[nextTokenIndex])
      }

      utterance.onend = () => {
        resetPlaybackState()
      }

      utterance.onerror = () => {
        resetPlaybackState()
      }

      utteranceRef.current = utterance
      startTTS('notes', utterance)
    }, [onActiveTokenChange, resetPlaybackState, speedIdx, startTimer])

    useImperativeHandle(ref, () => ({
      playFromPmPosition: (pmPos: number) => {
        const currentSnapshot = activeSnapshotRef.current
        if (!currentSnapshot) return

        const tokenIndex = findTokenIndexByPmPos(currentSnapshot, pmPos)
        if (tokenIndex === -1) return
        handlePlayFromToken(tokenIndex)
      },
    }), [handlePlayFromToken])

    const handlePauseResume = useCallback(() => {
      if (isPaused) {
        resumeTTS()
        setIsPaused(false)
        startTimer()
        return
      }

      pauseTTS()
      setIsPaused(true)
      pausedAtRef.current = elapsed
      stopTimer()
    }, [elapsed, isPaused, startTimer, stopTimer])

    const handleStop = useCallback(() => {
      stopTTS('notes')
      resetPlaybackState()
    }, [resetPlaybackState])

    const handleSpeedChange = useCallback(() => {
      const nextIdx = (speedIdx + 1) % SPEEDS.length
      const resumeTokenIndex = activeTokenIndexRef.current >= 0
        ? activeTokenIndexRef.current
        : currentStartTokenIndexRef.current

      setSpeedIdx(nextIdx)
      if (isPlaying) {
        handlePlayFromToken(resumeTokenIndex, nextIdx)
      }
    }, [handlePlayFromToken, isPlaying, speedIdx])

    const handleScrubStart = (e: React.PointerEvent) => {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const percentage = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      scrubValueRef.current = percentage
      setScrubValue(percentage)
      setIsScrubbing(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

    const handleScrubMove = (e: React.PointerEvent) => {
      if (!isScrubbing) return
      const rect = e.currentTarget.getBoundingClientRect()
      const percentage = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      scrubValueRef.current = percentage
      if (scrubRafRef.current !== null) return
      scrubRafRef.current = window.requestAnimationFrame(() => {
        setScrubValue(scrubValueRef.current)
        scrubRafRef.current = null
      })
    }

    const handleScrubEnd = (e: React.PointerEvent) => {
      if (!isScrubbing) return
      setIsScrubbing(false)
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)

      const currentSnapshot = activeSnapshotRef.current
      if (!currentSnapshot || currentSnapshot.tokens.length === 0) return

      if (scrubRafRef.current !== null) {
        window.cancelAnimationFrame(scrubRafRef.current)
        scrubRafRef.current = null
      }

      const boundedIndex = Math.max(
        0,
        Math.min(currentSnapshot.tokens.length - 1, Math.floor((scrubValueRef.current / 100) * currentSnapshot.tokens.length))
      )
      const token = currentSnapshot.tokens[boundedIndex]
      onSeekPmPosition?.(token.pmFrom, { fromScrub: true })
      handlePlayFromToken(boundedIndex)
    }

    const progress = isScrubbing
      ? scrubValue
      : duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0

    function formatTime(s: number) {
      const m = Math.floor(s / 60)
      return `${m}:${(Math.floor(s % 60)).toString().padStart(2, '0')}`
    }

    const canPlay = !!snapshot && snapshot.tokens.length > 0 && snapshot.fullText.trim().length > 0

    return (
      <div className="shrink-0 flex flex-col gap-2 px-3 py-2 border-t border-border bg-card">
        <div
          className="relative flex-1 h-3 flex items-center cursor-pointer group select-none touch-none min-w-[80px]"
          onPointerDown={handleScrubStart}
          onPointerMove={handleScrubMove}
          onPointerUp={handleScrubEnd}
          onPointerCancel={handleScrubEnd}
        >
          <div className="absolute left-0 right-0 h-1 bg-muted rounded-full" />
          <div
            className={`absolute left-0 h-1 bg-primary rounded-full ${isScrubbing ? '' : 'transition-all duration-75'}`}
            style={{ width: `${progress}%` }}
          />
          <div
            className={`absolute h-3 w-3 bg-primary rounded-full shadow-md z-10 ${isScrubbing ? '' : 'transition-all duration-75'} opacity-0 group-hover:opacity-100`}
            style={{ left: `${progress}%`, transform: 'translateX(-50%)' }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSpeedChange}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Playback speed"
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{SPEEDS[speedIdx]}x</span>
          </button>

          <div className="flex-1" />

          {!isPlaying ? (
            <button
              onClick={() => handlePlayFromToken(0)}
              disabled={!canPlay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3 fill-current" />
              Read aloud
            </button>
          ) : (
            <button
              onClick={handlePauseResume}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              {isPaused
                ? <><Play className="w-3 h-3 fill-current" />Resume</>
                : <><Pause className="w-3 h-3 fill-current" />Pause</>}
            </button>
          )}

          {isPlaying && (
            <button
              onClick={handleStop}
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Stop"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          )}

          <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground min-w-[50px] justify-end">
            <Timer className="w-3 h-3" />
            {formatTime(elapsed)}/{formatTime(duration)}
          </div>
        </div>
      </div>
    )
  }
)

NotesReaderBar.displayName = 'NotesReaderBar'
