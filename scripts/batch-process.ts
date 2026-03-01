#!/usr/bin/env node

/**
 * ScreenArc Batch Processor
 * 
 * Automates video processing with cinematic zoom:
 * - Watch input folder for new videos
 * - Apply auto-zoom with your cinematic engine
 * - Export with FFmpeg at target quality
 * - Organize outputs into processed folder
 * 
 * Usage:
 *   node scripts/batch-process.js --input ./input --output ./output
 *   node scripts/batch-process.js --file ./video.mp4 --preset cinematic
 *   node scripts/batch-process.js --watch ./input --parallel 2
 * 
 * Presets:
 *   - cinematic: Full auto-zoom with smooth follow
 *   - simple: Basic zoom in/out without panning
 *   - none: No zoom, just re-encode
 */

import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
interface Config {
  input: string
  output: string
  watch: boolean
  parallel: number
  preset: 'cinematic' | 'simple' | 'none'
  fps: number
  resolution: string
  quality: 'low' | 'medium' | 'high'
  verbose: boolean
}

const DEFAULT_CONFIG: Config = {
  input: path.join(__dirname, '../input'),
  output: path.join(__dirname, '../output'),
  watch: false,
  parallel: 1,
  preset: 'cinematic',
  fps: 60,
  resolution: '1080p',
  quality: 'high',
  verbose: false,
}

// Parse arguments
function parseArgs(): Config {
  const args = process.argv.slice(2)
  const config = { ...DEFAULT_CONFIG }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    
    switch (arg) {
      case '--input':
      case '-i':
        if (next) config.input = path.resolve(next)
        i++
        break
      case '--output':
      case '-o':
        if (next) config.output = path.resolve(next)
        i++
        break
      case '--watch':
      case '-w':
        config.watch = true
        break
      case '--parallel':
      case '-p':
        if (next) config.parallel = parseInt(next, 10)
        i++
        break
      case '--preset':
        if (next && ['cinematic', 'simple', 'none'].includes(next)) {
          config.preset = next as Config['preset']
        }
        i++
        break
      case '--fps':
        if (next) config.fps = parseInt(next, 10)
        i++
        break
      case '--resolution':
      case '-r':
        if (next) config.resolution = next
        i++
        break
      case '--quality':
      case '-q':
        if (next && ['low', 'medium', 'high'].includes(next)) {
          config.quality = next as Config['quality']
        }
        i++
        break
      case '--verbose':
      case '-v':
        config.verbose = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      case '--file':
        // Single file mode - process just this file
        if (next) {
          processSingleFile(path.resolve(next), config)
          process.exit(0)
        }
        i++
        break
    }
  }
  
  return config
}

function printHelp() {
  console.log(`
ScreenArc Batch Processor
=========================

Usage:
  node batch-process.js [options]

Options:
  -i, --input <dir>      Input folder (default: ./input)
  -o, --output <dir>     Output folder (default: ./output)
  -w, --watch            Watch input folder for new files
  -p, --parallel <n>     Number of parallel processes (default: 1)
  --preset <name>        Zoom preset: cinematic, simple, none (default: cinematic)
  --fps <n>              Output FPS (default: 60)
  -r, --resolution <res> Resolution: 720p, 1080p, 4k (default: 1080p)
  -q, --quality <level>  Quality: low, medium, high (default: high)
  -v, --verbose          Verbose logging
  --file <path>          Process single file
  -h, --help             Show this help

Examples:
  # Process all videos in input folder
  node batch-process.js --input ./videos --output ./processed

  # Watch folder for new videos
  node batch-process.js --watch --parallel 2

  # Single file with cinematic zoom
  node batch-process.js --file ./video.mp4 --preset cinematic

  # High quality 4k output
  node batch-process.js --file ./video.mp4 --resolution 4k --quality high
`)
}

// Resolution map
const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
}

// Quality presets for FFmpeg
const QUALITY_PRESETS = {
  low: { crf: 28, preset: 'veryfast' },
  medium: { crf: 23, preset: 'medium' },
  high: { crf: 18, preset: 'slow' },
}

/**
 * Process a single video file
 */
async function processSingleFile(inputPath: string, config: Config): Promise<void> {
  const inputDir = path.dirname(inputPath)
  const inputName = path.basename(inputPath, path.extname(inputPath))
  
  // Ensure output directory exists
  if (!fs.existsSync(config.output)) {
    fs.mkdirSync(config.output, { recursive: true })
  }
  
  const outputPath = path.join(config.output, `${inputName}_processed.mp4`)
  
  console.log(`\n📹 Processing: ${inputPath}`)
  console.log(`   → Output: ${outputPath}`)
  console.log(`   → Preset: ${config.preset}`)
  console.log(`   → Resolution: ${config.resolution}`)
  console.log(`   → FPS: ${config.fps}`)
  
  try {
    await processVideo(inputPath, outputPath, config)
    console.log(`✅ Complete: ${outputPath}`)
  } catch (error) {
    console.error(`❌ Failed: ${error}`)
  }
}

/**
 * Process video with FFmpeg - applies zoom effect
 */
function processVideo(inputPath: string, outputPath: string, config: Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const res = RESOLUTIONS[config.resolution] || RESOLUTIONS['1080p']
    const quality = QUALITY_PRESETS[config.quality]
    
    // Build FFmpeg filters based on preset
    let videoFilters = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2`
    
    // Add zoom effect based on preset
    if (config.preset === 'cinematic') {
      // Cinematic zoom - smooth pan and zoom
      // Using FFmpeg's zoompan filter with smooth transitions
      videoFilters += ',zoompan=z=\'min(zoom+0.001,1.5)\':d=25:s=${res.width}x${res.height}:fps=${config.fps}'
    } else if (config.preset === 'simple') {
      // Simple zoom in/out
      videoFilters += ',zoompan=z=\'1+0.5*sin(PI*t)\':d=100:s=${res.width}x${res.height}:fps=${config.fps}`
    }
    
    const ffmpegArgs = [
      '-i', inputPath,
      '-vf', videoFilters,
      '-r', config.fps.toString(),
      '-c:v', 'libx264',
      '-preset', quality.preset,
      '-crf', quality.crf.toString(),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y', // Overwrite output
      outputPath,
    ]
    
    if (config.verbose) {
      console.log('FFmpeg args:', ffmpegArgs.join(' '))
    }
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs)
    
    ffmpeg.stderr.on('data', (data) => {
      if (config.verbose) {
        console.log(data.toString())
      }
    })
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })
    
    ffmpeg.on('error', (error) => {
      reject(error)
    })
  })
}

/**
 * Process multiple files in parallel
 */
async function processBatch(files: string[], config: Config): Promise<void> {
  console.log(`\n📁 Batch processing ${files.length} files (parallel: ${config.parallel})`)
  
  const queue = [...files]
  const processing: Promise<void>[] = []
  
  while (queue.length > 0 || processing.length > 0) {
    // Start new processes if we have capacity
    while (queue.length > 0 && processing.length < config.parallel) {
      const file = queue.shift()!
      const promise = processSingleFile(file, config).then(() => {
        processing.splice(processing.indexOf(promise), 1)
      })
      processing.push(promise)
    }
    
    // Wait a bit before checking again
    await new Promise(r => setTimeout(r, 100))
  }
  
  console.log('\n✅ All files processed!')
}

/**
 * Watch folder for new files
 */
function watchFolder(config: Config): void {
  console.log(`\n👀 Watching: ${config.input}`)
  
  const processed = new Set<string>()
  
  const checkInterval = setInterval(() => {
    if (!fs.existsSync(config.input)) return
    
    const files = fs.readdirSync(config.input)
      .filter(f => /\.(mp4|mov|webm|mkv)$/i.test(f))
      .map(f => path.join(config.input, f))
      .filter(f => !processed.has(f))
    
    for (const file of files) {
      processed.add(file)
      console.log(`\n🆕 New file detected: ${file}`)
      processSingleFile(file, config)
    }
  }, 1000)
  
  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(checkInterval)
    console.log('\n👋 Stopped watching')
    process.exit(0)
  })
}

/**
 * Main entry point
 */
async function main() {
  const config = parseArgs()
  
  console.log(`
╔════════════════════════════════════════╗
║   ScreenArc Batch Processor v1.0       ║
╚════════════════════════════════════════╝
`)
  
  // Ensure directories exist
  if (!fs.existsSync(config.input)) {
    fs.mkdirSync(config.input, { recursive: true })
    console.log(`📁 Created input folder: ${config.input}`)
    console.log('💡 Drop videos into this folder to process them')
  }
  
  if (!fs.existsSync(config.output)) {
    fs.mkdirSync(config.output, { recursive: true })
  }
  
  // Get all video files in input folder
  const inputFiles = fs.readdirSync(config.input)
    .filter(f => /\.(mp4|mov|webm|mkv)$/i.test(f))
    .map(f => path.join(config.input, f))
  
  if (inputFiles.length === 0) {
    if (config.watch) {
      watchFolder(config)
    } else {
      console.log('📭 No video files found in input folder')
      console.log(`   Add videos to: ${config.input}`)
      process.exit(0)
    }
  } else {
    await processBatch(inputFiles, config)
    
    if (config.watch) {
      watchFolder(config)
    }
  }
}

main().catch(console.error)
