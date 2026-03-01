#!/usr/bin/env node

/**
 * ScreenArc CLI - Main Entry Point
 * A fully automated, headless CLI for video processing
 * 
 * Usage:
 *   screenarc-cli process -i input.mp4 -o output.mp4 -p cinematic
 *   screenarc-cli batch -i ./videos -o ./output -p youtube
 *   screenarc-cli presets --list
 * 
 * Run without arguments for interactive mode
 */

import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import { 
  CLIProjectConfig, 
  ExportSettings, 
  FrameStylesConfig, 
  CursorStylesConfig,
  ZoomRegionConfig,
  ProcessingResult
} from './types.js'
import { getLogger } from './logger.js'
import { loadPreset, getAvailablePresets, DEFAULT_PRESETS } from './presets.js'
import { processVideo } from './processor.js'
import { getVideoFiles, generateOutputPath, getFFmpegPath } from './ffmpeg-utils.js'
import { ZOOM } from '../lib/constants.js'

const logger = getLogger()

/**
 * Generate auto zoom regions from metadata click events (replicates GUI logic)
 */
function generateAutoZoomRegionsFromMetadata(
  events: any[],
  geometry: { width: number; height: number },
  zoomLevel: number,
  _defaultDuration: number
): ZoomRegionConfig[] {
  const clicks = events.filter((item: any) => item.type === 'click' && item.pressed)
  if (clicks.length === 0) return []

  // Convert timestamps from milliseconds to seconds
  const clicksInSeconds = clicks.map(c => ({
    ...c,
    timestamp: c.timestamp / 1000
  }))

  // Merge clicks that are close together (within 3 seconds)
  const mergedClickGroups: any[][] = []
  if (clicksInSeconds.length > 0) {
    let currentGroup = [clicksInSeconds[0]]
    for (let i = 1; i < clicksInSeconds.length; i++) {
      if (clicksInSeconds[i].timestamp - currentGroup[currentGroup.length - 1].timestamp < ZOOM.AUTO_ZOOM_MIN_DURATION) {
        currentGroup.push(clicksInSeconds[i])
      } else {
        mergedClickGroups.push(currentGroup)
        currentGroup = [clicksInSeconds[i]]
      }
    }
    mergedClickGroups.push(currentGroup)
  }

  const zoomRegions: ZoomRegionConfig[] = []

  mergedClickGroups.forEach((group, index) => {
    const firstClick = group[0]
    const lastClick = group[group.length - 1]

    const startTime = Math.max(0, firstClick.timestamp - ZOOM.AUTO_ZOOM_PRE_CLICK_OFFSET)
    const endTime = lastClick.timestamp + ZOOM.AUTO_ZOOM_POST_CLICK_PADDING
    let duration = endTime - startTime
    if (duration < ZOOM.AUTO_ZOOM_MIN_DURATION) {
      duration = ZOOM.AUTO_ZOOM_MIN_DURATION
    }

    zoomRegions.push({
      id: `auto-zoom-${Date.now()}-${index}`,
      type: 'zoom',
      zIndex: index,
      startTime,
      duration,
      zoomLevel,
      easing: ZOOM.DEFAULT_EASING,
      transitionDuration: ZOOM.SPEED_OPTIONS[ZOOM.DEFAULT_SPEED as keyof typeof ZOOM.SPEED_OPTIONS],
      targetX: firstClick.x / geometry.width - 0.5,
      targetY: firstClick.y / geometry.height - 0.5,
      mode: 'auto',
      blurEnabled: false,
      blurAmount: 0
    })
  })

  return zoomRegions
}

// Default export settings
const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolution: '1080p',
  fps: 60,
  quality: 'high',
  aspectRatio: '16:9'
}

// Default frame styles - kept for reference but using presets instead
// const DEFAULT_FRAME_STYLES: FrameStylesConfig = {...}

// Default cursor styles - kept for reference but using presets instead
// const DEFAULT_CURSOR_STYLES: CursorStylesConfig = {...}

/**
 * Build project configuration from CLI arguments
 */
function buildProjectConfig(args: any): CLIProjectConfig {
  // Load preset if specified
  let preset = DEFAULT_PRESETS.cinematic
  if (args.preset) {
    preset = loadPreset(args.preset, args.presetFile)
  }

  // Build export settings
  const exportSettings: ExportSettings = {
    format: args.format || DEFAULT_EXPORT_SETTINGS.format,
    resolution: args.resolution || DEFAULT_EXPORT_SETTINGS.resolution,
    fps: args.fps || DEFAULT_EXPORT_SETTINGS.fps,
    quality: args.quality || DEFAULT_EXPORT_SETTINGS.quality,
    aspectRatio: args.aspectRatio || preset.aspectRatio || DEFAULT_EXPORT_SETTINGS.aspectRatio
  }

  // Build frame styles (from preset or CLI args)
  const frameStyles: FrameStylesConfig = args.background || args.padding
    ? {
        background: args.background 
          ? { type: 'color', color: args.background }
          : preset.frameStyles.background,
        padding: args.padding ?? preset.frameStyles.padding ?? 5,
        borderRadius: args.borderRadius ?? preset.frameStyles.borderRadius ?? 16,
        shadowBlur: args.shadowBlur ?? preset.frameStyles.shadowBlur ?? 35,
        shadowOffsetX: args.shadowOffsetX ?? preset.frameStyles.shadowOffsetX ?? 0,
        shadowOffsetY: args.shadowOffsetY ?? preset.frameStyles.shadowOffsetY ?? 15,
        shadowColor: args.shadowColor ?? preset.frameStyles.shadowColor ?? 'rgba(0, 0, 0, 0.8)',
        borderWidth: args.borderWidth ?? preset.frameStyles.borderWidth ?? 4,
        borderColor: args.borderColor ?? preset.frameStyles.borderColor ?? 'rgba(255, 255, 255, 0.2)'
      }
    : preset.frameStyles

  // Build cursor styles (from preset or CLI args)
  const cursorStyles: CursorStylesConfig = {
    showCursor: args.showCursor ?? preset.cursorStyles?.showCursor ?? true,
    shadowBlur: args.cursorShadowBlur ?? preset.cursorStyles?.shadowBlur ?? 6,
    shadowOffsetX: args.cursorShadowOffsetX ?? preset.cursorStyles?.shadowOffsetX ?? 3,
    shadowOffsetY: args.cursorShadowOffsetY ?? preset.cursorStyles?.shadowOffsetY ?? 3,
    shadowColor: args.cursorShadowColor ?? preset.cursorStyles?.shadowColor ?? 'rgba(0, 0, 0, 0.4)',
    clickRippleEffect: args.enableClickRipple ?? preset.cursorStyles?.clickRippleEffect ?? true,
    clickRippleColor: args.clickRippleColor ?? preset.cursorStyles?.clickRippleColor ?? 'rgba(255, 255, 255, 0.8)',
    clickRippleSize: args.clickRippleSize ?? preset.cursorStyles?.clickRippleSize ?? 30,
    clickRippleDuration: args.clickRippleDuration ?? preset.cursorStyles?.clickRippleDuration ?? 0.5,
    clickScaleEffect: args.enableClickScale ?? preset.cursorStyles?.clickScaleEffect ?? true,
    clickScaleAmount: args.clickScaleAmount ?? preset.cursorStyles?.clickScaleAmount ?? 0.8,
    clickScaleDuration: args.clickScaleDuration ?? preset.cursorStyles?.clickScaleDuration ?? 0.4,
    clickScaleEasing: args.clickScaleEasing ?? preset.cursorStyles?.clickScaleEasing ?? 'Balanced',
    cursorGlowEffect: args.cursorGlowEffect ?? preset.cursorStyles?.cursorGlowEffect ?? false,
    cursorGlowColor: args.cursorGlowColor ?? preset.cursorStyles?.cursorGlowColor ?? 'rgba(59, 130, 246, 0.8)',
    cursorGlowSize: args.cursorGlowSize ?? preset.cursorStyles?.cursorGlowSize ?? 30,
    cursorGlowIntensity: args.cursorGlowIntensity ?? preset.cursorStyles?.cursorGlowIntensity ?? 1,
    cursorMotionTrail: args.cursorMotionTrail ?? preset.cursorStyles?.cursorMotionTrail ?? false,
    motionTrailLength: args.motionTrailLength ?? preset.cursorStyles?.motionTrailLength ?? 5,
    motionTrailOpacity: args.motionTrailOpacity ?? preset.cursorStyles?.motionTrailOpacity ?? 0.5,
    cursorMotionBlur: args.cursorMotionBlur ?? preset.cursorStyles?.cursorMotionBlur ?? false,
    motionBlurIntensity: args.motionBlurIntensity ?? preset.cursorStyles?.motionBlurIntensity ?? 0.5,
    motionBlurThreshold: args.motionBlurThreshold ?? preset.cursorStyles?.motionBlurThreshold ?? 15,
    swooshEffect: args.swooshEffect ?? preset.cursorStyles?.swooshEffect ?? false,
    swooshIntensity: args.swooshIntensity ?? preset.cursorStyles?.swooshIntensity ?? 0.5,
    swooshThreshold: args.swooshThreshold ?? preset.cursorStyles?.swooshThreshold ?? 30,
    speedLines: args.speedLines ?? preset.cursorStyles?.speedLines ?? false,
    speedLinesIntensity: args.speedLinesIntensity ?? preset.cursorStyles?.speedLinesIntensity ?? 0.5,
    speedLinesThreshold: args.speedLinesThreshold ?? preset.cursorStyles?.speedLinesThreshold ?? 50,
    clickExplosion: args.clickExplosion ?? preset.cursorStyles?.clickExplosion ?? false,
    clickExplosionIntensity: args.clickExplosionIntensity ?? preset.cursorStyles?.clickExplosionIntensity ?? 0.5,
    clickExplosionParticles: args.clickExplosionParticles ?? preset.cursorStyles?.clickExplosionParticles ?? 10,
  }

  // Build zoom regions (from CLI args or auto-generate from metadata)
  let zoomRegions: ZoomRegionConfig[] = []
  
  // Try to load metadata for auto-zoom generation
  let metadata: any = null
  if (args.metadata && fs.existsSync(args.metadata)) {
    try {
      const metadataContent = fs.readFileSync(args.metadata, 'utf-8')
      metadata = JSON.parse(metadataContent)
    } catch (e) {
      logger.warn('Failed to load metadata for auto-zoom:', e)
    }
  }

  if (args.zoomLevel && args.zoomLevel > 1) {
    if (metadata && metadata.events && metadata.events.length > 0) {
      // Auto-generate zoom regions from click events (like the GUI does)
      zoomRegions = generateAutoZoomRegionsFromMetadata(
        metadata.events,
        metadata.geometry || { width: 1920, height: 1080 },
        args.zoomLevel,
        args.zoomDuration || 3
      )
    } else {
      // Simple zoom region if no metadata
      zoomRegions = [{
        id: 'auto-zoom-1',
        type: 'zoom',
        zIndex: 0,
        startTime: 0,
        duration: args.zoomDuration || 3,
        zoomLevel: args.zoomLevel,
        easing: 'Balanced',
        transitionDuration: 0.5,
        targetX: 0,
        targetY: 0,
        mode: 'auto',
        blurEnabled: false,
        blurAmount: 0
      }]
    }
  } else if (metadata && metadata.events && metadata.events.length > 0 && preset.zoomLevel) {
    // Use preset zoom level with auto-generation
    zoomRegions = generateAutoZoomRegionsFromMetadata(
      metadata.events,
      metadata.geometry || { width: 1920, height: 1080 },
      preset.zoomLevel,
      3
    )
  }

  // Generate output path if not specified
  const inputPath = args.input
  let outputPath = args.output
  if (!outputPath) {
    outputPath = generateOutputPath(inputPath, undefined, '_processed')
  }

  return {
    videoPath: inputPath,
    metadataPath: args.metadata,
    outputPath,
    exportSettings,
    frameStyles,
    cursorStyles,
    webcamEnabled: args.webcam || false,
    zoomRegions,
    cutRegions: [],
    speedRegions: [],
    audioEnabled: args.audioVolume !== undefined ? args.audioVolume > 0 : true,
    audioVolume: args.audioVolume ?? 1.0,
    audioMuted: args.audioMuted ?? false
  }
}

/**
 * Process a single video file
 */
async function processCommand(args: any) {
  const logger = getLogger({ 
    level: args.verbose ? 'debug' : 'info',
    quiet: args.quiet 
  })

  // Validate input file
  if (!args.input) {
    logger.error('Input file is required. Use -i or --input')
    process.exit(1)
  }

  const inputPath = path.resolve(args.input)
  if (!fs.existsSync(inputPath)) {
    logger.error(`Input file not found: ${inputPath}`)
    process.exit(1)
  }

  logger.info('='.repeat(60))
  logger.info('ScreenArc CLI - Video Processor')
  logger.info('='.repeat(60))
  logger.info(`Input:    ${inputPath}`)
  logger.info(`Preset:   ${args.preset || 'cinematic (default)'}`)
  logger.info(`Format:   ${args.format || 'mp4'}`)
  logger.info(`Resolution: ${args.resolution || '1080p'}`)
  logger.info(`FPS:      ${args.fps || 60}`)
  logger.info(`Quality:  ${args.quality || 'high'}`)

  // Build configuration
  const config = buildProjectConfig(args)
  logger.info(`Output:   ${config.outputPath}`)

  // Check FFmpeg
  const ffmpegPath = getFFmpegPath()
  logger.info(`FFmpeg:   ${ffmpegPath}`)

  if (args.dryRun) {
    logger.info('\n[Dry Run] Configuration validated successfully.')
    logger.info('No processing performed.')
    return
  }

  // Process video
  try {
    const result = await processVideo(config, (progress, stage, _frame) => {
      if (!args.quiet) {
        process.stdout.write(`\r${stage}: ${progress.toFixed(1)}%`)
      }
    })

    if (result.success) {
      logger.info('\n' + '='.repeat(60))
      logger.info('✅ Processing completed successfully!')
      logger.info(`   Output: ${result.outputPath}`)
      logger.info(`   Duration: ${result.duration?.toFixed(1)}s`)
      logger.info('='.repeat(60))
    } else {
      logger.error('\n❌ Processing failed:', result.error)
      process.exit(1)
    }
  } catch (error) {
    logger.error('\n❌ Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/**
 * Process multiple videos in batch
 */
async function batchCommand(args: any) {
  const logger = getLogger({ 
    level: args.verbose ? 'debug' : 'info',
    quiet: args.quiet 
  })

  const inputDir = path.resolve(args.input)
  if (!fs.existsSync(inputDir)) {
    logger.error(`Input directory not found: ${inputDir}`)
    process.exit(1)
  }

  const outputDir = args.output ? path.resolve(args.output) : inputDir
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  logger.info('='.repeat(60))
  logger.info('ScreenArc CLI - Batch Processor')
  logger.info('='.repeat(60))
  logger.info(`Input Dir:  ${inputDir}`)
  logger.info(`Output Dir: ${outputDir}`)
  logger.info(`Preset:     ${args.preset || 'cinematic'}`)
  logger.info(`Pattern:    ${args.pattern || '*.mp4'}`)

  // Get video files
  const videoFiles = getVideoFiles(inputDir, args.recursive)
  logger.info(`Found ${videoFiles.length} video(s) to process`)

  if (videoFiles.length === 0) {
    logger.warn('No video files found to process.')
    return
  }

  // Process each video
  const results: ProcessingResult[] = []
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < videoFiles.length; i++) {
    const inputPath = videoFiles[i]
    const fileName = path.basename(inputPath)
    const outputPath = path.join(outputDir, fileName.replace(/\.[^/.]+$/, '_processed.mp4'))

    logger.info(`\n[${i + 1}/${videoFiles.length}] Processing: ${fileName}`)

    // Build config for this file
    const fileArgs = {
      ...args,
      input: inputPath,
      output: outputPath
    }

    try {
      const config = buildProjectConfig(fileArgs)
      const result = await processVideo(config)
      results.push(result)

      if (result.success) {
        successCount++
        logger.info(`  ✅ Success: ${path.basename(result.outputPath)}`)
      } else {
        failCount++
        logger.error(`  ❌ Failed: ${result.error}`)
      }
    } catch (error) {
      failCount++
      logger.error(`  ❌ Error:`, error)
    }
  }

  // Summary
  logger.info('\n' + '='.repeat(60))
  logger.info('Batch Processing Complete')
  logger.info(`  Total:    ${videoFiles.length}`)
  logger.info(`  Success:  ${successCount}`)
  logger.info(`  Failed:   ${failCount}`)
  logger.info('='.repeat(60))

  // Save results to JSON if requested
  if (args.json) {
    const resultsPath = path.join(outputDir, 'batch-results.json')
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
    logger.info(`Results saved to: ${resultsPath}`)
  }

  if (failCount > 0) {
    process.exit(1)
  }
}

/**
 * List available presets
 */
function listPresetsCommand() {
  const presets = getAvailablePresets()
  console.log('\n📋 Available Presets:\n')
  console.log('  Built-in Presets:')
  for (const name of presets) {
    const preset = DEFAULT_PRESETS[name]
    console.log(`    - ${name.padEnd(12)} ${preset?.name || ''}`)
  }
  console.log('\n  Usage: --preset <name>')
  console.log('  Example: screenarc-cli process -i video.mp4 -p cinematic\n')
}

/**
 * Create a preset from current settings
 */
function createPresetCommand(args: any) {
  const preset = {
    id: args.name.toLowerCase().replace(/\s+/g, '-'),
    name: args.name,
    frameStyles: buildProjectConfig(args).frameStyles,
    aspectRatio: args.aspectRatio || '16:9',
    cursorStyles: buildProjectConfig(args).cursorStyles,
    zoomLevel: args.zoomLevel
  }

  const outputPath = args.output || `./${preset.id}.preset.json`
  fs.writeFileSync(outputPath, JSON.stringify(preset, null, 2))
  console.log(`✅ Preset saved to: ${outputPath}`)
}

/**
 * Main entry point
 */
async function main() {
  const program = new Command()

  program
    .name('screenarc-cli')
    .description('ScreenArc - Automated video processing CLI')
    .version('1.0.0')

  // Process command
  program
    .command('process')
    .alias('p')
    .description('Process a single video file')
    .requiredOption('-i, --input <path>', 'Input video file path')
    .option('-o, --output <path>', 'Output video file path')
    .option('-m, --metadata <path>', 'Metadata JSON file from ScreenArc recording')
    .option('-p, --preset <name>', 'Preset name (cinematic, minimal, youtube, short, instagram, clean, dark)')
    .option('-f, --preset-file <path>', 'Custom preset JSON file')
    .option('--format <format>', 'Output format (mp4, gif)', 'mp4')
    .option('-r, --resolution <res>', 'Resolution (720p, 1080p, 2k)', '1080p')
    .option('--fps <n>', 'Frame rate', (val) => parseInt(val), 60)
    .option('-q, --quality <level>', 'Quality (low, medium, high)', 'high')
    .option('--aspect-ratio <ratio>', 'Aspect ratio (16:9, 9:16, 1:1)', '16:9')
    .option('--background <color>', 'Background color (hex)')
    .option('--padding <n>', 'Frame padding percentage', (val) => parseInt(val))
    .option('--border-radius <n>', 'Border radius', (val) => parseInt(val))
    .option('--shadow-blur <n>', 'Shadow blur', (val) => parseInt(val))
    .option('--zoom-level <n>', 'Zoom level (1 = no zoom)', (val) => parseFloat(val))
    .option('--zoom-duration <n>', 'Zoom region duration in seconds', (val) => parseFloat(val))
    .option('--show-cursor', 'Show cursor', true)
    .option('--no-cursor', 'Hide cursor')
    .option('--enable-click-ripple', 'Enable click ripple effect')
    .option('--no-click-ripple', 'Disable click ripple effect')
    .option('--enable-click-scale', 'Enable click scale effect')
    .option('--no-click-scale', 'Disable click scale effect')
    .option('--webcam', 'Enable webcam overlay')
    .option('--webcam-position <pos>', 'Webcam position (top-left, bottom-right, etc.)')
    .option('--webcam-size <n>', 'Webcam size percentage', (val) => parseInt(val))
    .option('--audio-volume <n>', 'Audio volume (0-1)', (val) => parseFloat(val))
    .option('-v, --verbose', 'Verbose logging')
    .option('--quiet', 'Quiet mode (no progress output)')
    .option('--dry-run', 'Validate configuration without processing')
    .action(processCommand)

  // Batch command
  program
    .command('batch')
    .alias('b')
    .description('Process multiple videos in batch')
    .requiredOption('-i, --input <dir>', 'Input directory containing videos')
    .requiredOption('-o, --output <dir>', 'Output directory')
    .option('-p, --preset <name>', 'Preset to use')
    .option('--pattern <glob>', 'File pattern to match', '*.mp4')
    .option('-r, --recursive', 'Process subdirectories', false)
    .option('--json', 'Save results to JSON file')
    .option('-v, --verbose', 'Verbose logging')
    .option('--quiet', 'Quiet mode')
    .action(batchCommand)

  // Presets command
  program
    .command('presets')
    .description('Manage presets')
    .option('--list', 'List available presets')
    .option('--create <name>', 'Create a new preset')
    .option('--output <path>', 'Output path for preset file')
    .action((args) => {
      if (args.list) {
        listPresetsCommand()
      } else if (args.create) {
        createPresetCommand(args)
      } else {
        listPresetsCommand()
      }
    })

  // Info command
  program
    .command('info')
    .description('Show FFmpeg and system information')
    .action(() => {
      const ffmpegPath = getFFmpegPath()
      console.log('\n📊 System Information:')
      console.log(`  Platform:   ${process.platform}`)
      console.log(`  Architecture: ${process.arch}`)
      console.log(`  Node.js:    ${process.version}`)
      console.log(`  FFmpeg:     ${ffmpegPath}`)
      console.log(`  FFmpeg exists: ${fs.existsSync(ffmpegPath) ? 'Yes' : 'No (will use system)'}`)
      console.log('')
    })

  // Parse arguments
  program.parse(process.argv)

  // Show help if no arguments
  if (process.argv.length === 2) {
    program.help()
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
