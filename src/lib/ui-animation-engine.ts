/**
 * UI Animation & Micro-motion System
 * 
 * Professional-grade UI animations including:
 * - Entry animations (fade, slide, scale)
 * - Stagger reveals
 * - Micro-interactions
 * - Hover effects
 */

import { EASING_MAP } from './easing'

// ============================================================
// TYPES
// ============================================================

export type AnimationType = 
  | 'fadeIn'
  | 'fadeOut'
  | 'slideIn'
  | 'slideOut'
  | 'scaleIn'
  | 'scaleOut'
  | 'blurIn'
  | 'blurOut'
  | 'reveal'
  | 'highlight'
  | 'pulse'
  | 'shake'
  | 'bounce'

export type SlideDirection = 'up' | 'down' | 'left' | 'right'
export type RevealDirection = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface AnimationConfig {
  type: AnimationType
  duration: number          // seconds
  delay: number            // seconds before starting
  easing: string
  // For slide animations
  direction?: SlideDirection
  distance?: number        // pixels to slide
  // For scale animations
  fromScale?: number
  toScale?: number
  // For blur animations
  fromBlur?: number
  toBlur?: number
  // For reveal animations
  revealDirection?: RevealDirection
  // For stagger
  staggerIndex?: number
  staggerDelay?: number
  // For repeat
  repeat?: number
  repeatDelay?: number
}

export interface UIElement {
  id: string
  type: string
  bounds: { x: number; y: number; width: number; height: number }
  visible: boolean
  opacity: number
  transform: {
    scale: number
    translateX: number
    translateY: number
    rotate: number
  }
  filter: {
    blur: number
    brightness: number
    contrast: number
  }
}

export interface AnimationState {
  isAnimating: boolean
  progress: number
  currentTime: number
}

// ============================================================
// DEFAULT ANIMATION CONFIGS
// ============================================================

export const DEFAULT_ANIMATIONS: Record<AnimationType, Omit<AnimationConfig, 'type'>> = {
  fadeIn: {
    duration: 0.4,
    delay: 0,
    easing: 'Smooth',
    fromScale: 0.96,
    toScale: 1,
  },
  
  fadeOut: {
    duration: 0.3,
    delay: 0,
    easing: 'Balanced',
    fromScale: 1,
    toScale: 0.96,
  },
  
  slideIn: {
    duration: 0.5,
    delay: 0,
    easing: 'Smooth',
    direction: 'up',
    distance: 30,
  },
  
  slideOut: {
    duration: 0.4,
    delay: 0,
    easing: 'Balanced',
    direction: 'down',
    distance: 30,
  },
  
  scaleIn: {
    duration: 0.4,
    delay: 0,
    easing: 'Bouncy Spring',
    fromScale: 0.8,
    toScale: 1,
  },
  
  scaleOut: {
    duration: 0.3,
    delay: 0,
    easing: 'Dynamic',
    fromScale: 1,
    toScale: 0.9,
  },
  
  blurIn: {
    duration: 0.5,
    delay: 0,
    easing: 'Smooth',
    fromBlur: 10,
    toBlur: 0,
  },
  
  blurOut: {
    duration: 0.4,
    delay: 0,
    easing: 'Balanced',
    fromBlur: 0,
    toBlur: 10,
  },
  
  reveal: {
    duration: 0.6,
    delay: 0,
    easing: 'Smooth',
    revealDirection: 'top',
  },
  
  highlight: {
    duration: 0.3,
    delay: 0,
    easing: 'Gentle Spring',
  },
  
  pulse: {
    duration: 0.2,
    delay: 0,
    easing: 'Gentle Spring',
    fromScale: 1,
    toScale: 1.05,
    repeat: 2,
  },
  
  shake: {
    duration: 0.5,
    delay: 0,
    easing: 'Dynamic',
  },
  
  bounce: {
    duration: 0.6,
    delay: 0,
    easing: 'Bouncy Spring',
  },
}

// ============================================================
// PRESET ANIMATION SEQUENCES
// ============================================================

export const ANIMATION_PRESETS = {
  cardEntry: [
    { type: 'fadeIn', duration: 0.3, easing: 'Smooth' },
    { type: 'slideIn', duration: 0.4, easing: 'Smooth', direction: 'up', distance: 20 },
  ],
  
  buttonPress: [
    { type: 'scaleIn', duration: 0.1, easing: 'Dynamic', fromScale: 1, toScale: 0.95 },
    { type: 'scaleOut', duration: 0.15, easing: 'Bouncy Spring', fromScale: 0.95, toScale: 1 },
  ],
  
  loading: [
    { type: 'pulse', duration: 0.6, easing: 'Gentle Spring', repeat: 3 },
  ],
  
  success: [
    { type: 'scaleIn', duration: 0.3, easing: 'Bouncy Spring', fromScale: 0.5, toScale: 1 },
    { type: 'fadeIn', duration: 0.2, easing: 'Smooth' },
  ],
  
  error: [
    { type: 'shake', duration: 0.5, easing: 'Dynamic' },
  ],
  
  staggerReveal: 'stagger', // Special marker for stagger animation
}

// ============================================================
// ANIMATION ENGINE
// ============================================================

export class UIAnimationEngine {
  private animations: Map<string, AnimationConfig[]> = new Map()
  private activeAnimations: Map<string, number> = new Map() // elementId -> startTime
  private elementStates: Map<string, UIElement> = new Map()
  private isPlaying: boolean = false
  private startTime: number = 0

  constructor() {
    // Initialize with default states
  }

  /**
   * Register an element for animation
   */
  registerElement(element: UIElement): void {
    this.elementStates.set(element.id, { ...element })
  }

  /**
   * Remove an element
   */
  unregisterElement(elementId: string): void {
    this.elementStates.delete(elementId)
    this.animations.delete(elementId)
    this.activeAnimations.delete(elementId)
  }

  /**
   * Add animation to an element
   */
  addAnimation(elementId: string, animation: AnimationConfig | AnimationConfig[]): void {
    const existing = this.animations.get(elementId) || []
    const anims = Array.isArray(animation) ? animation : [animation]
    this.animations.set(elementId, [...existing, ...anims])
  }

  /**
   * Add stagger animation to multiple elements
   */
  addStaggerAnimation(
    elementIds: string[],
    animation: Omit<AnimationConfig, 'staggerIndex' | 'staggerDelay'>,
    staggerDelay: number = 0.08
  ): void {
    elementIds.forEach((id, index) => {
      this.addAnimation(id, {
        ...animation,
        staggerIndex: index,
        staggerDelay,
        delay: animation.delay + (index * staggerDelay),
      })
    })
  }

  /**
   * Start playing animations
   */
  play(): void {
    this.isPlaying = true
    this.startTime = performance.now()
    
    // Start all animations
    for (const [elementId] of this.animations) {
      this.activeAnimations.set(elementId, this.startTime)
    }
  }

  /**
   * Pause animations
   */
  pause(): void {
    this.isPlaying = false
  }

  /**
   * Stop and reset animations
   */
  stop(): void {
    this.isPlaying = false
    this.activeAnimations.clear()
  }

  /**
   * Reset all animations
   */
  reset(): void {
    this.stop()
    // Reset all elements to original state
    for (const [id, element] of this.elementStates) {
      this.elementStates.set(id, { ...element })
    }
  }

  /**
   * Process animations - call this in animation loop
   * Returns the current state of all animated elements
   */
  process(currentTime: number): Map<string, UIElement> {
    if (!this.isPlaying) {
      return new Map(this.elementStates)
    }

    const elapsed = currentTime - this.startTime

    // Process each element's animations
    for (const [elementId, animations] of this.animations) {
      const element = this.elementStates.get(elementId)
      if (!element) continue

      const startTime = this.activeAnimations.get(elementId) || this.startTime
      const animElapsed = elapsed

      let currentState = { ...element }

      for (const anim of animations) {
        const animStart = anim.delay * 1000 // Convert to ms
        const animDuration = anim.duration * 1000

        if (animElapsed >= animStart && animElapsed < animStart + animDuration) {
          // Animation is active
          const progress = (animElapsed - animStart) / animDuration
          const easedProgress = EASING_MAP[anim.easing as keyof typeof EASING_MAP]?.(progress) || progress
          
          // Apply animation
          currentState = this.applyAnimation(currentState, anim, easedProgress)
          currentState.opacity = this.applyFadeAnimation(currentState.opacity, anim, easedProgress)
        } else if (animElapsed >= animStart + animDuration) {
          // Animation complete - apply final state
          currentState = this.applyAnimation(currentState, anim, 1)
          currentState.opacity = this.applyFadeAnimation(currentState.opacity, anim, 1)
        }
      }

      this.elementStates.set(elementId, currentState)
    }

    return new Map(this.elementStates)
  }

  /**
   * Apply transform animations
   */
  private applyAnimation(
    element: UIElement,
    anim: AnimationConfig,
    progress: number
  ): UIElement {
    const result = { ...element, transform: { ...element.transform } }

    switch (anim.type) {
      case 'fadeIn':
      case 'scaleIn':
        result.transform.scale = this.lerp(
          anim.fromScale ?? 0.96,
          anim.toScale ?? 1,
          progress
        )
        break

      case 'fadeOut':
      case 'scaleOut':
        result.transform.scale = this.lerp(
          anim.fromScale ?? 1,
          anim.toScale ?? 0.96,
          progress
        )
        break

      case 'slideIn':
      case 'slideOut':
        const distance = anim.distance ?? 30
        const direction = anim.direction ?? 'up'
        
        switch (direction) {
          case 'up':
            result.transform.translateY = this.lerp(distance, 0, progress)
            break
          case 'down':
            result.transform.translateY = this.lerp(-distance, 0, progress)
            break
          case 'left':
            result.transform.translateX = this.lerp(distance, 0, progress)
            break
          case 'right':
            result.transform.translateX = this.lerp(-distance, 0, progress)
            break
        }
        break

      case 'blurIn':
      case 'blurOut':
        result.filter.blur = this.lerp(
          anim.fromBlur ?? 10,
          anim.toBlur ?? 0,
          progress
        )
        break

      case 'pulse':
        // Handle repeat
        const repeatProgress = (anim.repeat ?? 1) > 1 
          ? this.getRepeatProgress(progress, anim.repeat ?? 1)
          : progress
        result.transform.scale = this.lerp(
          anim.fromScale ?? 1,
          anim.toScale ?? 1.05,
          Math.sin(repeatProgress * Math.PI)
        )
        break

      case 'shake':
        const shakeAmount = Math.sin(progress * Math.PI * 6) * (1 - progress) * 10
        result.transform.translateX = shakeAmount
        break

      case 'bounce':
        const bounceProgress = this.getBounceProgress(progress)
        result.transform.scale = 1 + Math.sin(bounceProgress * Math.PI * 3) * 0.1 * (1 - progress)
        break
    }

    return result
  }

  /**
   * Apply fade animation
   */
  private applyFadeAnimation(
    opacity: number,
    anim: AnimationConfig,
    progress: number
  ): number {
    switch (anim.type) {
      case 'fadeIn':
        return this.lerp(0, 1, progress)
      case 'fadeOut':
        return this.lerp(1, 0, progress)
      default:
        return opacity
    }
  }

  /**
   * Linear interpolation
   */
  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
  }

  /**
   * Get progress with repeat
   */
  private getRepeatProgress(progress: number, repeats: number): number {
    return (progress * repeats) % 1
  }

  /**
   * Get bounce progress
   */
  private getBounceProgress(progress: number): number {
    // Decaying sine wave for bounce effect
    return progress < 0.5
      ? progress * 2
      : 1 + Math.sin((progress - 0.5) * Math.PI * 2) * (1 - progress) * 0.5
  }

  /**
   * Get element state
   */
  getElementState(elementId: string): UIElement | undefined {
    return this.elementStates.get(elementId)
  }

  /**
   * Get all element states
   */
  getAllStates(): Map<string, UIElement> {
    return new Map(this.elementStates)
  }

  /**
   * Check if all animations are complete
   */
  isComplete(): boolean {
    if (!this.isPlaying) return true
    
    for (const [_, animations] of this.animations) {
      for (const anim of animations) {
        const elapsed = performance.now() - this.startTime
        const animEnd = (anim.delay + anim.duration) * 1000
        if (elapsed < animEnd) return false
      }
    }
    return true
  }

  /**
   * Serialize animations to JSON
   */
  toJSON(): string {
    const data: Record<string, AnimationConfig[]> = {}
    for (const [id, anims] of this.animations) {
      data[id] = anims
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * Load animations from JSON
   */
  static fromJSON(json: string): UIAnimationEngine {
    const engine = new UIAnimationEngine()
    const data = JSON.parse(json)
    
    for (const [id, anims] of Object.entries(data)) {
      engine.animations.set(id, anims as AnimationConfig[])
    }
    
    return engine
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

export function createUIAnimationEngine(): UIAnimationEngine {
  return new UIAnimationEngine()
}

export function createAnimation(
  type: AnimationType,
  overrides?: Partial<AnimationConfig>
): AnimationConfig {
  return {
    ...DEFAULT_ANIMATIONS[type],
    type,
    ...overrides,
  }
}

export function createStaggerAnimation(
  type: AnimationType,
  count: number,
  baseDelay: number = 0,
  staggerDelay: number = 0.08
): AnimationConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    ...DEFAULT_ANIMATIONS[type],
    type,
    delay: baseDelay + (i * staggerDelay),
    staggerIndex: i,
    staggerDelay,
  }))
}

// ============================================================
// PRESET CREATORS
// ============================================================

export function createCardEntryAnimations(
  cardIds: string[],
  options?: { staggerDelay?: number; startDelay?: number }
): Map<string, AnimationConfig[]> {
  const animations = new Map<string, AnimationConfig[]>()
  const staggerDelay = options?.staggerDelay ?? 0.1
  const startDelay = options?.startDelay ?? 0

  cardIds.forEach((id, index) => {
    const delay = startDelay + (index * staggerDelay)
    
    animations.set(id, [
      createAnimation('fadeIn', { delay, duration: 0.3 }),
      createAnimation('slideIn', { 
        delay, 
        duration: 0.4, 
        direction: 'up', 
        distance: 20 
      }),
    ])
  })

  return animations
}

export function createButtonPressAnimation(): AnimationConfig[] {
  return [
    createAnimation('scaleIn', { duration: 0.1, fromScale: 1, toScale: 0.95 }),
    createAnimation('scaleOut', { duration: 0.15, fromScale: 0.95, toScale: 1 }),
  ]
}
