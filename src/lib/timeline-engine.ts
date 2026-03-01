/**
 * Timeline Orchestration Engine
 * 
 * Production-grade timeline system with multi-track support,
 * event-driven animation, and keyframe-based camera control.
 */

import { EASING_MAP } from './easing'

// ============================================================
// CORE TYPES
// ============================================================

export type TrackType = 'camera' | 'ui' | 'cursor' | 'overlay' | 'audio' | 'effect'
export type EventType = 
  | 'cameraFocus' 
  | 'cameraMove' 
  | 'cameraZoom'
  | 'cameraRotate'
  | 'type' 
  | 'click'
  | 'scroll'
  | 'fadeIn'
  | 'fadeOut'
  | 'slide'
  | 'scale'
  | 'blur'
  | 'highlight'
  | 'pause'
  | 'sound'
  | 'voiceover'
  | 'music'
  | 'wait'

export type EaseType = keyof typeof EASING_MAP

export interface TimelineKeyframe {
  id: string
  time: number // seconds
  value: number | number[] | { x: number; y: number }
  easing?: EaseType
}

export interface TimelineEvent {
  id: string
  type: EventType
  time: number // start time in seconds
  duration: number // duration in seconds
  target?: string // element ID or region name
  data: Record<string, any>
  easing?: EaseType
}

export interface TimelineTrack {
  id: string
  type: TrackType
  name: string
  enabled: boolean
  muted: boolean
  locked: boolean
  events: TimelineEvent[]
  keyframes?: TimelineKeyframe[]
}

export interface TimelinePreset {
  id: string
  name: string
  description: string
  category: 'saas' | 'app-store' | 'social' | 'demo' | 'tutorial'
  tracks: Omit<TimelineTrack, 'id'>[]
  settings: TimelineSettings
}

export interface TimelineSettings {
  defaultZoom: number
  defaultTransitionDuration: number
  defaultEasing: EaseType
  enableMotionBlur: boolean
  enableSmoothing: boolean
  smoothingAmount: number
  autoFraming: boolean
  typingSimulation: boolean
  voiceover: boolean
  backgroundMusic: boolean
}

// ============================================================
// DEFAULT PRESETS
// ============================================================

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  defaultZoom: 1.5,
  defaultTransitionDuration: 1.0,
  defaultEasing: 'Smooth',
  enableMotionBlur: true,
  enableSmoothing: true,
  smoothingAmount: 0.15,
  autoFraming: true,
  typingSimulation: true,
  voiceover: false,
  backgroundMusic: false,
}

export const TIMELINE_PRESETS: TimelinePreset[] = [
  {
    id: 'saas-cinematic',
    name: 'SaaS Cinematic',
    description: 'Slow elegant zooms with pastel gradients and soft glow',
    category: 'saas',
    tracks: [
      {
        type: 'camera',
        name: 'Camera',
        enabled: true,
        muted: false,
        locked: false,
        events: [],
        keyframes: [],
      },
    ],
    settings: {
      ...DEFAULT_TIMELINE_SETTINGS,
      defaultZoom: 1.8,
      defaultTransitionDuration: 1.5,
      defaultEasing: 'Smooth',
    },
  },
  {
    id: 'app-store',
    name: 'App Store Preview',
    description: 'Faster pacing with tighter zoom for mobile apps',
    category: 'app-store',
    tracks: [],
    settings: {
      ...DEFAULT_TIMELINE_SETTINGS,
      defaultZoom: 1.4,
      defaultTransitionDuration: 0.8,
      defaultEasing: 'Balanced',
    },
  },
  {
    id: 'social-promo',
    name: 'Social Media Promo',
    description: 'Quick cuts with bold focus shifts for TikTok/Reels',
    category: 'social',
    tracks: [],
    settings: {
      ...DEFAULT_TIMELINE_SETTINGS,
      defaultZoom: 2.0,
      defaultTransitionDuration: 0.5,
      defaultEasing: 'Dynamic',
    },
  },
  {
    id: 'tech-demo',
    name: 'Tech Demo',
    description: 'Sharp precise movements for software demonstrations',
    category: 'demo',
    tracks: [],
    settings: {
      ...DEFAULT_TIMELINE_SETTINGS,
      defaultZoom: 2.0,
      defaultTransitionDuration: 0.6,
      defaultEasing: 'Dynamic',
    },
  },
]

// ============================================================
// TIMELINE ENGINE
// ============================================================

export class TimelineEngine {
  private tracks: Map<string, TimelineTrack> = new Map()
  private duration: number = 0
  private settings: TimelineSettings
  private currentTime: number = 0
  private isPlaying: boolean = false

  constructor(settings: Partial<TimelineSettings> = {}) {
    this.settings = { ...DEFAULT_TIMELINE_SETTINGS, ...settings }
    this.initializeDefaultTracks()
  }

  private initializeDefaultTracks(): void {
    const defaultTracks: TrackType[] = ['camera', 'ui', 'cursor', 'overlay', 'audio', 'effect']
    
    defaultTracks.forEach((type, index) => {
      const track: TimelineTrack = {
        id: `track-${type}-${index}`,
        type,
        name: this.getTrackName(type),
        enabled: true,
        muted: false,
        locked: false,
        events: [],
        keyframes: [],
      }
      this.tracks.set(track.id, track)
    })
  }

  private getTrackName(type: TrackType): string {
    const names: Record<TrackType, string> = {
      camera: 'Camera',
      ui: 'UI Animation',
      cursor: 'Cursor',
      overlay: 'Overlay',
      audio: 'Audio',
      effect: 'Effects',
    }
    return names[type]
  }

  // ============================================================
  // TRACK MANAGEMENT
  // ============================================================

  addTrack(type: TrackType, name?: string): TimelineTrack {
    const track: TimelineTrack = {
      id: `track-${type}-${Date.now()}`,
      type,
      name: name || this.getTrackName(type),
      enabled: true,
      muted: false,
      locked: false,
      events: [],
      keyframes: [],
    }
    this.tracks.set(track.id, track)
    return track
  }

  removeTrack(trackId: string): void {
    this.tracks.delete(trackId)
  }

  getTrack(trackId: string): TimelineTrack | undefined {
    return this.tracks.get(trackId)
  }

  getTracks(): TimelineTrack[] {
    return Array.from(this.tracks.values())
  }

  getTracksByType(type: TrackType): TimelineTrack[] {
    return this.getTracks().filter(t => t.type === type)
  }

  // ============================================================
  // EVENT MANAGEMENT
  // ============================================================

  addEvent(trackId: string, event: Omit<TimelineEvent, 'id'>): TimelineEvent {
    const track = this.tracks.get(trackId)
    if (!track) {
      throw new Error(`Track ${trackId} not found`)
    }

    const newEvent: TimelineEvent = {
      ...event,
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }

    track.events.push(newEvent)
    
    // Update duration
    const eventEnd = newEvent.time + newEvent.duration
    if (eventEnd > this.duration) {
      this.duration = eventEnd
    }

    // Sort events by time
    track.events.sort((a, b) => a.time - b.time)

    return newEvent
  }

  removeEvent(trackId: string, eventId: string): void {
    const track = this.tracks.get(trackId)
    if (track) {
      track.events = track.events.filter(e => e.id !== eventId)
      this.recalculateDuration()
    }
  }

  updateEvent(trackId: string, eventId: string, updates: Partial<TimelineEvent>): void {
    const track = this.tracks.get(trackId)
    if (track) {
      const eventIndex = track.events.findIndex(e => e.id === eventId)
      if (eventIndex !== -1) {
        track.events[eventIndex] = { ...track.events[eventIndex], ...updates }
        this.recalculateDuration()
      }
    }
  }

  // ============================================================
  // KEYFRAME MANAGEMENT
  // ============================================================

  addKeyframe(trackId: string, keyframe: Omit<TimelineKeyframe, 'id'>): TimelineKeyframe {
    const track = this.tracks.get(trackId)
    if (!track || !track.keyframes) {
      throw new Error(`Track ${trackId} not found or doesn't support keyframes`)
    }

    const newKeyframe: TimelineKeyframe = {
      ...keyframe,
      id: `keyframe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }

    track.keyframes.push(newKeyframe)
    track.keyframes.sort((a, b) => a.time - b.time)

    return newKeyframe
  }

  getKeyframeValue(trackId: string, time: number): number | number[] | { x: number; y: number } | null {
    const track = this.tracks.get(trackId)
    if (!track || !track.keyframes || track.keyframes.length === 0) {
      return null
    }

    const keyframes = track.keyframes
    
    // Find surrounding keyframes
    let prevKf = keyframes[0]
    let nextKf = keyframes[keyframes.length - 1]

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].time <= time && keyframes[i + 1].time >= time) {
        prevKf = keyframes[i]
        nextKf = keyframes[i + 1]
        break
      }
    }

    // If before first or after last, return those values
    if (time <= keyframes[0].time) return keyframes[0].value
    if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].time

    // Interpolate
    const progress = (time - prevKf.time) / (nextKf.time - prevKf.time)
    const easingFn = EASING_MAP[prevKf.easing || 'Smooth']
    const easedProgress = easingFn(progress)

    // Interpolate based on value type
    if (typeof prevKf.value === 'number' && typeof nextKf.value === 'number') {
      return prevKf.value + (nextKf.value - prevKf.value) * easedProgress
    }

    if (typeof prevKf.value === 'object' && !Array.isArray(prevKf.value) && 
        typeof nextKf.value === 'object' && !Array.isArray(nextKf.value)) {
      // Interpolate {x, y} objects
      return {
        x: (prevKf.value as { x: number; y: number }).x + 
           ((nextKf.value as { x: number; y: number }).x - (prevKf.value as { x: number; y: number }).x) * easedProgress,
        y: (prevKf.value as { x: number; y: number }).y + 
           ((nextKf.value as { x: number; y: number }).y - (prevKf.value as { x: number; y: number }).y) * easedProgress,
      }
    }

    // Array interpolation
    if (Array.isArray(prevKf.value) && Array.isArray(nextKf.value)) {
      return prevKf.value.map((v: number, i: number) => 
        v + ((nextKf.value as number[])[i] - v) * easedProgress
      )
    }

    return prevKf.value
  }

  // ============================================================
  // STATE QUERY
  // ============================================================

  getStateAtTime(time: number): {
    camera: CameraState
    ui: UIAnimationState
    cursor: CursorState
    overlay: OverlayState
    audio: AudioState
    effects: EffectsState
  } {
    return {
      camera: this.getCameraStateAtTime(time),
      ui: this.getUIStateAtTime(time),
      cursor: this.getCursorStateAtTime(time),
      overlay: this.getOverlayStateAtTime(time),
      audio: this.getAudioStateAtTime(time),
      effects: this.getEffectsStateAtTime(time),
    }
  }

  private getCameraStateAtTime(time: number): CameraState {
    const track = this.getTracksByType('camera')[0]
    if (!track) {
      return { x: 0.5, y: 0.5, zoom: this.settings.defaultZoom, rotation: 0 }
    }

    let state: CameraState = { x: 0.5, y: 0.5, zoom: this.settings.defaultZoom, rotation: 0 }

    // Get keyframe value if available
    if (track.keyframes && track.keyframes.length > 0) {
      const value = this.getKeyframeValue(track.id, time)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('zoom' in (value as any)) {
          state = { ...state, ...(value as any) }
        } else if ('x' in value && 'y' in value) {
          state = { ...state, x: value.x, y: value.y }
        }
      }
    }

    // Process events
    for (const event of track.events) {
      if (time >= event.time && time <= event.time + event.duration) {
        const progress = (time - event.time) / event.duration
        const easingFn = EASING_MAP[event.easing || this.settings.defaultEasing]
        const easedProgress = easingFn(progress)

        switch (event.type) {
          case 'cameraFocus':
            if (event.data.targetX !== undefined) {
              state.x = state.x + (event.data.targetX - state.x) * easedProgress
            }
            if (event.data.targetY !== undefined) {
              state.y = state.y + (event.data.targetY - state.y) * easedProgress
            }
            if (event.data.zoom !== undefined) {
              state.zoom = state.zoom + (event.data.zoom - state.zoom) * easedProgress
            }
            break

          case 'cameraZoom':
            if (event.data.zoom !== undefined) {
              state.zoom = event.data.zoom
            }
            break

          case 'cameraMove':
            if (event.data.x !== undefined) state.x = event.data.x
            if (event.data.y !== undefined) state.y = event.data.y
            break

          case 'cameraRotate':
            if (event.data.rotation !== undefined) {
              state.rotation = event.data.rotation
            }
            break
        }
      }
    }

    return state
  }

  private getUIStateAtTime(time: number): UIAnimationState {
    const track = this.getTracksByType('ui')[0]
    const state: UIAnimationState = { elements: new Map() }

    if (!track) return state

    for (const event of track.events) {
      if (time >= event.time && time <= event.time + event.duration) {
        const progress = (time - event.time) / event.duration

        switch (event.type) {
          case 'fadeIn':
            state.elements.set(event.target || 'default', {
              opacity: progress,
              scale: 0.96 + progress * 0.04,
              blur: (1 - progress) * 10,
            })
            break

          case 'fadeOut':
            state.elements.set(event.target || 'default', {
              opacity: 1 - progress,
              scale: 1 - progress * 0.04,
              blur: progress * 10,
            })
            break

          case 'scale':
            const easingFn = EASING_MAP[event.easing || 'Smooth']
            const scaleValue = event.data.from + 
              (event.data.to - event.data.from) * easingFn(progress)
            state.elements.set(event.target || 'default', { scale: scaleValue })
            break
        }
      }
    }

    return state
  }

  private getCursorStateAtTime(time: number): CursorState {
    return { x: 0.5, y: 0.5, visible: true }
  }

  private getOverlayStateAtTime(time: number): OverlayState {
    return { elements: [] }
  }

  private getAudioStateAtTime(time: number): AudioState {
    return { volume: 1, muted: false }
  }

  private getEffectsStateAtTime(time: number): EffectsState {
    return { 
      motionBlur: this.settings.enableMotionBlur,
      vignette: true,
      colorGrade: 'none',
    }
  }

  // ============================================================
  // DURATION & SETTINGS
  // ============================================================

  private recalculateDuration(): void {
    let maxEnd = 0
    for (const track of this.tracks.values()) {
      for (const event of track.events) {
        const end = event.time + event.duration
        if (end > maxEnd) maxEnd = end
      }
    }
    this.duration = maxEnd
  }

  getDuration(): number {
    return this.duration
  }

  setDuration(duration: number): void {
    this.duration = duration
  }

  updateSettings(settings: Partial<TimelineSettings>): void {
    this.settings = { ...this.settings, ...settings }
  }

  getSettings(): TimelineSettings {
    return { ...this.settings }
  }

  // ============================================================
  // PLAYBACK CONTROL
  // ============================================================

  setCurrentTime(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.duration))
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  play(): void {
    this.isPlaying = true
  }

  pause(): void {
    this.isPlaying = false
  }

  stop(): void {
    this.isPlaying = false
    this.currentTime = 0
  }

  isPlayingState(): boolean {
    return this.isPlaying
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================

  toJSON(): string {
    return JSON.stringify({
      tracks: Array.from(this.tracks.values()),
      duration: this.duration,
      settings: this.settings,
    }, null, 2)
  }

  static fromJSON(json: string): TimelineEngine {
    const data = JSON.parse(json)
    const engine = new TimelineEngine(data.settings)
    
    engine.tracks.clear()
    data.tracks.forEach((track: TimelineTrack) => {
      engine.tracks.set(track.id, track)
    })
    engine.duration = data.duration
    
    return engine
  }

  // ============================================================
  // PRESET MANAGEMENT
  // ============================================================

  applyPreset(preset: TimelinePreset): void {
    this.settings = { ...preset.settings }
    
    // Clear existing tracks and apply preset tracks
    this.tracks.clear()
    preset.tracks.forEach((track, index) => {
      this.tracks.set(`track-${index}`, { ...track, id: `track-${index}` })
    })
  }

  getAvailablePresets(): TimelinePreset[] {
    return TIMELINE_PRESETS
  }
}

// ============================================================
// STATE TYPES
// ============================================================

export interface CameraState {
  x: number
  y: number
  zoom: number
  rotation: number
}

export interface UIAnimationState {
  elements: Map<string, {
    opacity?: number
    scale?: number
    blur?: number
    x?: number
    y?: number
  }>
}

export interface CursorState {
  x: number
  y: number
  visible: boolean
}

export interface OverlayState {
  elements: Array<{
    id: string
    type: string
    props: Record<string, any>
  }>
}

export interface AudioState {
  volume: number
  muted: boolean
  tracks?: Array<{
    type: 'voiceover' | 'music' | 'sfx'
    src?: string
    startTime?: number
    volume?: number
  }>
}

export interface EffectsState {
  motionBlur: boolean
  vignette: boolean
  colorGrade: string
  bloom?: number
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

export function createTimelineEngine(settings?: Partial<TimelineSettings>): TimelineEngine {
  return new TimelineEngine(settings)
}

export function createPresetTimeline(presetId: string): TimelineEngine | null {
  const preset = TIMELINE_PRESETS.find(p => p.id === presetId)
  if (!preset) return null
  
  const engine = new TimelineEngine(preset.settings)
  engine.applyPreset(preset)
  return engine
}
