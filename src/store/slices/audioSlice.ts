import type { AudioState, AudioActions, Slice, Beat } from '../../types'
import { DEFAULTS } from '../../lib/constants'
import { generateBeatCutRegions } from '../../lib/audio-utils'

export const initialAudioState: AudioState = {
  volume: DEFAULTS.AUDIO.VOLUME.defaultValue,
  isMuted: DEFAULTS.AUDIO.MUTED.defaultValue,
  // NEW: Beat matching state
  beatAnalysisResult: null,
  isAnalyzingAudio: false,
  beatMatchingEnabled: false,
  beatMatchingSettings: {
    cutDuration: 0.3,
    startPadding: 0.1,
    endPadding: 0.2,
    minInterval: 0.5,
    beatStrengthThreshold: 0.3,
  },
}

export const createAudioSlice: Slice<AudioState, AudioActions> = (set, get) => ({
  ...initialAudioState,
  setVolume: (volume: number) => {
    set((state) => {
      // Clamp volume between 0 and 1
      state.volume = Math.max(0, Math.min(1, volume))
      // Unmute if volume is adjusted above 0
      if (state.volume > 0) {
        state.isMuted = false
      }
    })
  },
  toggleMute: () => {
    set((state) => {
      state.isMuted = !state.isMuted
    })
  },
  setIsMuted: (isMuted: boolean) => {
    set((state) => {
      state.isMuted = isMuted
    })
  },
  // NEW: Beat matching actions
  setBeatAnalysisResult: (result: { beats: Beat[]; bpm: number; duration: number } | null) => {
    set((state) => {
      state.beatAnalysisResult = result
    })
  },
  setIsAnalyzingAudio: (isAnalyzing: boolean) => {
    set((state) => {
      state.isAnalyzingAudio = isAnalyzing
    })
  },
  setBeatMatchingEnabled: (enabled: boolean) => {
    set((state) => {
      state.beatMatchingEnabled = enabled
    })
  },
  updateBeatMatchingSettings: (settings: Partial<AudioState['beatMatchingSettings']>) => {
    set((state) => {
      if (state.beatMatchingSettings) {
        Object.assign(state.beatMatchingSettings, settings)
      }
    })
  },
  applyBeatMatchingToTimeline: (addCutRegion: (data?: { startTime: number; duration: number }) => void, videoDuration: number) => {
    const { beatAnalysisResult, beatMatchingSettings } = get()
    
    if (!beatAnalysisResult || !beatMatchingSettings) return
    
    const cuts = generateBeatCutRegions(
      beatAnalysisResult.beats,
      videoDuration,
      beatMatchingSettings,
    )
    
    // Add cut regions for each beat
    for (const cut of cuts) {
      addCutRegion({
        startTime: cut.startTime,
        duration: cut.endTime - cut.startTime,
      })
    }
  },
})
