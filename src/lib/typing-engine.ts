/**
 * Typing Simulation Engine
 * 
 * Human-like typing cadence simulation for professional demo videos.
 * Creates realistic typing animations with natural delays and cursor effects.
 */

import { EASING_MAP } from './easing'

// ============================================================
// TYPES
// ============================================================

export interface TypingConfig {
  // Timing (in milliseconds)
  letterDelay: number          // Average delay between letters (40-70ms typical)
  letterDelayVariance: number // Random variance in letter delay
  spaceDelay: number           // Delay for spaces (120ms typical)
  punctuationDelay: number    // Extra delay for punctuation (250ms)
  enterDelay: number          // Delay before pressing enter (500ms)
  
  // Cursor
  cursorBlinkRate: number      // Cursor blink rate in ms (530ms typical)
  cursorBlinkVariance: number // Variance in blink rate
  
  // Text properties
  caseStyle: 'lower' | 'upper' | 'preserve'
  includeErrors: boolean      // Include typing errors and corrections
  errorRate: number           // Probability of error (0-1)
  correctionDelay: number     // Delay before correcting errors
  
  // Output
  generateEvents: boolean      // Generate cursor position events
  eventGranularity: number    // How often to generate events (ms)
}

export interface TypingEvent {
  type: 'keypress' | 'backspace' | 'pause' | 'submit'
  timestamp: number           // Relative timestamp in ms
  character?: string
  text?: string               // Current text state after this event
  cursorPosition?: number
}

export interface TypingState {
  currentText: string
  cursorPosition: number
  isTyping: boolean
  isPaused: boolean
  events: TypingEvent[]
}

// ============================================================
// DEFAULT CONFIGURATIONS
// ============================================================

export const DEFAULT_TYPING_CONFIG: TypingConfig = {
  letterDelay: 55,
  letterDelayVariance: 15,
  spaceDelay: 120,
  punctuationDelay: 250,
  enterDelay: 500,
  cursorBlinkRate: 530,
  cursorBlinkVariance: 50,
  caseStyle: 'preserve',
  includeErrors: false,
  errorRate: 0.02,
  correctionDelay: 300,
  generateEvents: true,
  eventGranularity: 16,
}

export const TYPING_PRESETS: Record<string, TypingConfig> = {
  slow: {
    ...DEFAULT_TYPING_CONFIG,
    letterDelay: 100,
    letterDelayVariance: 20,
    spaceDelay: 200,
    punctuationDelay: 400,
    enterDelay: 800,
  },
  
  fast: {
    ...DEFAULT_TYPING_CONFIG,
    letterDelay: 35,
    letterDelayVariance: 10,
    spaceDelay: 80,
    punctuationDelay: 150,
    enterDelay: 300,
  },
  
  natural: {
    ...DEFAULT_TYPING_CONFIG,
    letterDelay: 60,
    letterDelayVariance: 25,
    spaceDelay: 140,
    punctuationDelay: 300,
    enterDelay: 600,
    includeErrors: true,
    errorRate: 0.03,
  },
  
  demo: {
    ...DEFAULT_TYPING_CONFIG,
    letterDelay: 45,
    letterDelayVariance: 10,
    spaceDelay: 100,
    punctuationDelay: 200,
    enterDelay: 400,
  },
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function isPunctuation(char: string): boolean {
  return /[.,!?;:]/.test(char)
}

function isUpperCase(char: string): boolean {
  return char === char.toUpperCase() && char !== char.toLowerCase()
}

function shouldError(config: TypingConfig): boolean {
  return config.includeErrors && Math.random() < config.errorRate
}

// ============================================================
// MAIN ENGINE
// ============================================================

export class TypingEngine {
  private config: TypingConfig
  private text: string = ''
  private currentIndex: number = 0
  private cursorPosition: number = 0
  private isTyping: boolean = false
  private isPaused: boolean = false
  private events: TypingEvent[] = []
  private errorBuffer: string = ''
  private lastTimestamp: number = 0
  private cursorVisible: boolean = true
  private cursorBlinkTime: number = 0

  constructor(config: Partial<TypingConfig> = {}) {
    this.config = { ...DEFAULT_TYPING_CONFIG, ...config }
  }

  /**
   * Set configuration
   */
  configure(config: Partial<TypingConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): TypingConfig {
    return { ...this.config }
  }

  /**
   * Start typing the given text
   */
  start(text: string): void {
    // Apply case style
    this.text = this.applyCase(text)
    this.currentIndex = 0
    this.cursorPosition = 0
    this.isTyping = true
    this.isPaused = false
    this.events = []
    this.errorBuffer = ''
    this.lastTimestamp = 0
    this.cursorVisible = true
    this.cursorBlinkTime = 0
    
    // Add initial event
    this.addEvent({
      type: 'keypress',
      timestamp: 0,
      character: '',
      text: '',
      cursorPosition: 0,
    })
  }

  /**
   * Apply case transformation
   */
  private applyCase(text: string): string {
    switch (this.config.caseStyle) {
      case 'lower':
        return text.toLowerCase()
      case 'upper':
        return text.toUpperCase()
      default:
        return text
    }
  }

  /**
   * Process typing - call this in animation loop
   * Returns current state and advances time
   */
  process(deltaTime: number): TypingState {
    if (!this.isTyping || this.isPaused) {
      return this.getState()
    }

    this.lastTimestamp += deltaTime * 1000 // Convert to ms
    
    // Update cursor blink
    this.cursorBlinkTime += deltaTime * 1000
    if (this.cursorBlinkTime >= this.config.cursorBlinkRate) {
      this.cursorVisible = !this.cursorVisible
      this.cursorBlinkTime = randomInRange(
        -this.config.cursorBlinkVariance,
        this.config.cursorBlinkVariance
      )
    }

    // Process typing based on current character
    if (this.currentIndex < this.text.length) {
      const char = this.text[this.currentIndex]
      
      // Calculate delay for this character
      let delay = this.getDelayForCharacter(char)
      
      // Check for typing errors
      if (shouldError(this.config) && this.isValidErrorPosition()) {
        // Introduce an error
        delay = this.handleTypingError(delay)
      }
      
      if (this.lastTimestamp >= delay) {
        this.typeCharacter(char)
        this.lastTimestamp = 0
      }
    } else if (this.events.length > 0 && this.events[this.events.length - 1].type !== 'submit') {
      // Auto-submit at the end
      this.submit()
    }

    return this.getState()
  }

  /**
   * Get delay for a specific character
   */
  private getDelayForCharacter(char: string): number {
    let baseDelay = this.config.letterDelay
    const variance = randomInRange(
      -this.config.letterDelayVariance,
      this.config.letterDelayVariance
    )
    
    if (char === ' ') {
      baseDelay = this.config.spaceDelay
    } else if (isPunctuation(char)) {
      baseDelay = this.config.punctuationDelay
    }
    
    return baseDelay + variance
  }

  /**
   * Check if we can introduce an error at current position
   */
  private isValidErrorPosition(): boolean {
    const char = this.text[this.currentIndex]
    // Don't error on first char, after spaces, or on punctuation
    return this.currentIndex > 0 && 
           char !== ' ' && 
           !isPunctuation(char) &&
           this.errorBuffer.length === 0
  }

  /**
   * Handle typing error
   */
  private handleTypingError(baseDelay: number): number {
    // Type a wrong character first
    const wrongChars = 'qwertyuiopasdfghjklzxcvbnm'
    const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)]
    
    this.typeCharacter(wrongChar)
    this.errorBuffer = wrongChar
    
    // Add correction delay
    return this.config.correctionDelay
  }

  /**
   * Type a single character
   */
  private typeCharacter(char: string): void {
    // If we have an error buffer, we need to backspace first
    if (this.errorBuffer.length > 0) {
      this.backspace()
      this.errorBuffer = ''
      return
    }
    
    // Add the character
    const textBefore = this.text.substring(0, this.currentIndex)
    const textAfter = this.text.substring(this.currentIndex)
    this.text = textBefore + char + textAfter
    
    this.currentIndex++
    this.cursorPosition = this.currentIndex
    
    // Add event
    if (this.config.generateEvents && this.lastTimestamp >= this.config.eventGranularity) {
      this.addEvent({
        type: 'keypress',
        timestamp: this.getElapsedTime(),
        character: char,
        text: this.text,
        cursorPosition: this.cursorPosition,
      })
    }
  }

  /**
   * Handle backspace
   */
  private backspace(): void {
    if (this.currentIndex > 0) {
      const textBefore = this.text.substring(0, this.currentIndex - 1)
      const textAfter = this.text.substring(this.currentIndex)
      this.text = textBefore + textAfter
      
      this.currentIndex--
      this.cursorPosition = this.currentIndex
      
      this.addEvent({
        type: 'backspace',
        timestamp: this.getElapsedTime(),
        text: this.text,
        cursorPosition: this.cursorPosition,
      })
    }
  }

  /**
   * Submit/press enter
   */
  submit(): void {
    this.addEvent({
      type: 'submit',
      timestamp: this.getElapsedTime() + this.config.enterDelay,
      text: this.text,
      cursorPosition: this.cursorPosition,
    })
    
    this.isTyping = false
  }

  /**
   * Pause typing
   */
  pause(): void {
    this.isPaused = true
    this.addEvent({
      type: 'pause',
      timestamp: this.getElapsedTime(),
      text: this.text,
      cursorPosition: this.cursorPosition,
    })
  }

  /**
   * Resume typing
   */
  resume(): void {
    this.isPaused = false
  }

  /**
   * Stop typing
   */
  stop(): void {
    this.isTyping = false
    this.isPaused = false
  }

  /**
   * Reset engine
   */
  reset(): void {
    this.text = ''
    this.currentIndex = 0
    this.cursorPosition = 0
    this.isTyping = false
    this.isPaused = false
    this.events = []
    this.errorBuffer = ''
    this.lastTimestamp = 0
    this.cursorVisible = true
  }

  /**
   * Get elapsed time in ms
   */
  private getElapsedTime(): number {
    let time = 0
    for (let i = 0; i < this.currentIndex; i++) {
      const char = this.text[i] || ' '
      time += this.getDelayForCharacter(char)
    }
    return time
  }

  /**
   * Add event to timeline
   */
  private addEvent(event: TypingEvent): void {
    this.events.push(event)
  }

  /**
   * Get current state
   */
  getState(): TypingState {
    return {
      currentText: this.text,
      cursorPosition: this.cursorPosition,
      isTyping: this.isTyping,
      isPaused: this.isPaused,
      events: [...this.events],
    }
  }

  /**
   * Get all generated events
   */
  getEvents(): TypingEvent[] {
    return [...this.events]
  }

  /**
   * Get cursor visibility (for rendering)
   */
  isCursorVisible(): boolean {
    return this.cursorVisible
  }

  /**
   * Check if typing is complete
   */
  isComplete(): boolean {
    return !this.isTyping && this.currentIndex >= this.text.length
  }

  /**
   * Get progress (0-1)
   */
  getProgress(): number {
    if (this.text.length === 0) return 0
    return this.currentIndex / this.text.length
  }

  /**
   * Generate metadata for cursor tracking
   * Returns array of { timestamp, x, y, type }
   */
  generateMetadata(
    inputBounds: { x: number; y: number; width: number; height: number },
    charWidth: number = 10
  ): { timestamp: number; x: number; y: number; type: string }[] {
    const metadata: typeof arguments[0] = []
    let currentTime = 0
    
    for (let i = 0; i < this.text.length; i++) {
      const char = this.text[i]
      const delay = this.getDelayForCharacter(char)
      currentTime += delay
      
      // Calculate cursor position
      const x = inputBounds.x + (this.cursorPosition * charWidth)
      const y = inputBounds.y + inputBounds.height / 2
      
      metadata.push({
        timestamp: currentTime / 1000, // Convert to seconds
        x,
        y,
        type: char === ' ' ? 'move' : 'keypress',
      })
    }
    
    return metadata
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

export function createTypingEngine(config?: Partial<TypingConfig>): TypingEngine {
  return new TypingEngine(config)
}

export function createTypedText(text: string, preset?: string): TypingEngine {
  const engine = new TypingEngine(
    preset ? TYPING_PRESETS[preset] : undefined
  )
  engine.start(text)
  return engine
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Calculate total typing duration for text
 */
export function calculateTypingDuration(
  text: string,
  config: TypingConfig = DEFAULT_TYPING_CONFIG
): number {
  let totalDelay = 0
  
  for (const char of text) {
    if (char === ' ') {
      totalDelay += config.spaceDelay
    } else if (isPunctuation(char)) {
      totalDelay += config.punctuationDelay
    } else {
      totalDelay += config.letterDelay
    }
  }
  
  // Add enter delay at the end
  totalDelay += config.enterDelay
  
  return totalDelay / 1000 // Convert to seconds
}

/**
 * Split text into typing chunks (for multi-input scenarios)
 */
export function chunkTextForTyping(
  text: string,
  maxChunkLength: number = 50
): string[] {
  const chunks: string[] = []
  let currentChunk = ''
  
  // Split by common delimiters
  const parts = text.split(/(\s+|[,!?.;:]+)/)
  
  for (const part of parts) {
    if (currentChunk.length + part.length > maxChunkLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }
    }
    currentChunk += part
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }
  
  return chunks
}
