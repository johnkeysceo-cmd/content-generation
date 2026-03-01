/**
 * Production Engine Integration
 * 
 * Central integration point connecting all production systems:
 * - Timeline Engine
 * - Typing Engine  
 * - UI Animation Engine
 * - Batch Renderer
 * - AI Auto-Zoom
 * - Cinematic Camera
 */

import { 
  TimelineEngine, 
  createTimelineEngine, 
  TIMELINE_PRESETS,
  type TimelineSettings,
  type TimelineEvent,
  type CameraState 
} from './timeline-engine'

import { 
  TypingEngine, 
  createTypingEngine, 
  TYPING_PRESETS,
  type TypingConfig,
  type TypingEvent 
} from './typing-engine'

import { 
  UIAnimationEngine, 
  createUIAnimationEngine,
  createCardEntryAnimations,
  type AnimationConfig 
} from './ui-animation-engine'

// Batch renderer types (actual implementation runs in Electron main process)
export interface RenderSettings {
  width: number
  height: number
  fps: number
  codec: string
  bitrate?: string
  format: 'mp4' | 'webm' | 'gif'
  quality: 'low' | 'medium' | 'high' | 'ultra'
  enableMotionBlur: boolean
  enableSmoothing: boolean
  enableVignette: boolean
  musicVolume: number
  sfxVolume: number
  backgroundMusic?: string
  voiceover?: string
}

export interface RenderJob {
  id: string
  status: string
  progress: number
}

import { 
  AIAutoZoomController, 
  createAIAutoZoom,
  CAMERA_TEMPLATES,
  type AIZoomSettings 
} from './ai-auto-zoom'

import { 
  CinematicCameraController, 
  createCinematicCamera,
  type CameraTemplate 
} from './cinematic-camera'

// ============================================================
// MAIN PRODUCTION ENGINE
// ============================================================

export class ProductionEngine {
  // Core systems
  private timelineEngine: TimelineEngine
  private typingEngine: TypingEngine
  private uiAnimationEngine: UIAnimationEngine
  private aiAutoZoom: AIAutoZoomController
  private cinematicCamera: CinematicCameraController
  
  // State
  private isPlaying: boolean = false
  private currentTime: number = 0
  private playbackSpeed: number = 1
  private videoDuration: number = 0
  
  // Callbacks
  private onTimeUpdate: ((time: number) => void) | null = null
  private onStateChange: ((state: ProductionState) => void) | null = null
  private onRender: ((state: RenderState) => void) | null = null

  constructor() {
    // Initialize all engines
    this.timelineEngine = createTimelineEngine()
    this.typingEngine = createTypingEngine()
    this.uiAnimationEngine = createUIAnimationEngine()
    this.aiAutoZoom = createAIAutoZoom()
    this.cinematicCamera = createCinematicCamera('cinematic')
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  /**
   * Initialize for a new video project
   */
  initialize(videoDuration: number, settings?: Partial<TimelineSettings>): void {
    this.videoDuration = videoDuration
    this.timelineEngine = createTimelineEngine(settings)
    this.currentTime = 0
    this.isPlaying = false
    
    // Initialize AI auto zoom
    this.aiAutoZoom = createAIAutoZoom()
    
    // Reset other engines
    this.typingEngine = createTypingEngine()
    this.uiAnimationEngine = createUIAnimationEngine()
  }

  /**
   * Set callback for time updates
   */
  onTimeUpdateCallback(callback: (time: number) => void): void {
    this.onTimeUpdate = callback
  }

  /**
   * Set callback for state changes
   */
  onStateChangeCallback(callback: (state: ProductionState) => void): void {
    this.onStateChange = callback
  }

  /**
   * Set callback for render updates
   */
  onRenderCallback(callback: (state: RenderState) => void): void {
    this.onRender = callback
  }

  // ============================================================
  // TIMELINE MANAGEMENT
  // ============================================================

  /**
   * Apply a preset timeline
   */
  applyTimelinePreset(presetId: string): void {
    const preset = TIMELINE_PRESETS.find(p => p.id === presetId)
    if (preset) {
      this.timelineEngine.applyPreset(preset)
      this.notifyStateChange()
    }
  }

  /**
   * Add an event to the timeline
   */
  addTimelineEvent(
    trackType: string,
    event: Omit<TimelineEvent, 'id'>
  ): TimelineEvent {
    const tracks = this.timelineEngine.getTracks()
    const track = tracks.find(t => t.type === trackType)
    
    if (track) {
      const newEvent = this.timelineEngine.addEvent(track.id, event)
      this.notifyStateChange()
      return newEvent
    }
    
    throw new Error(`Track type ${trackType} not found`)
  }

  /**
   * Get current timeline state
   */
  getTimelineState() {
    return this.timelineEngine.getStateAtTime(this.currentTime)
  }

  /**
   * Update timeline settings
   */
  updateTimelineSettings(settings: Partial<TimelineSettings>): void {
    this.timelineEngine.updateSettings(settings)
    this.notifyStateChange()
  }

  // ============================================================
  // TYPING SIMULATION
  // ============================================================

  /**
   * Start typing simulation
   */
  startTyping(text: string, preset?: string): void {
    if (preset && TYPING_PRESETS[preset]) {
      this.typingEngine = createTypingEngine(TYPING_PRESETS[preset])
    }
    this.typingEngine.start(text)
  }

  /**
   * Process typing (call in animation loop)
   */
  processTyping(deltaTime: number) {
    return this.typingEngine.process(deltaTime)
  }

  /**
   * Get typing events for timeline
   */
  getTypingEvents(): TypingEvent[] {
    return this.typingEngine.getEvents()
  }

  /**
   * Calculate typing duration
   */
  calculateTypingDuration(text: string, preset?: string): number {
    const engine = preset ? createTypingEngine(TYPING_PRESETS[preset]) : createTypingEngine()
    // This would need the calculateTypingDuration function imported
    return text.length * 0.055 // Approximate
  }

  // ============================================================
  // UI ANIMATIONS
  // ============================================================

  /**
   * Add card entry animations
   */
  addCardAnimations(cardIds: string[], startTime: number = 0): void {
    const animations = createCardEntryAnimations(cardIds, { startDelay: startTime })
    
    for (const [id, anims] of animations) {
      this.uiAnimationEngine.addAnimation(id, anims)
    }
  }

  /**
   * Add custom animation
   */
  addAnimation(elementId: string, animation: AnimationConfig): void {
    this.uiAnimationEngine.addAnimation(elementId, animation)
  }

  /**
   * Process animations (call in animation loop)
   */
  processAnimations() {
    const time = performance.now()
    return this.uiAnimationEngine.process(time)
  }

  // ============================================================
  // AI AUTO-ZOOM
  // ============================================================

  /**
   * Configure AI auto-zoom
   */
  configureAIZoom(settings: Partial<AIZoomSettings>): void {
    this.aiAutoZoom.updateSettings(settings)
  }

  /**
   * Generate AI zoom regions for video
   */
  async generateAIZoomRegions(videoElement: HTMLVideoElement): Promise<void> {
    const regions = await this.aiAutoZoom.generateZoomRegions(
      videoElement,
      this.videoDuration,
      [] // Would pass metadata
    )
    
    // Add each region to timeline
    for (const region of regions) {
      this.addTimelineEvent('camera', {
        type: 'cameraFocus',
        time: region.startTime,
        duration: region.duration,
        data: {
          targetX: region.targetX,
          targetY: region.targetY,
          zoom: region.zoomLevel,
        },
        easing: region.easing as TimelineEvent['easing'],
      })
    }
  }

  // ============================================================
  // CINEMATIC CAMERA
  // ============================================================

  /**
   * Set camera template
   */
  setCameraTemplate(template: CameraTemplate): void {
    this.cinematicCamera.setTemplate(template)
  }

  /**
   * Get camera state at current time
   */
  getCameraState(metadata: { timestamp: number; x: number; y: number; type: string }[]): CameraState {
    return this.cinematicCamera.getStateAtTime(
      this.currentTime,
      metadata,
      1920, // Would get from video
      1080
    )
  }

  // ============================================================
  // BATCH RENDERING (Placeholder - implemented in main process)
  // ============================================================

  /**
   * Initialize batch renderer (placeholder - actual implementation in main process)
   */
  initBatchRenderer(options: {
    inputDir: string
    outputDir: string
    settings?: Partial<RenderSettings>
  }): void {
    // Placeholder - batch rendering runs in Electron main process
    console.log('[ProductionEngine] Batch renderer initialized (main process)')
  }

  /**
   * Add batch job (placeholder)
   */
  addBatchJob(inputPath: string, outputPath: string): string {
    console.log('[ProductionEngine] Batch job added:', inputPath)
    return `job-${Date.now()}`
  }

  /**
   * Start batch rendering (placeholder)
   */
  async startBatchRender() {
    console.log('[ProductionEngine] Batch render started')
    return { totalJobs: 0, completed: 0, failed: 0 }
  }

  // ============================================================
  // PLAYBACK CONTROL
  // ============================================================

  /**
   * Play
   */
  play(): void {
    this.isPlaying = true
    this.timelineEngine.play()
    this.uiAnimationEngine.play()
    this.notifyStateChange()
  }

  /**
   * Pause
   */
  pause(): void {
    this.isPlaying = false
    this.timelineEngine.pause()
    this.uiAnimationEngine.pause()
    this.notifyStateChange()
  }

  /**
   * Stop
   */
  stop(): void {
    this.isPlaying = false
    this.currentTime = 0
    this.timelineEngine.stop()
    this.uiAnimationEngine.stop()
    this.typingEngine.stop()
    this.notifyStateChange()
  }

  /**
   * Seek to time
   */
  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.videoDuration))
    this.timelineEngine.setCurrentTime(this.currentTime)
    this.onTimeUpdate?.(this.currentTime)
    this.notifyRender()
  }

  /**
   * Set playback speed
   */
  setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = speed
  }

  // ============================================================
  // MAIN UPDATE LOOP
  // ============================================================

  /**
   * Update - call this in animation frame
   * Returns current render state
   */
  update(deltaTime: number): RenderState {
    if (!this.isPlaying) {
      return this.getRenderState()
    }

    // Advance time
    this.currentTime += deltaTime * this.playbackSpeed
    
    if (this.currentTime >= this.videoDuration) {
      this.currentTime = this.videoDuration
      this.pause()
    }

    // Update engines
    this.timelineEngine.setCurrentTime(this.currentTime)
    
    // Get render state
    const renderState = this.getRenderState()
    
    // Callbacks
    this.onTimeUpdate?.(this.currentTime)
    this.onRender?.(renderState)
    
    return renderState
  }

  /**
   * Get current render state
   */
  private getRenderState(): RenderState {
    const timelineState = this.timelineEngine.getStateAtTime(this.currentTime)
    const animationStates = this.uiAnimationEngine.getAllStates()
    const typingState = this.typingEngine.getState()

    return {
      time: this.currentTime,
      duration: this.videoDuration,
      isPlaying: this.isPlaying,
      camera: timelineState.camera,
      ui: timelineState.ui,
      cursor: timelineState.cursor,
      effects: timelineState.effects,
      animations: animationStates,
      typing: typingState,
    }
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    this.onStateChange?.(this.getProductionState())
  }

  /**
   * Notify render
   */
  private notifyRender(): void {
    this.onRender?.(this.getRenderState())
  }

  /**
   * Get production state
   */
  getProductionState(): ProductionState {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      duration: this.videoDuration,
      playbackSpeed: this.playbackSpeed,
      timeline: {
        duration: this.timelineEngine.getDuration(),
        settings: this.timelineEngine.getSettings(),
        tracks: this.timelineEngine.getTracks(),
      },
      typing: {
        isTyping: this.typingEngine.getState().isTyping,
        progress: this.typingEngine.getProgress(),
      },
      batch: null,
    }
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================

  /**
   * Export project to JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      timeline: this.timelineEngine.toJSON(),
      settings: this.timelineEngine.getSettings(),
    }, null, 2)
  }

  /**
   * Import project from JSON
   */
  importFromJSON(json: string): void {
    const data = JSON.parse(json)
    this.timelineEngine = TimelineEngine.fromJSON(data.timeline)
    this.timelineEngine.updateSettings(data.settings)
  }

  // ============================================================
  // PRESETS
  // ============================================================

  /**
   * Get available timeline presets
   */
  getTimelinePresets() {
    return TIMELINE_PRESETS
  }

  /**
   * Get available camera templates
   */
  getCameraTemplates() {
    return CAMERA_TEMPLATES
  }

  /**
   * Get available typing presets
   */
  getTypingPresets() {
    return TYPING_PRESETS
  }
}

// ============================================================
// STATE TYPES
// ============================================================

export interface ProductionState {
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackSpeed: number
  timeline: {
    duration: number
    settings: TimelineSettings
    tracks: any[]
  }
  typing: {
    isTyping: boolean
    progress: number
  }
  batch: {
    status: {
      pending: number
      processing: number
      completed: number
      failed: number
    }
  } | null
}

export interface RenderState {
  time: number
  duration: number
  isPlaying: boolean
  camera: {
    x: number
    y: number
    zoom: number
    rotation: number
  }
  ui: any
  cursor: any
  effects: any
  animations: Map<string, any>
  typing: {
    currentText: string
    cursorPosition: number
    isTyping: boolean
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const productionEngine = new ProductionEngine()

// ============================================================
// FACTORY
// ============================================================

export function createProductionEngine(): ProductionEngine {
  return new ProductionEngine()
}
