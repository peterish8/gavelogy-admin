import { useState, useEffect, useRef, useCallback } from 'react';

export interface TTSState {
    isPlaying: boolean;
    isPaused: boolean;
    currentSentenceIndex: number;
    progress: number; // 0-100
    isSupported: boolean;
    rate: number;
}

export function useTTS(sentences: string[]) {
    const [state, setState] = useState<TTSState>({
        isPlaying: false,
        isPaused: false,
        currentSentenceIndex: 0,
        progress: 0,
        isSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
        rate: 1.0
    });

    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const sentencesRef = useRef(sentences);
    const rateRef = useRef(1.0);
    const isPlayingRef = useRef(false);

    useEffect(() => {
        sentencesRef.current = sentences;
    }, [sentences]);

    const stop = useCallback(() => {
        if (!state.isSupported) return;
        window.speechSynthesis.cancel();
        isPlayingRef.current = false;
        setState(prev => ({
            ...prev,
            isPlaying: false,
            isPaused: false,
            progress: 0,
            currentSentenceIndex: 0
        }));
    }, [state.isSupported]);

    const speakSentence = useCallback((index: number) => {
        if (!state.isSupported || index >= sentencesRef.current.length) {
            if (index >= sentencesRef.current.length && index > 0) {
                setState(prev => ({ ...prev, isPlaying: false, currentSentenceIndex: 0, progress: 100 }));
            }
            return;
        }

        window.speechSynthesis.cancel();

        const text = sentencesRef.current[index];
        const utterance = new SpeechSynthesisUtterance(text);

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                             voices.find(v => v.lang.startsWith('en')) ||
                             voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.rate = rateRef.current;

        utterance.onend = () => {
            if (utteranceRef.current !== utterance) return;
            if (!isPlayingRef.current) return;

            const nextIndex = index + 1;
            if (nextIndex < sentencesRef.current.length) {
                setState(prev => {
                    if (!prev.isPlaying) return prev;
                    return {
                        ...prev,
                        currentSentenceIndex: nextIndex,
                        progress: (nextIndex / sentencesRef.current.length) * 100
                    };
                });
                speakSentence(nextIndex);
            } else {
                setState(prev => ({ ...prev, isPlaying: false, currentSentenceIndex: 0, progress: 100 }));
            }
        };

        utterance.onerror = (e) => {
            if (utteranceRef.current !== utterance) return;
            if (e.error === 'interrupted' || e.error === 'canceled') {
                return;
            }
            console.error("TTS Error:", e);
            isPlayingRef.current = false;
            setState(prev => ({ ...prev, isPlaying: false }));
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);

        isPlayingRef.current = true;
        setState(prev => ({
            ...prev,
            currentSentenceIndex: index,
            isPlaying: true,
            isPaused: false,
            progress: (index / sentencesRef.current.length) * 100
        }));

    }, [state.isSupported]);

    const play = useCallback(() => {
        if (!state.isSupported) return;
        speakSentence(state.currentSentenceIndex);
    }, [state.isSupported, state.currentSentenceIndex, speakSentence]);

    const pause = useCallback(() => {
        if (!state.isSupported) return;

        window.speechSynthesis.cancel();
        isPlayingRef.current = false;

        setState(prev => ({
            ...prev,
            isPlaying: false,
            isPaused: true
        }));
    }, [state.isSupported]);

    const jumpToSentence = useCallback((index: number) => {
        if (!state.isSupported) return;
        const safeIndex = Math.max(0, Math.min(index, sentencesRef.current.length - 1));
        speakSentence(safeIndex);
    }, [state.isSupported, speakSentence]);

    const scrub = useCallback((percentage: number) => {
        if (!state.isSupported || sentencesRef.current.length === 0) return;
        const index = Math.floor((percentage / 100) * sentencesRef.current.length);
        jumpToSentence(index);
    }, [state.isSupported, jumpToSentence]);

    const setRate = useCallback((newRate: number) => {
        rateRef.current = newRate;
        setState(prev => ({ ...prev, rate: newRate }));

        if (state.isPlaying && !state.isPaused) {
            speakSentence(state.currentSentenceIndex);
        }
    }, [state.isPlaying, state.isPaused, state.currentSentenceIndex, speakSentence]);

    useEffect(() => {
        return () => {
            if (typeof window !== 'undefined') {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    useEffect(() => {
         if (typeof window !== 'undefined' && window.speechSynthesis) {
             window.speechSynthesis.getVoices();
         }
    }, []);

    return {
        ...state,
        play,
        pause,
        stop,
        jumpToSentence,
        scrub,
        setRate
    };
}
