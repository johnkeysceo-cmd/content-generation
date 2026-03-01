// Entry point of the Electron application.

import { app, BrowserWindow, protocol, ProtocolRequest, ProtocolResponse, Menu, screen, dialog, ipcMain } from 'electron'
import log from 'electron-log/main'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fsSync from 'node:fs'
import { VITE_PUBLIC } from './lib/constants'
import { setupLogging } from './lib/logging'
import { registerIpcHandlers } from './ipc'
import { createRecorderWindow } from './windows/recorder-window'
import { onAppQuit, startRecording, loadVideoFromFile } from './features/recording-manager'
import { initializeMouseTrackerDependencies } from './features/mouse-tracker'
import { processVideoBatch } from './features/batch-manager'
import { appState } from './state'
import { calculateExportDimensions, getFFmpegPath } from './lib/utils'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

// ES Module __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// --- Initialization ---
setupLogging()

// --- App Lifecycle Events ---
app.on('window-all-closed', () => {
  log.info('[App] All windows closed. Quitting.')
  app.quit()
})

app.on('before-quit', onAppQuit)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createRecorderWindow()
  }
})

app.whenReady().then(async () => {
  log.info('[App] Ready. Initializing...')

  // Set Dock Menu on macOS
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'New Default Recording',
        click: () => {
          if (appState.editorWin && !appState.editorWin.isDestroyed()) {
            dialog.showErrorBox(
              'Action Not Allowed',
              'Please close the current editor session to start a new recording.',
            )
            appState.editorWin.focus()
            return
          }
          if (appState.currentRecordingSession) {
            dialog.showErrorBox('Recording in Progress', 'A recording is already in progress.')
            return
          }

          if (!appState.recorderWin || appState.recorderWin.isDestroyed()) {
            createRecorderWindow()
          }
          appState.recorderWin?.show()

          const primaryDisplay = screen.getPrimaryDisplay()
          startRecording({
            source: 'fullscreen',
            displayId: primaryDisplay.id,
            mic: undefined,
            webcam: undefined,
          })
        },
      },
      {
        label: 'Import Video File...',
        click: () => {
          if (appState.editorWin && !appState.editorWin.isDestroyed()) {
            dialog.showErrorBox('Action Not Allowed', 'Please close the current editor session to import a new video.')
            appState.editorWin.focus()
            return
          }
          if (appState.currentRecordingSession) {
            dialog.showErrorBox('Recording in Progress', 'A recording is already in progress.')
            return
          }

          if (!appState.recorderWin || appState.recorderWin.isDestroyed()) {
            createRecorderWindow()
          }
          appState.recorderWin?.show()
          loadVideoFromFile()
        },
      },
    ])
    app.dock.setMenu(dockMenu)
  }

  // Initialize platform-specific dependencies asynchronously
  initializeMouseTrackerDependencies()

  // Register custom protocol for media files
  protocol.registerFileProtocol(
    'media',
    (request: ProtocolRequest, callback: (response: string | ProtocolResponse) => void) => {
      const url = request.url.replace('media://', '')
      const decodedUrl = decodeURIComponent(url)
      const resourcePath = path.join(VITE_PUBLIC, decodedUrl)
      
      // Also check user data recordings directory (where batch-manager copies videos)
      const userDataRecordings = path.join(app.getPath('userData'), 'recordings', path.basename(decodedUrl))

      if (path.isAbsolute(decodedUrl) && fsSync.existsSync(decodedUrl)) {
        return callback(decodedUrl)
      }
      if (fsSync.existsSync(resourcePath)) {
        return callback(resourcePath)
      }
      // Check user data recordings directory
      if (fsSync.existsSync(userDataRecordings)) {
        return callback(userDataRecordings)
      }
      // Check if it's a path within recordings folder
      if (decodedUrl.includes('recordings')) {
        const fullRecordingsPath = path.join(app.getPath('userData'), decodedUrl)
        if (fsSync.existsSync(fullRecordingsPath)) {
          return callback(fullRecordingsPath)
        }
      }
      log.error(`[Protocol] Could not find file: ${decodedUrl}`)
      return callback({ error: -6 }) // FILE_NOT_FOUND
    },
  )

  registerIpcHandlers()
  
  // Check for CLI export mode (new - uses full rendering pipeline)
  const cliExportArg = process.argv.find(arg => arg === '--cli-export')
  const videoArg = process.argv.find(arg => arg.startsWith('--video'))
  const metadataArg = process.argv.find(arg => arg.startsWith('--metadata'))
  const exportOutputArg = process.argv.find(arg => arg.startsWith('--output') && !arg.startsWith('--output='))
  const exportFormatArg = process.argv.find(arg => arg.startsWith('--export-format'))
  const exportResArg = process.argv.find(arg => arg.startsWith('--export-resolution'))
  const exportFpsArg = process.argv.find(arg => arg.startsWith('--export-fps'))
  const exportQualityArg = process.argv.find(arg => arg.startsWith('--export-quality'))
  
  // Check for CLI raw export mode (no metadata needed)
  const cliRawExportArg = process.argv.find(arg => arg === '--cli-raw-export')
  const inputArg = process.argv.find(arg => arg.startsWith('--input'))
  const backgroundArg = process.argv.find(arg => arg.startsWith('--background'))
  const paddingArg = process.argv.find(arg => arg.startsWith('--padding'))
  
  if (cliRawExportArg && inputArg) {
    // Raw video export - no metadata required
    const inputPath = inputArg.replace('--input=', '') || process.argv[process.argv.indexOf('--input') + 1]
    const rawOutputArg = process.argv.find(arg => arg.startsWith('--output') && !arg.startsWith('--output='))
    const outputPath = (rawOutputArg ? rawOutputArg.replace('--output=', '') : undefined) || 
      process.argv[process.argv.indexOf('--output') + 1] ||
      inputPath.replace('.mp4', '_cinematic.mp4')
    const format = (exportFormatArg ? exportFormatArg.replace('--export-format=', '') : 'mp4') as 'mp4' | 'gif'
    const resolution = (exportResArg ? exportResArg.replace('--export-resolution=', '') : '1080p') as '720p' | '1080p' | '2k'
    const fps = exportFpsArg ? parseInt(exportFpsArg.replace('--export-fps=', ''), 10) : 60
    const quality = (exportQualityArg ? exportQualityArg.replace('--export-quality=', '') : 'high') as 'low' | 'medium' | 'high'
    const background = (backgroundArg ? backgroundArg.replace('--background=', '') : '#000000')
    const padding = paddingArg ? parseInt(paddingArg.replace('--padding=', ''), 10) : 5
    
    console.log('🎬 Running in CLI raw export mode (full Canvas pipeline - no metadata needed)...')
    await handleRawVideoExport(inputPath, outputPath, { format, resolution, fps, quality, background, padding })
  } else if (cliExportArg && videoArg && metadataArg) {
    // Original mode with metadata
    const videoPath = videoArg.replace('--video=', '') || process.argv[process.argv.indexOf('--video') + 1]
    const metadataPath = metadataArg.replace('--metadata=', '') || process.argv[process.argv.indexOf('--metadata') + 1]
    const outputPath = (exportOutputArg ? exportOutputArg.replace('--output=', '') : undefined) || 
      process.argv[process.argv.indexOf('--output') + 1] ||
      videoPath.replace('.mp4', '_cinematic.mp4')
    const format = (exportFormatArg ? exportFormatArg.replace('--export-format=', '') : 'mp4') as 'mp4' | 'gif'
    const resolution = (exportResArg ? exportResArg.replace('--export-resolution=', '') : '1080p') as '720p' | '1080p' | '2k'
    const fps = exportFpsArg ? parseInt(exportFpsArg.replace('--export-fps=', ''), 10) : 60
    const quality = (exportQualityArg ? exportQualityArg.replace('--export-quality=', '') : 'high') as 'low' | 'medium' | 'high'
    
    console.log('🎬 Running in CLI export mode (full rendering pipeline)...')
    await handleCliExportMode(videoPath, metadataPath, outputPath, { format, resolution, fps, quality })
  } else {
    // Check for legacy batch processing mode
    const batchArg = process.argv.find(arg => arg.startsWith('--process-video='))
    const outputArg = process.argv.find(arg => arg.startsWith('--output='))
    const zoomArg = process.argv.find(arg => arg.startsWith('--zoom='))
    const durationArg = process.argv.find(arg => arg.startsWith('--duration='))
    const resArg = process.argv.find(arg => arg.startsWith('--res='))
    const qualityArg = process.argv.find(arg => arg.startsWith('--quality='))
    
    if (batchArg && outputArg) {
      const videoPath = batchArg.replace('--process-video=', '')
      const outputPath = outputArg.replace('--output=', '')
      const zoomLevel = zoomArg ? parseFloat(zoomArg.replace('--zoom=', '')) : 2.5
      const regionDuration = durationArg ? parseInt(durationArg.replace('--duration=', ''), 10) : 5
      const resolution = resArg ? resArg.replace('--res=', '') : '1080p'
      const quality = qualityArg ? qualityArg.replace('--quality=', '') : 'high'
      
      console.log('🎬 Running in batch processing mode...')
      handleBatchMode(videoPath, outputPath, zoomLevel, regionDuration, resolution, quality)
    } else {
      createRecorderWindow()
    }
  }
})

// Handle batch processing mode
async function handleBatchMode(
  videoPath: string, 
  outputPath: string, 
  zoomLevel: number = 2.5,
  regionDuration: number = 5,
  resolution: string = '1080p',
  quality: string = 'high'
) {
  try {
    const result = await processVideoBatch({
      inputPath: videoPath,
      outputPath: outputPath,
      autoZoom: true,
      zoomLevel,
      regionDuration,
      resolution,
      quality: quality as 'low' | 'medium' | 'high',
    })
    
    if (result.success) {
      console.log(`✅ Batch processing complete: ${result.outputPath}`)
    } else {
      console.error(`❌ Batch processing failed: ${result.error}`)
    }
    
    // Exit after batch processing
    app.quit()
  } catch (error) {
    console.error('❌ Batch processing error:', error)
    app.quit()
  }
}

// CLI Export settings interface
interface CliExportSettings {
  format: 'mp4' | 'gif'
  resolution: '720p' | '1080p' | '2k'
  fps: number
  quality: 'low' | 'medium' | 'high'
}

// Handle CLI export mode - uses the full rendering pipeline with Canvas
async function handleCliExportMode(
  videoPath: string,
  metadataPath: string,
  outputPath: string,
  exportSettings: CliExportSettings
) {
  try {
    console.log('[CLI Export] Starting full Canvas rendering pipeline...')
    console.log('[CLI Export] Video:', videoPath)
    console.log('[CLI Export] Metadata:', metadataPath)
    console.log('[CLI Export] Output:', outputPath)
    
    // Validate input files
    if (!existsSync(videoPath)) {
      console.error('❌ Video file not found:', videoPath)
      app.quit()
      return
    }
    
    if (!existsSync(metadataPath)) {
      console.error('❌ Metadata file not found:', metadataPath)
      app.quit()
      return
    }
    
    // Read metadata
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent)
    
    // Calculate output dimensions
    const { width: outputWidth, height: outputHeight } = calculateExportDimensions(
      exportSettings.resolution,
      '16:9' // Default aspect ratio
    )
    
    console.log(`[CLI Export] Output dimensions: ${outputWidth}x${outputHeight}`)
    
    // Copy video to temp location in .screenarc folder (as the app expects)
    const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc')
    const baseName = `cli-export-${Date.now()}`
    const tempVideoPath = path.join(recordingDir, `${baseName}-screen.mp4`)
    const tempMetadataPath = path.join(recordingDir, `${baseName}.json`)
    
    // Ensure directory exists
    await fs.mkdir(recordingDir, { recursive: true })
    
    // Copy files
    await fs.copyFile(videoPath, tempVideoPath)
    await fs.writeFile(tempMetadataPath, metadataContent)
    
    console.log('[CLI Export] Files copied to temp location')
    
    // Build the full project state (same structure as in-app export)
    // This includes: videoPath, metadata, zoomRegions, frameStyles, cursorStyles, etc.
    const projectState = {
      // Video
      videoPath: tempVideoPath,
      videoUrl: `media://${tempVideoPath}`,
      videoDimensions: metadata.geometry || { width: 1920, height: 1080 },
      duration: 0, // Will be determined when video loads
      metadataPath: tempMetadataPath,
      
      // Recording info
      recordingGeometry: metadata.geometry || { x: 0, y: 0, width: 1920, height: 1080 },
      screenSize: metadata.screenSize || { width: 1920, height: 1080 },
      platform: metadata.platform || process.platform,
      syncOffset: metadata.syncOffset || 0,
      
      // Mouse events / metadata
      metadata: metadata.events || [],
      cursorImages: metadata.cursorImages || {},
      cursorBitmapsToRender: new Map(), // Will be populated in renderer
      
      // Frame styles (default)
      frameStyles: {
        background: { type: 'color' as const, color: '#000000' },
        padding: 5,
        borderRadius: 0,
        borderWidth: 0,
        borderColor: '#ffffff',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowColor: '#000000',
      },
      
      // Aspect ratio
      aspectRatio: '16:9',
      
      // Zoom regions - auto-generate from click events (same as app)
      zoomRegions: generateAutoZoomRegions(metadata.events || [], metadata.geometry),
      
      // Cut/Speed regions (empty for CLI)
      cutRegions: {},
      speedRegions: {},
      
      // Cursor styles
      cursorStyles: {
        showCursor: true,
        clickRippleEffect: true,
        clickRippleDuration: 0.5,
        clickRippleSize: 30,
        clickRippleColor: 'rgba(255, 255, 255, 0.5)',
        clickScaleEffect: true,
        clickScaleDuration: 0.2,
        clickScaleAmount: 0.8,
        clickScaleEasing: 'Balanced',
      },
      
      // Webcam (none for CLI)
      webcamVideoPath: undefined,
      webcamVideoUrl: null,
      webcamPosition: { pos: 'bottom-right' as const },
      webcamStyles: {
        size: 20,
        shape: 'circle' as const,
        borderRadius: 50,
        isFlipped: false,
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 5,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        scaleOnZoom: false,
        smartPosition: false,
      },
      isWebcamVisible: false,
      
      // Cursor theme
      cursorTheme: null,
      cursorThemeName: 'default',
    }
    
    console.log('[CLI Export] Project state prepared with auto-zoom regions')
    
    // Set up export settings
    const cliExportSettings = {
      format: exportSettings.format,
      resolution: exportSettings.resolution,
      fps: exportSettings.fps,
      quality: exportSettings.quality,
    }
    
    // Call the actual export function from export-manager
    await startCliExport(projectState, cliExportSettings, outputPath)
    
    // Cleanup temp files
    try {
      await fs.unlink(tempVideoPath)
      await fs.unlink(tempMetadataPath)
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.log('✅ CLI Export completed successfully!')
    app.quit()
  } catch (error) {
    console.error('❌ CLI Export error:', error)
    app.quit()
  }
}

// Auto-generate zoom regions from click events (same logic as app)
function generateAutoZoomRegions(
  events: any[],
  geometry: { width: number; height: number } | null
) {
  const clicks = events.filter((e) => e.type === 'click' && e.pressed)
  if (clicks.length === 0) return {}
  
  const geometryWidth = geometry?.width || 1920
  const geometryHeight = geometry?.height || 1080
  
  // Merge clicks that are close together
  const mergedClickGroups: any[][] = []
  if (clicks.length > 0) {
    let currentGroup = [clicks[0]]
    for (let i = 1; i < clicks.length; i++) {
      if (clicks[i].timestamp - currentGroup[currentGroup.length - 1].timestamp < 2) {
        currentGroup.push(clicks[i])
      } else {
        mergedClickGroups.push(currentGroup)
        currentGroup = [clicks[i]]
      }
    }
    mergedClickGroups.push(currentGroup)
  }
  
  const zoomRegions: Record<string, any> = {}
  
  mergedClickGroups.forEach((group, index) => {
    const firstClick = group[0]
    const lastClick = group[group.length - 1]
    
    const startTime = Math.max(0, firstClick.timestamp - 0.5) // Pre-click offset
    const endTime = lastClick.timestamp + 2 // Post-click padding
    const duration = Math.max(1, endTime - startTime) // Minimum 1 second
    
    const id = `auto-zoom-${Date.now()}-${index}`
    zoomRegions[id] = {
      id,
      type: 'zoom',
      startTime,
      duration,
      zoomLevel: 2.5,
      easing: 'Balanced',
      transitionDuration: 0.5,
      targetX: firstClick.x / geometryWidth - 0.5,
      targetY: firstClick.y / geometryHeight - 0.5,
      mode: 'auto',
      zIndex: 0,
    }
  })
  
  return zoomRegions
}

// Raw video export settings interface
interface RawExportSettings {
  format: 'mp4' | 'gif'
  resolution: '720p' | '1080p' | '2k'
  fps: number
  quality: 'low' | 'medium' | 'high'
  background: string
  padding: number
}

// Handle raw video export - no metadata needed
async function handleRawVideoExport(
  inputPath: string,
  outputPath: string,
  exportSettings: RawExportSettings
) {
  try {
    console.log('[CLI Raw Export] Starting raw video export...')
    console.log('[CLI Raw Export] Input:', inputPath)
    console.log('[CLI Raw Export] Output:', outputPath)
    
    // Validate input file
    if (!existsSync(inputPath)) {
      console.error('❌ Input video not found:', inputPath)
      app.quit()
      return
    }
    
    console.log('[CLI Raw Export] Copying video to temp location...')
    
    // Copy video to temp location in .screenarc folder
    const recordingDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.screenarc')
    const baseName = `cli-raw-${Date.now()}`
    const tempVideoPath = path.join(recordingDir, `${baseName}.mp4`)
    
    // Ensure directory exists
    await fs.mkdir(recordingDir, { recursive: true })
    
    // Copy the video
    await fs.copyFile(inputPath, tempVideoPath)
    
    console.log('[CLI Raw Export] Video copied to temp location')
    
    // Build project state for raw video (no metadata, full pipeline)
    const projectState = {
      // Video
      videoPath: tempVideoPath,
      videoUrl: `media://${tempVideoPath}`,
      videoDimensions: { width: 1920, height: 1080 }, // Will be updated when video loads
      duration: 0,
      metadataPath: '',
      
      // Recording info
      recordingGeometry: { x: 0, y: 0, width: 1920, height: 1080 },
      screenSize: { width: 1920, height: 1080 },
      platform: process.platform,
      syncOffset: 0,
      
      // No mouse events for raw video
      metadata: [],
      cursorImages: {},
      cursorBitmapsToRender: new Map(),
      
      // Frame styles from CLI args
      frameStyles: {
        background: { type: 'color' as const, color: exportSettings.background },
        padding: exportSettings.padding,
        borderRadius: 0,
        borderWidth: 0,
        borderColor: '#ffffff',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowColor: '#000000',
      },
      
      // Aspect ratio
      aspectRatio: '16:9',
      
      // No zoom regions for raw video (or add simple center zoom)
      zoomRegions: {},
      
      // Cut/Speed regions (empty)
      cutRegions: {},
      speedRegions: {},
      
      // Cursor styles (disabled for raw video)
      cursorStyles: {
        showCursor: false,
        clickRippleEffect: false,
        clickRippleDuration: 0.5,
        clickRippleSize: 30,
        clickRippleColor: 'rgba(255, 255, 255, 0.5)',
        clickScaleEffect: false,
        clickScaleDuration: 0.2,
        clickScaleAmount: 0.8,
        clickScaleEasing: 'Balanced',
      },
      
      // Webcam (none)
      webcamVideoPath: undefined,
      webcamVideoUrl: null,
      webcamPosition: { pos: 'bottom-right' as const },
      webcamStyles: {
        size: 20,
        shape: 'circle' as const,
        borderRadius: 50,
        isFlipped: false,
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 5,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        scaleOnZoom: false,
        smartPosition: false,
      },
      isWebcamVisible: false,
      
      // Cursor theme
      cursorTheme: null,
      cursorThemeName: 'default',
    }
    
    console.log('[CLI Raw Export] Project state prepared (raw video mode)')
    
    // Set up export settings
    const cliExportSettings = {
      format: exportSettings.format,
      resolution: exportSettings.resolution,
      fps: exportSettings.fps,
      quality: exportSettings.quality,
    }
    
    // Call the export function
    await startCliExport(projectState, cliExportSettings, outputPath)
    
    // Cleanup temp files
    try {
      await fs.unlink(tempVideoPath)
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.log('✅ CLI Raw Export completed successfully!')
    app.quit()
  } catch (error) {
    console.error('❌ CLI Raw Export error:', error)
    app.quit()
  }
}

// CLI-specific export function that uses the Canvas rendering pipeline
async function startCliExport(projectState: any, exportSettings: any, outputPath: string) {
  console.log('[CLI Export] Setting up render worker...')
  
  // Create hidden BrowserWindow for rendering (same as export-manager)
  const renderWorker = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      offscreen: true,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  
  // Load the renderer page
  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
  const RENDERER_DIST = path.join(__dirname, '..', 'dist')
  
  if (VITE_DEV_SERVER_URL) {
    const renderUrl = `${VITE_DEV_SERVER_URL}#renderer`
    renderWorker.loadURL(renderUrl)
    console.log(`[CLI Export] Loading render worker URL (Dev): ${renderUrl}`)
  } else {
    const renderPath = path.join(RENDERER_DIST, 'index.html')
    renderWorker.loadFile(renderPath, { hash: 'renderer' })
    console.log(`[CLI Export] Loading render worker file (Prod): ${renderPath}#renderer`)
  }
  
  // Wait for renderer to be ready
  await new Promise<void>((resolve) => {
    ipcMain.once('render:ready', () => {
      console.log('[CLI Export] Renderer ready signal received')
      resolve()
    })
  })
  
  console.log('[CLI Export] Sending project state to renderer...')
  
  // Send project to renderer
  renderWorker.webContents.send('render:start', { projectState, exportSettings })
  
  // Set up FFmpeg for encoding
  const { resolution, fps, format } = exportSettings
  const { width: outputWidth, height: outputHeight } = calculateExportDimensions(resolution, projectState.aspectRatio)
  
  const ffmpegArgs = [
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${outputWidth}x${outputHeight}`,
    '-r', fps.toString(),
    '-i', '-',
  ]
  
  if (format === 'mp4') {
    ffmpegArgs.push('-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p')
  } else {
    ffmpegArgs.push('-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse')
  }
  
  ffmpegArgs.push(outputPath)
  
  console.log('[CLI Export] Spawning FFmpeg...')
  const ffmpeg = spawn(getFFmpegPath(), ffmpegArgs)
  
  let ffmpegClosed = false
  
  // Listen for frames from renderer
  ipcMain.on('export:frame-data', (_event, { frame, progress }: { frame: Buffer; progress: number }) => {
    if (!ffmpegClosed && ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(frame)
      process.stdout.write(`\r[CLI Export] Rendering: ${progress.toFixed(1)}%`)
    }
  })
  
  // Listen for render finish
  ipcMain.on('export:render-finished', () => {
    console.log('\n[CLI Export] Render finished, closing FFmpeg stdin...')
    if (!ffmpegClosed && ffmpeg.stdin.writable) {
      ffmpeg.stdin.end()
    }
  })
  
  // Wait for FFmpeg to finish
  await new Promise<void>((resolve) => {
    ffmpeg.on('close', (code) => {
      ffmpegClosed = true
      console.log(`\n[CLI Export] FFmpeg exited with code ${code}`)
      
      if (code === 0) {
        console.log('[CLI Export] Video encoding complete!')
      } else {
        console.error('[CLI Export] FFmpeg encoding failed')
      }
      
      // Cleanup
      if (renderWorker && !renderWorker.isDestroyed()) {
        renderWorker.close()
      }
      
      resolve()
    })
  })
}
