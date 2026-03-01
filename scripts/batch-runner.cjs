#!/usr/bin/env node

/**
 * ScreenArc Batch Runner
 * 
 * This runs the ScreenArc app with CLI arguments to process videos
 * using the full application pipeline.
 * 
 * Usage:
 *   npm run build
 *   node scripts/batch-runner.cjs --file "path/to/video.mp4"
 * 
 * Options:
 *   --file <path>       Input video file (required)
 *   --output <path>     Output video file (optional)
 *   --zoom <level>      Zoom level 1.5-5 (default: 2.5)
 *   --duration <sec>    Zoom region duration (default: 5)
 *   --res <res>         Resolution: 720p, 1080p, 4k (default: 1080p)
 *   --quality <q>       Quality: low, medium, high (default: high)
 *   --no-auto-zoom     Disable automatic zoom (default: enabled)
 * 
 * Frame Style Options:
 *   --padding <0-30>       Frame padding (default: 5)
 *   --border-radius <0-100> Frame border radius (default: 16)
 *   --shadow-blur <0-100>  Shadow blur (default: 35)
 *   --shadow-y <0-50>      Shadow Y offset (default: 15)
 *   --border-width <0-20>   Border width (default: 4)
 *   --bg-color <hex>       Background color (default: #000000)
 * 
 * Example:
 *   node scripts/batch-runner.cjs --file "./video.mp4" --output "./output.mp4"
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// Parse arguments
const args = process.argv.slice(2)
let inputFile = null
let outputFile = null
let zoomLevel = 2.5
let regionDuration = 5
let resolution = '1080p'
let quality = 'high'
let autoZoom = true
// Frame style options
let padding = 5
let borderRadius = 16
let shadowBlur = 35
let shadowOffsetY = 15
let borderWidth = 4
let bgColor = '#000000'

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  const next = args[i + 1]
  
  if (arg === '--file' && next) {
    inputFile = next
    i++
  } else if (arg === '--output' && next) {
    outputFile = next
    i++
  } else if (arg === '--zoom' && next) {
    zoomLevel = parseFloat(next)
    i++
  } else if (arg === '--duration' && next) {
    regionDuration = parseInt(next, 10)
    i++
  } else if (arg === '--res' && next) {
    resolution = next
    i++
  } else if (arg === '--quality' && next) {
    quality = next
    i++
  } else if (arg === '--no-auto-zoom') {
    autoZoom = false
  } else if (arg === '--padding' && next) {
    padding = parseInt(next, 10)
    i++
  } else if (arg === '--border-radius' && next) {
    borderRadius = parseInt(next, 10)
    i++
  } else if (arg === '--shadow-blur' && next) {
    shadowBlur = parseInt(next, 10)
    i++
  } else if (arg === '--shadow-y' && next) {
    shadowOffsetY = parseInt(next, 10)
    i++
  } else if (arg === '--border-width' && next) {
    borderWidth = parseInt(next, 10)
    i++
  } else if (arg === '--bg-color' && next) {
    bgColor = next
    i++
  }
}

if (!inputFile) {
  console.log(`
ScreenArc Batch Runner
=====================

Usage:
  node scripts/batch-runner.cjs --file <video> [options]

Options:
  --file <path>       Input video file (required)
  --output <path>     Output video file
  --zoom <level>      Zoom level 1.5-5 (default: 2.5)
  --duration <sec>    Zoom region duration (default: 5)
  --res <res>         Resolution: 720p, 1080p, 4k (default: 1080p)
  --quality <q>       Quality: low, medium, high (default: high)
  --no-auto-zoom     Disable automatic zoom

Frame Style Options:
  --padding <0-30>       Frame padding (default: 5)
  --border-radius <0-100> Frame border radius (default: 16)
  --shadow-blur <0-100>  Shadow blur (default: 35)
  --shadow-y <0-50>      Shadow Y offset (default: 15)
  --border-width <0-20>   Border width (default: 4)
  --bg-color <hex>       Background color (default: #000000)

Example:
  node scripts/batch-runner.cjs --file "./video.mp4" --output "./output.mp4"

  # Custom frame styles:
  node scripts/batch-runner.cjs --file "./video.mp4" --padding 10 --border-radius 20 --shadow-blur 50
`)
  process.exit(1)
}

// Resolve absolute paths
const inputPath = path.resolve(inputFile)
if (!fs.existsSync(inputPath)) {
  console.error(`❌ Input file not found: ${inputPath}`)
  process.exit(1)
}

// Generate output path if not provided
if (!outputFile) {
  const outputDir = path.join(__dirname, '../output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  const baseName = path.basename(inputPath, path.extname(inputPath))
  outputFile = path.join(outputDir, `${baseName}_processed.mp4`)
}

const outputPath = path.resolve(outputFile)

console.log(`
╔══════════════════════════════════════════╗
║   ScreenArc Batch Runner v1.0           ║
╚══════════════════════════════════════════╝
`)

console.log(`📹 Input:   ${inputPath}`)
console.log(`📺 Output:  ${outputPath}`)
console.log(`🔍 Zoom:    ${zoomLevel}x`)
console.log(`⏱ Duration: ${regionDuration}s per region`)
console.log(`📐 Res:     ${resolution}`)
console.log(`🎨 Quality: ${quality}`)
console.log(`📐 Auto-zoom: ${autoZoom ? 'enabled' : 'disabled'}`)
console.log(`\nFrame Styles:`)
console.log(`   Padding: ${padding}%`)
console.log(`   Border Radius: ${borderRadius}px`)
console.log(`   Shadow Blur: ${shadowBlur}px`)
console.log(`   Shadow Y: ${shadowOffsetY}px`)
console.log(`   Border Width: ${borderWidth}px`)
console.log(`   Background: ${bgColor}`)
console.log(`\n⏳ Starting ScreenArc in batch mode...\n`)

// Check if built app exists  
const distElectron = path.join(__dirname, '../dist-electron/index.js')
const builtApp = path.join(__dirname, '../out/ScreenArc-win32-x64/ScreenArc.exe')

let appPath

if (fs.existsSync(distElectron)) {
  // Use dev mode with dist-electron
  appPath = path.join(__dirname, '../node_modules/.bin/electron.cmd')
  console.log(`🛠 Using dev mode: ${appPath}`)
} else if (fs.existsSync(builtApp)) {
  // Use built app
  appPath = builtApp
  console.log(`📦 Using built app: ${appPath}`)
} else {
  console.error(`❌ App not found. Run 'npm run build' first.`)
  process.exit(1)
}

// Build command arguments - use format: --key=value (not --key value)
const appArgs = [
  distElectron,
  `--process-video=${inputPath}`,
  `--output=${outputPath}`,
  `--zoom=${zoomLevel}`,
  `--duration=${regionDuration}`,
  `--res=${resolution}`,
  `--quality=${quality}`,
  `--auto-zoom=${autoZoom}`,
  `--padding=${padding}`,
  `--border-radius=${borderRadius}`,
  `--shadow-blur=${shadowBlur}`,
  `--shadow-y=${shadowOffsetY}`,
  `--border-width=${borderWidth}`,
  `--bg-color=${encodeURIComponent(bgColor)}`,
]

console.log(`\n🚀 Launching...\n`)
console.log(`Command: ${appPath} ${appArgs.join(' ')}\n`)

// Spawn the app
const child = spawn(appPath, appArgs, {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  }
})

child.on('close', (code) => {
  if (code === 0) {
    console.log(`\n✅ Batch processing complete!`)
    console.log(`   Output: ${outputPath}`)
  } else {
    console.log(`\n❌ App exited with code ${code}`)
  }
  process.exit(code || 0)
})

child.on('error', (err) => {
  console.error(`\n❌ Failed to launch: ${err.message}`)
  process.exit(1)
})

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(`\n⚠️ Cancelled`)
  child.kill('SIGTERM')
  process.exit(1)
})
