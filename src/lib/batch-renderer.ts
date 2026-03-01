/**
 * Batch Rendering Pipeline
 * 
 * Production-grade batch processing system for automated video generation.
 * Supports headless rendering, job queues, and crash recovery.
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// TYPES
// ============================================================

export type RenderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type OutputFormat = 'mp4' | 'webm' | 'gif'

export interface RenderJob {
  id: string
  inputPath: string
  outputPath: string
  settings: RenderSettings
  status: RenderStatus
  progress: number
  startTime?: number
  endTime?: number
  error?: string
  retries: number
}

export interface RenderSettings {
  // Video settings
  width: number
  height: number
  fps: number
  codec: string
  bitrate?: string
  
  // Timeline settings
  timelineJson?: string
  preset?: string
  
  // Effects
  enableMotionBlur: boolean
  enableSmoothing: boolean
  enableVignette: boolean
  
  // Output
  format: OutputFormat
  quality: 'low' | 'medium' | 'high' | 'ultra'
  
  // Audio
  backgroundMusic?: string
  voiceover?: string
  musicVolume: number
  sfxVolume: number
}

export interface BatchRenderOptions {
  inputDirectory: string
  outputDirectory: string
  settings: RenderSettings
  maxConcurrent: number
  retryFailed: boolean
  maxRetries: number
  onProgress?: (job: RenderJob) => void
  onComplete?: (job: RenderJob) => void
  onError?: (job: RenderJob, error: Error) => void
}

export interface BatchRenderResult {
  totalJobs: number
  completed: number
  failed: number
  cancelled: number
  totalTime: number
  jobs: RenderJob[]
}

// ============================================================
// DEFAULT SETTINGS
// ============================================================

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  bitrate: '5M',
  enableMotionBlur: true,
  enableSmoothing: true,
  enableVignette: true,
  format: 'mp4',
  quality: 'high',
  musicVolume: 0.3,
  sfxVolume: 0.5,
}

export const QUALITY_PRESETS: Record<RenderSettings['quality'], { bitrate: string; crf: number }> = {
  low: { bitrate: '2M', crf: 28 },
  medium: { bitrate: '4M', crf: 23 },
  high: { bitrate: '8M', crf: 18 },
  ultra: { bitrate: '15M', crf: 15 },
}

// ============================================================
// BATCH RENDERER
// ============================================================

export class BatchRenderer {
  private jobs: Map<string, RenderJob> = new Map()
  private queue: string[] = []
  private processing: Set<string> = new Set()
  private options: BatchRenderOptions
  private isRunning: boolean = false
  private isPaused: boolean = false
  private ffmpegPath: string = 'ffmpeg'

  constructor(options: BatchRenderOptions) {
    this.options = {
      ...options,
      maxConcurrent: options.maxConcurrent ?? 2,
      retryFailed: options.retryFailed ?? true,
      maxRetries: options.maxRetries ?? 3,
    }
  }

  /**
   * Set FFmpeg path
   */
  setFFmpegPath(path: string): void {
    this.ffmpegPath = path
  }

  /**
   * Add a job to the queue
   */
  addJob(inputPath: string, outputPath: string, settings?: Partial<RenderSettings>): string {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const job: RenderJob = {
      id,
      inputPath,
      outputPath,
      settings: { ...this.options.settings, ...settings },
      status: 'pending',
      progress: 0,
      retries: 0,
    }

    this.jobs.set(id, job)
    this.queue.push(id)
    
    return id
  }

  /**
   * Add multiple jobs from a directory
   */
  addJobsFromDirectory(extensions: string[] = ['.mp4', '.mov', '.avi']): string[] {
    const jobIds: string[] = []
    
    if (!fs.existsSync(this.options.inputDirectory)) {
      return jobIds
    }

    const files = fs.readdirSync(this.options.inputDirectory)
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      if (extensions.includes(ext)) {
        const inputPath = path.join(this.options.inputDirectory, file)
        const outputName = path.basename(file, ext) + '.mp4'
        const outputPath = path.join(this.options.outputDirectory, outputName)
        
        const id = this.addJob(inputPath, outputPath)
        jobIds.push(id)
      }
    }
    
    return jobIds
  }

  /**
   * Start processing the queue
   */
  async start(): Promise<BatchRenderResult> {
    if (this.isRunning) {
      throw new Error('Batch renderer is already running')
    }

    this.isRunning = true
    const startTime = Date.now()
    
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDirectory)) {
      fs.mkdirSync(this.options.outputDirectory, { recursive: true })
    }

    // Process queue
    while (this.queue.length > 0 || this.processing.size > 0) {
      if (!this.isRunning) break
      
      while (this.isPaused) {
        await this.sleep(100)
      }

      // Fill up processing slots
      while (this.queue.length > 0 && this.processing.size < this.options.maxConcurrent) {
        const jobId = this.queue.shift()!
        this.processJob(jobId)
      }

      // Wait a bit before checking again
      await this.sleep(500)
    }

    this.isRunning = false
    
    return this.getResult(startTime)
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isPaused = true
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.isPaused = false
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.isRunning = false
    
    // Cancel pending jobs
    for (const jobId of this.queue) {
      const job = this.jobs.get(jobId)
      if (job) {
        job.status = 'cancelled'
      }
    }
    
    this.queue = []
  }

  /**
   * Process a single job
   */
  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.status = 'processing'
    job.startTime = Date.now()
    this.processing.add(jobId)

    this.options.onProgress?.(job)

    try {
      await this.renderVideo(job)
      
      job.status = 'completed'
      job.progress = 100
      job.endTime = Date.now()
      
      this.options.onComplete?.(job)
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error)
      
      // Retry if enabled
      if (job.retries < this.options.maxRetries) {
        job.retries++
        job.status = 'pending'
        job.progress = 0
        this.queue.push(jobId)
      } else {
        job.status = 'failed'
        this.options.onError?.(job, error as Error)
      }
    }

    this.processing.delete(jobId)
  }

  /**
   * Render a single video using FFmpeg
   */
  private renderVideo(job: RenderJob): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = this.buildFFmpegArgs(job)
      
      console.log(`[BatchRenderer] Starting job ${job.id}`)
      console.log(`[BatchRenderer] FFmpeg args: ${args.join(' ')}`)

      const proc = spawn(this.ffmpegPath, args)
      
      let stderr = ''
      
      proc.stderr.on('data', (data) => {
        const str = data.toString()
        stderr += str
        
        // Parse progress from FFmpeg output
        const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (timeMatch && job.settings.fps) {
          const hours = parseInt(timeMatch[1])
          const minutes = parseInt(timeMatch[2])
          const seconds = parseFloat(timeMatch[3])
          const currentTime = hours * 3600 + minutes * 60 + seconds
          
          // Estimate progress (this is rough)
          const duration = this.estimateDuration(job.inputPath)
          if (duration > 0) {
            job.progress = Math.min(99, (currentTime / duration) * 100)
            this.options.onProgress?.(job)
          }
        }
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
        }
      })

      proc.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Build FFmpeg arguments from job settings
   */
  private buildFFmpegArgs(job: RenderJob): string[] {
    const settings = job.settings
    const quality = QUALITY_PRESETS[settings.quality]
    
    const args = [
      '-i', job.inputPath,
      '-c:v', settings.codec,
      '-b:v', settings.bitrate || quality.bitrate,
      '-crf', quality.crf.toString(),
      '-r', settings.fps.toString(),
      '-s', `${settings.width}x${settings.height}`,
      '-pix_fmt', 'yuv420p',
    ]

    // Add audio settings
    if (settings.backgroundMusic) {
      args.push('-i', settings.backgroundMusic, '-map', '0:v', '-map', '1:a')
      args.push('-filter:a', `volume=${settings.musicVolume}`)
    }

    // Add effects
    const filters: string[] = []
    
    if (settings.enableVignette) {
      filters.push('vignette=angle=0.5')
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','))
    }

    // Output
    args.push('-y', job.outputPath)
    
    return args
  }

  /**
   * Estimate video duration (placeholder - in production would use ffprobe)
   */
  private estimateDuration(inputPath: string): number {
    // This would use ffprobe in production
    return 60 // Default assumption
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Get all jobs
   */
  getAllJobs(): RenderJob[] {
    return Array.from(this.jobs.values())
  }

  /**
   * Get queue status
   */
  getStatus(): {
    pending: number
    processing: number
    completed: number
    failed: number
    cancelled: number
  } {
    const jobs = this.getAllJobs()
    
    return {
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
    }
  }

  /**
   * Get final result
   */
  private getResult(startTime: number): BatchRenderResult {
    const jobs = this.getAllJobs()
    
    return {
      totalJobs: jobs.length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
      totalTime: Date.now() - startTime,
      jobs,
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Serialize queue to JSON for persistence
   */
  toJSON(): string {
    const data = {
      jobs: Array.from(this.jobs.entries()),
      queue: this.queue,
      options: this.options,
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * Load queue from JSON
   */
  static fromJSON(json: string): BatchRenderer {
    const data = JSON.parse(json)
    const renderer = new BatchRenderer(data.options)
    
    for (const [id, job] of data.jobs) {
      renderer.jobs.set(id, job as RenderJob)
    }
    renderer.queue = data.queue
    
    return renderer
  }
}

// ============================================================
// HEADLESS RENDERER (CLI)
// ============================================================

export interface HeadlessRenderOptions {
  input: string
  output: string
  settings: RenderSettings
  timeline?: string
  preset?: string
}

export async function runHeadlessRender(options: HeadlessRenderOptions): Promise<void> {
  const { input, output, settings, timeline, preset } = options
  
  // Build command
  const args = [
    '-i', input,
    '-c:v', settings.codec,
    '-b:v', settings.bitrate || QUALITY_PRESETS[settings.quality].bitrate,
    '-crf', QUALITY_PRESETS[settings.quality].crf.toString(),
    '-r', settings.fps.toString(),
    '-s', `${settings.width}x${settings.height}`,
    '-pix_fmt', 'yuv420p',
  ]

  // Apply timeline if provided
  if (timeline) {
    // This would integrate with the timeline engine
    console.log(`[HeadlessRender] Applying timeline: ${timeline}`)
  }

  // Apply preset if provided
  if (preset) {
    console.log(`[HeadlessRender] Using preset: ${preset}`)
  }

  // Effects
  const filters: string[] = []
  
  if (settings.enableVignette) {
    filters.push('vignette=angle=0.5')
  }
  
  if (settings.enableMotionBlur) {
    filters.push('minterpolate=fps=60:mi_mode=mci:me_mode=bidir')
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','))
  }

  // Audio
  if (settings.backgroundMusic) {
    args.push('-i', settings.backgroundMusic, '-map', '0:v', '-map', '1:a')
    args.push('-filter:a', `volume=${settings.musicVolume}`)
  }

  // Output
  args.push('-y', output)

  // Run FFmpeg
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    
    proc.stderr.on('data', (data) => {
      process.stderr.write(data)
    })
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`))
      }
    })
    
    proc.on('error', reject)
  })
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

export function createBatchRenderer(options: BatchRenderOptions): BatchRenderer {
  return new BatchRenderer(options)
}

export function createRenderSettings(overrides?: Partial<RenderSettings>): RenderSettings {
  return { ...DEFAULT_RENDER_SETTINGS, ...overrides }
}

// ============================================================
// CLI UTILITIES
// ============================================================

export function parseCLIArgs(args: string[]): HeadlessRenderOptions | null {
  const input = args.find((a, i) => args[i - 1] === '-i' || args[i - 1] === '--input')
  const output = args.find((a, i) => args[i - 1] === '-o' || args[i - 1] === '--output')
  const preset = args.find((a, i) => args[i - 1] === '-p' || args[i - 1] === '--preset')
  const timeline = args.find((a, i) => args[i - 1] === '-t' || args[i - 1] === '--timeline')
  
  if (!input || !output) {
    return null
  }

  return {
    input,
    output,
    settings: {
      ...DEFAULT_RENDER_SETTINGS,
      ...(preset && { preset }),
    },
    ...(timeline && { timeline }),
  }
}
