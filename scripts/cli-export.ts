#!/usr/bin/env node

/**
 * ScreenArc CLI Export
 * 
 * Processes a raw ScreenArc recording through the full cinematic rendering pipeline.
 * This uses the same Electron-based rendering engine as the app, ensuring identical results.
 * 
 * Usage:
 *   npm run cli-export -- --video <video.mp4> --metadata <metadata.json> --output <output.mp4>
 *   npm run cli-export -- --help
 * 
 * Workflow:
 *   1. Record with ScreenArc app → produces video.mp4 + metadata.json
 *   2. Run this CLI → processes with all cinematic effects
 *   3. Get the same output as in-app export
 */

import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration interface
interface Config {
  videoPath: string
  metadataPath: string
  outputPath: string
  format: 'mp4' | 'gif'
  resolution: '720p' | '1080p' | '2k'
  quality: 'low' | 'medium' | 'high'
  fps: number
  verbose: boolean
}

const DEFAULT_CONFIG: Config = {
  videoPath: '',
  metadataPath: '',
  outputPath: '',
  format: 'mp4',
  resolution: '1080p',
  quality: 'high',
  fps: 60,
  verbose: false,
}

// Parse command line arguments
function parseArgs(): Config {
  const args = process.argv.slice(2)
  const config = { ...DEFAULT_CONFIG }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    
    switch (arg) {
      case '--video':
      case '-v':
        if (next) config.videoPath = path.resolve(next)
        i++
        break
      case '--metadata':
      case '-m':
        if (next) config.metadataPath = path.resolve(next)
        i++
        break
      case '--output':
      case '-o':
        if (next) config.outputPath = path.resolve(next)
        i++
        break
      case '--format':
      case '-f':
        if (next && ['mp4', 'gif'].includes(next)) {
          config.format = next as Config['format']
        }
        i++
        break
      case '--resolution':
      case '-r':
        if (next && ['720p', '1080p', '2k'].includes(next)) {
          config.resolution = next as Config['resolution']
        }
        i++
        break
      case '--quality':
      case '-q':
        if (next && ['low', 'medium', 'high'].includes(next)) {
          config.quality = next as Config['quality']
        }
        i++
        break
      case '--fps':
        if (next) config.fps = parseInt(next, 10)
        i++
        break
      case '--verbose':
      case '-V':
        config.verbose = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }
  
  // Validate required arguments
  if (!config.videoPath) {
    console.error('❌ Error: --video is required')
    printHelp()
    process.exit(1)
  }
  
  if (!config.metadataPath) {
    console.error('❌ Error: --metadata is required')
    printHelp()
    process.exit(1)
  }
  
  if (!config.outputPath) {
    // Auto-generate output path
    const inputDir = path.dirname(config.videoPath)
    const inputName = path.basename(config.videoPath, path.extname(config.videoPath))
    config.outputPath = path.join(inputDir, `${inputName}_cinematic.mp4`)
  }
  
  // Validate files exist
  if (!fs.existsSync(config.videoPath)) {
    console.error(`❌ Error: Video file not found: ${config.videoPath}`)
    process.exit(1)
  }
  
  if (!fs.existsSync(config.metadataPath)) {
    console.error(`❌ Error: Metadata file not found: ${config.metadataPath}`)
    process.exit(1)
  }
  
  return config
}

function printHelp() {
  console.log(`
ScreenArc CLI Export
====================

Processes a raw ScreenArc recording through the full cinematic rendering pipeline.

Usage:
  npm run cli-export -- [options]

Options:
  -v, --video <path>      Path to the video file (required)
  -m, --metadata <path>  Path to the metadata.json file (required)
  -o, --output <path>    Output path (default: <video>_cinematic.mp4)
  -f, --format           Output format: mp4, gif (default: mp4)
  -r, --resolution       Resolution: 720p, 1080p, 2k (default: 1080p)
  -q, --quality          Quality: low, medium, high (default: high)
  --fps <n>              Frame rate (default: 60)
  -V, --verbose          Verbose logging
  -h, --help             Show this help

Examples:
  # Basic usage (after recording with ScreenArc app)
  npm run cli-export -- --video recording-screen.mp4 --metadata recording.json

  # With custom output
  npm run cli-export -- --video myvideo.mp4 --metadata myvideo.json --output cinematic.mp4

  # High quality 2K export
  npm run cli-export -- --video input.mp4 --metadata input.json --resolution 2k --quality high

Workflow:
  1. Record with ScreenArc app → produces video.mp4 + metadata.json
  2. Run this CLI → processes with all cinematic effects  
  3. Get the same output as in-app export
`)
}

/**
 * Get the app root directory
 */
function getAppRoot(): string {
  // From scripts/ folder, go up to project root
  return path.join(__dirname, '..')
}

/**
 * Build the export settings object
 */
function buildExportSettings(config: Config) {
  return {
    format: config.format,
    resolution: config.resolution,
    fps: config.fps,
    quality: config.quality,
  }
}

/**
 * Main function to run the Electron export
 */
async function runElectronExport(config: Config): Promise<void> {
  const appRoot = getAppRoot()
  
  console.log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI Export v1.0           ║
╚════════════════════════════════════════╝
`)
  
  console.log(`📹 Input Video:   ${config.videoPath}`)
  console.log(`📋 Metadata:      ${config.metadataPath}`)
  console.log(`📤 Output:        ${config.outputPath}`)
  console.log(`📐 Resolution:   ${config.resolution}`)
  console.log(`🎬 Format:       ${config.format}`)
  console.log(`🎨 Quality:      ${config.quality}`)
  console.log(`🔢 FPS:          ${config.fps}`)
  console.log('')
  
  // Build the arguments for the Electron main process
  const electronArgs = [
    path.join(appRoot, 'dist-electron', 'index.js'),
    '--cli-export',
    '--video', config.videoPath,
    '--metadata', config.metadataPath,
    '--output', config.outputPath,
    '--export-format', config.format,
    '--export-resolution', config.resolution,
    '--export-fps', config.fps.toString(),
    '--export-quality', config.quality,
  ]
  
  if (config.verbose) {
    electronArgs.push('--verbose')
  }
  
  console.log('🚀 Starting Electron export process...')
  
  return new Promise((resolve, reject) => {
    const electron = spawn('electron', electronArgs, {
      cwd: appRoot,
      stdio: config.verbose ? 'inherit' : 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    })
    
    let output = ''
    
    if (!config.verbose) {
      electron.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      electron.stderr?.on('data', (data) => {
        output += data.toString()
      })
    }
    
    electron.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Export completed successfully!')
        console.log(`   Output: ${config.outputPath}`)
        resolve()
      } else {
        console.error(`\n❌ Export failed with code ${code}`)
        if (!config.verbose && output) {
          console.error('Output:', output)
        }
        reject(new Error(`Electron process exited with code ${code}`))
      }
    })
    
    electron.on('error', (error) => {
      console.error('\n❌ Failed to start Electron:', error.message)
      reject(error)
    })
  })
}

/**
 * Main entry point
 */
async function main() {
  try {
    const config = parseArgs()
    await runElectronExport(config)
    process.exit(0)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
