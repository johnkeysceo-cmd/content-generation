/**
 * ScreenArc CLI - Logger Module
 * Provides logging functionality with file output support
 */

import fs from 'fs'
import path from 'path'
import { LogLevel, Logger } from './types.js'

// const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss'

function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'debug': return '\x1b[36m'    // Cyan
    case 'info': return '\x1b[32m'     // Green
    case 'warn': return '\x1b[33m'     // Yellow
    case 'error': return '\x1b[31m'    // Red
    default: return '\x1b[0m'          // Reset
  }
}

const RESET = '\x1b[0m'

export class CLILogger implements Logger {
  private logFile: string | null = null
  private minLevel: LogLevel
  private quiet: boolean = false

  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  }

  constructor(options: { logFile?: string; level?: LogLevel; quiet?: boolean } = {}) {
    this.logFile = options.logFile || null
    this.minLevel = options.level || 'info'
    this.quiet = options.quiet || false

    // Ensure log directory exists
    if (this.logFile) {
      const dir = path.dirname(this.logFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel]
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = formatTimestamp()
    const levelStr = level.toUpperCase().padEnd(5)
    return `[${timestamp}] [${levelStr}] ${message}`
  }

  private writeToFile(message: string): void {
    if (this.logFile) {
      fs.appendFileSync(this.logFile, message + '\n', 'utf-8')
    }
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return

    const formattedMessage = args.length > 0 
      ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}`
      : message

    const fullMessage = this.formatMessage(level, formattedMessage)

    // Write to file
    this.writeToFile(fullMessage)

    // Output to console (unless quiet mode)
    if (!this.quiet) {
      const color = getLevelColor(level)
      console.log(`${color}${fullMessage}${RESET}`)
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args)
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args)
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet
  }
}

// Default logger instance
let defaultLogger: CLILogger | null = null

export function getLogger(options?: { logFile?: string; level?: LogLevel; quiet?: boolean }): CLILogger {
  if (!defaultLogger) {
    defaultLogger = new CLILogger(options)
  }
  return defaultLogger
}

export function setDefaultLogger(logger: CLILogger): void {
  defaultLogger = logger
}
