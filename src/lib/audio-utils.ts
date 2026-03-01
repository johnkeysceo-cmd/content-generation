/**
 * Audio utilities for beat detection and auto-sync features
 * Uses Web Audio API for client-side audio analysis
 */

export interface Beat {
  time: number
  strength: number
}

export interface AudioAnalysisResult {
  beats: Beat[]
  bpm: number
  duration: number
}

/**
 * Analyzes audio from an AudioBuffer to detect beats using energy-based algorithm
 */
export async function analyzeAudio(audioBuffer: AudioBuffer): Promise<AudioAnalysisResult> {
  const sampleRate = audioBuffer.sampleRate
  const channels = audioBuffer.numberOfChannels
  const duration = audioBuffer.duration
  const samples = audioBuffer.length
  
  // Mix down to mono
  const monoData = new Float32Array(samples)
  for (let channel = 0; channel < channels; channel++) {
    const channelData = audioBuffer.getChannelData(channel)
    for (let i = 0; i < samples; i++) {
      monoData[i] += channelData[i] / channels
    }
  }
  
  // Parameters for beat detection
  const windowSize = Math.floor(sampleRate * 0.02) // 20ms windows
  const hopSize = Math.floor(sampleRate * 0.01)   // 10ms hop
  const sensitivity = 1.4                          // Beat detection threshold
  
  // Calculate energy in each window
  const energies: number[] = []
  for (let i = 0; i < samples - windowSize; i += hopSize) {
    let energy = 0
    for (let j = 0; j < windowSize; j++) {
      energy += monoData[i + j] * monoData[i + j]
    }
    energies.push(energy / windowSize)
  }
  
  // Apply smoothing
  const smoothedEnergies = energies.map((_, i) => {
    const window = energies.slice(Math.max(0, i - 5), i + 6)
    return window.reduce((a, b) => a + b, 0) / window.length
  })
  
  // Detect beats using adaptive threshold
  const beats: Beat[] = []
  const onsetCooldown = Math.floor(0.2 / (hopSize / sampleRate)) // 200ms minimum between beats
  
  let lastBeatIndex = -onsetCooldown
  
  for (let i = 1; i < smoothedEnergies.length; i++) {
    // Calculate local average
    const localWindow = smoothedEnergies.slice(Math.max(0, i - 30), i)
    const localAverage = localWindow.reduce((a, b) => a + b, 0) / localWindow.length
    
    // Check if this is a beat
    if (smoothedEnergies[i] > localAverage * sensitivity && smoothedEnergies[i] > 0.01) {
      if (i - lastBeatIndex >= onsetCooldown) {
        const time = (i * hopSize) / sampleRate
        const strength = Math.min(1, smoothedEnergies[i] / (localAverage * 2))
        
        beats.push({ time, strength })
        lastBeatIndex = i
      }
    }
  }
  
  // Estimate BPM from beat intervals
  const bpm = estimateBPM(beats, duration)
  
  return { beats, bpm, duration }
}

/**
 * Estimates BPM from detected beats
 */
function estimateBPM(beats: Beat[], _duration: number): number {
  if (beats.length < 2) return 120 // Default BPM
  
  // Calculate intervals between consecutive beats
  const intervals: number[] = []
  for (let i = 1; i < beats.length; i++) {
    const interval = beats[i].time - beats[i - 1].time
    if (interval > 0.2 && interval < 2) { // Reasonable beat interval range
      intervals.push(interval)
    }
  }
  
  if (intervals.length === 0) return 120
  
  // Find the most common interval (cluster around common BPMs)
  const bpmCandidates: number[] = []
  for (const interval of intervals) {
    const bpm = 60 / interval
    // Normalize to common BPM range (60-180)
    if (bpm >= 60 && bpm <= 180) {
      bpmCandidates.push(bpm)
      // Also add half and double tempo
      if (bpm >= 30 && bpm < 60) bpmCandidates.push(bpm * 2)
      if (bpm > 180 && bpm <= 360) bpmCandidates.push(bpm / 2)
    }
  }
  
  // Find the median BPM
  bpmCandidates.sort((a, b) => a - b)
  const medianBPM = bpmCandidates[Math.floor(bpmCandidates.length / 2)] || 120
  
  // Round to nearest whole number
  return Math.round(medianBPM)
}

/**
 * Generates cut regions that sync with beats
 */
export function generateBeatCutRegions(
  beats: Beat[],
  videoDuration: number,
  options: {
    cutDuration?: number      // Duration of each cut (default: 0.3s)
    startPadding?: number     // Time before beat to start cut (default: 0.1s)
    endPadding?: number       // Time after beat to end cut (default: 0.2s)
    minInterval?: number      // Minimum time between cuts (default: 0.5s)
    beatStrengthThreshold?: number // Only cut on beats stronger than this (default: 0.3)
  } = {}
): Array<{ startTime: number; endTime: number }> {
  const {
    cutDuration = 0.3,
    startPadding = 0.1,
    endPadding = 0.2,
    minInterval = 0.5,
    beatStrengthThreshold = 0.3
  } = options
  
  const cuts: Array<{ startTime: number; endTime: number }> = []
  let lastCutEnd = -minInterval
  
  for (const beat of beats) {
    // Skip weak beats
    if (beat.strength < beatStrengthThreshold) continue
    
    const cutStart = Math.max(0, beat.time - startPadding)
    const cutEnd = Math.min(videoDuration, beat.time + cutDuration - startPadding + endPadding)
    
    // Ensure minimum interval between cuts
    if (cutStart >= lastCutEnd + minInterval) {
      cuts.push({ startTime: cutStart, endTime: cutEnd })
      lastCutEnd = cutEnd
    }
  }
  
  return cuts
}

/**
 * Loads audio from a URL and returns an AudioBuffer
 */
export async function loadAudioFromUrl(url: string): Promise<AudioBuffer> {
  const audioContext = new AudioContext()
  
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return await audioContext.decodeAudioData(arrayBuffer)
  } finally {
    await audioContext.close()
  }
}

/**
 * Loads audio from a File object
 */
export async function loadAudioFromFile(file: File): Promise<AudioBuffer> {
  const audioContext = new AudioContext()
  
  try {
    const arrayBuffer = await file.arrayBuffer()
    return await audioContext.decodeAudioData(arrayBuffer)
  } finally {
    await audioContext.close()
  }
}

/**
 * Analyzes audio from a video element
 * Note: This requires CORS-enabled video source
 */
export async function analyzeVideoAudio(videoElement: HTMLVideoElement): Promise<AudioAnalysisResult | null> {
  // Create audio context
  const audioContext = new AudioContext()
  
  try {
    // Get the audio buffer by fetching the video source
    // This only works for same-origin or CORS-enabled video sources
    const response = await fetch(videoElement.src)
    if (!response.ok) {
      console.warn('Could not fetch video for audio analysis - CORS may be blocking')
      return null
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return await analyzeAudio(await audioContext.decodeAudioData(arrayBuffer))
  } catch (error) {
    console.error('Failed to analyze video audio:', error)
    return null
  } finally {
    await audioContext.close()
  }
}
