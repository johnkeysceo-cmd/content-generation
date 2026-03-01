/**
 * ScreenArc CLI - Video Processor
 * 
 * This module provides a unified interface for video processing.
 * It uses the headless Canvas-based processor for exact GUI replication.
 */

import { 
  CLIProjectConfig, 
  ProgressCallback,
  ProcessingResult
} from './types.js'
import { processVideoHeadless } from './cli-video-processor.js'

/**
 * Process a video with the given configuration
 * This is the main entry point for CLI video processing
 * Uses the headless Canvas-based processor for exact GUI replication
 */
export async function processVideo(
  config: CLIProjectConfig,
  progressCallback?: ProgressCallback
): Promise<ProcessingResult> {
  // Use the headless Canvas-based processor for exact GUI replication
  return processVideoHeadless(config, progressCallback)
}
