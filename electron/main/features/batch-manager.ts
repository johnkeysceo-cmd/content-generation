// Batch processing - CLI automation for video processing using UI automation

import { app, ipcMain } from 'electron'
import log from 'electron-log/main'
import path from 'node:path'
import fsPromises from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { getFFmpegPath } from '../lib/utils'
import { appState } from '../state'
import { createEditorWindow } from '../windows/editor-window'
import { startExport } from './export-manager'

const FFMPEG_PATH = getFFmpegPath()

export interface BatchOptions {
  inputPath: string
  outputPath: string
  autoZoom?: boolean
  zoomLevel?: number
  regionDuration?: number
  resolution?: string
  quality?: 'low' | 'medium' | 'high'
}

interface VideoInfo {
  width: number
  height: number
  duration: number
  fps: number
}

/**
 * Process a video file through the ScreenArc UI automation pipeline:
 * 1. Import video (via UI)
 * 2. Auto-generate zoom regions  
 * 3. Trigger export via UI
 */
export async function processVideoBatch(options: BatchOptions): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { inputPath, outputPath, autoZoom = true, zoomLevel = 2.5, regionDuration = 5, resolution = '1080p', quality = 'high' } = options

  log.info(`[BatchManager] Starting UI automation batch process: ${inputPath}`)
  console.log(`\n📹 Processing: ${inputPath}`)

  // Step 1: Get video info
  console.log(`   📊 Analyzing video...`)
  const videoInfo = await getVideoInfo(inputPath)
  
  // Use defaults if analysis fails
  const info = videoInfo || { width: 1920, height: 1080, duration: 60, fps: 30 }
  console.log(`   ✓ ${info.width}x${info.height}, ${Math.round(info.duration)}s`)

  // Step 2: Copy video to app storage (like import does)
  console.log(`   📥 Preparing video...`)
  const importedPath = await importVideo(inputPath, info)
  if (!importedPath) {
    const error = 'Failed to prepare video'
    console.error(`   ❌ ${error}`)
    return { success: false, error }
  }
  console.log(`   ✓ Video prepared`)

  // Step 3: Generate metadata with simulated cursor events
  console.log(`   🔍 Generating cursor data...`)
  const metadataResult = await generateMetadata(importedPath, info)
  if (!metadataResult) {
    const error = 'Failed to generate metadata'
    console.error(`   ❌ ${error}`)
    return { success: false, error }
  }
  const { events, path: metadataPath } = metadataResult
  console.log(`   ✓ Generated ${events.length} cursor events`)

  // Step 4: Auto-generate zoom regions based on actual cursor positions
  let zoomRegions: Record<string, unknown> = {}
  if (autoZoom) {
    console.log(`   🎬 Generating zoom regions...`)
    zoomRegions = generateAutoZoomRegions(info, events, zoomLevel, regionDuration)
    console.log(`   ✓ ${Object.keys(zoomRegions).length} zoom regions created`)
  }

  // Step 5: Create editor window with the imported video (like normal import)
  // Note: We pass zoomRegions directly to startExport, so no need to send via IPC
  console.log(`   📂 Opening in editor...`)
  createEditorWindow(importedPath, metadataPath, { x: 0, y: 0, width: info.width, height: info.height }, undefined)

  // Wait for editor to be ready
  await new Promise(resolve => setTimeout(resolve, 3000))

  if (!appState.editorWin || appState.editorWin.isDestroyed()) {
    return { success: false, error: 'Failed to open editor' }
  }

  // Wait for render worker to be ready
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Step 6: Trigger export DIRECTLY with zoom regions in projectState
  console.log(`   📤 Starting export...`)
  
  // Get export settings
  const exportSettings = {
    resolution,
    fps: 60,
    format: 'mp4' as const,
    quality,
  }

  // Calculate aspect ratio from video dimensions
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(info.width, info.height)
  const aspectRatio = `${info.width / divisor}:${info.height / divisor}`

  // Build project state with the ACTUAL metadata events (this was the bug!)
  // Note: metadata should be an array of MetaDataItem (events), not the full metadata object
  // Use the SAME default values as the app to ensure identical rendering
  const projectState = {
    platform: process.platform,
    videoPath: importedPath,
    metadata: events.map(e => ({
      ...e,
      type: 'move' as const,  // Required field for MetaDataItem
    })),
    videoDimensions: { width: info.width, height: info.height },
    duration: info.duration,
    // Use app default values for frame styles to match manual processing exactly
    frameStyles: {
      padding: 5,
      borderRadius: 16,
      shadowBlur: 35,
      shadowOffsetX: 0,
      shadowOffsetY: 15,
      shadowColor: 'rgba(0, 0, 0, 0.8)',
      borderWidth: 4,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      background: {
        type: 'color' as const,
        color: '#000000',
      },
    },
    aspectRatio,  // Calculated from actual video dimensions
    zoomRegions,
    cutRegions: {},
    speedRegions: {},
    webcamVideoPath: null,
    webcamPosition: { pos: 'bottom-right' as const, x: 0, y: 0 },
    webcamStyles: {
      shape: 'circle' as const,
      size: 40,
      borderRadius: 35,
      isFlipped: false,
      scaleOnZoom: true,
      shadowBlur: 20,
      shadowOffsetX: 0,
      shadowOffsetY: 10,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      blur: 20,
      offsetX: 0,
      offsetY: 10,
      opacity: 0.4,
    },
    isWebcamVisible: false,
    recordingGeometry: { x: 0, y: 0, width: info.width, height: info.height },
    cursorImages: {},
    cursorTheme: null,
    // Use app default values for cursor styles to match manual processing exactly
    cursorStyles: {
      showCursor: true,
      shadowBlur: 6,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      clickRippleEffect: false,
      clickRippleColor: 'rgba(255, 255, 255, 0.8)',
      clickRippleSize: 30,
      clickRippleDuration: 0.5,
      clickScaleEffect: true,
      clickScaleAmount: 0.8,
      clickScaleDuration: 0.4,
      clickScaleEasing: 'Balanced',
    },
    syncOffset: 0,
  }

  // Call export directly from main process (exactly like manual export)
  // Wait for export:complete message
  const exportResult = await new Promise<{ success: boolean; outputPath?: string; error?: string }>((resolve) => {
    const completeHandler = (_event: unknown, result: { success: boolean; outputPath?: string; error?: string }) => {
      ipcMain.removeListener('export:complete', completeHandler)
      resolve(result)
    }
    ipcMain.on('export:complete', completeHandler)
    
    // Create a mock event with the editor window's webContents as sender
    const mockEvent = {
      sender: appState.editorWin!.webContents,
    } as any
    
    startExport(mockEvent, { projectState, exportSettings, outputPath })
    
    // Timeout after 5 minutes
    setTimeout(() => {
      ipcMain.removeListener('export:complete', completeHandler)
      resolve({ success: false, error: 'Export timeout' })
    }, 300000)
  })
  
  if (exportResult.success) {
    console.log(`   ✅ Export complete: ${exportResult.outputPath}`)
  } else {
    console.error(`   ❌ Export failed: ${exportResult.error}`)
  }
  
  // Clean up - close editor and quit
  appState.editorWin?.close()
  app.quit()
  
  return exportResult
}

/**
 * Get video information using ffprobe
 */
async function getVideoInfo(videoPath: string): Promise<VideoInfo | null> {
  return new Promise((resolve) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ]

    // Use ffmpeg instead of ffprobe (ffprobe not included in binaries)
    const proc = spawn(FFMPEG_PATH, args)
    let output = ''

    proc.stdout.on('data', (data) => {
      output += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        log.error('[BatchManager] ffprobe exited with code:', code)
        resolve(null)
        return
      }

      try {
        const data = JSON.parse(output)
        const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')

        if (!videoStream) {
          resolve(null)
          return
        }

        let fps = 30
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/')
          fps = den ? parseInt(num, 10) / parseInt(den, 10) : parseInt(num, 10)
        }

        let duration = parseFloat(data.format?.duration || '0')
        if (!duration && videoStream.duration) {
          duration = parseFloat(videoStream.duration)
        }

        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration,
          fps,
        })
      } catch (e) {
        log.error('[BatchManager] Error parsing video info:', e)
        resolve(null)
      }
    })

    proc.on('error', (err) => {
      log.error('[BatchManager] Failed to run ffprobe:', err)
      resolve(null)
    })
  })
}

/**
 * Import video (copy to app storage like the normal import does)
 */
async function importVideo(sourcePath: string, videoInfo: VideoInfo): Promise<string | null> {
  try {
    const recordingDir = path.join(app.getPath('userData'), 'recordings')
    await fsPromises.mkdir(recordingDir, { recursive: true })

    const baseName = `batch-${Date.now()}`
    const destPath = path.join(recordingDir, `${baseName}-screen.mp4`)
    const metadataPath = path.join(recordingDir, `${baseName}.json`)

    await fsPromises.copyFile(sourcePath, destPath)

    const metadata = {
      platform: process.platform,
      events: [],
      cursorImages: {},
      geometry: { x: 0, y: 0, width: videoInfo.width, height: videoInfo.height },
      screenSize: { width: videoInfo.width, height: videoInfo.height },
      syncOffset: 0,
    }
    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata))

    return destPath
  } catch (error) {
    log.error('[BatchManager] Error importing video:', error)
    return null
  }
}

/**
 * Generate metadata with simulated cursor tracking
 * Returns the full metadata object, events array, and file path
 */
async function generateMetadata(_videoPath: string, videoInfo: VideoInfo): Promise<{ metadata: Record<string, unknown>; events: Array<{ x: number; y: number; timestamp: number }>; path: string } | null> {
  try {
    const recordingDir = path.join(app.getPath('userData'), 'recordings')
    await fsPromises.mkdir(recordingDir, { recursive: true })

    const metadataPath = path.join(recordingDir, `batch-meta-${Date.now()}.json`)

    const events: Array<{ x: number; y: number; timestamp: number }> = []
    const interval = 0.1
    const duration = videoInfo.duration

    // Generate smooth cursor movement patterns
    for (let t = 0; t < duration; t += interval) {
      const progress = t / duration
      // Create natural-looking cursor movement with multiple sine waves
      const x = (0.3 + 0.4 * Math.sin(progress * Math.PI * 2) + Math.sin(progress * 7) * 0.1) * videoInfo.width
      const y = (0.3 + 0.4 * Math.cos(progress * Math.PI * 1.5) + Math.cos(progress * 5) * 0.1) * videoInfo.height

      events.push({
        x: Math.round(x),
        y: Math.round(y),
        timestamp: t * 1000,  // Convert to milliseconds
      })
    }

    const metadata = {
      platform: process.platform,
      screenSize: { width: videoInfo.width, height: videoInfo.height },
      geometry: { x: 0, y: 0, width: videoInfo.width, height: videoInfo.height },
      syncOffset: 0,
      cursorImages: {},
      events,
    }

    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata))
    return { metadata, events, path: metadataPath }
  } catch (error) {
    log.error('[BatchManager] Error generating metadata:', error)
    return null
  }
}

/**
 * Auto-generate zoom regions - follows cursor movement like manual mode
 * Now accepts actual events array from generateMetadata
 * Format matches the ZoomRegion type from timelineSlice.ts
 */
function generateAutoZoomRegions(
  videoInfo: VideoInfo, 
  events: Array<{ x: number; y: number; timestamp: number }>,
  zoomLevel: number = 2.5, 
  regionDuration: number = 5
): Record<string, ZoomRegion> {
  const regions: Record<string, ZoomRegion> = {}
  const duration = videoInfo.duration
  let id = 0

  // Convert event timestamps from ms to seconds
  const eventsInSeconds = events.map(e => ({
    x: e.x,
    y: e.y,
    time: e.timestamp / 1000
  }))

  // Create zoom regions at regular intervals
  for (let start = 1; start < duration - 3; start += regionDuration) {
    // Find cursor position closest to this time
    const cursorAtTime = eventsInSeconds.find(e => e.time >= start) || eventsInSeconds[0]
    
    if (!cursorAtTime) continue
    
    // Normalize targetX and targetY to -0.5 to 0.5 range (like the app does)
    const normalizedX = (cursorAtTime.x / videoInfo.width) - 0.5
    const normalizedY = (cursorAtTime.y / videoInfo.height) - 0.5
    
    const region: ZoomRegion = {
      id: `auto-${id++}`,
      type: 'zoom',
      startTime: start,
      duration: Math.min(regionDuration, duration - start),
      zoomLevel,
      targetX: normalizedX,
      targetY: normalizedY,
      mode: 'auto',
      easing: 'Balanced',
      transitionDuration: 1.5,
      zIndex: 0,
    }

    regions[region.id] = region
  }

  return regions
}

// Type for ZoomRegion (matching the app's type)
interface ZoomRegion {
  id: string
  type: 'zoom'
  startTime: number
  duration: number
  zoomLevel: number
  easing: string
  transitionDuration: number
  targetX: number
  targetY: number
  mode: 'auto' | 'fixed'
  zIndex: number
}

/**
 * Handle batch process IPC
 */
export function handleBatchProcess(_event: Electron.IpcMainInvokeEvent, options: BatchOptions): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  return processVideoBatch(options)
}
