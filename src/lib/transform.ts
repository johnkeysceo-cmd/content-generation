import { EASING_MAP } from './easing'
import { ZoomRegion, MetaDataItem } from '../types'

// --- HELPER FUNCTIONS ---

/**
 * Linearly interpolates between two values.
 */
function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t
}

/**
 * Finds the index of the last metadata item with a timestamp less than or equal to the given time.
 * Uses binary search for performance optimization.
 */
export const findLastMetadataIndex = (metadata: MetaDataItem[], currentTime: number): number => {
  if (metadata.length === 0) return -1
  let left = 0
  let right = metadata.length - 1
  let result = -1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (metadata[mid].timestamp <= currentTime) {
      result = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  return result
}

// ============================================================
// STABLE SMOOTHING SYSTEM WITH HOLD FREEZE
// ============================================================

interface SimpleState {
  // EMA cursor smoothing
  smoothedX: number
  smoothedY: number
  initialized: boolean
  
  // Smoothed target for zoom
  zoomTargetX: number
  zoomTargetY: number
  
  // Camera follow state
  panX: number
  panY: number
  
  // Hold freeze - stops micro-bounce
  holdFrozen: boolean
  lastStableX: number
  lastStableY: number
  stableSince: number
}

// Persistent state across frames
let simpleState: SimpleState = {
  smoothedX: 0,
  smoothedY: 0,
  initialized: false,
  zoomTargetX: 0,
  zoomTargetY: 0,
  panX: 0,
  panY: 0,
  holdFrozen: false,
  lastStableX: 0,
  lastStableY: 0,
  stableSince: 0,
}

/**
 * Resets all state for a new playback session
 */
export function resetCameraState(): void {
  simpleState = {
    smoothedX: 0,
    smoothedY: 0,
    initialized: false,
    zoomTargetX: 0,
    zoomTargetY: 0,
    panX: 0,
    panY: 0,
    holdFrozen: false,
    lastStableX: 0,
    lastStableY: 0,
    stableSince: 0,
  }
}

/**
 * Gets smoothed mouse position using simple EMA
 */
function getSmoothedMousePosition(
  metadata: MetaDataItem[],
  targetTime: number,
): { x: number; y: number } | null {
  const endIndex = findLastMetadataIndex(metadata, targetTime)
  if (endIndex < 0) return null

  const targetEvent = metadata[endIndex]
  const rawX = targetEvent.x
  const rawY = targetEvent.y

  // Initialize on first call
  if (!simpleState.initialized) {
    simpleState.smoothedX = rawX
    simpleState.smoothedY = rawY
    simpleState.zoomTargetX = rawX
    simpleState.zoomTargetY = rawY
    simpleState.lastStableX = rawX
    simpleState.lastStableY = rawY
    simpleState.stableSince = Date.now()
    simpleState.initialized = true
    return { x: rawX, y: rawY }
  }

  // Simple EMA smoothing with factor 0.18
  const emaFactor = 0.18
  simpleState.smoothedX = lerp(simpleState.smoothedX, rawX, emaFactor)
  simpleState.smoothedY = lerp(simpleState.smoothedY, rawY, emaFactor)

  // Smooth the target: prevents tiny cursor noise from propagating
  const targetFactor = 0.25
  simpleState.zoomTargetX += (simpleState.smoothedX - simpleState.zoomTargetX) * targetFactor
  simpleState.zoomTargetY += (simpleState.smoothedY - simpleState.zoomTargetY) * targetFactor

  // Interpolate between events for sub-frame accuracy
  if (endIndex + 1 < metadata.length) {
    const nextEvent = metadata[endIndex + 1]
    const timeDiff = nextEvent.timestamp - targetEvent.timestamp
    if (timeDiff > 0 && timeDiff < 0.1) {
      const progress = (targetTime - targetEvent.timestamp) / timeDiff
      const interpolatedX = lerp(simpleState.zoomTargetX, nextEvent.x, progress * 0.2)
      const interpolatedY = lerp(simpleState.zoomTargetY, nextEvent.y, progress * 0.2)
      return { x: interpolatedX, y: interpolatedY }
    }
  }

  return { x: simpleState.zoomTargetX, y: simpleState.zoomTargetY }
}

/**
 * Calculates the final bounded translation values based on a smoothed mouse position.
 */
function calculateBoundedPan(
  mousePos: { x: number; y: number } | null,
  origin: { x: number; y: number },
  zoomLevel: number,
  recordingGeometry: { width: number; height: number },
  frameContentDimensions: { width: number; height: number },
): { tx: number; ty: number } {
  if (!mousePos) return { tx: 0, ty: 0 }

  // Normalized mouse position (0 to 1)
  const nsmx = mousePos.x / recordingGeometry.width
  const nsmy = mousePos.y / recordingGeometry.height

  // Calculate the target pan that would center the mouse
  const targetFinalPanX = (0.5 - ((nsmx - origin.x) * zoomLevel + origin.x)) * frameContentDimensions.width
  const targetFinalPanY = (0.5 - ((nsmy - origin.y) * zoomLevel + origin.y)) * frameContentDimensions.height

  // Apply this pan to the scaled-up coordinate space, then divide by scale to get the correct CSS translate value
  const targetTranslateX = targetFinalPanX / zoomLevel
  const targetTranslateY = targetFinalPanY / zoomLevel

  // Define the maximum allowed pan in any direction to keep the video in frame
  const maxTx = (origin.x * frameContentDimensions.width * (zoomLevel - 1)) / zoomLevel
  const minTx = -((1 - origin.x) * frameContentDimensions.width * (zoomLevel - 1)) / zoomLevel
  const maxTy = (origin.y * frameContentDimensions.height * (zoomLevel - 1)) / zoomLevel
  const minTy = -((1 - origin.y) * frameContentDimensions.height * (zoomLevel - 1)) / zoomLevel

  // Clamp the translation to the allowed bounds
  const tx = Math.max(minTx, Math.min(maxTx, targetTranslateX))
  const ty = Math.max(minTy, Math.min(maxTy, targetTranslateY))

  return { tx, ty }
}

/**
 * Calculates the transform-origin based on a normalized target point [-0.5, 0.5].
 * Implements edge snapping to prevent zooming outside the video frame.
 * The output is a value from 0 to 1 for CSS transform-origin.
 */
function getTransformOrigin(targetX: number, targetY: number): { x: number; y: number } {
  return { x: targetX + 0.5, y: targetY + 0.5 }
}

export const calculateZoomTransform = (
  currentTime: number,
  zoomRegions: Record<string, ZoomRegion>,
  metadata: MetaDataItem[],
  recordingGeometry: { width: number; height: number },
  frameContentDimensions: { width: number; height: number },
): { scale: number; translateX: number; translateY: number; transformOrigin: string; blur: number } => {
  const activeRegion = Object.values(zoomRegions).find(
    (r) => currentTime >= r.startTime && currentTime < r.startTime + r.duration,
  )

  const defaultTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    transformOrigin: '50% 50%',
    blur: 0,
  }

  if (!activeRegion) {
    return defaultTransform
  }

  const { startTime, duration, zoomLevel, targetX, targetY, mode, easing, transitionDuration, blurEnabled, blurAmount } = activeRegion
  const zoomOutStartTime = startTime + duration - transitionDuration
  const zoomInEndTime = startTime + transitionDuration

  const fixedOrigin = getTransformOrigin(targetX, targetY)
  const transformOrigin = `${fixedOrigin.x * 100}% ${fixedOrigin.y * 100}%`

  let currentScale = 1
  let currentTranslateX = 0
  let currentTranslateY = 0
  let currentBlur = 0

  // Calculate pan targets using smoothed cursor
  let livePan = { tx: 0, ty: 0 }
  let finalPan = { tx: 0, ty: 0 }

  if (mode === 'auto' && metadata.length > 0 && recordingGeometry.width > 0) {
    // Get smoothed mouse position
    const liveMousePos = getSmoothedMousePosition(metadata, currentTime)
    livePan = calculateBoundedPan(liveMousePos, fixedOrigin, zoomLevel, recordingGeometry, frameContentDimensions)

    // Get final mouse position for zoom-out
    const finalMousePos = getSmoothedMousePosition(metadata, zoomOutStartTime)
    finalPan = calculateBoundedPan(finalMousePos, fixedOrigin, zoomLevel, recordingGeometry, frameContentDimensions)
  }

  // Phase 1: ZOOM-IN
  if (currentTime >= startTime && currentTime < zoomInEndTime) {
    const t = (EASING_MAP[easing as keyof typeof EASING_MAP] || EASING_MAP.Balanced)(
      (currentTime - startTime) / transitionDuration,
    )
    currentScale = lerp(1, zoomLevel, t)
    
    // NEW: Calculate blur during zoom-in (fades out as we reach full zoom)
    if (blurEnabled) {
      const blurProgress = 1 - t // 1 at start, 0 at end of zoom-in
      currentBlur = blurAmount * blurProgress * 0.5
    }
    
    // Reset pan and hold state during zoom-in
    simpleState.panX = 0
    simpleState.panY = 0
    simpleState.holdFrozen = false
    simpleState.lastStableX = 0
    simpleState.lastStableY = 0
  }
  // Phase 2: HOLD (with proper freeze to prevent micro-bounce)
  else if (currentTime >= zoomInEndTime && currentTime < zoomOutStartTime) {
    currentScale = zoomLevel
    // No blur during hold phase
    currentBlur = 0

    // Calculate distance from center to determine if we should move
    const holdThreshold = 40
    const centerX = frameContentDimensions.width / 2
    const centerY = frameContentDimensions.height / 2

    // Get current smoothed position
    const mousePos = getSmoothedMousePosition(metadata, currentTime)
    
    if (mousePos) {
      const mouseFrameX = (mousePos.x / recordingGeometry.width) * frameContentDimensions.width
      const mouseFrameY = (mousePos.y / recordingGeometry.height) * frameContentDimensions.height
      
      const distFromCenter = Math.sqrt(
        Math.pow(mouseFrameX - centerX, 2) + 
        Math.pow(mouseFrameY - centerY, 2)
      )
      
      // Calculate stability - has cursor moved significantly?
      const moveThreshold = 15 // pixels
      const dx = mousePos.x - simpleState.lastStableX
      const dy = mousePos.y - simpleState.lastStableY
      const moved = Math.sqrt(dx * dx + dy * dy) > moveThreshold
      
      if (moved) {
        // Cursor moved - update stable position and unfreeze
        simpleState.lastStableX = mousePos.x
        simpleState.lastStableY = mousePos.y
        simpleState.stableSince = Date.now()
        simpleState.holdFrozen = false
      } else {
        // Cursor stable - freeze after brief period to prevent micro-bounce
        const stableTime = Date.now() - simpleState.stableSince
        if (stableTime > 100 && distFromCenter < holdThreshold) {
          // Been stable for 100ms and near center - freeze!
          simpleState.holdFrozen = true
        }
      }
    }

    // Only update pan if not frozen
    if (!simpleState.holdFrozen) {
      simpleState.panX += (livePan.tx - simpleState.panX) * 0.22
      simpleState.panY += (livePan.ty - simpleState.panY) * 0.22
    }

    currentTranslateX = simpleState.panX
    currentTranslateY = simpleState.panY
  }
  // Phase 3: ZOOM-OUT
  else if (currentTime >= zoomOutStartTime && currentTime <= startTime + duration) {
    const t = (EASING_MAP[easing as keyof typeof EASING_MAP] || EASING_MAP.Balanced)(
      (currentTime - zoomOutStartTime) / transitionDuration,
    )
    currentScale = lerp(zoomLevel, 1, t)
    currentTranslateX = lerp(finalPan.tx, 0, t)
    currentTranslateY = lerp(finalPan.ty, 0, t)
    
    // NEW: Calculate blur during zoom-out (fades in as we zoom out)
    if (blurEnabled) {
      const blurProgress = t // 0 at start, 1 at end of zoom-out
      currentBlur = blurAmount * blurProgress * 0.5
    }
    
    // Reset hold during zoom-out
    simpleState.holdFrozen = false
  }

  // Only snap if extremely small (less than 0.01 px) to prevent subpixel shake
  if (Math.abs(currentTranslateX) < 0.01) currentTranslateX = 0
  if (Math.abs(currentTranslateY) < 0.01) currentTranslateY = 0

  return { 
    scale: currentScale, 
    translateX: currentTranslateX, 
    translateY: currentTranslateY, 
    transformOrigin,
    blur: currentBlur,
  }
}
