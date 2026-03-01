/**
 * AI Auto-Zoom Integration Module
 * 
 * Connects the AI content detection and cinematic camera systems
 * with the existing timeline zoom regions.
 */

import type { MetaDataItem, ZoomRegion } from '../types'
import { contentDetector, focusSelector, type ContentAnalysis } from './ai-content-detector'
import { 
  CinematicCameraController, 
  CAMERA_TEMPLATES, 
  createCinematicCamera,
  type CameraTemplate,
  type CameraMove
} from './cinematic-camera'

export interface AIZoomSettings {
  // Enable AI-powered zoom
  enabled: boolean
  
  // Template to use
  template: CameraTemplate
  
  // Sensitivity threshold (0-1)
  sensitivity: number
  
  // Minimum zoom level
  minZoom: number
  
  // Maximum zoom level
  maxZoom: number
  
  // Auto-generate zoom regions on load
  autoGenerate: boolean
  
  // Smart focus point selection
  smartFocus: boolean
  
  // Layout-aware zoom
  layoutAware: boolean
  
  // Micro-movements enabled
  microMovements: boolean
  
  // Predictive lookahead (seconds)
  lookahead: number
}

// Default AI zoom settings
export const DEFAULT_AI_ZOOM_SETTINGS: AIZoomSettings = {
  enabled: false,
  template: 'cinematic',
  sensitivity: 0.5,
  minZoom: 1.2,
  maxZoom: 2.5,
  autoGenerate: true,
  smartFocus: true,
  layoutAware: true,
  microMovements: true,
  lookahead: 0.5,
}

// AI Auto-Zoom Controller
export class AIAutoZoomController {
  private cameraController: CinematicCameraController
  private settings: AIZoomSettings
  private lastAnalysis: ContentAnalysis | null = null
  private analysisCache: Map<number, ContentAnalysis> = new Map()
  private isAnalyzing: boolean = false
  
  constructor(settings: Partial<AIZoomSettings> = {}) {
    this.settings = { ...DEFAULT_AI_ZOOM_SETTINGS, ...settings }
    this.cameraController = createCinematicCamera(this.settings.template)
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<AIZoomSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    
    if (newSettings.template) {
      this.cameraController.setTemplate(newSettings.template)
    }
  }

  /**
   * Get current settings
   */
  getSettings(): AIZoomSettings {
    return { ...this.settings }
  }

  /**
   * Analyze video content at a specific time
   */
  async analyzeAtTime(
    videoElement: HTMLVideoElement,
    currentTime: number
  ): Promise<ContentAnalysis | null> {
    // Check cache first
    const cachedKey = Math.floor(currentTime * 2) // Cache at 0.5s intervals
    if (this.analysisCache.has(cachedKey)) {
      return this.analysisCache.get(cachedKey)!
    }

    if (this.isAnalyzing) return this.lastAnalysis
    
    this.isAnalyzing = true
    
    try {
      const analysis = await contentDetector.analyzeFrame(videoElement, currentTime)
      this.lastAnalysis = analysis
      this.analysisCache.set(cachedKey, analysis)
      
      // Limit cache size
      if (this.analysisCache.size > 100) {
        const firstKey = this.analysisCache.keys().next().value
        if (firstKey !== undefined) {
          this.analysisCache.delete(firstKey)
        }
      }
      
      return analysis
    } catch (error) {
      console.error('AI Analysis error:', error)
      return null
    } finally {
      this.isAnalyzing = false
    }
  }

  /**
   * Get smart focus point based on current state
   */
  async getSmartFocusPoint(
    videoElement: HTMLVideoElement,
    currentTime: number,
    mousePosition: { x: number; y: number } | null,
    metadata: MetaDataItem[]
  ): Promise<{ x: number; y: number; zoom: number }> {
    // Get content analysis
    const analysis = await this.analyzeAtTime(videoElement, currentTime)
    
    if (this.settings.smartFocus && analysis) {
      // Use AI-powered focus selection
      const focusPoint = await focusSelector.getSmartFocusPoint(
        videoElement,
        currentTime,
        mousePosition,
        metadata,
        analysis.layout,
        analysis.density
      )
      
      // Calculate zoom based on content density and element sizes
      const zoom = this.calculateAdaptiveZoom(analysis)
      
      return {
        x: focusPoint.x,
        y: focusPoint.y,
        zoom,
      }
    }
    
    // Fallback to mouse-based or center
    if (mousePosition) {
      return {
        x: mousePosition.x / videoElement.videoWidth,
        y: mousePosition.y / videoElement.videoHeight,
        zoom: this.settings.minZoom,
      }
    }
    
    return { x: 0.5, y: 0.5, zoom: this.settings.minZoom }
  }

  /**
   * Calculate adaptive zoom based on content analysis
   */
  private calculateAdaptiveZoom(analysis: ContentAnalysis): number {
    const { baseZoom, zoomVariation } = CAMERA_TEMPLATES[this.settings.template]
    
    // Adjust based on content density
    let densityMultiplier = 1
    if (analysis.density > 0.5) {
      // High density - zoom in more to focus on specific elements
      densityMultiplier = 1 + (analysis.density - 0.5) * 0.5
    } else if (analysis.density < 0.2) {
      // Low density - zoom out to show more context
      densityMultiplier = 0.9
    }
    
    // Adjust based on element types
    let elementMultiplier = 1
    const hasHighPriority = analysis.regions.highPriority.length > 0
    const hasCode = analysis.elements.some(e => e.type === 'code')
    
    if (hasHighPriority) {
      elementMultiplier = 1.2 // Zoom in on interactive elements
    } else if (hasCode) {
      elementMultiplier = 1.1 // Slightly more zoom for code
    }
    
    const calculatedZoom = baseZoom * densityMultiplier * elementMultiplier
    
    // Clamp to configured range
    return Math.max(
      this.settings.minZoom,
      Math.min(this.settings.maxZoom, calculatedZoom)
    )
  }

  /**
   * Generate zoom regions automatically from video content
   */
  async generateZoomRegions(
    videoElement: HTMLVideoElement,
    duration: number,
    metadata: MetaDataItem[]
  ): Promise<ZoomRegion[]> {
    const regions: ZoomRegion[] = []
    const config = CAMERA_TEMPLATES[this.settings.template]
    
    // Sample points throughout the video
    const sampleInterval = 2 // seconds
    const samples: { time: number; focus: { x: number; y: number; zoom: number }; analysis: ContentAnalysis | null }[] = []
    
    for (let time = 0; time < duration; time += sampleInterval) {
      const focus = await this.getSmartFocusPoint(videoElement, time, null, metadata)
      const analysis = await this.analyzeAtTime(videoElement, time)
      samples.push({ time, focus, analysis })
    }
    
    // Group samples into coherent regions
    const groups = this.groupSamplesIntoRegions(samples, config.transitionDuration)
    
    let regionId = 0
    for (const group of groups) {
      const avgFocus = this.averageFocusPoints(group.map(s => s.focus))
      const avgZoom = group.reduce((sum, s) => sum + s.focus.zoom, 0) / group.length
      
      regions.push({
        id: `ai-zoom-${regionId++}`,
        type: 'zoom',
        startTime: group[0].time,
        duration: group[group.length - 1].time - group[0].time + sampleInterval,
        zoomLevel: Math.max(this.settings.minZoom, Math.min(this.settings.maxZoom, avgZoom)),
        easing: this.getEasingName(config.easingStyle),
        transitionDuration: config.transitionDuration,
        targetX: avgFocus.x,
        targetY: avgFocus.y,
        mode: 'auto',
        zIndex: regionId,
        blurEnabled: true,
        blurAmount: 2,
      })
    }
    
    return regions
  }

  /**
   * Group time samples into coherent zoom regions
   */
  private groupSamplesIntoRegions(
    samples: { time: number; focus: { x: number; y: number; zoom: number } }[],
    transitionDuration: number
  ): typeof samples[] {
    if (samples.length === 0) return []
    
    const groups: typeof samples[] = []
    let currentGroup: typeof samples = [samples[0]]
    
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]
      const curr = samples[i]
      
      // Check if this sample should start a new group
      const timeGap = curr.time - prev.time
      const focusChange = Math.sqrt(
        Math.pow(curr.focus.x - prev.focus.x, 2) +
        Math.pow(curr.focus.y - prev.focus.y, 2)
      )
      const zoomChange = Math.abs(curr.focus.zoom - prev.focus.zoom)
      
      // Start new region if:
      // - Time gap is too large
      // - Focus point changed significantly
      // - Zoom level changed significantly
      const shouldNewRegion = 
        timeGap > transitionDuration * 2 ||
        focusChange > 0.3 ||
        zoomChange > 0.5
      
      if (shouldNewRegion && currentGroup.length > 2) {
        groups.push(currentGroup)
        currentGroup = [curr]
      } else {
        currentGroup.push(curr)
      }
    }
    
    // Add final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }
    
    return groups
  }

  /**
   * Average multiple focus points
   */
  private averageFocusPoints(focuses: { x: number; y: number; zoom: number }[]): { x: number; y: number; zoom: number } {
    if (focuses.length === 0) {
      return { x: 0.5, y: 0.5, zoom: 1.5 }
    }
    
    const sum = focuses.reduce(
      (acc, f) => ({ x: acc.x + f.x, y: acc.y + f.y, zoom: acc.zoom + f.zoom }),
      { x: 0, y: 0, zoom: 0 }
    )
    
    return {
      x: sum.x / focuses.length,
      y: sum.y / focuses.length,
      zoom: sum.zoom / focuses.length,
    }
  }

  /**
   * Get easing name from style
   */
  private getEasingName(style: 'smooth' | 'dynamic' | 'sharp'): string {
    switch (style) {
      case 'smooth':
        return 'Smooth'
      case 'dynamic':
        return 'Dynamic'
      case 'sharp':
        return 'Balanced'
      default:
        return 'Smooth'
    }
  }

  /**
   * Get cinematic camera controller for real-time updates
   */
  getCameraController(): CinematicCameraController {
    return this.cameraController
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear()
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.cameraController.reset()
    this.clearCache()
    this.lastAnalysis = null
  }
}

// Singleton instance
export const aiAutoZoom = new AIAutoZoomController()

// Factory function for creating new instances
export function createAIAutoZoom(settings?: Partial<AIZoomSettings>): AIAutoZoomController {
  return new AIAutoZoomController(settings)
}

// Export available templates for UI
export { CAMERA_TEMPLATES }
export type { CameraTemplate }
