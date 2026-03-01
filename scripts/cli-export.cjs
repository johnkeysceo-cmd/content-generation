#!/usr/bin/env node

/**
 * ScreenArc CLI Export - Simple Version
 * 
 * This version works by:
 * 1. Copying video to .screenarc folder with proper naming
 * 2. Creating metadata.json 
 * 3. Launching the app in a way that triggers the export
 * 
 * Usage:
 *   npm run cli-export -- --input="video.mp4"
 * 
 * Simpler approach that uses the built app functionality!
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Configuration
const DEFAULT_CONFIG = {
  inputPath: '',
  outputPath: '',
  format: 'mp4',
  resolution: '1080p',
  quality: 'high',
  fps: 60,
  backgroundColor: '#000000',
  padding: 5,
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const config = { ...DEFAULT_CONFIG }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--' || arg === '') continue
    
    // Handle --key=value format
    if (arg.includes('=')) {
      const [key, value] = arg.split('=')
      switch (key.replace('--', '')) {
        case 'input':
        case 'i':
          if (value) config.inputPath = path.resolve(value)
          break
        case 'output':
        case 'o':
          if (value) config.outputPath = path.resolve(value)
          break
        case 'format':
        case 'f':
          if (['mp4', 'gif'].includes(value)) config.format = value
          break
        case 'resolution':
        case 'r':
          if (['720p', '1080p', '2k'].includes(value)) config.resolution = value
          break
        case 'quality':
        case 'q':
          if (['low', 'medium', 'high'].includes(value)) config.quality = value
          break
        case 'fps':
          config.fps = parseInt(value, 10)
          break
        case 'background':
        case 'b':
          if (value) config.backgroundColor = value
          break
        case 'padding':
          config.padding = parseInt(value, 10)
          break
      }
      continue
    }
    
    // Handle --key value format  
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '')
      const value = args[i + 1]
      
      if (value && !value.startsWith('--')) i++
      
      switch (key) {
        case 'input':
        case 'i':
          if (value && !value.startsWith('--')) config.inputPath = path.resolve(value)
          break
        case 'output':
        case 'o':
          if (value && !value.startsWith('--')) config.outputPath = path.resolve(value)
          break
      }
      continue
    }
    
    // Positional argument
    if (!arg.startsWith('-') && !config.inputPath) {
      config.inputPath = path.resolve(arg)
    }
  }
  
  // Validate
  if (!config.inputPath) {
    console.error('❌ Error: --input is required')
    console.log('Usage: npm run cli-export -- --input=video.mp4')
    process.exit(1)
  }
  
  if (!fs.existsSync(config.inputPath)) {
    console.error(`❌ Error: Video file not found: ${config.inputPath}`)
    process.exit(1)
  }
  
  if (!config.outputPath) {
    const inputDir = path.dirname(config.inputPath)
    const inputName = path.basename(config.inputPath, path.extname(config.inputPath))
    config.outputPath = path.join(inputDir, `${inputName}_cinematic.mp4`)
  }
  
  return config
}

function printHelp() {
  console.log(`
ScreenArc CLI Export
====================

Usage:
  npm run cli-export -- --input=video.mp4

Options:
  --input=<path>     Input video (required)
  --output=<path>   Output path (optional)
  --resolution=     720p, 1080p, 2k (default: 1080p)
  --quality=        low, medium, high (default: high)
  --fps=            Frame rate (default: 60)
  --background=     Background color (default: #000000)
  --padding=        Frame padding % (default: 5)

Example:
  npm run cli-export -- --input=myvideo.mp4 --resolution=1080p --quality=high
`)
}

/**
 * Get the app path
 */
function getAppRoot() {
  return path.join(__dirname, '..')
}

async function main() {
  const config = parseArgs()
  
  console.log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI Export               ║
╚════════════════════════════════════════╝
`)
  
  console.log(`📹 Input:    ${config.inputPath}`)
  console.log(`📤 Output:   ${config.outputPath}`)
  console.log(`📐 Res:      ${config.resolution}`)
  console.log(`🎨 Quality:  ${config.quality}`)
  console.log('')
  
  const appRoot = getAppRoot()
  const screenarcDir = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.screenarc')
  
  // Ensure .screenarc directory exists
  if (!fs.existsSync(screenarcDir)) {
    fs.mkdirSync(screenarcDir, { recursive: true })
  }
  
  // Create unique filenames
  const timestamp = Date.now()
  const videoFileName = `ScreenArc-recording-${timestamp}-screen.mp4`
  const metadataFileName = `ScreenArc-recording-${timestamp}.json`
  const videoDestPath = path.join(screenarcDir, videoFileName)
  const metadataDestPath = path.join(screenarcDir, metadataFileName)
  
  console.log('📋 Copying video to .screenarc folder...')
  
  // Copy video
  fs.copyFileSync(config.inputPath, videoDestPath)
  
  // Create metadata file (minimal - no cursor data for raw video)
  const metadata = {
    platform: process.platform,
    events: [], // No click events for raw video
    cursorImages: {},
    geometry: { x: 0, y: 0, width: 1920, height: 1080 },
    screenSize: { width: 1920, height: 1080 },
    syncOffset: 0,
  }
  
  fs.writeFileSync(metadataDestPath, JSON.stringify(metadata, null, 2))
  
  console.log('✅ Files prepared:')
  console.log(`   Video: ${videoDestPath}`)
  console.log(`   Metadata: ${metadataDestPath}`)
  console.log('')
  
  // Build export settings
  const exportSettings = {
    format: config.format,
    resolution: config.resolution,
    fps: config.fps,
    quality: config.quality,
    backgroundColor: config.backgroundColor,
    padding: config.padding,
  }
  
  // Save export settings to a temp file for the app to read
  const settingsPath = path.join(screenarcDir, `cli-export-${timestamp}.json`)
  fs.writeFileSync(settingsPath, JSON.stringify({
    outputPath: config.outputPath,
    settings: exportSettings,
    videoPath: videoDestPath,
    metadataPath: metadataDestPath,
    timestamp,
  }, null, 2))
  
  console.log('📦 Export settings saved')
  console.log('')
  console.log('Note: This CLI version is a simplified implementation.')
  console.log('For full Canvas-based export, please use the app directly.')
  console.log('')
  console.log('Alternative: Open the app, import the video, and export manually.')
  console.log(`   Video location: ${videoDestPath}`)
  console.log('')
  
  // Try to launch the app
  const electronPath = path.join(appRoot, 'node_modules', '.bin', 'electron' + (process.platform === 'win32' ? '.cmd' : ''))
  
  if (fs.existsSync(electronPath)) {
    console.log('🚀 Launching ScreenArc app...')
    
    spawn(electronPath, [path.join(appRoot, 'dist-electron', 'index.js'), '--cli-launch'], {
      cwd: appRoot,
      stdio: 'inherit',
      detached: true,
      env: {
        ...process.env,
        SCREENARC_CLI_EXPORT: settingsPath,
      }
    })
    
    console.log('✅ App launched! You can now open the video in the app and export.')
  } else {
    console.log('❌ Electron not found. Please build the app first: npm run build')
  }
}

main()
