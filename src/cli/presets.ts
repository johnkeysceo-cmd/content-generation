/**
 * ScreenArc CLI - Preset Manager
 * Handles loading and managing presets from JSON files
 */

import fs from 'fs'
import path from 'path'
import { PresetConfig, FrameStylesConfig, CursorStylesConfig, WebcamStylesConfig, WebcamPositionConfig, AspectRatio } from './types.js'
import { getLogger } from './logger.js'

const logger = getLogger()

// Default presets built into the CLI
export const DEFAULT_PRESETS: Record<string, PresetConfig> = {
  'ai-demo': {
    id: 'ai-demo',
    name: 'AI Demo Video',
    aspectRatio: '9:16',
    frameStyles: {
      background: { type: 'color', color: '#fafafa' },
      padding: 8,
      borderRadius: 24,
      shadowBlur: 40,
      shadowOffsetX: 0,
      shadowOffsetY: 20,
      shadowColor: 'rgba(0, 0, 0, 0.6)',
      borderWidth: 0,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      // KEY FEATURE: Vignette effect for that professional AI demo look
      vignetteEnabled: true,
      vignetteIntensity: 25,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 4,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      clickRippleEffect: true,
      clickRippleColor: 'rgba(255, 255, 255, 0.9)',
      clickRippleSize: 35,
      clickRippleDuration: 0.5,
      clickScaleEffect: true,
      clickScaleAmount: 0.85,
      clickScaleDuration: 0.35,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 1.8
  },
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    aspectRatio: '16:9',
    frameStyles: {
      background: { type: 'color', color: '#000000' },
      padding: 5,
      borderRadius: 16,
      shadowBlur: 35,
      shadowOffsetX: 0,
      shadowOffsetY: 15,
      shadowColor: 'rgba(0, 0, 0, 0.8)',
      borderWidth: 4,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 6,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      clickRippleEffect: true,
      clickRippleColor: 'rgba(255, 255, 255, 0.8)',
      clickRippleSize: 30,
      clickRippleDuration: 0.5,
      clickScaleEffect: true,
      clickScaleAmount: 0.8,
      clickScaleDuration: 0.4,
      clickScaleEasing: 'Balanced',
      // NEW: Cursor FX
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      // NEW: Additional FX
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 2.5
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    aspectRatio: '16:9',
    frameStyles: {
      background: { type: 'color', color: '#1a1a1a' },
      padding: 3,
      borderRadius: 8,
      shadowBlur: 20,
      shadowOffsetX: 0,
      shadowOffsetY: 10,
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      borderWidth: 0,
      borderColor: '#ffffff',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 4,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      clickRippleEffect: false,
      clickRippleColor: 'rgba(255, 255, 255, 0.5)',
      clickRippleSize: 20,
      clickRippleDuration: 0.3,
      clickScaleEffect: true,
      clickScaleAmount: 0.9,
      clickScaleDuration: 0.2,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 2.0
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    aspectRatio: '16:9',
    frameStyles: {
      background: { type: 'gradient', gradientStart: '#1a1a2e', gradientEnd: '#16213e', gradientDirection: 'to bottom right' },
      padding: 8,
      borderRadius: 20,
      shadowBlur: 40,
      shadowOffsetX: 0,
      shadowOffsetY: 20,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 8,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      clickRippleEffect: true,
      clickRippleColor: 'rgba(255, 100, 100, 0.6)',
      clickRippleSize: 35,
      clickRippleDuration: 0.6,
      clickScaleEffect: true,
      clickScaleAmount: 0.75,
      clickScaleDuration: 0.3,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 2.5
  },
  short: {
    id: 'short',
    name: 'Shorts/TikTok',
    aspectRatio: '9:16',
    frameStyles: {
      background: { type: 'color', color: '#000000' },
      padding: 10,
      borderRadius: 24,
      shadowBlur: 50,
      shadowOffsetX: 0,
      shadowOffsetY: 25,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      borderWidth: 0,
      borderColor: '#ffffff',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 6,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      clickRippleEffect: true,
      clickRippleColor: 'rgba(255, 255, 255, 0.7)',
      clickRippleSize: 40,
      clickRippleDuration: 0.5,
      clickScaleEffect: true,
      clickScaleAmount: 0.8,
      clickScaleDuration: 0.3,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 2.0
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram Square',
    aspectRatio: '1:1',
    frameStyles: {
      background: { type: 'color', color: '#ffffff' },
      padding: 5,
      borderRadius: 12,
      shadowBlur: 30,
      shadowOffsetX: 0,
      shadowOffsetY: 15,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      borderWidth: 0,
      borderColor: '#ffffff',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 5,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      clickRippleEffect: false,
      clickRippleColor: 'rgba(0, 0, 0, 0.3)',
      clickRippleSize: 25,
      clickRippleDuration: 0.4,
      clickScaleEffect: false,
      clickScaleAmount: 1.0,
      clickScaleDuration: 0.2,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 1.8
  },
  clean: {
    id: 'clean',
    name: 'Clean',
    aspectRatio: '16:9',
    frameStyles: {
      background: { type: 'color', color: '#ffffff' },
      padding: 0,
      borderRadius: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowColor: 'rgba(0, 0, 0, 0)',
      borderWidth: 0,
      borderColor: '#ffffff',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowColor: 'rgba(0, 0, 0, 0)',
      clickRippleEffect: false,
      clickRippleColor: 'rgba(255, 255, 255, 0.5)',
      clickRippleSize: 20,
      clickRippleDuration: 0.3,
      clickScaleEffect: false,
      clickScaleAmount: 1.0,
      clickScaleDuration: 0.2,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 1.5
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    aspectRatio: '16:9',
    frameStyles: {
      background: { type: 'color', color: '#0d0d0d' },
      padding: 6,
      borderRadius: 12,
      shadowBlur: 40,
      shadowOffsetX: 0,
      shadowOffsetY: 20,
      shadowColor: 'rgba(0, 0, 0, 1)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.05)',
      vignetteEnabled: false,
      vignetteIntensity: 0,
      vignetteColor: 'black'
    },
    cursorStyles: {
      showCursor: true,
      shadowBlur: 8,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
      shadowColor: 'rgba(0, 0, 0, 0.6)',
      clickRippleEffect: true,
      clickRippleColor: 'rgba(255, 255, 255, 0.9)',
      clickRippleSize: 25,
      clickRippleDuration: 0.4,
      clickScaleEffect: true,
      clickScaleAmount: 0.85,
      clickScaleDuration: 0.25,
      clickScaleEasing: 'Balanced',
      cursorGlowEffect: false,
      cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
      cursorGlowSize: 30,
      cursorGlowIntensity: 1,
      cursorMotionTrail: false,
      motionTrailLength: 5,
      motionTrailOpacity: 0.5,
      cursorMotionBlur: false,
      motionBlurIntensity: 0.5,
      motionBlurThreshold: 15,
      swooshEffect: false,
      swooshIntensity: 0.5,
      swooshThreshold: 30,
      speedLines: false,
      speedLinesIntensity: 0.5,
      speedLinesThreshold: 50,
      clickExplosion: false,
      clickExplosionIntensity: 0.5,
      clickExplosionParticles: 10,
    },
    zoomLevel: 2.2
  }
}

/**
 * Load a preset by name or from a file
 */
export function loadPreset(presetName: string, presetFile?: string): PresetConfig {
  // First check built-in presets
  if (DEFAULT_PRESETS[presetName.toLowerCase()]) {
    logger.info(`Using built-in preset: ${presetName}`)
    return DEFAULT_PRESETS[presetName.toLowerCase()]
  }

  // Then check if it's a file path
  if (presetFile) {
    const filePath = path.resolve(presetFile)
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const preset = JSON.parse(content) as PresetConfig
        logger.info(`Loaded preset from file: ${filePath}`)
        return preset
      } catch (error) {
        logger.error(`Failed to load preset from ${filePath}:`, error)
        throw new Error(`Invalid preset file: ${filePath}`)
      }
    }
  }

  // Check if presetName is a file path
  const presetPath = path.resolve(presetName)
  if (fs.existsSync(presetPath)) {
    try {
      const content = fs.readFileSync(presetPath, 'utf-8')
      const preset = JSON.parse(content) as PresetConfig
      logger.info(`Loaded preset from file: ${presetPath}`)
      return preset
    } catch (error) {
      logger.error(`Failed to load preset from ${presetPath}:`, error)
      throw new Error(`Invalid preset file: ${presetPath}`)
    }
  }

  // Default to cinematic if not found
  logger.warn(`Preset "${presetName}" not found, using "cinematic"`)
  return DEFAULT_PRESETS.cinematic
}

/**
 * Get list of available preset names
 */
export function getAvailablePresets(): string[] {
  return Object.keys(DEFAULT_PRESETS)
}

/**
 * Save a preset to a JSON file
 */
export function savePreset(preset: PresetConfig, filePath: string): void {
  const content = JSON.stringify(preset, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')
  logger.info(`Preset saved to: ${filePath}`)
}

/**
 * Create a FrameStylesConfig from a preset
 */
export function createFrameStylesFromPreset(preset: PresetConfig): FrameStylesConfig {
  return preset.frameStyles
}

/**
 * Create a CursorStylesConfig from a preset
 */
export function createCursorStylesFromPreset(preset: PresetConfig): CursorStylesConfig {
  if (preset.cursorStyles) {
    return preset.cursorStyles
  }
  // Return a default cursor style config if preset doesn't have one
  return {
    showCursor: true,
    shadowBlur: 6,
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    shadowColor: 'rgba(0, 0, 0, 0.4)',
    clickRippleEffect: true,
    clickRippleColor: 'rgba(255, 255, 255, 0.8)',
    clickRippleSize: 30,
    clickRippleDuration: 0.5,
    clickScaleEffect: true,
    clickScaleAmount: 0.8,
    clickScaleDuration: 0.4,
    clickScaleEasing: 'Balanced',
    cursorGlowEffect: false,
    cursorGlowColor: 'rgba(59, 130, 246, 0.8)',
    cursorGlowSize: 30,
    cursorGlowIntensity: 1,
    cursorMotionTrail: false,
    motionTrailLength: 5,
    motionTrailOpacity: 0.5,
    cursorMotionBlur: false,
    motionBlurIntensity: 0.5,
    motionBlurThreshold: 15,
    swooshEffect: false,
    swooshIntensity: 0.5,
    swooshThreshold: 30,
    speedLines: false,
    speedLinesIntensity: 0.5,
    speedLinesThreshold: 50,
    clickExplosion: false,
    clickExplosionIntensity: 0.5,
    clickExplosionParticles: 10,
  }
}

/**
 * Get webcam styles from preset
 */
export function createWebcamStylesFromPreset(preset: PresetConfig): WebcamStylesConfig | undefined {
  return preset.webcamStyles
}

/**
 * Get webcam position from preset
 */
export function createWebcamPositionFromPreset(preset: PresetConfig): WebcamPositionConfig | undefined {
  return preset.webcamPosition
}

/**
 * Get aspect ratio from preset
 */
export function getAspectRatioFromPreset(preset: PresetConfig): AspectRatio {
  return preset.aspectRatio
}
