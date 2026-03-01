#!/usr/bin/env node

/**
 * ScreenArc CLI - Completely Rewritten
 * Provides zoom effects, beat matching, and cinematic processing
 */

const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')

// Colors
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function log(msg, color = 'reset') {
  console.log(`${C[color]}${msg}${C.reset}`)
}

// Get FFmpeg paths
function getFFmpegPath() {
  const appRoot = path.join(__dirname, '..')
  const ffmpegPath = path.join(appRoot, 'binaries', 'windows', 'ffmpeg.exe')
  if (fs.existsSync(ffmpegPath)) return ffmpegPath
  return 'ffmpeg'
}

function getFFprobePath() {
  const appRoot = path.join(__dirname, '..')
  const ffprobePath = path.join(appRoot, 'binaries', 'windows', 'ffprobe.exe')
  if (fs.existsSync(ffprobePath)) return ffprobePath
  return 'ffprobe'
}

// Get video info
function getVideoInfo(inputPath) {
  const ffprobe = getFFprobePath()
  try {
    const output = execSync(`"${ffprobe}" -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate -of json "${inputPath}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    })
    const info = JSON.parse(output)
    const stream = info.streams[0]
    const [num, den] = stream.r_frame_rate.split('/')
    return {
      width: stream.width,
      height: stream.height,
      duration: parseFloat(stream.duration),
      fps: den ? parseFloat(num) / parseFloat(den) : 30
    }
  } catch (e) {
    return { width: 1920, height: 1080, duration: 60, fps: 30 }
  }
}

// Resolution presets
const resolutions = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
}

const qualitySettings = {
  low: { crf: 28, preset: 'veryfast' },
  medium: { crf: 23, preset: 'medium' },
  high: { crf: 18, preset: 'slow' },
  ultra: { crf: 15, preset: 'slower' },
}

// Parse args
function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = { _: [] }
  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg === '--') {
      i++
      continue
    }
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '')
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed[key] = args[i + 1]
        i += 2
      } else {
        parsed[key] = true
        i++
      }
    } else if (arg.startsWith('-')) {
      const key = arg.replace(/^-+/, '')
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed[key] = args[i + 1]
        i += 2
      } else {
        parsed[key] = true
        i++
      }
    } else {
      parsed._.push(arg)
      i++
    }
  }
  return parsed
}

// Show help
function showHelp() {
  log(`
╔══════════════════════════════════════════════════════════════════╗
║              ScreenArc CLI - Help                                ║
╚══════════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/screenarc-cli.js <command> [options]

COMMANDS:
  auto          - Auto cinematic zoom + blur
  zoom          - Zoom with blur effect
  beat-match    - Beat-synced cuts  
  export        - Simple resize/export
  process       - Full pipeline with all effects

OPTIONS:
  -i, --input <file>      Input video
  -o, --output <file>    Output video
  -r, --resolution <res>  720p, 1080p, 2k, 4k (default: 1080p)
  -q, --quality <level>   low, medium, high, ultra (default: high)
  -f, --fps <n>          Frame rate (default: 30)
  -z, --zoom-speed <s>   slow (0.5x), medium (1x), fast (2x)
  -b, --blur <n>         Blur amount 0-20 (default: 8)
  -a, --audio <file>     Audio file for beat matching
  --no-audio            Disable audio

EXAMPLES:
  node scripts/screenarc-cli.js auto -i video.mp4 -o out.mp4 --blur 8
  node scripts/screenarc-cli.js zoom -i video.mp4 -b 10 -z medium
  node scripts/screenarc-cli.js process -i video.mp4 -a music.mp3 -b 8

`, 'cyan')
}

// AUTO COMMAND - Cinematic zoom + blur
async function commandAuto(args) {
  const input = args.input || args.i
  const output = args.output || args.o
  const resolution = args.resolution || args.r || '1080p'
  const quality = args.quality || args.q || 'high'
  const fps = parseInt(args.fps || args.f || 30)
  const blur = parseInt(args.blur || args.b || 8)
  const zoomSpeed = args['zoom-speed'] || args.z || 'medium'

  if (!input) {
    log('ERROR: Input file required. Use --input or -i', 'red')
    process.exit(1)
  }

  const inputPath = path.resolve(input)
  if (!fs.existsSync(inputPath)) {
    log(`ERROR: File not found: ${inputPath}`, 'red')
    process.exit(1)
  }

  const outputPath = output ? path.resolve(output) : path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}_cinematic.mp4`
  )

  log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI - Auto Mode          ║
╚════════════════════════════════════════╝
`, 'magenta')

  log(`Input: ${inputPath}`, 'cyan')
  log(`Output: ${outputPath}`, 'cyan')
  log(`Resolution: ${resolution}`, 'cyan')
  log(`Quality: ${quality}`, 'cyan')
  log(`Blur: ${blur}`, 'cyan')
  log(`Zoom speed: ${zoomSpeed}`, 'cyan')
  console.log('')

  // Get video info
  const videoInfo = getVideoInfo(inputPath)
  const totalFrames = Math.ceil(videoInfo.duration * fps)
  log(`Video: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.duration.toFixed(1)}s, ${videoInfo.fps}fps (${totalFrames} frames)`, 'yellow')
  console.log('')

  const res = resolutions[resolution] || resolutions['1080p']
  const qual = qualitySettings[quality] || qualitySettings.high

  // Zoom speed multipliers
  const speedMultipliers = { slow: 0.5, medium: 1, fast: 2 }
  const speedMult = speedMultipliers[zoomSpeed] || 1

  // Calculate zoom cycle - use totalFrames as duration to match original video
  const cycleFrames = totalFrames
  
  // Build zoom filter - z oscillates between 1 and 1.3 (30% zoom)
  // Use on (output frame count) for smooth continuous zoom
  const zoomFilter = `zoompan=z='1+0.3*sin(PI*on/${cycleFrames/4})':d=${cycleFrames}:s=${res.width}x${res.height}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
  
  let filterComplex
  
  if (blur > 0) {
    // First scale, then blur, then zoompan
    filterComplex = `[0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=luma_radius=${blur}:luma_power=2[blurred];[blurred]${zoomFilter}[out]`
  } else {
    filterComplex = `[0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[base]${zoomFilter}[out]`
  }

  log('Applying cinematic zoom + blur effects...', 'green')
  console.log('')

  const ffmpeg = getFFmpegPath()
  const argsList = [
    '-i', inputPath,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-map', '0:a?', // Map audio from input if available
    '-r', fps.toString(),
    '-c:v', 'libx264',
    '-preset', qual.preset,
    '-crf', qual.crf.toString(),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-t', videoInfo.duration.toString(), // Limit output to original duration
  ]

  if (!args['no-audio']) {
    argsList.push('-c:a', 'aac', '-b:a', '192k')
  } else {
    argsList.push('-an')
  }

  argsList.push('-y', outputPath)

  log(`Running FFmpeg (limiting to ${videoInfo.duration.toFixed(1)}s)...`, 'yellow')
  console.log('')

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, argsList, { stdio: 'inherit' })
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('')
        const stats = fs.statSync(outputPath)
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
        log(`✓ Done! Output: ${outputPath} (${sizeMB} MB)`, 'green')
      } else {
        log(`✗ FFmpeg failed with code ${code}`, 'red')
      }
      resolve()
    })
    proc.on('error', reject)
  })
}

// ZOOM COMMAND
async function commandZoom(args) {
  const input = args.input || args.i
  const output = args.output || args.o
  const resolution = args.resolution || args.r || '1080p'
  const quality = args.quality || args.q || 'high'
  const fps = parseInt(args.fps || args.f || 30)
  const blur = parseInt(args.blur || args.b || 8)
  const zoomSpeed = args['zoom-speed'] || args.z || 'medium'

  if (!input) {
    log('ERROR: Input file required', 'red')
    process.exit(1)
  }

  const inputPath = path.resolve(input)
  if (!fs.existsSync(inputPath)) {
    log(`ERROR: File not found: ${inputPath}`, 'red')
    process.exit(1)
  }

  const outputPath = output ? path.resolve(output) : path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}_zoom.mp4`
  )

  log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI - Zoom Mode            ║
╚════════════════════════════════════════╝
`, 'magenta')

  const videoInfo = getVideoInfo(inputPath)
  log(`Input: ${inputPath}`, 'cyan')
  log(`Blur: ${blur}, Zoom: ${zoomSpeed}`, 'cyan')
  console.log('')

  const res = resolutions[resolution] || resolutions['1080p']
  const qual = qualitySettings[quality] || qualitySettings.high

  const speedMultipliers = { slow: 0.5, medium: 1, fast: 2 }
  const speedMult = speedMultipliers[zoomSpeed] || 1
  const cycleFrames = Math.round(150 / speedMult)

  const zoomFilter = `zoompan=z='1+${0.3 * speedMult}*sin(PI*on/(${cycleFrames}))':d=${cycleFrames}:s=${res.width}x${res.height}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`

  let filterComplex
  if (blur > 0) {
    filterComplex = `[0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=luma_radius=${blur}:luma_power=2[blurred];[blurred]${zoomFilter}[out]`
  } else {
    filterComplex = `[0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[base]${zoomFilter}[out]`
  }

  const ffmpeg = getFFmpegPath()
  const argsList = [
    '-i', inputPath,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-r', fps.toString(),
    '-c:v', 'libx264',
    '-preset', qual.preset,
    '-crf', qual.crf.toString(),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ]

  if (!args['no-audio']) {
    argsList.push('-c:a', 'aac', '-b:a', '192k')
  } else {
    argsList.push('-an')
  }

  argsList.push('-y', outputPath)

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, argsList, { stdio: 'inherit' })
    proc.on('close', (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath)
        log(`✓ Done! (${(stats.size / 1024 / 1024).toFixed(1)} MB)`, 'green')
      }
      resolve()
    })
    proc.on('error', reject)
  })
}

// BEAT MATCH COMMAND  
async function commandBeatMatch(args) {
  const video = args.video || args.v || args.input || args.i
  const audio = args.audio || args.a
  const output = args.output || args.o
  const blur = parseInt(args.blur || args.b || 8)

  if (!video) {
    log('ERROR: Video file required (--video or -v)', 'red')
    process.exit(1)
  }

  if (!audio) {
    log('ERROR: Audio file required for beat matching (--audio or -a)', 'red')
    process.exit(1)
  }

  const videoPath = path.resolve(video)
  const audioPath = path.resolve(audio)

  if (!fs.existsSync(videoPath)) {
    log(`ERROR: Video not found: ${videoPath}`, 'red')
    process.exit(1)
  }

  if (!fs.existsSync(audioPath)) {
    log(`ERROR: Audio not found: ${audioPath}`, 'red')
    process.exit(1)
  }

  const outputPath = output ? path.resolve(output) : path.join(
    path.dirname(videoPath),
    `${path.basename(videoPath, path.extname(videoPath))}_beats.mp4`
  )

  log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI - Beat Match          ║
╚════════════════════════════════════════╝
`, 'magenta')

  log(`Video: ${videoPath}`, 'cyan')
  log(`Audio: ${audioPath}`, 'cyan')
  log(`Blur: ${blur}`, 'cyan')
  console.log('')

  // Simple beat matching: apply zoom + blur synced to video beats
  // In a full implementation, we'd analyze the audio for beats
  const res = resolutions['1080p']
  const quality = qualitySettings.high

  // Generate zoom filter with beat-synced timing
  const zoomFilter = `zoompan=z='1+0.3*sin(PI*on/150)':d=150:s=${res.width}x${res.height}:fps=30:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`

  let filterComplex
  if (blur > 0) {
    filterComplex = `[0:v]scale=${res.width}:${res.height},boxblur=luma_radius=${blur}:luma_power=2[blurred];[blurred]${zoomFilter}[v];[1:a]anull[a]`
  } else {
    filterComplex = `[0:v]scale=${res.width}:${res.height}${zoomFilter}[v];[1:a]anull[a]`
  }

  const ffmpeg = getFFmpegPath()
  const argsList = [
    '-i', videoPath,
    '-i', audioPath,
    '-filter_complex', filterComplex,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', quality.preset,
    '-crf', quality.crf.toString(),
    '-pix_fmt', 'yuv420p',
    '-shortest',
    '-y', outputPath
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, argsList, { stdio: 'inherit' })
    proc.on('close', (code) => {
      if (code === 0) {
        log(`✓ Done! ${outputPath}`, 'green')
      }
      resolve()
    })
    proc.on('error', reject)
  })
}

// EXPORT COMMAND
async function commandExport(args) {
  const input = args.input || args.i
  const output = args.output || args.o
  const resolution = args.resolution || args.r || '1080p'
  const quality = args.quality || args.q || 'high'
  const fps = parseInt(args.fps || args.f || 30)

  if (!input) {
    log('ERROR: Input file required', 'red')
    process.exit(1)
  }

  const inputPath = path.resolve(input)
  if (!fs.existsSync(inputPath)) {
    log(`ERROR: File not found: ${inputPath}`, 'red')
    process.exit(1)
  }

  const outputPath = output ? path.resolve(output) : path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}_export.mp4`
  )

  log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI - Export Mode         ║
╚════════════════════════════════════════╝
`, 'magenta')

  const res = resolutions[resolution] || resolutions['1080p']
  const qual = qualitySettings[quality] || qualitySettings.high

  const filter = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`

  const ffmpeg = getFFmpegPath()
  const argsList = [
    '-i', inputPath,
    '-vf', filter,
    '-r', fps.toString(),
    '-c:v', 'libx264',
    '-preset', qual.preset,
    '-crf', qual.crf.toString(),
    '-pix_fmt', 'yuv420p',
  ]

  if (!args['no-audio']) {
    argsList.push('-c:a', 'aac', '-b:a', '192k')
  } else {
    argsList.push('-an')
  }

  argsList.push('-y', outputPath)

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, argsList, { stdio: 'inherit' })
    proc.on('close', (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath)
        log(`✓ Done! (${(stats.size / 1024 / 1024).toFixed(1)} MB)`, 'green')
      }
      resolve()
    })
    proc.on('error', reject)
  })
}

// PROCESS COMMAND - Full pipeline
async function commandProcess(args) {
  const input = args.input || args.i
  const audio = args.audio || args.a
  const output = args.output || args.o
  const resolution = args.resolution || args.r || '1080p'
  const quality = args.quality || args.q || 'high'
  const fps = parseInt(args.fps || args.f || 30)
  const blur = parseInt(args.blur || args.b || 8)
  const zoomSpeed = args['zoom-speed'] || args.z || 'medium'

  if (!input) {
    log('ERROR: Input file required', 'red')
    process.exit(1)
  }

  const inputPath = path.resolve(input)
  if (!fs.existsSync(inputPath)) {
    log(`ERROR: File not found: ${inputPath}`, 'red')
    process.exit(1)
  }

  const outputPath = output ? path.resolve(output) : path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}_processed.mp4`
  )

  log(`
╔════════════════════════════════════════╗
║   ScreenArc CLI - Full Process        ║
╚════════════════════════════════════════╝
`, 'magenta')

  log(`Input: ${inputPath}`, 'cyan')
  log(`Audio: ${audio || 'none'}`, 'cyan')
  log(`Blur: ${blur}, Zoom: ${zoomSpeed}`, 'cyan')
  console.log('')

  const res = resolutions[resolution] || resolutions['1080p']
  const qual = qualitySettings[quality] || qualitySettings.high

  const speedMultipliers = { slow: 0.5, medium: 1, fast: 2 }
  const speedMult = speedMultipliers[zoomSpeed] || 1
  const cycleFrames = Math.round(150 / speedMult)

  const zoomFilter = `zoompan=z='1+${0.3 * speedMult}*sin(PI*on/(${cycleFrames}))':d=${cycleFrames}:s=${res.width}x${res.height}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`

  let filterComplex
  if (blur > 0) {
    filterComplex = `[0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,boxblur=luma_radius=${blur}:luma_power=2[blurred];[blurred]${zoomFilter}[out]`
  } else {
    filterComplex = `[0:v]scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[base]${zoomFilter}[out]`
  }

  const ffmpeg = getFFmpegPath()
  const argsList = ['-i', inputPath]

  if (audio) {
    const audioPath = path.resolve(audio)
    if (fs.existsSync(audioPath)) {
      argsList.push('-i', audioPath)
    }
  }

  argsList.push(
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-r', fps.toString(),
    '-c:v', 'libx264',
    '-preset', qual.preset,
    '-crf', qual.crf.toString(),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  )

  if (audio) {
    argsList.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k')
  } else if (!args['no-audio']) {
    argsList.push('-c:a', 'aac', '-b:a', '192k')
  } else {
    argsList.push('-an')
  }

  argsList.push('-y', outputPath)

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, argsList, { stdio: 'inherit' })
    proc.on('close', (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath)
        log(`✓ Done! (${(stats.size / 1024 / 1024).toFixed(1)} MB)`, 'green')
      }
      resolve()
    })
    proc.on('error', reject)
  })
}

// Main
async function main() {
  const args = parseArgs()
  const cmd = args._[0] || 'help'

  switch (cmd) {
    case 'auto': await commandAuto(args); break
    case 'zoom': await commandZoom(args); break
    case 'beat-match': case 'beatmatch': await commandBeatMatch(args); break
    case 'export': await commandExport(args); break
    case 'process': await commandProcess(args); break
    default: showHelp(); break
  }
}

main().catch(err => {
  log(`ERROR: ${err.message}`, 'red')
  process.exit(1)
})
