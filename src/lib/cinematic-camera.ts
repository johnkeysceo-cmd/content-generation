/**
 * Cinematic Camera System
 * 
 * Provides advanced camera movements with Bezier curve easing
 * and multiple zoom templates for professional-quality videos.
 */

import { EASING_MAP } from './easing'

export type CameraTemplate = 
  | 'cinematic' 
  | 'documentary' 
  | 'tech-demo' 
  | 'minimal' 
  | 'dynamic'

export interface CameraMove {
  // Target position (normalized 0-1)
  targetX: number
  targetY: number
  
  // Zoom level for this move
  zoomLevel: number
  
  // Duration in seconds
  duration: number
  
  // Easing function name
  easing: string
  
  // Optional rotation (degrees)
  rotation?: number
  
  // Optional: delay before this move starts
  delay?: number
  
  // Hold duration at this position
  holdDuration?: number
}

export interface CameraTemplateConfig {
  name: string
  description: string
  // Base zoom level
  baseZoom: number
  // Zoom variations during the sequence
  zoomVariation: number
  // Transition duration between points
  transitionDuration: number
  // Easing style
  easingStyle: 'smooth' | 'dynamic' | 'sharp'
  // Enable rotation during moves
  enableRotation: boolean
  // Enable micro-movements for natural feel
  enableMicroMovements: boolean
  // Hold time between movements
  holdTime: number
  // Lookahead time for predictive camera
  lookaheadTime: number
}

// Template configurations
export const CAMERA_TEMPLATES: Record<CameraTemplate, CameraTemplateConfig> = {
  cinematic: {
    name: 'Cinematic',
    description: 'Smooth, elegant camera movements perfect for storytelling',
    baseZoom: 1.8,
    zoomVariation: 0.4,
    transitionDuration: 1.2,
    easingStyle: 'smooth',
    enableRotation: true,
    enableMicroMovements: true,
    holdTime: 0.8,
    lookaheadTime: 0.5,
  },
  
  documentary: {
    name: 'Documentary',
    description: 'Natural, observational camera that follows action organically',
    baseZoom: 1.5,
    zoomVariation: 0.3,
    transitionDuration: 0.8,
    easingStyle: 'smooth',
    enableRotation: false,
    enableMicroMovements: true,
    holdTime: 0.5,
    lookaheadTime: 0.8,
  },
  
  'tech-demo': {
    name: 'Tech Demo',
    description: 'Sharp, precise movements ideal for software demonstrations',
    baseZoom: 2.0,
    zoomVariation: 0.5,
    transitionDuration: 0.6,
    easingStyle: 'sharp',
    enableRotation: false,
    enableMicroMovements: false,
    holdTime: 0.3,
    lookaheadTime: 0.3,
  },
  
  minimal: {
    name: 'Minimal',
    description: 'Subtle movements that keep focus on the content',
    baseZoom: 1.3,
    zoomVariation: 0.2,
    transitionDuration: 1.5,
    easingStyle: 'smooth',
    enableRotation: false,
    enableMicroMovements: false,
    holdTime: 1.0,
    lookaheadTime: 0.2,
  },
  
  dynamic: {
    name: 'Dynamic',
    description: 'Energetic movements with dramatic zoom transitions',
    baseZoom: 2.2,
    zoomVariation: 0.6,
    transitionDuration: 0.5,
    easingStyle: 'dynamic',
    enableRotation: true,
    enableMicroMovements: true,
    holdTime: 0.2,
    lookaheadTime: 0.4,
  },
}

// Bezier curve easing functions
interface BezierCurve {
  x1: number
  y1: number
  x2: number
  y2: number
}

// Predefined Bezier curves for different feels
const BEZIER_CURVES: Record<string, BezierCurve> = {
  // Smooth cinematic - gentle acceleration and deceleration
  cinematic: { x1: 0.4, y1: 0.0, x2: 0.2, y2: 1.0 },
  
  // Documentary - very smooth, almost linear
  documentary: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 },
  
  // Tech demo - snappy, quick transitions
  techdemo: { x1: 0.0, y1: 0.0, x2: 0.2, y2: 1.0 },
  
  // Dynamic - bouncy overshoot
  dynamic: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1.0 },
  
  // Minimal - very slow, elegant
  minimal: { x1: 0.42, y1: 0.0, x2: 0.58, y2: 1.0 },
}

/**
 * Cubic Bezier easing implementation
 */
function cubicBezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  // Newton's method for finding the parameter t for a given x
  let x = t
  for (let i = 0; i < 8; i++) {
    const currentX = bezierX(x, p1x, p2x)
    const currentSlope = bezierSlope(x, p1x, p2x)
    if (Math.abs(currentSlope) < 1e-7) break
    x -= (currentX - t) / currentSlope
  }
  return bezierY(x, p1y, p2y)
}

function bezierX(t: number, p1x: number, p2x: number): number {
  const t2 = t * t
  const t3 = t2 * t
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  return mt3 * 0 + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t3 * 1
}

function bezierSlope(t: number, p1x: number, p2x: number): number {
  const t2 = t * t
  const mt = 1 - t
  const mt2 = mt * mt
  return 3 * mt2 * p1x + 6 * mt * t * (p2x - p1x) + 3 * t2 * (1 - p2x)
}

function bezierY(t: number, p1y: number, p2y: number): number {
  const t2 = t * t
  const t3 = t2 * t
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  return mt3 * 0 + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t3 * 1
}

/**
 * Get easing function from template style
 */
function getTemplateEasing(style: CameraTemplateConfig['easingStyle']): (t: number) => number {
  switch (style) {
    case 'smooth':
      return cubicBezier.bind(null, 0.42, 0.0, 0.58, 1.0)
    case 'sharp':
      return cubicBezier.bind(null, 0.0, 0.0, 0.2, 1.0)
    case 'dynamic':
      return cubicBezier.bind(null, 0.34, 1.56, 0.64, 1.0)
    default:
      return (t) => t
  }
}

/**
 * Micro-movement generator for natural feel
 */
function generateMicroMovements(
  duration: number,
  baseX: number,
  baseY: number,
  intensity: number = 0.02
): { x: number; y: number }[] {
  const movements: { x: number; y: number }[] = []
  const numPoints = Math.floor(duration * 30) // 30 points per second
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    // Combine multiple sine waves for organic movement
    const offsetX = 
      Math.sin(t * Math.PI * 4) * intensity +
      Math.sin(t * Math.PI * 7) * intensity * 0.5 +
      Math.sin(t * Math.PI * 11) * intensity * 0.25
      
    const offsetY = 
      Math.cos(t * Math.PI * 3) * intensity +
      Math.cos(t * Math.PI * 6) * intensity * 0.5 +
      Math.cos(t * Math.PI * 9) * intensity * 0.25
    
    movements.push({
      x: baseX + offsetX,
      y: baseY + offsetY,
    })
  }
  
  return movements
}

/**
 * Camera state for animation
 */
interface CameraState {
  x: number
  y: number
  zoom: number
  rotation: number
}

/**
 * Cinematic Camera Controller
 * Generates smooth camera movements based on templates
 */
export class CinematicCameraController {
  private template: CameraTemplate
  private config: CameraTemplateConfig
  private currentState: CameraState
  private keyframes: CameraMove[]
  private currentKeyframeIndex: number
  private isAnimating: boolean
  private microMovements: { x: number; y: number }[] | null
  private microMovementIndex: number
  
  constructor(template: CameraTemplate = 'cinematic') {
    this.template = template
    this.config = CAMERA_TEMPLATES[template]
    this.currentState = { x: 0.5, y: 0.5, zoom: 1, rotation: 0 }
    this.keyframes = []
    this.currentKeyframeIndex = 0
    this.isAnimating = false
    this.microMovements = null
    this.microMovementIndex = 0
  }

  /**
   * Generate camera sequence from mouse metadata
   */
  generateFromMetadata(
    metadata: { timestamp: number; x: number; y: number; type: string }[],
    duration: number
  ): CameraMove[] {
    const moves: CameraMove[] = []
    const config = this.config
    
    // Filter significant mouse events (clicks and moves beyond threshold)
    const significantEvents = this.filterSignificantEvents(metadata)
    
    if (significantEvents.length === 0) {
      // Default: slow pan across the screen
      return this.generateDefaultSequence(duration)
    }
    
    // Group events into camera moves
    const eventGroups = this.groupEventsIntoMoves(significantEvents, config)
    
    for (const group of eventGroups) {
      // Calculate average position
      const avgX = group.events.reduce((sum, e) => sum + e.x, 0) / group.events.length
      const avgY = group.events.reduce((sum, e) => sum + e.y, 0) / group.events.length
      
      // Add some variation to zoom based on activity
      const activityLevel = group.events.length / 10 // Normalize
      const zoomLevel = config.baseZoom + (Math.random() - 0.5) * config.zoomVariation * Math.min(1, activityLevel)
      
      moves.push({
        targetX: avgX,
        targetY: avgY,
        zoomLevel: Math.max(1.2, Math.min(3.0, zoomLevel)),
        duration: group.duration,
        easing: this.getEasingForStyle(config.easingStyle),
        delay: group.startTime,
        holdDuration: config.holdTime,
      })
    }
    
    return moves
  }

  /**
   * Generate default camera sequence when no metadata
   */
  private generateDefaultSequence(duration: number): CameraMove[] {
    const moves: CameraMove[] = []
    const config = this.config
    
    // Slow sweep across the screen
    const numMoves = Math.max(3, Math.floor(duration / 5))
    const moveDuration = duration / numMoves
    
    for (let i = 0; i < numMoves; i++) {
      const t = i / numMoves
      
      moves.push({
        targetX: 0.3 + Math.sin(t * Math.PI * 2) * 0.3,
        targetY: 0.3 + Math.cos(t * Math.PI * 1.5) * 0.2,
        zoomLevel: config.baseZoom * (0.9 + Math.sin(t * Math.PI * 3) * 0.1),
        duration: moveDuration,
        easing: this.getEasingForStyle(config.easingStyle),
        delay: i * moveDuration,
        holdDuration: config.holdTime,
      })
    }
    
    return moves
  }

  /**
   * Filter metadata to significant events
   */
  private filterSignificantEvents(
    metadata: { timestamp: number; x: number; y: number; type: string }[]
  ): { timestamp: number; x: number; y: number; type: string }[] {
    const significant: typeof metadata = []
    let lastX = 0, lastY = 0
    const movementThreshold = 50 // pixels
    
    for (const event of metadata) {
      const isClick = event.type === 'click'
      const movedSignificantly = 
        Math.abs(event.x - lastX) > movementThreshold ||
        Math.abs(event.y - lastY) > movementThreshold
      
      if (isClick || movedSignificantly) {
        significant.push(event)
        lastX = event.x
        lastY = event.y
      }
    }
    
    return significant
  }

  /**
   * Group events into coherent camera moves
   */
  private groupEventsIntoMoves(
    events: { timestamp: number; x: number; y: number; type: string }[],
    config: CameraTemplateConfig
  ): { startTime: number; duration: number; events: typeof events }[] {
    const groups: { startTime: number; duration: number; events: typeof events }[] = []
    
    if (events.length === 0) return groups
    
    let currentGroup: typeof groups[0] = {
      startTime: events[0].timestamp,
      duration: 0,
      events: [events[0]],
    }
    
    const gapThreshold = config.holdTime * 2 // Time gap to start new group
    
    for (let i = 1; i < events.length; i++) {
      const gap = events[i].timestamp - events[i - 1].timestamp
      
      if (gap > gapThreshold) {
        // Start new group
        currentGroup.duration = events[i - 1].timestamp - currentGroup.startTime
        groups.push(currentGroup)
        currentGroup = {
          startTime: events[i].timestamp,
          duration: 0,
          events: [events[i]],
        }
      } else {
        currentGroup.events.push(events[i])
      }
    }
    
    // Add last group
    if (currentGroup.events.length > 0) {
      const lastEvent = events[events.length - 1]
      currentGroup.duration = lastEvent.timestamp - currentGroup.startTime
      groups.push(currentGroup)
    }
    
    return groups
  }

  /**
   * Get easing function name for style
   */
  private getEasingForStyle(style: CameraTemplateConfig['easingStyle']): string {
    switch (style) {
      case 'smooth':
        return 'Smooth'
      case 'sharp':
        return 'Dynamic'
      case 'dynamic':
        return 'Bouncy Spring'
      default:
        return 'Balanced'
    }
  }

  /**
   * Set template
   */
  setTemplate(template: CameraTemplate): void {
    this.template = template
    this.config = CAMERA_TEMPLATES[template]
  }

  /**
   * Get current camera state at a given time
   */
  getStateAtTime(
    time: number,
    metadata: { timestamp: number; x: number; y: number; type: string }[],
    videoWidth: number,
    videoHeight: number
  ): CameraState {
    const config = this.config
    
    // Get current target from metadata (with lookahead)
    const lookaheadTime = config.lookaheadTime
    const target = this.getTargetAtTime(time, metadata, videoWidth, videoHeight, lookaheadTime)
    
    // Calculate zoom with variation
    const activityLevel = this.getActivityLevelAtTime(time, metadata)
    const targetZoom = config.baseZoom + (activityLevel - 0.5) * config.zoomVariation
    
    // Smooth interpolation to target
    const smoothing = 0.15
    this.currentState.x += (target.x - this.currentState.x) * smoothing
    this.currentState.y += (target.y - this.currentState.y) * smoothing
    this.currentState.zoom += (targetZoom - this.currentState.zoom) * smoothing
    
    // Apply micro movements if enabled
    if (config.enableMicroMovements) {
      const microOffset = this.getMicroMovementOffset(time)
      this.currentState.x += microOffset.x
      this.currentState.y += microOffset.y
    }
    
    // Calculate rotation based on movement direction
    if (config.enableRotation) {
      const prevTarget = this.getTargetAtTime(
        Math.max(0, time - 0.1),
        metadata,
        videoWidth,
        videoHeight,
        0
      )
      const dx = target.x - prevTarget.x
      const dy = target.y - prevTarget.y
      const movementAngle = Math.atan2(dy, dx) * (180 / Math.PI)
      
      // Smooth rotation towards movement direction
      const targetRotation = Math.abs(dx) + Math.abs(dy) > 0.01 ? movementAngle * 0.05 : 0
      this.currentState.rotation += (targetRotation - this.currentState.rotation) * 0.1
    }
    
    return { ...this.currentState }
  }

  /**
   * Get target position at specific time
   */
  private getTargetAtTime(
    time: number,
    metadata: { timestamp: number; x: number; y: number; type: string }[],
    videoWidth: number,
    videoHeight: number,
    lookaheadTime: number
  ): { x: number; y: number } {
    // Find events around the target time
    const targetTime = time + lookaheadTime
    const relevantEvents = metadata.filter(
      e => e.timestamp <= targetTime && e.timestamp >= targetTime - 2
    )
    
    if (relevantEvents.length === 0) {
      // Default to center with slight drift
      return {
        x: 0.5 + Math.sin(time * 0.5) * 0.1,
        y: 0.5 + Math.cos(time * 0.3) * 0.1,
      }
    }
    
    // Weight recent events more heavily
    let totalWeight = 0
    let weightedX = 0
    let weightedY = 0
    
    for (const event of relevantEvents) {
      const age = targetTime - event.timestamp
      const weight = Math.exp(-age * 2) // Exponential decay
      
      weightedX += (event.x / videoWidth) * weight
      weightedY += (event.y / videoHeight) * weight
      totalWeight += weight
    }
    
    if (totalWeight > 0) {
      return {
        x: weightedX / totalWeight,
        y: weightedY / totalWeight,
      }
    }
    
    return { x: 0.5, y: 0.5 }
  }

  /**
   * Get activity level at specific time
   */
  private getActivityLevelAtTime(
    time: number,
    metadata: { timestamp: number; x: number; y: number; type: string }[]
  ): number {
    const windowSize = 1.0 // 1 second window
    const recentEvents = metadata.filter(
      e => e.timestamp >= time - windowSize && e.timestamp <= time
    )
    
    if (recentEvents.length === 0) return 0.3 // Low activity baseline
    
    // Calculate movement in this window
    let totalMovement = 0
    for (let i = 1; i < recentEvents.length; i++) {
      const dx = recentEvents[i].x - recentEvents[i - 1].x
      const dy = recentEvents[i].y - recentEvents[i - 1].y
      totalMovement += Math.sqrt(dx * dx + dy * dy)
    }
    
    // Normalize to 0-1 range
    return Math.min(1, totalMovement / 500)
  }

  /**
   * Get micro movement offset
   */
  private getMicroMovementOffset(time: number): { x: number; y: number } {
    // Multiple frequencies for organic movement
    const intensity = 0.015
    
    return {
      x: Math.sin(time * Math.PI * 4) * intensity +
         Math.sin(time * Math.PI * 7.3) * intensity * 0.5 +
         Math.sin(time * Math.PI * 11.7) * intensity * 0.25,
      y: Math.cos(time * Math.PI * 3.7) * intensity +
         Math.cos(time * Math.PI * 6.1) * intensity * 0.5 +
         Math.cos(time * Math.PI * 9.3) * intensity * 0.25,
    }
  }

  /**
   * Generate smooth Bezier curve path between two points
   */
  generateBezierPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number,
    template: string = 'cinematic'
  ): { x: number; y: number }[] {
    const bezier = BEZIER_CURVES[template] || BEZIER_CURVES.cinematic
    const numPoints = Math.floor(duration * 60) // 60 fps
    const path: { x: number; y: number }[] = []
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints
      const easedT = cubicBezier(t, bezier.x1, bezier.y1, bezier.x2, bezier.y2)
      
      path.push({
        x: startX + (endX - startX) * easedT,
        y: startY + (endY - startY) * easedT,
      })
    }
    
    return path
  }

  /**
   * Create camera move with Bezier easing
   */
  createCameraMove(
    startState: CameraState,
    endState: CameraState,
    duration: number,
    template: string = 'cinematic'
  ): (time: number) => CameraState {
    const path = this.generateBezierPath(
      startState.x,
      startState.y,
      endState.x,
      endState.y,
      duration,
      template
    )
    
    return (time: number) => {
      const index = Math.min(
        Math.floor(time / duration * path.length),
        path.length - 1
      )
      
      const progress = time / duration
      
      return {
        x: path[index]?.x ?? startState.x,
        y: path[index]?.y ?? startState.y,
        zoom: startState.zoom + (endState.zoom - startState.zoom) * progress,
        rotation: startState.rotation + (endState.rotation - startState.rotation) * progress,
      }
    }
  }

  /**
   * Get template configuration
   */
  getConfig(): CameraTemplateConfig {
    return { ...this.config }
  }

  /**
   * Reset camera state
   */
  reset(): void {
    this.currentState = { x: 0.5, y: 0.5, zoom: 1, rotation: 0 }
    this.currentKeyframeIndex = 0
    this.microMovements = null
    this.microMovementIndex = 0
  }
}

// Export singleton with default cinematic template
export const cinematicCamera = new CinematicCameraController('cinematic')

// Export factory function
export function createCinematicCamera(template: CameraTemplate = 'cinematic'): CinematicCameraController {
  return new CinematicCameraController(template)
}

// Export all templates for UI
export function getAvailableTemplates(): { id: CameraTemplate; name: string; description: string }[] {
  return Object.entries(CAMERA_TEMPLATES).map(([id, config]) => ({
    id: id as CameraTemplate,
    name: config.name,
    description: config.description,
  }))
}
