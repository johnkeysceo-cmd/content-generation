# ScreenArc CLI - Fully Automated Video Processing

## Overview

This document describes the fully automated CLI interface for ScreenArc that extracts all core video processing logic from the Electron main process and provides a headless, pure Node.js module for video processing.

## Architecture

### Core Components

1. **`src/cli/cli-video-processor.ts`** - Headless video processor
   - Extracts rendering logic from `src/lib/renderer.ts`
   - Uses `@napi-rs/canvas` to replicate exact Canvas-based rendering
   - Processes videos frame-by-frame with identical output to GUI
   - Handles all effects: zoom, pan, cursor, webcam, backgrounds, etc.
   - Works on Windows, macOS, and Linux without native dependencies

2. **`src/cli/processor.ts`** - Unified processor interface
   - Provides main entry point for video processing
   - Routes to headless Canvas-based processor

3. **`src/cli/index.ts`** - CLI entry script
   - Uses Commander.js for command parsing
   - Supports single file and batch processing
   - Handles presets, configuration, and auto-zoom generation

4. **`src/cli/ffmpeg-utils.ts`** - FFmpeg utilities
   - Platform-specific binary resolution from `binaries/*`
   - Video info extraction, dimension calculations
   - Quality settings and file operations

## Features

### Identical Output to GUI
- Uses the same Canvas rendering pipeline as the GUI
- Replicates `drawScene` function from `src/lib/renderer.ts`
- Applies exact same filters, overlays, cursors, and timelines
- Maintains pixel-perfect accuracy

### Headless Operation
- No Electron dependencies
- Pure Node.js module
- No React or Zustand state
- Works in any Node.js environment

### Platform Support
- Automatically detects and uses platform-specific FFmpeg binaries
- Supports Windows, macOS (Intel/ARM), and Linux
- Falls back to system FFmpeg if bundled binary not found

### Batch Processing
- Process entire folders of videos
- Apply presets and overlays to multiple files
- Log progress and errors to files
- Unattended execution support

## Usage

### Single Video Processing

```bash
# Basic usage with preset
npm run cli -- process -i input.mp4 -o output.mp4 -p cinematic

# With custom settings
npm run cli -- process -i input.mp4 -o output.mp4 \
  --preset cinematic \
  --resolution 1080p \
  --quality high \
  --fps 60 \
  --metadata recording.json

# With auto-zoom from metadata
npm run cli -- process -i input.mp4 -o output.mp4 \
  --metadata recording.json \
  --zoom-level 2.5
```

### Batch Processing

```bash
# Process all videos in a folder
npm run cli -- batch -i ./videos -o ./output -p cinematic

# Recursive processing
npm run cli -- batch -i ./videos -o ./output -p cinematic --recursive

# Save results to JSON
npm run cli -- batch -i ./videos -o ./output -p cinematic --json
```

### Presets

```bash
# List available presets
npm run cli -- presets --list

# Available presets:
# - cinematic (default)
# - minimal
# - youtube
# - short (9:16 for TikTok/Shorts)
# - instagram (1:1)
# - clean
# - dark
```

## Configuration

### CLI Parameters

**Input/Output:**
- `-i, --input <path>` - Input video file (required)
- `-o, --output <path>` - Output video file
- `-m, --metadata <path>` - Metadata JSON from ScreenArc recording

**Presets:**
- `-p, --preset <name>` - Preset name (cinematic, minimal, youtube, etc.)
- `--preset-file <path>` - Custom preset JSON file

**Export Settings:**
- `--format <format>` - Output format (mp4, gif)
- `-r, --resolution <res>` - Resolution (720p, 1080p, 2k)
- `--fps <n>` - Frame rate (default: 60)
- `-q, --quality <level>` - Quality (low, medium, high)
- `--aspect-ratio <ratio>` - Aspect ratio (16:9, 9:16, 1:1)

**Frame Styles:**
- `--background <color>` - Background color (hex)
- `--padding <n>` - Frame padding percentage
- `--border-radius <n>` - Border radius
- `--shadow-blur <n>` - Shadow blur
- `--border-width <n>` - Border width

**Zoom & Effects:**
- `--zoom-level <n>` - Zoom level (1 = no zoom)
- `--zoom-duration <n>` - Zoom region duration in seconds
- `--show-cursor` - Show cursor (default: true)
- `--no-cursor` - Hide cursor
- `--enable-click-ripple` - Enable click ripple effect
- `--enable-click-scale` - Enable click scale effect

**Audio:**
- `--audio-volume <n>` - Audio volume (0-1)
- `--audio-muted` - Mute audio

**Other:**
- `-v, --verbose` - Verbose logging
- `--quiet` - Quiet mode (no progress output)
- `--dry-run` - Validate configuration without processing

## Implementation Details

### Video Processing Pipeline

1. **Initialization**
   - Load metadata JSON (if provided)
   - Get video info using FFprobe
   - Prepare cursor bitmaps from metadata
   - Build renderable state

2. **Frame Extraction**
   - Extract all video frames using FFmpeg
   - Extract webcam frames (if enabled)
   - Store frames in temporary directory

3. **Frame Rendering**
   - For each frame in output timeline:
     - Map export time to source time (accounting for cuts/speed)
     - Load corresponding video frame
     - Render using Canvas (background, video, cursor, webcam, effects)
     - Apply zoom/pan transforms
     - Generate RGBA buffer

4. **Video Encoding**
   - Write all rendered frames to FFmpeg stdin
   - Encode to MP4 or GIF
   - Apply audio (if enabled)
   - Cleanup temporary files

### Auto-Zoom Generation

When metadata is provided with click events, the CLI automatically generates zoom regions:

- Groups clicks within 3 seconds together
- Creates zoom regions starting 1 second before first click
- Holds zoom for 0.9 seconds after last click
- Minimum duration: 3 seconds
- Uses preset zoom level or `--zoom-level` parameter

### Platform-Specific FFmpeg

The CLI automatically resolves FFmpeg binaries:

1. Checks `binaries/{platform}/ffmpeg` (or `ffmpeg.exe` on Windows)
2. Checks environment variable `SCREENARC_FFMPEG_PATH`
3. Falls back to system `ffmpeg` command

Platform detection:
- Windows: `binaries/windows/ffmpeg.exe`
- macOS Intel: `binaries/darwin/ffmpeg-x64`
- macOS ARM: `binaries/darwin/ffmpeg-arm64`
- Linux: `binaries/linux/ffmpeg`

## Dependencies

### Required
- `@napi-rs/canvas` - Node.js Canvas implementation (pre-built binaries, no native compilation needed)
- `commander` - CLI argument parsing

### Optional
- FFmpeg binary in `binaries/*` or system PATH

## Installation

```bash
# Install dependencies (@napi-rs/canvas will be installed automatically with pre-built binaries)
npm install

# The CLI is ready to use
npm run cli -- process -i video.mp4 -o output.mp4 -p cinematic
```

**Note:** `@napi-rs/canvas` uses pre-built binaries and doesn't require native compilation or GTK+ dependencies, making it much easier to install on Windows compared to the `canvas` package.

## Examples

### Process a ScreenArc recording

```bash
npm run cli -- process \
  -i ScreenArc-recording-1234567890-screen.mp4 \
  -m ScreenArc-recording-1234567890.json \
  -o final-video.mp4 \
  -p cinematic \
  --resolution 1080p \
  --quality high
```

### Batch process folder with YouTube preset

```bash
npm run cli -- batch \
  -i ./recordings \
  -o ./processed \
  -p youtube \
  --recursive \
  --json
```

### Custom frame styling

```bash
npm run cli -- process \
  -i input.mp4 \
  -o output.mp4 \
  --background "#1a1a2e" \
  --padding 8 \
  --border-radius 20 \
  --shadow-blur 40 \
  --zoom-level 2.5
```

## Notes

- The CLI produces **identical output** to the GUI by using the same Canvas rendering pipeline
- All GUI state (presets, frame regions, cursor effects) is converted to plain JSON/CLI parameters
- No React or Electron dependencies required
- Fully automated - can process entire folders unattended
- Progress logging and error handling included

## Troubleshooting

### Canvas Installation Issues

`@napi-rs/canvas` uses pre-built binaries and should install without issues. If you encounter problems:

**Windows:**
- Should work out of the box with pre-built binaries
- No GTK+ or Visual Studio Build Tools required (unlike the `canvas` package)

**macOS:**
- Should work out of the box
- If issues occur, ensure Xcode Command Line Tools are installed: `xcode-select --install`

**Linux:**
- Should work out of the box
- If issues occur, you may need: `sudo apt-get install libnapi-rs-canvas-dev` (if available)

### FFmpeg Not Found

1. Check `binaries/{platform}/ffmpeg` exists
2. Set `SCREENARC_FFMPEG_PATH` environment variable
3. Ensure system FFmpeg is in PATH

### Memory Issues with Large Videos

For very large videos, the frame extraction approach may use significant memory. Consider:
- Processing shorter segments
- Using lower resolution
- Increasing system RAM
