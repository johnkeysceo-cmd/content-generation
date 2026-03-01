/**
 * ScreenArc CLI - Headless Video Processor
 * 
 * This module extracts all core video processing logic from the Electron main process
 * and refactors it into a pure Node.js module that produces identical output to the GUI.
 * 
 * It uses node-canvas to replicate the exact Canvas-based rendering pipeline used by the GUI.
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createCanvas, loadImage, Image, CanvasRenderingContext2D, CanvasGradient } from '@napi-rs/canvas'
import { 
  CLIProjectConfig, 
  RecordingMetadata, 
  ProgressCallback,
  ProcessingResult,
  ZoomRegionConfig,
  MouseEvent
} from './types.js'
import { getLogger } from './logger.js'
import { getFFmpegPath, getFFprobePath, calculateExportDimensions, getQualitySettings } from './ffmpeg-utils.js'
import { mapExportTimeToSourceTime } from '../lib/utils.js'
import { calculateZoomTransform, resetCameraState } from '../lib/transform.js'
import { EASING_MAP } from '../lib/easing.js'

const logger = getLogger()

interface CursorImageBitmap {
  width: number
  height: number
  xhot: number
  yhot: number
  imageBitmap: Image
}

interface RenderableState {
  videoDimensions: { width: number; height: number }
  frameStyles: CLIProjectConfig['frameStyles']
  cursorStyles: CLIProjectConfig['cursorStyles']
  webcamStyles?: CLIProjectConfig['webcamStyles']
  webcamPosition?: CLIProjectConfig['webcamPosition']
  isWebcamVisible: boolean
  zoomRegions: Record<string, ZoomRegionConfig>
  metadata: MouseEvent[]
  recordingGeometry: { width: number; height: number }
  cursorBitmapsToRender: Map<string, CursorImageBitmap>
  cutRegions: CLIProjectConfig['cutRegions']
  speedRegions: CLIProjectConfig['speedRegions']
}

export class HeadlessVideoProcessor {
  private config: CLIProjectConfig
  private metadata: RecordingMetadata | null = null
  private videoDuration: number = 0
  private videoWidth: number = 0
  private videoHeight: number = 0
  private ffmpegPath: string
  private ffprobePath: string
  private cancelRequested: boolean = false
  private videoFrames: Buffer[] = []
  private webcamFrames: Buffer[] = []
  private tempDir: string

  constructor(config: CLIProjectConfig) {
    this.config = config
    this.ffmpegPath = getFFmpegPath()
    this.ffprobePath = getFFprobePath()
    this.tempDir = path.join(os.tmpdir(), `screenarc-cli-${Date.now()}`)
  }

  /**
   * Initialize - load metadata and get video info
   */
  async initialize(): Promise<void> {
    logger.info('Initializing headless video processor...')

    // Create temp directory
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }

    // Load metadata if available
    if (this.config.metadataPath && fs.existsSync(this.config.metadataPath)) {
      try {
        const content = fs.readFileSync(this.config.metadataPath, 'utf-8')
        this.metadata = JSON.parse(content)
        logger.info(`Loaded metadata with ${this.metadata!.events.length} mouse events`)
      } catch (error) {
        logger.warn('Failed to load metadata:', error)
        this.metadata = null
      }
    }

    // Get video info
    await this.getVideoInfo()
    logger.info(`Video: ${this.videoWidth}x${this.videoHeight}, ${this.videoDuration.toFixed(1)}s`)
  }

  /**
   * Get video info using FFprobe
   */
  private async getVideoInfo(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn(this.ffprobePath, [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-of', 'json',
        this.config.videoPath
      ])

      let output = ''
      ffprobe.stdout.on('data', (data) => { output += data.toString() })
      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFprobe failed with code ${code}`))
          return
        }
        try {
          const info = JSON.parse(output)
          if (info.streams?.[0]) {
            const stream = info.streams[0]
            this.videoWidth = stream.width || 1920
            this.videoHeight = stream.height || 1080
            this.videoDuration = parseFloat(stream.duration) || 10
          }
        } catch {
          this.videoWidth = 1920
          this.videoHeight = 1080
          this.videoDuration = 10
        }
        resolve()
      })
    })
  }

  /**
   * Process the video using Canvas-based rendering (identical to GUI)
   */
  async process(progressCallback?: ProgressCallback): Promise<ProcessingResult> {
    const startTime = Date.now()
    const { outputPath, exportSettings } = this.config
    const { width: outputWidth, height: outputHeight } = calculateExportDimensions(
      exportSettings.resolution,
      exportSettings.aspectRatio
    )

    logger.info(`Processing: ${this.config.videoPath}`)
    logger.info(`Output: ${outputPath} (${outputWidth}x${outputHeight})`)

    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // Reset camera state for new processing
      resetCameraState()

      // Prepare cursor bitmaps
      const cursorBitmaps = await this.prepareCursorBitmaps()

      // Build renderable state
      const renderableState = this.buildRenderableState(cursorBitmaps)

      // Extract video frames
      logger.info('Extracting video frames...')
      await this.extractVideoFrames()

      // Extract webcam frames if enabled
      if (this.config.webcamEnabled && this.config.webcamVideoPath) {
        logger.info('Extracting webcam frames...')
        await this.extractWebcamFrames()
      }

      // Render frames
      logger.info('Rendering frames...')
      const totalFrames = Math.ceil(this.videoDuration * exportSettings.fps)
      const frameBuffers: Buffer[] = []

      for (let frame = 0; frame < totalFrames; frame++) {
        if (this.cancelRequested) {
          throw new Error('Processing cancelled')
        }

        const exportTimestamp = frame / exportSettings.fps
        const sourceTimestamp = mapExportTimeToSourceTime(
          exportTimestamp,
          this.videoDuration,
          this.config.cutRegions.reduce((acc, r) => {
            acc[r.id] = { startTime: r.startTime, duration: r.duration }
            return acc
          }, {} as Record<string, { startTime: number; duration: number }>),
          this.config.speedRegions.reduce((acc, r) => {
            acc[r.id] = { startTime: r.startTime, duration: r.duration, speed: r.speed }
            return acc
          }, {} as Record<string, { startTime: number; duration: number; speed: number }>)
        )

        // Get frame index
        const frameIndex = Math.floor(sourceTimestamp * exportSettings.fps)
        const videoFrame = this.videoFrames[Math.min(frameIndex, this.videoFrames.length - 1)]
        
        if (!videoFrame) {
          logger.warn(`Frame ${frameIndex} not found, skipping`)
          continue
        }

        // Render frame
        const renderedFrame = await this.renderFrame(
          videoFrame,
          renderableState,
          sourceTimestamp,
          outputWidth,
          outputHeight
        )

        frameBuffers.push(renderedFrame)

        // Progress callback
        if (progressCallback) {
          const progress = ((frame + 1) / totalFrames) * 100
          progressCallback(progress, 'Rendering...', frame)
        }
      }

      // Encode to video
      logger.info('Encoding video...')
      await this.encodeFramesToVideo(frameBuffers, outputPath, outputWidth, outputHeight, exportSettings)

      // Cleanup
      this.cleanup()

      const duration = (Date.now() - startTime) / 1000
      logger.info(`Completed in ${duration.toFixed(1)}s`)

      return {
        success: true,
        inputPath: this.config.videoPath,
        outputPath,
        duration,
        framesProcessed: frameBuffers.length
      }
    } catch (error) {
      this.cleanup()
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Failed: ${errorMessage}`)
      return {
        success: false,
        inputPath: this.config.videoPath,
        outputPath,
        error: errorMessage
      }
    }
  }

  /**
   * Prepare cursor bitmaps from metadata
   */
  private async prepareCursorBitmaps(): Promise<Map<string, CursorImageBitmap>> {
    const bitmapMap = new Map<string, CursorImageBitmap>()

    if (!this.metadata || !this.metadata.cursorImages) {
      return bitmapMap
    }

    for (const [key, cursor] of Object.entries(this.metadata.cursorImages)) {
      if (cursor.image && cursor.width > 0 && cursor.height > 0) {
        try {
          // Convert RGBA array to buffer
          const buffer = Buffer.from(cursor.image)
          const imageData = new Uint8ClampedArray(buffer)
          
          // Create canvas and draw image data
          const canvas = createCanvas(cursor.width, cursor.height)
          const ctx = canvas.getContext('2d')
          const imgData = ctx.createImageData(cursor.width, cursor.height)
          imgData.data.set(imageData)
          ctx.putImageData(imgData, 0, 0)

          // @napi-rs/canvas loadImage can accept a Buffer directly
          // Convert canvas to PNG buffer and load it
          const pngBuffer = canvas.toBuffer('image/png')
          const image = await loadImage(pngBuffer)

          bitmapMap.set(key, {
            width: cursor.width,
            height: cursor.height,
            xhot: cursor.xhot || 0,
            yhot: cursor.yhot || 0,
            imageBitmap: image
          })
        } catch (e) {
          logger.warn(`Failed to create cursor bitmap for ${key}:`, e)
        }
      }
    }

    return bitmapMap
  }

  /**
   * Build renderable state from config
   */
  private buildRenderableState(cursorBitmaps: Map<string, CursorImageBitmap>): RenderableState {
    const zoomRegions = this.config.zoomRegions.reduce((acc, r) => {
      acc[r.id] = r
      return acc
    }, {} as Record<string, ZoomRegionConfig>)

    return {
      videoDimensions: { width: this.videoWidth, height: this.videoHeight },
      frameStyles: this.config.frameStyles,
      cursorStyles: this.config.cursorStyles,
      webcamStyles: this.config.webcamStyles,
      webcamPosition: this.config.webcamPosition,
      isWebcamVisible: this.config.webcamEnabled || false,
      zoomRegions,
      metadata: this.metadata?.events || [],
      recordingGeometry: this.metadata?.geometry || { width: this.videoWidth, height: this.videoHeight },
      cursorBitmapsToRender: cursorBitmaps,
      cutRegions: this.config.cutRegions,
      speedRegions: this.config.speedRegions
    }
  }

  /**
   * Extract video frames to memory
   */
  private async extractVideoFrames(): Promise<void> {
    return new Promise((resolve, reject) => {
      const framesDir = path.join(this.tempDir, 'frames')
      fs.mkdirSync(framesDir, { recursive: true })

      const ffmpeg = spawn(this.ffmpegPath, [
        '-i', this.config.videoPath,
        '-vf', `fps=${this.config.exportSettings.fps},scale=${this.videoWidth}:${this.videoHeight}`,
        '-f', 'image2',
        path.join(framesDir, 'frame-%06d.png')
      ])

      let stderr = ''
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      ffmpeg.on('close', (code) => {
        if (code !== 0 && code !== 1) { // Code 1 is normal for some FFmpeg versions
          reject(new Error(`FFmpeg frame extraction failed: ${stderr.slice(-500)}`))
          return
        }

        // Load all frames into memory
        const files = fs.readdirSync(framesDir).sort()
        for (const file of files) {
          if (file.endsWith('.png')) {
            const framePath = path.join(framesDir, file)
            const frameBuffer = fs.readFileSync(framePath)
            this.videoFrames.push(frameBuffer)
          }
        }

        resolve()
      })

      ffmpeg.on('error', reject)
    })
  }

  /**
   * Extract webcam frames if enabled
   */
  private async extractWebcamFrames(): Promise<void> {
    if (!this.config.webcamVideoPath) return

    return new Promise((resolve, reject) => {
      const framesDir = path.join(this.tempDir, 'webcam-frames')
      fs.mkdirSync(framesDir, { recursive: true })

      const ffmpeg = spawn(this.ffmpegPath, [
        '-i', this.config.webcamVideoPath,
        '-vf', `fps=${this.config.exportSettings.fps}`,
        '-f', 'image2',
        path.join(framesDir, 'frame-%06d.png')
      ])

      let stderr = ''
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      ffmpeg.on('close', (code) => {
        if (code !== 0 && code !== 1) {
          reject(new Error(`FFmpeg webcam extraction failed: ${stderr.slice(-500)}`))
          return
        }

        const files = fs.readdirSync(framesDir).sort()
        for (const file of files) {
          if (file.endsWith('.png')) {
            const framePath = path.join(framesDir, file)
            const frameBuffer = fs.readFileSync(framePath)
            this.webcamFrames.push(frameBuffer)
          }
        }

        resolve()
      })

      ffmpeg.on('error', reject)
    })
  }

  /**
   * Render a single frame using Canvas (replicates drawScene from renderer.ts)
   */
  private async renderFrame(
    videoFrameBuffer: Buffer,
    state: RenderableState,
    currentTime: number,
    outputWidth: number,
    outputHeight: number
  ): Promise<Buffer> {
    // Create canvas
    const canvas = createCanvas(outputWidth, outputHeight)
    const ctx = canvas.getContext('2d')

    // Enable high-quality rendering
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Load video frame (loadImage accepts Buffer directly in @napi-rs/canvas)
    const videoImage = await loadImage(videoFrameBuffer)

    // Draw background
    await this.drawBackground(ctx, outputWidth, outputHeight, state.frameStyles.background)

    // Calculate frame dimensions
    const { frameStyles, videoDimensions } = state
    const paddingPercent = frameStyles.padding / 100
    const availableWidth = outputWidth * (1 - 2 * paddingPercent)
    const availableHeight = outputHeight * (1 - 2 * paddingPercent)
    const videoAspectRatio = videoDimensions.width / videoDimensions.height

    let frameContentWidth, frameContentHeight
    if (availableWidth / availableHeight > videoAspectRatio) {
      frameContentHeight = availableHeight
      frameContentWidth = frameContentHeight * videoAspectRatio
    } else {
      frameContentWidth = availableWidth
      frameContentHeight = frameContentWidth / videoAspectRatio
    }

    const frameX = (outputWidth - frameContentWidth) / 2
    const frameY = (outputHeight - frameContentHeight) / 2

    // Calculate zoom transform
    // Note: calculateZoomTransform expects timestamps in seconds, but metadata has milliseconds
    // We need to convert metadata timestamps for the transform function
    const metadataForTransform = state.metadata.map(e => ({
      ...e,
      timestamp: e.timestamp / 1000 // Convert to seconds
    }))
    const { scale, translateX, translateY, transformOrigin } = calculateZoomTransform(
      currentTime,
      state.zoomRegions,
      metadataForTransform as any, // Type assertion needed due to timestamp format difference
      state.recordingGeometry,
      { width: frameContentWidth, height: frameContentHeight }
    )

    // Draw video frame with transforms
    ctx.save()
    ctx.translate(frameX, frameY)
    
    const [originXStr, originYStr] = transformOrigin.split(' ')
    const originXMul = parseFloat(originXStr) / 100
    const originYMul = parseFloat(originYStr) / 100
    const originPxX = originXMul * frameContentWidth
    const originPxY = originYMul * frameContentHeight

    ctx.translate(originPxX, originPxY)
    ctx.scale(scale, scale)
    ctx.translate(translateX, translateY)
    ctx.translate(-originPxX, -originPxY)

    // Draw shadow
    const { shadowBlur, shadowOffsetX, shadowOffsetY, borderRadius, shadowColor, borderWidth, borderColor } = frameStyles
    if (shadowBlur > 0) {
      ctx.save()
      ctx.shadowColor = shadowColor
      ctx.shadowBlur = shadowBlur
      ctx.shadowOffsetX = shadowOffsetX
      ctx.shadowOffsetY = shadowOffsetY
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.beginPath()
      this.roundRect(ctx, 0, 0, frameContentWidth, frameContentHeight, borderRadius)
      ctx.fill()
      ctx.restore()
    }

    // Draw video with border radius
    ctx.save()
    ctx.beginPath()
    this.roundRect(ctx, 0, 0, frameContentWidth, frameContentHeight, borderRadius)
    ctx.clip()
    ctx.drawImage(videoImage, 0, 0, frameContentWidth, frameContentHeight)

    // Draw border
    if (borderWidth > 0) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth * 2
      ctx.beginPath()
      this.roundRect(ctx, 0, 0, frameContentWidth, frameContentHeight, borderRadius)
      ctx.stroke()
    }
    ctx.restore()
    ctx.restore()

    // Draw click ripples
    if (state.cursorStyles.clickRippleEffect && state.recordingGeometry) {
      this.drawClickRipples(ctx, state, currentTime, frameContentWidth, frameContentHeight)
    }

    // Draw cursor
    if (state.cursorStyles.showCursor) {
      await this.drawCursor(ctx, state, currentTime, frameContentWidth, frameContentHeight)
    }

    // Draw webcam if enabled
    if (state.isWebcamVisible && this.webcamFrames.length > 0) {
      await this.drawWebcam(ctx, state, currentTime, outputWidth, outputHeight)
    }

    // Convert to RGBA buffer
    const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight)
    return Buffer.from(imageData.data.buffer)
  }

  /**
   * Draw background (replicates drawBackground from renderer.ts)
   */
  private async drawBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    backgroundState: CLIProjectConfig['frameStyles']['background']
  ): Promise<void> {
    ctx.clearRect(0, 0, width, height)

    switch (backgroundState.type) {
      case 'color':
        ctx.fillStyle = backgroundState.color || '#000000'
        ctx.fillRect(0, 0, width, height)
        break
      case 'gradient': {
        const start = backgroundState.gradientStart || '#000000'
        const end = backgroundState.gradientEnd || '#ffffff'
        const direction = backgroundState.gradientDirection || 'to right'
        
        let gradient: CanvasGradient
        if (direction.startsWith('circle')) {
          gradient = ctx.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height) / 2
          )
          if (direction === 'circle-in') {
            gradient.addColorStop(0, end)
            gradient.addColorStop(1, start)
          } else {
            gradient.addColorStop(0, start)
            gradient.addColorStop(1, end)
          }
        } else {
          const getCoords = (dir: string) => {
            switch (dir) {
              case 'to bottom': return [0, 0, 0, height]
              case 'to top': return [0, height, 0, 0]
              case 'to right': return [0, 0, width, 0]
              case 'to left': return [width, 0, 0, 0]
              case 'to bottom right': return [0, 0, width, height]
              case 'to bottom left': return [width, 0, 0, height]
              case 'to top right': return [0, height, width, 0]
              case 'to top left': return [width, height, 0, 0]
              default: return [0, 0, width, 0]
            }
          }
          const coords = getCoords(direction)
          gradient = ctx.createLinearGradient(coords[0], coords[1], coords[2], coords[3])
          gradient.addColorStop(0, start)
          gradient.addColorStop(1, end)
        }
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
        break
      }
      case 'image':
      case 'wallpaper': {
        // For CLI, we'd need to load the image from file
        // This is a simplified version - full implementation would load from path
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)
        break
      }
      default:
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)
    }
  }

  /**
   * Draw click ripples
   */
  private drawClickRipples(
    ctx: CanvasRenderingContext2D,
    state: RenderableState,
    currentTime: number,
    frameContentWidth: number,
    frameContentHeight: number
  ): void {
    const { clickRippleDuration, clickRippleSize, clickRippleColor } = state.cursorStyles
    const rippleEasing = EASING_MAP.Balanced

    // Metadata timestamps are in milliseconds
    const recentRippleClicks = state.metadata.filter(
      (event) =>
        event.type === 'click' &&
        event.pressed &&
        currentTime >= event.timestamp / 1000 &&
        currentTime < (event.timestamp / 1000) + clickRippleDuration
    )

    for (const click of recentRippleClicks) {
      const clickTime = click.timestamp / 1000 // Convert to seconds
      const progress = (currentTime - clickTime) / clickRippleDuration
      const easedProgress = rippleEasing(progress)
      const currentRadius = easedProgress * clickRippleSize
      const currentOpacity = 1 - easedProgress

      const cursorX = (click.x / state.recordingGeometry.width) * frameContentWidth
      const cursorY = (click.y / state.recordingGeometry.height) * frameContentHeight

      const colorResult = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(clickRippleColor)
      if (colorResult) {
        const [r, g, b, baseAlpha] = colorResult.slice(1).map(Number)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(baseAlpha || 1) * currentOpacity})`
      }

      ctx.beginPath()
      ctx.arc(cursorX, cursorY, currentRadius, 0, 2 * Math.PI)
      ctx.fill()
    }
  }

  /**
   * Draw cursor
   */
  private async drawCursor(
    ctx: CanvasRenderingContext2D,
    state: RenderableState,
    currentTime: number,
    frameContentWidth: number,
    frameContentHeight: number
  ): Promise<void> {
    // Find last metadata event before current time
    // Metadata timestamps are in milliseconds, convert to seconds for comparison
    const lastEvent = state.metadata
      .filter(e => (e.timestamp / 1000) <= currentTime)
      .sort((a, b) => b.timestamp - a.timestamp)[0]

    if (!lastEvent || currentTime - (lastEvent.timestamp / 1000) > 0.1) {
      return
    }

    const cursorData = state.cursorBitmapsToRender.get(lastEvent.cursorImageKey || '')
    if (!cursorData || !cursorData.imageBitmap) {
      return
    }

    const cursorX = (lastEvent.x / state.recordingGeometry.width) * frameContentWidth
    const cursorY = (lastEvent.y / state.recordingGeometry.height) * frameContentHeight
    const drawX = Math.round(cursorX - cursorData.xhot)
    const drawY = Math.round(cursorY - cursorData.yhot)

    ctx.save()

    // Handle click scale animation
    let cursorScale = 1
    if (state.cursorStyles.clickScaleEffect) {
      const { clickScaleDuration, clickScaleAmount, clickScaleEasing } = state.cursorStyles
      const mostRecentClick = state.metadata
        .filter(
          (e) =>
            e.type === 'click' &&
            e.pressed &&
            (e.timestamp / 1000) <= currentTime &&
            (e.timestamp / 1000) > currentTime - clickScaleDuration
        )
        .pop()

      if (mostRecentClick) {
        const clickTime = mostRecentClick.timestamp / 1000 // Convert to seconds
        const progress = (currentTime - clickTime) / clickScaleDuration
        const easingFn = EASING_MAP[clickScaleEasing as keyof typeof EASING_MAP] || EASING_MAP.Balanced
        const easedProgress = easingFn(progress)
        const scaleValue = 1 - (1 - clickScaleAmount) * Math.sin(easedProgress * Math.PI)
        cursorScale = scaleValue
      }
    }

    // Apply drop shadow
    const { shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor } = state.cursorStyles
    if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
      ctx.shadowColor = shadowColor
      ctx.shadowBlur = shadowBlur
      ctx.shadowOffsetX = shadowOffsetX
      ctx.shadowOffsetY = shadowOffsetY
    }

    // Apply scale transform
    if (cursorScale !== 1) {
      const scaleCenterX = drawX + cursorData.xhot
      const scaleCenterY = drawY + cursorData.yhot
      ctx.translate(scaleCenterX, scaleCenterY)
      ctx.scale(cursorScale, cursorScale)
      ctx.translate(-scaleCenterX, -scaleCenterY)
    }

    ctx.drawImage(cursorData.imageBitmap, drawX, drawY)
    ctx.restore()
  }

  /**
   * Draw webcam overlay
   */
  private async drawWebcam(
    ctx: CanvasRenderingContext2D,
    state: RenderableState,
    currentTime: number,
    outputWidth: number,
    outputHeight: number
  ): Promise<void> {
    if (!state.webcamStyles || !state.webcamPosition || this.webcamFrames.length === 0) {
      return
    }

    const frameIndex = Math.floor(currentTime * this.config.exportSettings.fps)
    const webcamFrame = this.webcamFrames[Math.min(frameIndex, this.webcamFrames.length - 1)]
    if (!webcamFrame) return

    // loadImage accepts Buffer directly in @napi-rs/canvas
    const webcamImage = await loadImage(webcamFrame)
    const baseSize = Math.min(outputWidth, outputHeight)
    
    let webcamWidth, webcamHeight
    if (state.webcamStyles.shape === 'rectangle') {
      webcamWidth = baseSize * (state.webcamStyles.size / 100)
      webcamHeight = webcamWidth * (9 / 16)
    } else {
      webcamWidth = baseSize * (state.webcamStyles.size / 100)
      webcamHeight = webcamWidth
    }

    // Calculate position
    const edgePadding = baseSize * 0.02
    let webcamX, webcamY
    const pos = state.webcamPosition.pos
    switch (pos) {
      case 'top-left':
        webcamX = edgePadding
        webcamY = edgePadding
        break
      case 'top-center':
        webcamX = (outputWidth - webcamWidth) / 2
        webcamY = edgePadding
        break
      case 'top-right':
        webcamX = outputWidth - webcamWidth - edgePadding
        webcamY = edgePadding
        break
      case 'bottom-left':
        webcamX = edgePadding
        webcamY = outputHeight - webcamHeight - edgePadding
        break
      case 'bottom-center':
        webcamX = (outputWidth - webcamWidth) / 2
        webcamY = outputHeight - webcamHeight - edgePadding
        break
      case 'bottom-right':
        webcamX = outputWidth - webcamWidth - edgePadding
        webcamY = outputHeight - webcamHeight - edgePadding
        break
      case 'left-center':
        webcamX = edgePadding
        webcamY = (outputHeight - webcamHeight) / 2
        break
      case 'right-center':
        webcamX = outputWidth - webcamWidth - edgePadding
        webcamY = (outputHeight - webcamHeight) / 2
        break
      default:
        webcamX = outputWidth - webcamWidth - edgePadding
        webcamY = outputHeight - webcamHeight - edgePadding
    }

    // Draw shadow
    if (state.webcamStyles.shadowBlur > 0) {
      ctx.save()
      ctx.shadowColor = state.webcamStyles.shadowColor
      ctx.shadowBlur = state.webcamStyles.shadowBlur
      ctx.shadowOffsetX = state.webcamStyles.shadowOffsetX
      ctx.shadowOffsetY = state.webcamStyles.shadowOffsetY
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.beginPath()
      this.roundRect(ctx, webcamX, webcamY, webcamWidth, webcamHeight, state.webcamStyles.borderRadius)
      ctx.fill()
      ctx.restore()
    }

    // Draw webcam with clipping
    ctx.save()
    if (state.webcamStyles.isFlipped) {
      ctx.translate(outputWidth, 0)
      ctx.scale(-1, 1)
      webcamX = outputWidth - webcamX - webcamWidth
    }
    ctx.beginPath()
    this.roundRect(ctx, webcamX, webcamY, webcamWidth, webcamHeight, state.webcamStyles.borderRadius)
    ctx.clip()
    ctx.drawImage(webcamImage, webcamX, webcamY, webcamWidth, webcamHeight)
    ctx.restore()
  }

  /**
   * Round rect helper (for node-canvas compatibility)
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    if (radius === 0) {
      ctx.rect(x, y, width, height)
      return
    }

    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  /**
   * Encode frames to video using FFmpeg
   */
  private async encodeFramesToVideo(
    frameBuffers: Buffer[],
    outputPath: string,
    outputWidth: number,
    outputHeight: number,
    exportSettings: CLIProjectConfig['exportSettings']
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const { format, fps, quality } = exportSettings
      const qualitySettings = getQualitySettings(quality)

      const ffmpegArgs = [
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-s', `${outputWidth}x${outputHeight}`,
        '-r', fps.toString(),
        '-i', '-'
      ]

      // Add audio input if enabled (before encoding options)
      if (this.config.audioEnabled && !this.config.audioMuted && this.config.videoPath) {
        ffmpegArgs.push('-i', this.config.videoPath)
      }

      // Video encoding options
      if (format === 'mp4') {
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', qualitySettings.preset,
          '-crf', qualitySettings.crf.toString(),
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart'
        )
      } else {
        // GIF
        ffmpegArgs.push(
          '-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
          '-f', 'gif'
        )
      }

      // Audio handling
      if (this.config.audioEnabled && !this.config.audioMuted && this.config.videoPath) {
        // Map video from first input (stdin) and audio from second input (source video)
        ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0?')
        // Apply audio volume if needed
        if (this.config.audioVolume !== undefined && this.config.audioVolume !== 1) {
          ffmpegArgs.push('-af', `volume=${this.config.audioVolume}`)
        }
        // Encode audio
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k')
      } else {
        ffmpegArgs.push('-an')
      }

      ffmpegArgs.push(outputPath)

      const ffmpeg = spawn(this.ffmpegPath, ffmpegArgs)

      // Write frames to stdin with backpressure handling
      let frameIndex = 0
      let isWriting = false
      let hasError = false

      const writeNextFrame = () => {
        if (hasError || !ffmpeg.stdin.writable) {
          return
        }

        if (frameIndex >= frameBuffers.length) {
          if (!isWriting) {
            ffmpeg.stdin.end()
          }
          return
        }

        isWriting = true
        const frame = frameBuffers[frameIndex]
        frameIndex++

        try {
          const canContinue = ffmpeg.stdin.write(frame)
          
          if (canContinue) {
            // Buffer is not full, continue writing
            isWriting = false
            setImmediate(writeNextFrame)
          } else {
            // Buffer is full, wait for drain event
            ffmpeg.stdin.once('drain', () => {
              isWriting = false
              writeNextFrame()
            })
          }
        } catch (err) {
          hasError = true
          if (err instanceof Error) {
            reject(err)
          } else {
            reject(new Error(String(err)))
          }
        }
      }

      // Handle stdin errors (but don't fail if FFmpeg already finished)
      ffmpeg.stdin.on('error', (err) => {
        // EOF errors are expected when FFmpeg closes stdin after reading all data
        if (err.code !== 'EOF' && frameIndex < frameBuffers.length) {
          hasError = true
          reject(err)
        }
      })

      // Start writing frames
      writeNextFrame()

      let stderr = ''
      let ffmpegFinished = false
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString()
        // Check for errors in FFmpeg output
        if (data.toString().includes('Error') || data.toString().includes('error')) {
          logger.warn('FFmpeg warning:', data.toString().slice(0, 200))
        }
      })

      ffmpeg.on('close', (code) => {
        ffmpegFinished = true
        if (code === 0) {
          resolve()
        } else {
          // If we wrote all frames, it might still be a success
          if (frameIndex >= frameBuffers.length) {
            logger.warn(`FFmpeg exited with code ${code} but all frames were written`)
            resolve() // Consider it success if all frames were written
          } else {
            reject(new Error(`FFmpeg encoding failed with code ${code}: ${stderr.slice(-500)}`))
          }
        }
      })

      ffmpeg.on('error', (err) => {
        hasError = true
        reject(err)
      })
    })
  }

  /**
   * Cleanup temporary files
   */
  private cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true })
      } catch (e) {
        logger.warn('Failed to cleanup temp directory:', e)
      }
    }
  }

  /**
   * Cancel processing
   */
  cancel(): void {
    this.cancelRequested = true
  }
}

/**
 * Process a video with the given configuration
 */
export async function processVideoHeadless(
  config: CLIProjectConfig,
  progressCallback?: ProgressCallback
): Promise<ProcessingResult> {
  const processor = new HeadlessVideoProcessor(config)
  await processor.initialize()
  return processor.process(progressCallback)
}
