#!/usr/bin/env node

/**
 * ScreenArc CLI - Fully Automatic Video Processing
 * 
 * Takes ANY raw video and automatically creates a cinematic version
 * with smooth zoom/pan effects using FFmpeg
 * 
 * NO APP NEEDED - Runs completely automatically!
 * 
 * Usage:
 *   node scripts/cli-auto.cjs --input=video.mp4
 *   node scripts/cli-auto.cjs --input=video.mp4 --output=result.mp4
 */

const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')

// Get FFmpeg path
function getFFmpegPath() {
  const appRoot = path.join(__dirname, '..')
  const ffmpegPath = path.join(appRoot, 'binaries', 'windows', 'ffmpeg.exe')
  if (fs.existsSync(ffmpegPath)) {
    return ffmpegPath
  }
  // Fallback to system ffmpeg
  return 'ffmpeg'
}

// Get FFprobe path
function getFFprobePath() {
  const appRoot = path.join(__dirname, '..')
  const ffprobePath = path.join(appRoot, 'binaries', 'windows', 'ffprobe.exe')
  if (fs.existsSync(ffprobePath)) {
    return ffprobePath
  }
  return 'ffprobe'
}

// Parse arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const config = {
    input: '',
    output: '',
    resolution: '1080p',
    quality: 'high',
    fps: 30,
    zoomSpeed: 'medium',
  }
  
  for (const arg of args) {
    const [key, value] = arg.replace('--', '').split('=')
    switch (key) {
      case 'input':
      case 'i':
        config.input = value
        break
      case 'output':
      case 'o':
        config.output = value
        break
      case 'resolution':
      case 'r':
        config.resolution = value
        break
      case 'quality':
      case 'q':
        config.quality = value
        break
      case 'fps':
        config.fps = parseInt(value)
        break
      case 'zoom':
        config.zoomSpeed = value
        break
    }
  }
  
  // Validate input
  if (!config.input) {
    console.log('Usage: node cli-auto.cjs --input=video.mp4 [--output=output.mp4]')
    process.exit(1)
  }
  
  config.input = path.resolve(config.input)
  
  if (!fs.existsSync(config.input)) {
    console.log('Error: Input file not found:', config.input)
    process.exit(1)
  }
  
  // Auto-generate output
  if (!config.output) {
    const dir = path.dirname(config.input)
    const name = path.basename(config.input, path.extname(config.input))
    config.output = path.join(dir, `${name}_cinematic.mp4`)
  }
  
  return config
}

// Get video info
function getVideoInfo(inputPath) {
  const ffprobe = getFFprobePath()
  try {
    const output = execSync(`"${ffprobe}" -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${inputPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const info = JSON.parse(output)
    const stream = info.streams[0]
    return {
      width: stream.width,
      height: stream.height,
      duration: parseFloat(stream.duration),
    }
  } catch (e) {
    console.log('Could not get video info, using defaults')
    return { width: 1920, height: 1080, duration: 60 }
  }
}

async function main() {
  const config = parseArgs()
  const ffmpeg = getFFmpegPath()
  
  console.log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI - Auto Mode          ║
╚════════════════════════════════════════╝
`)
  console.log('📹 Input:', config.input)
  console.log('📤 Output:', config.output)
  console.log('')
  
  // Get video info
  console.log('🔍 Analyzing video...')
  const videoInfo = getVideoInfo(config.input)
  console.log(`   Size: ${videoInfo.width}x${videoInfo.height}`)
  console.log(`   Duration: ${videoInfo.duration.toFixed(1)}s`)
  console.log('')
  
  // Resolution settings
  const resolutions = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '2k': { width: 2560, height: 1440 },
    '4k': { width: 3840, height: 2160 },
  }
  
  const res = resolutions[config.resolution] || resolutions['1080p']
  
  // Quality settings
  const qualitySettings = {
    low: { crf: 28, preset: 'veryfast' },
    medium: { crf: 23, preset: 'medium' },
    high: { crf: 18, preset: 'slow' },
  }
  
  const quality = qualitySettings[config.quality] || qualitySettings.high
  
  console.log('🎬 Processing with cinematic zoom effects...')
  console.log('')
  
  // Build FFmpeg command with zoom/pan filter
  // This creates a smooth cinematic effect with zoom and pan
  const zoomSpeed = config.zoomSpeed === 'slow' ? 0.001 : config.zoomSpeed === 'fast' ? 0.003 : 0.002
  
  const filterComplex = `
    [0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base];
    [base]zoompan=z='min(zoom+${zoomSpeed},1.5)':d=25:s=${res.width}x${res.height}:fps=${config.fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[out]
  `
  
  const args = [
    '-i', config.input,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-r', config.fps.toString(),
    '-c:v', 'libx264',
    '-preset', quality.preset,
    '-crf', quality.crf.toString(),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y',
    config.output
  ]
  
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, {
      stdio: 'inherit'
    })
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('')
        console.log('✅ Done! Output saved to:', config.output)
        
        // Get output file size
        const stats = fs.statSync(config.output)
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
        console.log('   File size:', sizeMB, 'MB')
      } else {
        console.log('Error: FFmpeg exited with code', code)
      }
      resolve()
    })
    
    proc.on('error', (err) => {
      console.log('Error:', err.message)
      reject(err)
    })
  })
}

main().catch(console.error)
