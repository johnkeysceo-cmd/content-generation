/**
 * ScreenArc CLI - FFmpeg Utilities
 * Helper functions for FFmpeg binary path and video processing
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Resolution dimensions
export const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 }
}

// Aspect ratio dimensions
export const ASPECT_RATIOS: Record<string, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '1:1': 1
}

/**
 * Get the platform-specific FFmpeg binary path
 */
export function getFFmpegPath(): string {
  const platform = process.platform
  
  // Check environment variable first (for development)
  const envPath = process.env.SCREENARC_FFMPEG_PATH
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  // Check local binaries folder (for development)
  const projectRoot = getProjectRoot()
  const localPath = path.join(projectRoot, 'binaries', platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'windows' : 'linux')
  
  // Try different binary names
  const binaryNames: Record<string, string[]> = {
    win32: ['ffmpeg.exe', 'ffmpeg'],
    darwin: ['ffmpeg', 'ffmpeg-arm64', 'ffmpeg-x64'],
    linux: ['ffmpeg']
  }
  
  const names = binaryNames[platform] || ['ffmpeg']
  
  for (const name of names) {
    const fullPath = path.join(localPath, name)
    if (fs.existsSync(fullPath)) {
      // Make executable on Unix
      if (platform !== 'win32') {
        try {
          fs.chmodSync(fullPath, '755')
        } catch (e) {
          // Ignore chmod errors
        }
      }
      return fullPath
    }
  }

  // Fallback to system ffmpeg
  const systemFFmpeg = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return systemFFmpeg
}

/**
 * Get the platform-specific FFprobe binary path
 */
export function getFFprobePath(): string {
  const platform = process.platform
  
  // Check environment variable first
  const envPath = process.env.SCREENARC_FFPROBE_PATH
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  // Check local binaries folder
  const projectRoot = getProjectRoot()
  const localPath = path.join(projectRoot, 'binaries', platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'windows' : 'linux')
  
  const binaryNames: Record<string, string[]> = {
    win32: ['ffprobe.exe', 'ffprobe'],
    darwin: ['ffprobe', 'ffprobe-arm64', 'ffprobe-x64'],
    linux: ['ffprobe']
  }
  
  const names = binaryNames[platform] || ['ffprobe']
  
  for (const name of names) {
    const fullPath = path.join(localPath, name)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  // Fallback to system ffprobe
  const systemFFprobe = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  return systemFFprobe
}

/**
 * Get project root directory
 */
export function getProjectRoot(): string {
  // Try to find project root by looking for package.json
  let currentDir = __dirname
  
  // If in src/cli, go up to project root
  if (currentDir.includes('src' + path.sep + 'cli')) {
    currentDir = path.join(currentDir, '..', '..')
  }
  
  // Check for package.json
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir
    }
    currentDir = path.dirname(currentDir)
  }
  
  // Fallback to process.cwd()
  return process.cwd()
}

/**
 * Calculate export dimensions based on resolution and aspect ratio
 */
export function calculateExportDimensions(
  resolution: string,
  aspectRatio: string
): { width: number; height: number } {
  const res = RESOLUTIONS[resolution] || RESOLUTIONS['1080p']
  const ratio = ASPECT_RATIOS[aspectRatio] || ASPECT_RATIOS['16:9']
  
  let width: number
  let height: number
  
  // Calculate dimensions based on aspect ratio
  if (ratio >= 1) {
    // Landscape-ish (16:9, 4:3)
    width = res.width
    height = Math.round(width / ratio)
  } else {
    // Portrait-ish (9:16, 3:4)
    height = res.height
    width = Math.round(height * ratio)
  }
  
  // Ensure even dimensions (required by FFmpeg)
  width = Math.floor(width / 2) * 2
  height = Math.floor(height / 2) * 2
  
  return { width, height }
}

/**
 * Get default FFmpeg quality settings
 */
export function getQualitySettings(quality: string): { crf: number; preset: string; bitrate?: string } {
  const settings: Record<string, { crf: number; preset: string; bitrate?: string }> = {
    low: { crf: 28, preset: 'fast', bitrate: '2M' },
    medium: { crf: 23, preset: 'medium', bitrate: '5M' },
    high: { crf: 18, preset: 'slow', bitrate: '10M' }
  }
  
  return settings[quality] || settings.medium
}

/**
 * Get user data directory for ScreenArc
 */
export function getUserDataDir(): string {
  const homeDir = os.homedir()
  return path.join(homeDir, '.screenarc')
}

/**
 * Ensure a directory exists
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Get list of video files in a directory
 */
export function getVideoFiles(dirPath: string, recursive: boolean = false): string[] {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.flv', '.wmv']
  const files: string[] = []
  
  function scanDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory() && recursive) {
        scanDir(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (videoExtensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }
  
  if (fs.existsSync(dirPath)) {
    scanDir(dirPath)
  }
  
  return files
}

/**
 * Generate output filename based on input
 */
export function generateOutputPath(
  inputPath: string,
  outputDir?: string,
  suffix: string = '_processed'
): string {
  const dir = outputDir || path.dirname(inputPath)
  const ext = path.extname(inputPath)
  const baseName = path.basename(inputPath, ext)
  return path.join(dir, `${baseName}${suffix}${ext}`)
}
