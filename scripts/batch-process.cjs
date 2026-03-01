#!/usr/bin/env node

/**
 * ScreenArc Batch Processor - Robust Version
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Find FFmpeg
function getFFmpegPath() {
  const systemPath = process.env.PATH || ''
  const pathDirs = systemPath.split(path.delimiter)
  
  for (const dir of pathDirs) {
    const ffmpegPath = path.join(dir, 'ffmpeg.exe')
    if (fs.existsSync(ffmpegPath)) return ffmpegPath
  }
  
  const knownPaths = [
    'F:\\Programs\\ffmpeg\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe',
    'C:\\Programs\\ffmpeg\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe',
  ]
  for (const p of knownPaths) if (fs.existsSync(p)) return p
  
  return 'ffmpeg'
}

const FFMPEG = getFFmpegPath()

const RESOLUTIONS = { '720p': [1280,720], '1080p': [1920,1080], '4k': [3840,2160] }
const QUALITY = {
  low: [28, 'veryfast'],
  medium: [23, 'medium'],
  high: [18, 'slow']
}

function usage() {
  console.log('Usage: node batch-process.cjs --file <video> [-r 720p|1080p|4k] [-q low|medium|high]')
  process.exit(1)
}

const args = process.argv.slice(2)
let file, res = '1080p', qual = 'high'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i+1]) file = args[++i]
  else if ((args[i] === '-r' || args[i] === '--resolution') && args[i+1]) res = args[++i]
  else if ((args[i] === '-q' || args[i] === '--quality') && args[i+1]) qual = args[++i]
}

if (!file) usage()

const [width, height] = RESOLUTIONS[res] || RESOLUTIONS['1080p']
const [crf, preset] = QUALITY[qual] || QUALITY.high

console.log(`\n📹 Input: ${file}`)
console.log(`   Output: ${path.join('output', path.basename(file, path.extname(file)) + '_processed.mp4')}`)
console.log(`   Size: ${width}x${height}`)
console.log(`   FFmpeg: ${FFMPEG}\n`)

if (!fs.existsSync(file)) {
  console.error(`❌ File not found: ${file}`)
  process.exit(1)
}

if (!fs.existsSync('output')) fs.mkdirSync('output')

const output = path.join('output', path.basename(file, path.extname(file)) + '_processed.mp4')

// Build filter
let filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
filter += `,zoompan=z='min(zoom+0.001,1.5)':d=25:s=${width}x${height}:fps=60`

const ffmpegArgs = [
  '-i', file,
  '-vf', filter,
  '-r', '60',
  '-c:v', 'libx264',
  '-preset', preset,
  '-crf', crf.toString(),
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-y',
  output
]

console.log('⏳ Processing...\n')

const proc = spawn(FFMPEG, ffmpegArgs)

let stderr = ''

proc.stderr.on('data', (data) => {
  const s = data.toString()
  stderr += s
  // Show progress
  const m = s.match(/time=(\d+:\d+:\d+\.\d+)/)
  if (m) process.stdout.write(`\r   ⏱ ${m[1]}`)
})

proc.stdout.on('data', (data) => {
  if (process.env.DEBUG) console.log(data.toString())
})

proc.on('close', (code) => {
  process.stdout.write('\n')
  if (code === 0) {
    console.log(`\n✅ Done: ${output}`)
    process.exit(0)
  } else {
    console.error(`\n❌ FFmpeg exited with code ${code}`)
    console.error(stderr.slice(-1000))
    process.exit(1)
  }
})

proc.on('error', (err) => {
  console.error(`\n❌ Failed to start FFmpeg: ${err.message}`)
  process.exit(1)
})

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Cancelled')
  proc.kill('SIGTERM')
  process.exit(1)
})
