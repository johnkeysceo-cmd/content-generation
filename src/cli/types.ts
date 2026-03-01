/**
 * ScreenArc CLI - Type Definitions
 * Pure Node.js types for headless CLI video processor
 */

export type AspectRatio = '16:9' | '9:16' | '4:3' | '3:4' | '1:1'
export type BackgroundType = 'color' | 'gradient' | 'image' | 'wallpaper'
export type WebcamPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'left-center' | 'right-center'
export type WebcamShape = 'circle' | 'square' | 'rectangle'
export type OutputFormat = 'mp4' | 'gif'
export type Resolution = '720p' | '1080p' | '2k'
export type Quality = 'low' | 'medium' | 'high'

export interface BackgroundConfig {
  type: BackgroundType
  color?: string
  gradientStart?: string
  gradientEnd?: string
  gradientDirection?: string
  imageUrl?: string
  wallpaperId?: string
}

export interface FrameStylesConfig {
  background: BackgroundConfig
  padding: number
  borderRadius: number
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowColor: string
  borderWidth: number
  borderColor: string
  // NEW: Vignette effect for AI Demo look
  vignetteEnabled: boolean
  vignetteIntensity: number  // 0-100, default ~20-30 for subtle effect
  vignetteColor: string     // default 'black'
}

export interface CursorStylesConfig {
  showCursor: boolean
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowColor: string
  clickRippleEffect: boolean
  clickRippleColor: string
  clickRippleSize: number
  clickRippleDuration: number
  clickScaleEffect: boolean
  clickScaleAmount: number
  clickScaleDuration: number
  clickScaleEasing: string
  // NEW: Cursor FX - Glow Effect
  cursorGlowEffect: boolean
  cursorGlowColor: string
  cursorGlowSize: number
  cursorGlowIntensity: number
  // NEW: Cursor FX - Motion Trail
  cursorMotionTrail: boolean
  motionTrailLength: number
  motionTrailOpacity: number
  // NEW: Cursor FX - Motion Blur
  cursorMotionBlur: boolean
  motionBlurIntensity: number
  motionBlurThreshold: number
  // NEW: Additional FX
  swooshEffect: boolean
  swooshIntensity: number
  swooshThreshold: number
  speedLines: boolean
  speedLinesIntensity: number
  speedLinesThreshold: number
  clickExplosion: boolean
  clickExplosionIntensity: number
  clickExplosionParticles: number
}

export interface WebcamStylesConfig {
  shape: WebcamShape
  borderRadius: number
  size: number
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowColor: string
  isFlipped: boolean
  scaleOnZoom: boolean
  smartPosition: boolean
}

export interface WebcamPositionConfig {
  pos: WebcamPosition
}

export interface ZoomRegionConfig {
  id: string
  type: 'zoom'
  zIndex: number
  startTime: number
  duration: number
  zoomLevel: number
  easing: string
  transitionDuration: number
  targetX: number
  targetY: number
  mode: 'auto' | 'fixed'
  blurEnabled: boolean
  blurAmount: number
}

export interface CutRegionConfig {
  id: string
  type: 'cut'
  zIndex: number
  startTime: number
  duration: number
}

export interface SpeedRegionConfig {
  id: string
  startTime: number
  duration: number
  speed: number
}

export interface MouseEvent {
  timestamp: number
  x: number
  y: number
  type: 'click' | 'move' | 'scroll'
  button?: string
  pressed?: boolean
  cursorImageKey?: string
}

export interface RecordingMetadata {
  platform: string
  screenSize: { width: number; height: number }
  geometry: { x: number; y: number; width: number; height: number }
  syncOffset: number
  cursorImages: Record<string, { width: number; height: number; xhot: number; yhot: number; image: number[] }>
  events: MouseEvent[]
}

export interface ExportSettings {
  format: OutputFormat
  resolution: Resolution
  fps: number
  quality: Quality
  aspectRatio: AspectRatio
}

export interface CLIProjectConfig {
  videoPath: string
  metadataPath?: string
  outputPath: string
  exportSettings: ExportSettings
  frameStyles: FrameStylesConfig
  cursorStyles: CursorStylesConfig
  webcamEnabled: boolean
  webcamPosition?: WebcamPositionConfig
  webcamStyles?: WebcamStylesConfig
  webcamVideoPath?: string
  zoomRegions: ZoomRegionConfig[]
  cutRegions: CutRegionConfig[]
  speedRegions: SpeedRegionConfig[]
  audioEnabled: boolean
  audioVolume: number
  audioMuted: boolean
}

export interface PresetConfig {
  id: string
  name: string
  frameStyles: FrameStylesConfig
  aspectRatio: AspectRatio
  webcamStyles?: WebcamStylesConfig
  webcamPosition?: WebcamPositionConfig
  cursorStyles?: CursorStylesConfig
  zoomLevel?: number
}

export interface BatchConfig {
  inputDirectory: string
  outputDirectory: string
  pattern: string
  recursive: boolean
  preset?: string
  presetFile?: string
  exportSettings?: Partial<ExportSettings>
}

export interface ProcessingResult {
  success: boolean
  inputPath: string
  outputPath: string
  error?: string
  duration?: number
  framesProcessed?: number
}

export type ProgressCallback = (progress: number, stage: string, frame?: number) => void
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
