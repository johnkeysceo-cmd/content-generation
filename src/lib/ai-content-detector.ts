/**
 * AI Content Detection Module
 * 
 * Provides intelligent content analysis for automatic zoom targeting.
 * Detects UI elements, text regions, code blocks, buttons, and other
 * important visual elements to create more cinematic camera movements.
 */

import type { MetaDataItem } from '../types'

export interface DetectedElement {
  type: 'button' | 'text' | 'code' | 'icon' | 'image' | 'input' | 'menu' | 'container'
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  label?: string
}

export interface ContentAnalysis {
  elements: DetectedElement[]
  regions: {
    highPriority: { x: number; y: number; width: number; height: number }[]
    mediumPriority: { x: number; y: number; width: number; height: number }[]
    lowPriority: { x: number; y: number; width: number; height: number }[]
  }
  layout: 'sidebar' | 'fullscreen' | 'split' | 'grid' | 'floating'
  density: number // 0-1 indicating how crowded the screen is
}

export interface SmartFocusPoint {
  x: number // Normalized 0-1
  y: number // Normalized 0-1
  reason: string
  confidence: number
  smoothness: number // How smooth this point tends to be (for stabilization)
}

// Detection thresholds
const UI_ELEMENT_THRESHOLDS = {
  MIN_BUTTON_SIZE: 20,
  MIN_TEXT_HEIGHT: 12,
  MIN_ICON_SIZE: 16,
  MAX_CLUSTER_DISTANCE: 50,
  TEXT_DENSITY_THRESHOLD: 0.3,
}

/**
 * Analyzes video frames to detect UI elements and content regions
 * Uses canvas pixel analysis for basic element detection
 */
export class AIContentDetector {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  
  constructor() {
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  }

  /**
   * Analyze a video frame to detect UI elements
   */
  async analyzeFrame(
    videoElement: HTMLVideoElement,
    currentTime: number
  ): Promise<ContentAnalysis> {
    // Seek to the specified time
    videoElement.currentTime = currentTime
    
    await new Promise<void>((resolve) => {
      videoElement.onseeked = () => resolve()
    })

    // Set canvas dimensions to match video
    this.canvas.width = videoElement.videoWidth
    this.canvas.height = videoElement.videoHeight

    // Draw current frame
    this.ctx.drawImage(videoElement, 0, 0)

    // Get pixel data for analysis
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const pixels = imageData.data

    // Detect elements
    const elements = this.detectUIElements(pixels, this.canvas.width, this.canvas.height)
    
    // Analyze layout
    const layout = this.analyzeLayout(elements, this.canvas.width, this.canvas.height)
    
    // Categorize regions by priority
    const regions = this.categorizeRegions(elements)
    
    // Calculate density
    const density = this.calculateDensity(elements, this.canvas.width, this.canvas.height)

    return {
      elements,
      regions,
      layout,
      density,
    }
  }

  /**
   * Detect UI elements from pixel data
   */
  private detectUIElements(pixels: Uint8ClampedArray, width: number, height: number): DetectedElement[] {
    const elements: DetectedElement[] = []
    const visited = new Set<string>()

    // Simple edge detection and blob analysis
    // In production, this would use ML models like TensorFlow.js
    
    // 1. Detect button-like elements (solid color rectangles with rounded corners)
    const buttons = this.detectButtons(pixels, width, height)
    elements.push(...buttons)

    // 2. Detect text regions (high contrast horizontal patterns)
    const textRegions = this.detectTextRegions(pixels, width, height)
    elements.push(...textRegions)

    // 3. Detect code blocks (monospace patterns)
    const codeBlocks = this.detectCodeBlocks(pixels, width, height)
    elements.push(...codeBlocks)

    // 4. Detect icons (small square elements with high detail)
    const icons = this.detectIcons(pixels, width, height)
    elements.push(...icons)

    // 5. Detect input fields
    const inputs = this.detectInputFields(pixels, width, height)
    elements.push(...inputs)

    return elements
  }

  /**
   * Detect button-like UI elements
   */
  private detectButtons(pixels: Uint8ClampedArray, width: number, height: number): DetectedElement[] {
    const buttons: DetectedElement[] = []
    const minSize = UI_ELEMENT_THRESHOLDS.MIN_BUTTON_SIZE
    
    // Scan for potential buttons (rectangles with solid fill)
    // This is a simplified detection - real implementation would use ML
    const step = 10 // Sample every 10th pixel for performance
    
    for (let y = 0; y < height - minSize; y += step) {
      for (let x = 0; x < width - minSize; x += step) {
        // Check if this could be a button (solid color region)
        const result = this.findContiguousRegion(pixels, width, x, y, minSize, minSize)
        if (result.found && result.width >= minSize && result.height >= minSize) {
          // Check if it has button-like characteristics
          if (this.isButtonLike(pixels, width, x, y, result.width, result.height)) {
            buttons.push({
              type: 'button',
              bounds: {
                x: result.x,
                y: result.y,
                width: result.width,
                height: result.height
              },
              confidence: result.confidence,
              label: 'Button'
            })
          }
        }
      }
    }
    
    return this.mergeOverlappingElements(buttons)
  }

  /**
   * Detect text regions by analyzing contrast patterns
   */
  private detectTextRegions(pixels: Uint8ClampedArray, width: number, height: number): DetectedElement[] {
    const textRegions: DetectedElement[] = []
    const minHeight = UI_ELEMENT_THRESHOLDS.MIN_TEXT_HEIGHT
    
    // Detect horizontal lines of high contrast (likely text)
    const lines = this.detectHorizontalLines(pixels, width, height)
    
    for (const line of lines) {
      if (line.height >= minHeight) {
        textRegions.push({
          type: 'text',
          bounds: line,
          confidence: 0.7,
          label: 'Text Region'
        })
      }
    }
    
    return this.mergeOverlappingElements(textRegions)
  }

  /**
   * Detect code blocks (monospace patterns with consistent spacing)
   */
  private detectCodeBlocks(pixels: Uint8ClampedArray, width: number, height: number): DetectedElement[] {
    const codeBlocks: DetectedElement[] = []
    
    // Code blocks typically have:
    // - Dark background (syntax highlighting)
    // - Multiple horizontal lines of similar height
    // - Monospace character patterns
    
    const darkRegions = this.findDarkRegions(pixels, width, height)
    
    for (const region of darkRegions) {
      // Check if it has code-like characteristics
      if (this.isCodeLike(pixels, width, region)) {
        codeBlocks.push({
          type: 'code',
          bounds: region,
          confidence: 0.8,
          label: 'Code Block'
        })
      }
    }
    
    return codeBlocks
  }

  /**
   * Detect icon elements (small, detailed squares)
   */
  private detectIcons(pixels: Uint8ClampedArray, width: number, height: number): DetectedElement[] {
    const icons: DetectedElement[] = []
    const minSize = UI_ELEMENT_THRESHOLDS.MIN_ICON_SIZE
    
    // Icons are typically small, high-detail square regions
    for (let y = 0; y < height - minSize; y += 5) {
      for (let x = 0; x < width - minSize; x += 5) {
        const detail = this.calculateDetailLevel(pixels, width, x, y, minSize, minSize)
        if (detail > 0.5 && detail < 0.9) { // Not too low (flat), not too high (noise)
          icons.push({
            type: 'icon',
            bounds: { x, y, width: minSize, height: minSize },
            confidence: detail,
            label: 'Icon'
          })
        }
      }
    }
    
    return this.mergeOverlappingElements(icons)
  }

  /**
   * Detect input fields
   */
  private detectInputFields(pixels: Uint8ClampedArray, width: number, height: number): DetectedElement[] {
    const inputs: DetectedElement[] = []
    
    // Input fields typically have:
    // - Border/frame
    // - Rectangular shape
    // - Light interior
    
    const borderedRegions = this.findBorderedRegions(pixels, width, height)
    
    for (const region of borderedRegions) {
      if (this.isInputLike(pixels, width, region)) {
        inputs.push({
          type: 'input',
          bounds: region,
          confidence: 0.6,
          label: 'Input Field'
        })
      }
    }
    
    return inputs
  }

  /**
   * Find contiguous region of similar pixels
   */
  private findContiguousRegion(
    pixels: Uint8ClampedArray,
    width: number,
    startX: number,
    startY: number,
    minWidth: number,
    minHeight: number
  ): { found: boolean; x: number; y: number; width: number; height: number; confidence: number } {
    const baseColor = this.getPixelColor(pixels, width, startX, startY)
    let minX = startX, maxX = startX
    let minY = startY, maxY = startY
    const tolerance = 30 // Color tolerance

    // Flood fill to find bounds
    const stack = [[startX, startY]]
    const visited = new Set<string>()

    while (stack.length > 0) {
      const [x, y] = stack.pop()!
      const key = `${x},${y}`
      
      if (visited.has(key)) continue
      if (x < 0 || x >= width || y < 0 || y >= this.canvas.height) continue
      
      const color = this.getPixelColor(pixels, width, x, y)
      if (!this.colorsMatch(baseColor, color, tolerance)) continue
      
      visited.add(key)
      
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      
      // Limit search
      if (maxX - minX > minWidth * 3 || maxY - minY > minHeight * 3) break
      
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }

    const w = maxX - minX
    const h = maxY - minY
    
    return {
      found: w >= minWidth && h >= minHeight,
      x: minX,
      y: minY,
      width: w,
      height: h,
      confidence: Math.min(1, (w * h) / (minWidth * minHeight * 4))
    }
  }

  /**
   * Get RGB color at pixel position
   */
  private getPixelColor(pixels: Uint8ClampedArray, width: number, x: number, y: number): { r: number; g: number; b: number } {
    const i = (y * width + x) * 4
    return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
  }

  /**
   * Check if two colors match within tolerance
   */
  private colorsMatch(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tolerance: number): boolean {
    return Math.abs(a.r - b.r) < tolerance && Math.abs(a.g - b.g) < tolerance && Math.abs(a.b - b.b) < tolerance
  }

  /**
   * Check if region looks like a button
   */
  private isButtonLike(pixels: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number): boolean {
    // Buttons typically have:
    // - Uniform fill color
    // - Moderate contrast with background
    // - Reasonable aspect ratio (not too thin or tall)
    
    const aspectRatio = w / h
    if (aspectRatio < 0.5 || aspectRatio > 10) return false
    
    // Check for uniform fill
    const corners = [
      this.getPixelColor(pixels, width, x, y),
      this.getPixelColor(pixels, width, x + w - 1, y),
      this.getPixelColor(pixels, width, x, y + h - 1),
      this.getPixelColor(pixels, width, x + w - 1, y + h - 1),
    ]
    
    // If corners match, likely solid fill
    return this.colorsMatch(corners[0], corners[1], 20) && 
           this.colorsMatch(corners[2], corners[3], 20)
  }

  /**
   * Detect horizontal lines (potential text lines)
   */
  private detectHorizontalLines(pixels: Uint8ClampedArray, width: number, height: number): { x: number; y: number; width: number; height: number }[] {
    const lines: { x: number; y: number; width: number; height: number }[] = []
    const step = 5
    
    for (let y = 0; y < height; y += step) {
      let lineStart = -1
      let contrastCount = 0
      
      for (let x = 0; x < width; x++) {
        const prevColor = x > 0 ? this.getPixelColor(pixels, width, x - 1, y) : null
        const color = this.getPixelColor(pixels, width, x, y)
        
        if (prevColor) {
          const contrast = Math.abs(color.r - prevColor.r) + Math.abs(color.g - prevColor.g) + Math.abs(color.b - prevColor.b)
          if (contrast > 100) {
            contrastCount++
            if (lineStart === -1) lineStart = x
          }
        }
      }
      
      // If high contrast ratio, likely text line
      if (contrastCount > width * 0.1) {
        // Find vertical extent
        let minY = y, maxY = y
        for (let dy = -5; dy <= 5; dy++) {
          if (y + dy >= 0 && y + dy < height) {
            const testContrast = this.getLineContrast(pixels, width, y + dy)
            if (testContrast > width * 0.1) {
              minY = Math.min(minY, y + dy)
              maxY = Math.max(maxY, y + dy)
            }
          }
        }
        
        if (maxY - minY > 0) {
          lines.push({ x: 0, y: minY, width, height: maxY - minY + 1 })
        }
      }
    }
    
    return lines
  }

  /**
   * Get contrast level for a horizontal line
   */
  private getLineContrast(pixels: Uint8ClampedArray, width: number, y: number): number {
    let contrast = 0
    for (let x = 1; x < width; x++) {
      const c1 = this.getPixelColor(pixels, width, x - 1, y)
      const c2 = this.getPixelColor(pixels, width, x, y)
      contrast += Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b)
    }
    return contrast / width
  }

  /**
   * Find dark regions (potential code blocks)
   */
  private findDarkRegions(pixels: Uint8ClampedArray, width: number, height: number): { x: number; y: number; width: number; height: number }[] {
    const regions: { x: number; y: number; width: number; height: number }[] = []
    const darkThreshold = 80 // Low brightness
    
    // Find dark rectangular areas
    let darkStartX = -1
    let darkStartY = -1
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = this.getPixelColor(pixels, width, x, y)
        const brightness = (color.r + color.g + color.b) / 3
        
        if (brightness < darkThreshold) {
          if (darkStartX === -1) {
            darkStartX = x
            darkStartY = y
          }
        } else if (darkStartX !== -1) {
          // End of dark region
          regions.push({
            x: darkStartX,
            y: darkStartY,
            width: x - darkStartX,
            height: y - darkStartY
          })
          darkStartX = -1
        }
      }
    }
    
    return regions.filter(r => r.width > 100 && r.height > 50)
  }

  /**
   * Check if region is code-like
   */
  private isCodeLike(pixels: Uint8ClampedArray, width: number, region: { x: number; y: number; width: number; height: number }): boolean {
    // Code blocks have multiple horizontal lines
    let lineCount = 0
    const { x, y, width: w, height: h } = region
    
    for (let ly = y + 5; ly < y + h - 5; ly += 5) {
      const contrast = this.getLineContrast(pixels, width, ly)
      if (contrast > 30) lineCount++
    }
    
    return lineCount > 5
  }

  /**
   * Calculate detail level in a region
   */
  private calculateDetailLevel(pixels: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number): number {
    let edgeCount = 0
    const totalPixels = w * h
    
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (px > 0 && px < width - 1) {
          const c1 = this.getPixelColor(pixels, width, px - 1, py)
          const c2 = this.getPixelColor(pixels, width, px, py)
          const diff = Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b)
          if (diff > 50) edgeCount++
        }
      }
    }
    
    return edgeCount / totalPixels
  }

  /**
   * Find regions with borders
   */
  private findBorderedRegions(pixels: Uint8ClampedArray, width: number, height: number): { x: number; y: number; width: number; height: number }[] {
    // Simplified border detection
    const regions: { x: number; y: number; width: number; height: number }[] = []
    
    // In a real implementation, this would use more sophisticated edge detection
    // For now, return empty array
    return regions
  }

  /**
   * Check if region is an input field
   */
  private isInputLike(pixels: Uint8ClampedArray, width: number, region: { x: number; y: number; width: number; height: number }): boolean {
    return false // Simplified
  }

  /**
   * Merge overlapping elements
   */
  private mergeOverlappingElements(elements: DetectedElement[]): DetectedElement[] {
    if (elements.length === 0) return []
    
    const merged: DetectedElement[] = []
    const threshold = UI_ELEMENT_THRESHOLDS.MAX_CLUSTER_DISTANCE
    
    for (const elem of elements) {
      let foundCluster = false
      
      for (const cluster of merged) {
        const dx = Math.abs((elem.bounds.x + elem.bounds.width / 2) - (cluster.bounds.x + cluster.bounds.width / 2))
        const dy = Math.abs((elem.bounds.y + elem.bounds.height / 2) - (cluster.bounds.y + cluster.bounds.height / 2))
        
        if (dx < threshold && dy < threshold) {
          // Merge into cluster
          cluster.bounds.x = Math.min(cluster.bounds.x, elem.bounds.x)
          cluster.bounds.y = Math.min(cluster.bounds.y, elem.bounds.y)
          cluster.bounds.width = Math.max(cluster.bounds.x + cluster.bounds.width, elem.bounds.x + elem.bounds.width) - cluster.bounds.x
          cluster.bounds.height = Math.max(cluster.bounds.y + cluster.bounds.height, elem.bounds.y + elem.bounds.height) - cluster.bounds.y
          cluster.confidence = Math.max(cluster.confidence, elem.confidence)
          foundCluster = true
          break
        }
      }
      
      if (!foundCluster) {
        merged.push({ ...elem })
      }
    }
    
    return merged
  }

  /**
   * Analyze screen layout
   */
  private analyzeLayout(elements: DetectedElement[], width: number, height: number): ContentAnalysis['layout'] {
    if (elements.length < 3) return 'fullscreen'
    
    // Check for sidebar (elements clustered on one side)
    const leftElements = elements.filter(e => e.bounds.x < width * 0.3)
    const rightElements = elements.filter(e => e.bounds.x > width * 0.7)
    
    if (leftElements.length > elements.length * 0.5) return 'sidebar'
    if (rightElements.length > elements.length * 0.5) return 'sidebar'
    
    // Check for split (elements on both sides with empty center)
    if (leftElements.length > 2 && rightElements.length > 2) return 'split'
    
    // Check for grid (evenly distributed)
    const gridScore = this.calculateGridScore(elements, width, height)
    if (gridScore > 0.7) return 'grid'
    
    // Check for floating (few elements, lots of empty space)
    const density = this.calculateDensity(elements, width, height)
    if (density < 0.2) return 'floating'
    
    return 'fullscreen'
  }

  /**
   * Calculate grid layout score
   */
  private calculateGridScore(elements: DetectedElement[], width: number, height: number): number {
    // Simplified grid detection
    return 0.5
  }

  /**
   * Categorize regions by priority
   */
  private categorizeRegions(elements: DetectedElement[]): ContentAnalysis['regions'] {
    const highPriority: ContentAnalysis['regions']['highPriority'] = []
    const mediumPriority: ContentAnalysis['regions']['mediumPriority'] = []
    const lowPriority: ContentAnalysis['regions']['lowPriority'] = []
    
    for (const elem of elements) {
      const region = { ...elem.bounds }
      
      // High priority: buttons, icons, inputs (interactive elements)
      if (elem.type === 'button' || elem.type === 'icon' || elem.type === 'input') {
        highPriority.push({ x: elem.bounds.x, y: elem.bounds.y, width: elem.bounds.width, height: elem.bounds.height })
      }
      // Medium priority: text, code (content elements)
      else if (elem.type === 'text' || elem.type === 'code') {
        mediumPriority.push({ x: elem.bounds.x, y: elem.bounds.y, width: elem.bounds.width, height: elem.bounds.height })
      }
      // Low priority: images, containers
      else {
        lowPriority.push({ x: elem.bounds.x, y: elem.bounds.y, width: elem.bounds.width, height: elem.bounds.height })
      }
    }
    
    return { highPriority, mediumPriority, lowPriority }
  }

  /**
   * Calculate screen density
   */
  private calculateDensity(elements: DetectedElement[], width: number, height: number): number {
    const totalArea = width * height
    let elementArea = 0
    
    for (const elem of elements) {
      elementArea += elem.bounds.width * elem.bounds.height
    }
    
    return Math.min(1, elementArea / totalArea)
  }
}

/**
 * Smart Focus Point Selection
 * Uses detected elements and mouse position to intelligently
 * select the best focus point for zooming
 */
export class SmartFocusSelector {
  private detector: AIContentDetector
  private recentFocusPoints: SmartFocusPoint[] = []
  private stabilityWindow = 500 // ms
  
  constructor() {
    this.detector = new AIContentDetector()
  }

  /**
   * Analyze current frame and determine optimal focus point
   */
  async getSmartFocusPoint(
    videoElement: HTMLVideoElement,
    currentTime: number,
    mousePosition: { x: number; y: number } | null,
    metadata: MetaDataItem[],
    layout: ContentAnalysis['layout'] = 'fullscreen',
    density: number = 0.5
  ): Promise<SmartFocusPoint> {
    // Analyze the frame
    const analysis = await this.detector.analyzeFrame(videoElement, currentTime)
    
    let focusPoint: SmartFocusPoint
    
    if (mousePosition) {
      // Check if mouse is near any high-priority element
      const nearElement = this.findNearbyElement(analysis, mousePosition)
      
      if (nearElement) {
        // Focus on the element
        focusPoint = {
          x: (nearElement.bounds.x + nearElement.bounds.width / 2) / videoElement.videoWidth,
          y: (nearElement.bounds.y + nearElement.bounds.height / 2) / videoElement.videoHeight,
          reason: `Near ${nearElement.type}`,
          confidence: nearElement.confidence,
          smoothness: this.calculateSmoothness(nearElement.type)
        }
      } else {
        // Use mouse position with smoothing
        focusPoint = this.smoothFocusPoint(
          {
            x: mousePosition.x / videoElement.videoWidth,
            y: mousePosition.y / videoElement.videoHeight,
            reason: 'Mouse position',
            confidence: 0.8,
            smoothness: 0.5
          },
          currentTime
        )
      }
    } else if (analysis.elements.length > 0) {
      // Auto-detect: focus on most important element
      const primaryElement = this.selectPrimaryElement(analysis, layout, density)
      focusPoint = {
        x: (primaryElement.bounds.x + primaryElement.bounds.width / 2) / videoElement.videoWidth,
        y: (primaryElement.bounds.y + primaryElement.bounds.height / 2) / videoElement.videoHeight,
        reason: `Auto-detected ${primaryElement.type}`,
        confidence: primaryElement.confidence,
        smoothness: this.calculateSmoothness(primaryElement.type)
      }
    } else {
      // Default to center
      focusPoint = {
        x: 0.5,
        y: 0.5,
        reason: 'Default center',
        confidence: 0.3,
        smoothness: 1
      }
    }
    
    // Store for smoothing
    this.recentFocusPoints.push(focusPoint)
    this.recentFocusPoints = this.recentFocusPoints.filter(
      p => currentTime * 1000 - this.getFocusPointTime(p) < this.stabilityWindow
    )
    
    return focusPoint
  }

  /**
   * Find element near mouse position
   */
  private findNearbyElement(analysis: ContentAnalysis, mousePos: { x: number; y: number }): DetectedElement | null {
    const threshold = 100 // pixels
    
    for (const elem of analysis.elements) {
      const centerX = elem.bounds.x + elem.bounds.width / 2
      const centerY = elem.bounds.y + elem.bounds.height / 2
      const distance = Math.sqrt(Math.pow(mousePos.x - centerX, 2) + Math.pow(mousePos.y - centerY, 2))
      
      if (distance < threshold) {
        return elem
      }
    }
    
    return null
  }

  /**
   * Select primary element based on layout
   */
  private selectPrimaryElement(analysis: ContentAnalysis, layout: ContentAnalysis['layout'], density: number): DetectedElement {
    const { highPriority, mediumPriority, lowPriority } = analysis.regions
    
    // In high density, prioritize compact elements
    // In low density, can afford to focus on larger areas
    
    if (highPriority.length > 0) {
      const region = highPriority[0]
      return {
        type: 'button',
        bounds: region,
        confidence: 0.9
      }
    }
    
    if (mediumPriority.length > 0) {
      const region = mediumPriority[0]
      return {
        type: 'text',
        bounds: region,
        confidence: 0.7
      }
    }

    if (lowPriority.length > 0) {
      const region = lowPriority[0]
      return {
        type: 'container',
        bounds: region,
        confidence: 0.5
      }
    }
    
    // Fallback to first element
    return analysis.elements[0] || {
      type: 'container',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      confidence: 0.3
    }
  }

  /**
   * Smooth focus point using temporal averaging
   */
  private smoothFocusPoint(newPoint: SmartFocusPoint, currentTime: number): SmartFocusPoint {
    if (this.recentFocusPoints.length < 3) return newPoint
    
    let totalWeight = 0
    let weightedX = 0
    let weightedY = 0
    
    for (const point of this.recentFocusPoints) {
      const weight = point.confidence * (point.smoothness || 0.5)
      weightedX += point.x * weight
      weightedY += point.y * weight
      totalWeight += weight
    }
    
    if (totalWeight > 0) {
      return {
        x: weightedX / totalWeight,
        y: weightedY / totalWeight,
        reason: newPoint.reason,
        confidence: newPoint.confidence,
        smoothness: newPoint.smoothness
      }
    }
    
    return newPoint
  }

  /**
   * Get timestamp for a focus point (placeholder)
   */
  private getFocusPointTime(point: SmartFocusPoint): number {
    return 0 // Simplified
  }

  /**
   * Calculate smoothness factor for element type
   */
  private calculateSmoothness(type: DetectedElement['type']): number {
    switch (type) {
      case 'button':
      case 'icon':
        return 0.9 // These are stable targets
      case 'input':
        return 0.7
      case 'text':
        return 0.6
      case 'code':
        return 0.8 // Code blocks are stable
      default:
        return 0.5
    }
  }

  /**
   * Reset internal state
   */
  reset(): void {
    this.recentFocusPoints = []
  }
}

// Singleton instance
export const contentDetector = new AIContentDetector()
export const focusSelector = new SmartFocusSelector()
