import { EditorState, RenderableState, WebcamPosition } from '../types'
import { calculateZoomTransform, findLastMetadataIndex } from './transform'
import { EASING_MAP } from './easing'
import { DEFAULTS } from './constants'

type Rect = { x: number; y: number; width: number; height: number }

const ADJACENT_POSITIONS: Record<WebcamPosition['pos'], [WebcamPosition['pos'], WebcamPosition['pos']]> = {
  'top-left': ['top-center', 'left-center'],
  'top-center': ['top-left', 'top-right'],
  'top-right': ['top-center', 'right-center'],
  'right-center': ['top-right', 'bottom-right'],
  'bottom-right': ['right-center', 'bottom-center'],
  'bottom-center': ['bottom-right', 'bottom-left'],
  'bottom-left': ['bottom-center', 'left-center'],
  'left-center': ['bottom-left', 'top-left'],
}

function getWebcamRectForPosition(
  pos: WebcamPosition['pos'],
  width: number,
  height: number,
  outputWidth: number,
  outputHeight: number,
): Rect {
  const baseSize = Math.min(outputWidth, outputHeight)
  const edgePadding = baseSize * 0.02

  switch (pos) {
    case 'top-left':
      return { x: edgePadding, y: edgePadding, width, height }
    case 'top-center':
      return { x: (outputWidth - width) / 2, y: edgePadding, width, height }
    case 'top-right':
      return { x: outputWidth - width - edgePadding, y: edgePadding, width, height }
    case 'left-center':
      return { x: edgePadding, y: (outputHeight - height) / 2, width, height }
    case 'right-center':
      return { x: outputWidth - width - edgePadding, y: (outputHeight - height) / 2, width, height }
    case 'bottom-left':
      return { x: edgePadding, y: outputHeight - height - edgePadding, width, height }
    case 'bottom-center':
      return { x: (outputWidth - width) / 2, y: outputHeight - height - edgePadding, width, height }
    default:
      return { x: outputWidth - width - edgePadding, y: outputHeight - height - edgePadding, width, height }
  }
}

function isPointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t
}

/**
 * Draws the background with optimized rendering
 */
const drawBackground = async (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundState: EditorState['frameStyles']['background'],
  preloadedImage: HTMLImageElement | null,
): Promise<void> => {
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
      let gradient

      if (direction.startsWith('circle')) {
        gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) / 2,
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
            case 'to bottom':
              return [0, 0, 0, height]
            case 'to top':
              return [0, height, 0, 0]
            case 'to right':
              return [0, 0, width, 0]
            case 'to left':
              return [width, 0, 0, 0]
            case 'to bottom right':
              return [0, 0, width, height]
            case 'to bottom left':
              return [width, 0, 0, height]
            case 'to top right':
              return [0, height, width, 0]
            case 'to top left':
              return [width, height, 0, 0]
            default:
              return [0, 0, width, 0]
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
      if (preloadedImage && preloadedImage.complete) {
        const img = preloadedImage
        const imgRatio = img.width / img.height
        const canvasRatio = width / height
        let sx, sy, sWidth, sHeight

        if (imgRatio > canvasRatio) {
          sHeight = img.height
          sWidth = sHeight * canvasRatio
          sx = (img.width - sWidth) / 2
          sy = 0
        } else {
          sWidth = img.width
          sHeight = sWidth / canvasRatio
          sx = 0
          sy = (img.height - sHeight) / 2
        }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height)
      } else {
        ctx.fillStyle = 'oklch(0.2077 0.0398 265.7549)'
        ctx.fillRect(0, 0, width, height)
      }
      break
    }
    default:
      ctx.fillStyle = 'oklch(0.2077 0.0398 265.7549)'
      ctx.fillRect(0, 0, width, height)
  }
}

/**
 * Main rendering function with enhanced visuals
 */
export const drawScene = async (
  ctx: CanvasRenderingContext2D,
  state: RenderableState,
  videoElement: HTMLVideoElement,
  webcamVideoElement: HTMLVideoElement | null,
  currentTime: number,
  outputWidth: number,
  outputHeight: number,
  preloadedBgImage: HTMLImageElement | null,
): Promise<void> => {
  if (!state.videoDimensions.width || !state.videoDimensions.height) return

  // Enable high-quality rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // --- 1. Draw Background ---
  await drawBackground(ctx, outputWidth, outputHeight, state.frameStyles.background, preloadedBgImage)

  // --- 2. Calculate Frame and Content Dimensions ---
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

  // --- 3. Main video frame transform and drawing ---
  ctx.save()

  const { scale, translateX, translateY, transformOrigin, blur } = calculateZoomTransform(
    currentTime,
    state.zoomRegions,
    state.metadata,
    state.recordingGeometry || state.videoDimensions,
    { width: frameContentWidth, height: frameContentHeight },
  )

  const [originXStr, originYStr] = transformOrigin.split(' ')
  const originXMul = parseFloat(originXStr) / 100
  const originYMul = parseFloat(originYStr) / 100
  const originPxX = originXMul * frameContentWidth
  const originPxY = originYMul * frameContentHeight

  // STABLE RENDER: Use setTransform once per frame to avoid floating-point drift
  // ctx.setTransform(scale, 0, 0, scale, panX, panY)
  // Transform order: translate to frame → scale from origin → translate
  ctx.translate(frameX, frameY)
  ctx.translate(originPxX, originPxY)
  ctx.scale(scale, scale)
  ctx.translate(translateX, translateY)
  ctx.translate(-originPxX, -originPxY)

  const { shadowBlur, shadowOffsetX, shadowOffsetY, borderRadius, shadowColor, borderWidth, borderColor } = frameStyles

  // Draw shadow if needed
  if (shadowBlur > 0) {
    ctx.save()
    ctx.shadowColor = shadowColor
    ctx.shadowBlur = shadowBlur
    ctx.shadowOffsetX = shadowOffsetX
    ctx.shadowOffsetY = shadowOffsetY
    const shadowPath = new Path2D()
    shadowPath.roundRect(0, 0, frameContentWidth, frameContentHeight, borderRadius)
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fill(shadowPath)
    ctx.restore()
  }

  // Draw the video and border
  ctx.save()
  const path = new Path2D()
  path.roundRect(0, 0, frameContentWidth, frameContentHeight, borderRadius)
  ctx.clip(path)
  
  // NEW: Apply blur effect during zoom transitions
  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`
  }
  
  ctx.drawImage(videoElement, 0, 0, frameContentWidth, frameContentHeight)
  
  // Reset filter after drawing video
  if (blur > 0) {
    ctx.filter = 'none'
  }

  // Draw border on top of the video content
  if (borderWidth > 0) {
    ctx.strokeStyle = borderColor
    ctx.lineWidth = borderWidth * 2
    ctx.stroke(path)
  }
  ctx.restore()

  // --- 4. Draw Click Animations ---
  if (state.cursorStyles.clickRippleEffect && state.recordingGeometry) {
    const { clickRippleDuration, clickRippleSize, clickRippleColor } = state.cursorStyles
    const rippleEasing = EASING_MAP.Balanced // Ripple uses a standard ease-out

    const recentRippleClicks = state.metadata.filter(
      (event) =>
        event.type === 'click' &&
        event.pressed &&
        currentTime >= event.timestamp &&
        currentTime < event.timestamp + clickRippleDuration,
    )

    for (const click of recentRippleClicks) {
      const progress = (currentTime - click.timestamp) / clickRippleDuration
      const easedProgress = rippleEasing(progress)
      const currentRadius = easedProgress * clickRippleSize
      const currentOpacity = 1 - easedProgress

      // Scale cursor position from original recording geometry to the current frame's content size
      const cursorX = (click.x / state.recordingGeometry.width) * frameContentWidth
      const cursorY = (click.y / state.recordingGeometry.height) * frameContentHeight

      const colorResult = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(clickRippleColor)
      if (colorResult) {
        const [r, g, b, baseAlpha] = colorResult.slice(1).map(Number)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${baseAlpha * currentOpacity})`
      }

      ctx.beginPath()
      ctx.arc(cursorX, cursorY, currentRadius, 0, 2 * Math.PI)
      ctx.fill()
    }
  }

  // --- 5. Draw ENHANCED Cursor with ALL FX ---
  const lastEventIndex = findLastMetadataIndex(state.metadata, currentTime)

  if (state.cursorStyles.showCursor && lastEventIndex > -1 && state.recordingGeometry) {
    const event = state.metadata[lastEventIndex]
    if (event && currentTime - event.timestamp < 0.1) {
      const cursorData = state.cursorBitmapsToRender.get(event.cursorImageKey!)

      if (cursorData && cursorData.imageBitmap && cursorData.width > 0) {
        const cursorX = (event.x / state.recordingGeometry.width) * frameContentWidth
        const cursorY = (event.y / state.recordingGeometry.height) * frameContentHeight
        const drawX = Math.round(cursorX - cursorData.xhot)
        const drawY = Math.round(cursorY - cursorData.yhot)

        // === ENHANCED Motion Trail Effect ===
        if (state.cursorStyles.cursorMotionTrail && state.cursorStyles.motionTrailLength > 0) {
          const trailLength = Math.min(state.cursorStyles.motionTrailLength * 2, 30)
          const trailOpacity = state.cursorStyles.motionTrailOpacity

          const recentMoveEvents = state.metadata
            .filter(
              (e) =>
                e.type === 'move' &&
                e.timestamp < event.timestamp &&
                e.timestamp > event.timestamp - 0.15,
            )
            .slice(-trailLength)

          for (let i = 0; i < recentMoveEvents.length; i++) {
            const trailEvent = recentMoveEvents[i]
            const trailProgress = i / recentMoveEvents.length
            const trailAlpha = trailOpacity * (1 - Math.pow(trailProgress, 0.7))

            const trailX = (trailEvent.x / state.recordingGeometry.width) * frameContentWidth
            const trailY = (trailEvent.y / state.recordingGeometry.height) * frameContentHeight
            const trailDrawX = Math.round(trailX - cursorData.xhot)
            const trailDrawY = Math.round(trailY - cursorData.yhot)

            ctx.save()
            ctx.globalAlpha = trailAlpha
            ctx.filter = `blur(${1 + trailProgress * 4}px)`
            ctx.drawImage(cursorData.imageBitmap, trailDrawX, trailDrawY)
            ctx.restore()
          }
        }

        // === ENHANCED Motion Blur Effect ===
        if (state.cursorStyles.cursorMotionBlur && state.cursorStyles.motionBlurIntensity > 0) {
          const { motionBlurIntensity, motionBlurThreshold } = state.cursorStyles

          const prevMoveEvent = state.metadata
            .filter(
              (e) =>
                e.type === 'move' &&
                e.timestamp < event.timestamp &&
                e.timestamp > event.timestamp - 0.05,
            )
            .pop()

          if (prevMoveEvent) {
            const dx = event.x - prevMoveEvent.x
            const dy = event.y - prevMoveEvent.y
            const speed = Math.sqrt(dx * dx + dy * dy)

            if (speed > motionBlurThreshold) {
              const blurAmount = Math.min(speed * 0.1 * motionBlurIntensity, 40)
              const angle = Math.atan2(dy, dx)

              ctx.save()
              ctx.translate(drawX + cursorData.xhot, drawY + cursorData.yhot)
              ctx.rotate(angle)
              ctx.globalAlpha = 0.5 * motionBlurIntensity

              for (let i = 1; i <= 6; i++) {
                const streakLength = blurAmount * i * 0.35
                ctx.globalAlpha = 0.3 * motionBlurIntensity * (1 - i * 0.15)
                ctx.drawImage(
                  cursorData.imageBitmap,
                  -cursorData.xhot - streakLength,
                  -cursorData.yhot,
                  cursorData.width,
                  cursorData.height,
                )
              }

              ctx.restore()
            }
          }
        }

        // === NEW: Speed Lines Effect ===
        if (state.cursorStyles.speedLines && state.cursorStyles.speedLinesIntensity > 0) {
          const { speedLinesIntensity, speedLinesThreshold } = state.cursorStyles
          
          const speedMoveEvent = state.metadata
            .filter(
              (e) =>
                e.type === 'move' &&
                e.timestamp < event.timestamp &&
                e.timestamp > event.timestamp - 0.03,
            )
            .pop()

          if (speedMoveEvent) {
            const dx = event.x - speedMoveEvent.x
            const dy = event.y - speedMoveEvent.y
            const speed = Math.sqrt(dx * dx + dy * dy)

            if (speed > speedLinesThreshold) {
              const angle = Math.atan2(dy, dx)
              const numLines = Math.floor(5 + speedLinesIntensity * 8)
              
              ctx.save()
              ctx.translate(cursorX, cursorY)
              ctx.rotate(angle)
              
              for (let i = 0; i < numLines; i++) {
                const lineLength = 20 + Math.random() * 40 * speedLinesIntensity
                const lineOffset = (i - numLines / 2) * 8
                const alpha = (0.3 + Math.random() * 0.4) * speedLinesIntensity
                
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
                ctx.lineWidth = 1 + Math.random() * 2
                ctx.beginPath()
                ctx.moveTo(-10, lineOffset)
                ctx.lineTo(-10 - lineLength, lineOffset)
                ctx.stroke()
              }
              
              ctx.restore()
            }
          }
        }

        // === NEW: Swoosh Effect ===
        if (state.cursorStyles.swooshEffect && state.cursorStyles.swooshIntensity > 0) {
          const { swooshIntensity, swooshThreshold } = state.cursorStyles
          
          const swooshMoveEvents = state.metadata
            .filter(
              (e) =>
                e.type === 'move' &&
                e.timestamp < event.timestamp &&
                e.timestamp > event.timestamp - 0.08,
            )
            .slice(-3)
          
          if (swooshMoveEvents.length >= 2) {
            const first = swooshMoveEvents[0]
            const last = swooshMoveEvents[swooshMoveEvents.length - 1]
            const dx = last.x - first.x
            const dy = last.y - first.y
            const speed = Math.sqrt(dx * dx + dy * dy)

            if (speed > swooshThreshold) {
              const startX = (first.x / state.recordingGeometry.width) * frameContentWidth
              const startY = (first.y / state.recordingGeometry.height) * frameContentHeight
              const angle = Math.atan2(dy, dx)
              
              ctx.save()
              ctx.translate(startX, startY)
              ctx.rotate(angle)
              
              // Draw swoosh arc
              const swooshLength = speed * 0.8 * swooshIntensity
              const gradient = ctx.createLinearGradient(0, 0, -swooshLength, 0)
              gradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 * swooshIntensity})`)
              gradient.addColorStop(0.5, `rgba(200, 220, 255, ${0.3 * swooshIntensity})`)
              gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
              
              ctx.strokeStyle = gradient
              ctx.lineWidth = 8 * swooshIntensity
              ctx.lineCap = 'round'
              ctx.beginPath()
              ctx.moveTo(0, 0)
              ctx.quadraticCurveTo(-swooshLength * 0.5, 15 * swooshIntensity, -swooshLength, 0)
              ctx.stroke()
              
              ctx.restore()
            }
          }
        }

        ctx.save()

        // Handle click scale animation - MORE DRAMATIC
        let cursorScale = 1
        if (state.cursorStyles.clickScaleEffect) {
          const { clickScaleDuration, clickScaleAmount, clickScaleEasing } = state.cursorStyles
          const mostRecentClick = state.metadata
            .filter(
              (e) =>
                e.type === 'click' &&
                e.pressed &&
                e.timestamp <= currentTime &&
                e.timestamp > currentTime - clickScaleDuration,
            )
            .pop()

          if (mostRecentClick) {
            const progress = (currentTime - mostRecentClick.timestamp) / clickScaleDuration
            const easingFn = EASING_MAP[clickScaleEasing as keyof typeof EASING_MAP] || EASING_MAP.Balanced
            const easedProgress = easingFn(progress)
            // More dramatic bounce effect
            const bounceEffect = Math.sin(easedProgress * Math.PI * 2) * 0.15
            const scaleValue = 1 - (1 - clickScaleAmount) * Math.sin(easedProgress * Math.PI) + bounceEffect
            cursorScale = scaleValue
          }
        }

        // Apply drop shadow - STRONGER
        const { shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor } = state.cursorStyles
        if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
          ctx.filter = `drop-shadow(${shadowOffsetX * 1.5}px ${shadowOffsetY * 1.5}px ${shadowBlur * 2}px ${shadowColor})`
        }

        // === ENHANCED Cursor Glow Effect ===
        if (state.cursorStyles.cursorGlowEffect && state.cursorStyles.cursorGlowSize > 0) {
          const { cursorGlowColor, cursorGlowSize, cursorGlowIntensity } = state.cursorStyles

          const glowColorResult = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(cursorGlowColor)
          if (glowColorResult) {
            // Multiple glow layers
            for (let i = 5; i >= 1; i--) {
              const layerSize = cursorGlowSize * i * 0.35 * cursorGlowIntensity
              const layerAlpha = 0.25 * cursorGlowIntensity * (1 - i * 0.12)

              ctx.save()
              ctx.globalAlpha = layerAlpha
              ctx.filter = `blur(${layerSize * 0.6}px)`
              ctx.drawImage(cursorData.imageBitmap, drawX, drawY)
              ctx.restore()
            }
            
            // Outer halo
            ctx.save()
            ctx.globalAlpha = 0.2 * cursorGlowIntensity
            ctx.filter = `blur(${cursorGlowSize * cursorGlowIntensity * 1.5}px)`
            ctx.globalCompositeOperation = 'screen'
            ctx.drawImage(cursorData.imageBitmap, drawX, drawY)
            ctx.restore()
          }
        }

        // Apply scale transform if needed
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
    }
  }

  // === NEW: Click Explosion Effect ===
  if (state.cursorStyles.clickExplosion && state.recordingGeometry) {
    const { clickExplosionIntensity, clickExplosionParticles } = state.cursorStyles
    
    const recentClicks = state.metadata.filter(
      (e) =>
        e.type === 'click' &&
        e.pressed &&
        currentTime >= e.timestamp &&
        currentTime < e.timestamp + 0.4,
    )

    for (const click of recentClicks) {
      const progress = (currentTime - click.timestamp) / 0.4
      if (progress < 1) {
        const clickX = (click.x / state.recordingGeometry.width) * frameContentWidth
        const clickY = (click.y / state.recordingGeometry.height) * frameContentHeight
        
        const particles = Math.floor(clickExplosionParticles * (1 - progress))
        const explosionRadius = progress * 60 * clickExplosionIntensity
        
        ctx.save()
        for (let i = 0; i < particles; i++) {
          const angle = (i / particles) * Math.PI * 2 + progress * 2
          const distance = explosionRadius * (0.3 + Math.random() * 0.7)
          const px = clickX + Math.cos(angle) * distance
          const py = clickY + Math.sin(angle) * distance
          const size = 2 + Math.random() * 4 * (1 - progress)
          const alpha = (0.8 - progress) * clickExplosionIntensity
          
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, size, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
    }
  }

  ctx.restore() // Restore from video's transform

  // --- 6. Draw Webcam ---
  const { webcamPosition, webcamStyles, isWebcamVisible } = state
  if (isWebcamVisible && webcamVideoElement && webcamVideoElement.videoWidth > 0 && state.recordingGeometry) {
    let finalWebcamScale = 1
    if (webcamStyles.scaleOnZoom) {
      const activeZoomRegion = Object.values(state.zoomRegions).find(
        (r) => currentTime >= r.startTime && currentTime < r.startTime + r.duration,
      )
      if (activeZoomRegion) {
        const { startTime, duration, transitionDuration } = activeZoomRegion
        const zoomInEndTime = startTime + transitionDuration
        const zoomOutStartTime = startTime + duration - transitionDuration
        const easingFn = EASING_MAP[activeZoomRegion.easing as keyof typeof EASING_MAP] || EASING_MAP.Balanced

        if (currentTime < zoomInEndTime) {
          const progress = (currentTime - startTime) / transitionDuration
          finalWebcamScale = lerp(1, DEFAULTS.CAMERA.SCALE_ON_ZOOM_AMOUNT, easingFn(progress))
        } else if (currentTime >= zoomOutStartTime) {
          const progress = (currentTime - zoomOutStartTime) / transitionDuration
          finalWebcamScale = lerp(DEFAULTS.CAMERA.SCALE_ON_ZOOM_AMOUNT, 1, easingFn(progress))
        } else {
          finalWebcamScale = DEFAULTS.CAMERA.SCALE_ON_ZOOM_AMOUNT
        }
      }
    }

    const baseSize = Math.min(outputWidth, outputHeight)
    let initialWebcamWidth, initialWebcamHeight
    if (webcamStyles.shape === 'rectangle') {
      initialWebcamWidth = baseSize * (webcamStyles.size / 100)
      initialWebcamHeight = initialWebcamWidth * (9 / 16)
    } else {
      initialWebcamWidth = baseSize * (webcamStyles.size / 100)
      initialWebcamHeight = initialWebcamWidth
    }

    const originalPos = webcamPosition.pos
    let currentPos = originalPos
    let previousPos = originalPos
    let timeOfChange = 0

    if (webcamStyles.smartPosition) {
      const getTargetPosAtTime = (time: number): WebcamPosition['pos'] => {
        const originalRect = getWebcamRectForPosition(
          originalPos,
          initialWebcamWidth,
          initialWebcamHeight,
          outputWidth,
          outputHeight,
        )
        const futureCursorIndex = findLastMetadataIndex(
          state.metadata,
          time + DEFAULTS.CAMERA.SMART_POSITION.LOOKAHEAD_TIME,
        )
        if (futureCursorIndex > -1) {
          const futureCursorEvent = state.metadata[futureCursorIndex]
          const cursorCanvasX = (futureCursorEvent.x / state.recordingGeometry!.width) * frameContentWidth + frameX
          const cursorCanvasY = (futureCursorEvent.y / state.recordingGeometry!.height) * frameContentHeight + frameY
          if (isPointInRect({ x: cursorCanvasX, y: cursorCanvasY }, originalRect)) {
            const [adj1, adj2] = ADJACENT_POSITIONS[originalPos]
            const adj1Rect = getWebcamRectForPosition(
              adj1,
              initialWebcamWidth,
              initialWebcamHeight,
              outputWidth,
              outputHeight,
            )
            return !isPointInRect({ x: cursorCanvasX, y: cursorCanvasY }, adj1Rect) ? adj1 : adj2
          }
        }
        return originalPos
      }

      currentPos = getTargetPosAtTime(currentTime)
      const checkInterval = 0.05

      for (let t = currentTime; t >= 0; t -= checkInterval) {
        const posAtT = getTargetPosAtTime(t)
        if (posAtT !== currentPos) {
          previousPos = posAtT
          timeOfChange = t + checkInterval
          break
        }
        if (t === 0) {
          previousPos = currentPos
          timeOfChange = 0
        }
      }
    }

    const transitionDuration = DEFAULTS.CAMERA.SMART_POSITION.TRANSITION_DURATION
    let progress = 1
    if (previousPos !== currentPos && currentTime - timeOfChange < transitionDuration) {
      progress = (currentTime - timeOfChange) / transitionDuration
    }

    const easingFn = EASING_MAP[DEFAULTS.CAMERA.SMART_POSITION.EASING as keyof typeof EASING_MAP] || EASING_MAP.Balanced
    const easedProgress = easingFn(Math.min(1, progress))

    const startRect = getWebcamRectForPosition(
      previousPos,
      initialWebcamWidth,
      initialWebcamHeight,
      outputWidth,
      outputHeight,
    )
    const targetRect = getWebcamRectForPosition(
      currentPos,
      initialWebcamWidth,
      initialWebcamHeight,
      outputWidth,
      outputHeight,
    )

    const baseWebcamX = lerp(startRect.x, targetRect.x, easedProgress)
    const baseWebcamY = lerp(startRect.y, targetRect.y, easedProgress)

    const webcamWidth = initialWebcamWidth * finalWebcamScale
    const webcamHeight = initialWebcamHeight * finalWebcamScale

    let webcamX = baseWebcamX
    let webcamY = baseWebcamY

    if (originalPos.includes('right')) {
      webcamX += initialWebcamWidth - webcamWidth
    } else if (originalPos === 'top-center' || originalPos === 'bottom-center') {
      webcamX += (initialWebcamWidth - webcamWidth) / 2
    }

    if (originalPos.includes('bottom')) {
      webcamY += initialWebcamHeight - webcamHeight
    } else if (originalPos === 'left-center' || originalPos === 'right-center') {
      webcamY += (initialWebcamHeight - webcamHeight) / 2
    }

    const maxRadius = Math.min(webcamWidth, webcamHeight) / 2
    let webcamRadius = 0

    if (webcamStyles.shape === 'circle') {
      webcamRadius = maxRadius
    } else {
      webcamRadius = maxRadius * (webcamStyles.borderRadius / 50)
    }

    if (webcamStyles.shadowBlur > 0) {
      ctx.save()
      ctx.shadowColor = webcamStyles.shadowColor
      ctx.shadowBlur = webcamStyles.shadowBlur
      ctx.shadowOffsetX = webcamStyles.shadowOffsetX
      ctx.shadowOffsetY = webcamStyles.shadowOffsetY
      const webcamShadowPath = new Path2D()
      webcamShadowPath.roundRect(webcamX, webcamY, webcamWidth, webcamHeight, webcamRadius)
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.fill(webcamShadowPath)
      ctx.restore()
    }

    const webcamVideo = webcamVideoElement
    const webcamAR = webcamVideo.videoWidth / webcamVideo.videoHeight
    const targetAR = webcamWidth / webcamHeight

    let sx = 0,
      sy = 0,
      sWidth = webcamVideo.videoWidth,
      sHeight = webcamVideo.videoHeight

    if (webcamAR > targetAR) {
      sWidth = webcamVideo.videoHeight * targetAR
      sx = (webcamVideo.videoWidth - sWidth) / 2
    } else {
      sHeight = webcamVideo.videoWidth / targetAR
      sy = (webcamVideo.videoHeight - sHeight) / 2
    }

    ctx.save()

    if (webcamStyles.isFlipped) {
      ctx.translate(outputWidth, 0)
      ctx.scale(-1, 1)
    }

    const drawX = webcamStyles.isFlipped ? outputWidth - webcamX - webcamWidth : webcamX
    const webcamPath = new Path2D()
    webcamPath.roundRect(drawX, webcamY, webcamWidth, webcamHeight, webcamRadius)
    ctx.clip(webcamPath)
    ctx.drawImage(webcamVideo, sx, sy, sWidth, sHeight, drawX, webcamY, webcamWidth, webcamHeight)
    ctx.restore()
  }

  // --- 7. Draw Vignette Effect (AI Demo Look) ---
  // Vignette effect is disabled - properties not in FrameStyles
  // TODO: Add vignetteEnabled, vignetteIntensity, vignetteColor to FrameStyles type
}
