import { useState, useEffect, useRef, useCallback } from 'react';

// Strips markdown artifacts so speech synthesizer reads smoothly
function cleanTextForSpeech(mdText) {
  if (!mdText) return '';
  return mdText
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/<think>[\s\S]*?<\/think>/g, '') // strip think tags
    .replace(/[*#_~>]/g, '') // remove markdown symbols *, #, _, ~, >
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links to label
    .replace(/\n+/g, ' ') // collapse line breaks
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const AGENT_VOICE_PROFILES = {
  'Analyst': { rate: 1.1, pitch: 1.05 },
  "Devil's Advocate": { rate: 0.95, pitch: 0.78 },
  'Creative Thinker': { rate: 1.12, pitch: 1.22 },
  'Ethics Checker': { rate: 0.95, pitch: 0.95 },
  'Moderator': { rate: 1.0, pitch: 0.85 }
};

export function useCouncilAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentRole, setCurrentRole] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [queueLength, setQueueLength] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [voices, setVoices] = useState([]);

  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1.0);

  // Load available system voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const updateVoices = () => {
      const avail = window.speechSynthesis.getVoices();
      if (avail && avail.length > 0) {
        setVoices(avail);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const selectVoiceForRole = useCallback((role, availableVoices) => {
    if (!availableVoices || availableVoices.length === 0) return null;
    const enVoices = availableVoices.filter(v => v.lang && v.lang.startsWith('en'));
    const pool = enVoices.length > 0 ? enVoices : availableVoices;

    const roleIndexMap = {
      'Analyst': 0,
      "Devil's Advocate": 1,
      'Creative Thinker': 2,
      'Ethics Checker': 3,
      'Moderator': 4
    };
    const targetIdx = roleIndexMap[role] !== undefined ? roleIndexMap[role] % pool.length : 0;
    return pool[targetIdx] || pool[0];
  }, []);

  const speakCurrentItem = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const queue = queueRef.current;
    const idx = currentIndexRef.current;

    if (idx >= queue.length) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentRole(null);
      return;
    }

    const item = queue[idx];
    setCurrentRole(item.role);
    setCurrentIndex(idx);

    const cleanText = cleanTextForSpeech(item.text);
    if (!cleanText) {
      currentIndexRef.current = idx + 1;
      speakCurrentItem();
      return;
    }

    window.speechSynthesis.cancel();

    const speechText = `${item.role} says: ${cleanText}`;
    const utterance = new SpeechSynthesisUtterance(speechText);
    
    const profile = AGENT_VOICE_PROFILES[item.role] || { rate: 1.0, pitch: 1.0 };
    utterance.rate = (profile.rate || 1.0) * speedRef.current;
    utterance.pitch = profile.pitch || 1.0;

    const voice = selectVoiceForRole(item.role, window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      if (!isPlayingRef.current) return;
      currentIndexRef.current = idx + 1;
      setTimeout(() => {
        if (isPlayingRef.current) {
          speakCurrentItem();
        }
      }, 450);
    };

    utterance.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('Speech synthesis error:', e);
      if (isPlayingRef.current) {
        currentIndexRef.current = idx + 1;
        speakCurrentItem();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [selectVoiceForRole]);

  const playQueue = useCallback((items) => {
    if (!items || items.length === 0 || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    queueRef.current = items.filter(it => it && it.text);
    currentIndexRef.current = 0;
    setQueueLength(queueRef.current.length);
    setIsPlaying(true);
    setIsPaused(false);
    isPlayingRef.current = true;

    speakCurrentItem();
  }, [speakCurrentItem]);

  const playSingle = useCallback((role, text) => {
    playQueue([{ role, text }]);
  }, [playQueue]);

  const pause = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentRole(null);
    isPlayingRef.current = false;
    queueRef.current = [];
    currentIndexRef.current = 0;
  }, []);

  const skip = useCallback(() => {
    if (!isPlayingRef.current) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    currentIndexRef.current += 1;
    speakCurrentItem();
  }, [speakCurrentItem]);

  const changeSpeed = useCallback((newSpeed) => {
    speedRef.current = newSpeed;
    setSpeed(newSpeed);
    if (isPlayingRef.current) {
      speakCurrentItem();
    }
  }, [speakCurrentItem]);

  return {
    isPlaying,
    isPaused,
    currentRole,
    currentIndex,
    queueLength,
    speed,
    voicesAvailable: voices.length > 0 || (typeof window !== 'undefined' && 'speechSynthesis' in window),
    playQueue,
    playSingle,
    pause,
    resume,
    stop,
    skip,
    changeSpeed
  };
}
