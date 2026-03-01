# ScreenArc CLI - Headless Video Processing

A fully automated, headless CLI system for processing videos without the GUI. Process single videos or entire folders with the same cinematic effects as the desktop application.

## Features

- **Fully Headless**: No Electron or GUI required - pure Node.js processing
- **Presets**: Built-in presets (cinematic, minimal, youtube, short, instagram, clean, dark)
- **Custom Presets**: Load presets from JSON files
- **Batch Processing**: Process entire folders automatically
- **Full Control**: Override any preset setting via CLI arguments
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Logging**: Detailed logs with configurable verbosity

## Installation

1. Install dependencies:
```bash
npm install
```

2. Ensure FFmpeg is available:
   - Place FFmpeg in `binaries/<platform>/` directory
   - Or set `SCREENARC_FFMPEG_PATH` environment variable
   - Or install FFmpeg system-wide

## Quick Start

### Process a Single Video

```bash
# Basic usage with cinematic preset (default)
npm run cli:process -- -i input.mp4 -o output.mp4

# With specific preset
npm run cli:process -- -i input.mp4 -o output.mp4 -p youtube

# With custom settings
npm run cli:process -- -i input.mp4 -o output.mp4 -r 2k -q high --padding 10
```

### Batch Processing

```bash
# Process all videos in a directory
npm run cli:batch -- -i ./recordings -o ./output -p cinematic

# With JSON results output
npm run cli:batch -- -i ./videos -o ./output --json
```

### List Available Presets

```bash
npm run cli:presets
```

### Check System Info

```bash
npm run cli:info
```

## Command Reference

### process (p)

Process a single video file.

```bash
npm run cli:process -- [options]
```

**Options:**

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--input <path>` | `-i` | Input video file (required) | - |
| `--output <path>` | `-o` | Output video file | `<input>_processed.mp4` |
| `--metadata <path>` | `-m` | ScreenArc metadata JSON | - |
| `--preset <name>` | `-p` | Preset name | `cinematic` |
| `--preset-file <path>` | | Custom preset JSON file | - |
| `--format <format>` | `-f` | Output format (mp4, gif) | `mp4` |
| `--resolution <res>` | `-r` | Resolution (720p, 1080p, 2k) | `1080p` |
| `--fps <n>` | | Frame rate | `60` |
| `--quality <level>` | `-q` | Quality (low, medium, high) | `high` |
| `--aspect-ratio <ratio>` | | Aspect ratio (16:9, 9:16, 1:1) | `16:9` |
| `--background <color>` | | Background color (hex) | - |
| `--padding <n>` | | Frame padding (%) | - |
| `--border-radius <n>` | | Border radius | - |
| `--shadow-blur <n>` | | Shadow blur | - |
| `--zoom-level <n>` | | Zoom level (1 = no zoom) | - |
| `--zoom-duration <n>` | | Zoom duration (seconds) | - |
| `--show-cursor` | | Show cursor | `true` |
| `--no-cursor` | | Hide cursor | - |
| `--enable-click-ripple` | | Enable click ripple | - |
| `--no-click-ripple` | | Disable click ripple | - |
| `--webcam` | | Enable webcam overlay | - |
| `--audio-volume <n>` | | Audio volume (0-1) | `1.0` |
| `--verbose` | `-v` | Verbose logging | - |
| `--quiet` | | Quiet mode | - |
| `--dry-run` | | Validate without processing | - |

### batch (b)

Process multiple videos in batch mode.

```bash
npm run cli:batch -- [options]
```

**Options:**

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--input <dir>` | `-i` | Input directory (required) | - |
| `--output <dir>` | `-o` | Output directory (required) | - |
| `--preset <name>` | `-p` | Preset to use | `cinematic` |
| `--pattern <glob>` | | File pattern | `*.mp4` |
| `--recursive` | `-r` | Process subdirectories | `false` |
| `--json` | | Save results to JSON | - |
| `--verbose` | `-v` | Verbose logging | - |
| `--quiet` | | Quiet mode | - |

### presets

List available presets.

```bash
npm run cli:presets
```

### info

Show system and FFmpeg information.

```bash
npm run cli:info
```

## Presets

### Built-in Presets

| Preset | Aspect Ratio | Description |
|--------|--------------|-------------|
| `cinematic` | 16:9 | Default cinematic look with shadows |
| `minimal` | 16:9 | Minimal styling with subtle effects |
| `youtube` | 16:9 | Optimized for YouTube (gradient bg) |
| `short` | 9:16 | TikTok/Shorts vertical format |
| `instagram` | 1:1 | Square format for Instagram |
| `clean` | 16:9 | No effects - clean video |
| `dark` | 16:9 | Dark theme with enhanced shadows |

### Custom Presets

Create a preset file:

```json
{
  "id": "my-preset",
  "name": "My Custom Preset",
  "aspectRatio": "16:9",
  "frameStyles": {
    "background": {
      "type": "gradient",
      "gradientStart": "#1a1a2e",
      "gradientEnd": "#16213e",
      "gradientDirection": "to bottom right"
    },
    "padding": 8,
    "borderRadius": 20,
    "shadowBlur": 40,
    "shadowOffsetX": 0,
    "shadowOffsetY": 20,
    "shadowColor": "rgba(0, 0, 0, 0.9)",
    "borderWidth": 2,
    "borderColor": "rgba(255, 255, 255, 0.1)"
  },
  "cursorStyles": {
    "showCursor": true,
    "shadowBlur": 8,
    "shadowOffsetX": 4,
    "shadowOffsetY": 4,
    "shadowColor": "rgba(0, 0, 0, 0.5)",
    "clickRippleEffect": true,
    "clickRippleColor": "rgba(255, 100, 100, 0.6)",
    "clickRippleSize": 35,
    "clickRippleDuration": 0.6,
    "clickScaleEffect": true,
    "clickScaleAmount": 0.75,
    "clickScaleDuration": 0.3,
    "clickScaleEasing": "Balanced"
  },
  "zoomLevel": 2.5
}
```

Use the custom preset:

```bash
npm run cli:process -- -i video.mp4 -o output.mp4 --preset-file ./my-preset.json
```

## Examples

### Basic Processing

```bash
# Process with default cinematic preset
npm run cli:process -- -i recording.mp4

# Specify output
npm run cli:process -- -i recording.mp4 -o my-video.mp4

# Use YouTube preset
npm run cli:process -- -i recording.mp4 -p youtube
```

### High Quality Export

```bash
# 2K resolution, high quality
npm run cli:process -- -i recording.mp4 -r 2k -q high

# 60fps, best quality
npm run cli:process -- -i recording.mp4 --fps 60 -q high
```

### Custom Styling

```bash
# Custom background color
npm run cli:process -- -i video.mp4 --background "#1a1a2e"

# Custom padding and border
npm run cli:process -- -i video.mp4 --padding 10 --border-radius 20

# Disable cursor
npm run cli:process -- -i video.mp4 --no-cursor
```

### Batch Processing

```bash
# Process all MP4 files
npm run cli:batch -- -i ./recordings -o ./output

# Include subdirectories
npm run cli:batch -- -i ./videos -o ./output -r

# Save results to JSON
npm run cli:batch -- -i ./videos -o ./output --json
```

### With ScreenArc Metadata

If you have a ScreenArc recording with metadata (mouse events):

```bash
npm run cli:process -- -i recording-screen.mp4 -m recording.json -o output.mp4 -p cinematic
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SCREENARC_FFMPEG_PATH` | Path to FFmpeg binary |
| `SCREENARC_FFPROBE_PATH` | Path to FFprobe binary |

## Exit Codes

- `0`: Success
- `1`: Error (invalid input, processing failure, etc.)

## Notes

- The CLI uses the same rendering engine as the GUI app
- Output is identical to what the app would produce
- Videos are processed frame-by-frame for maximum quality
- Batch processing saves results to `batch-results.json` when `--json` is used

## Troubleshooting

### FFmpeg Not Found

If you see "FFmpeg not found", ensure:
1. FFmpeg is in `binaries/<platform>/` directory
2. Or set `SCREENARC_FFMPEG_PATH` environment variable
3. Or install FFmpeg system-wide

### Canvas Module Issues

If you have issues with the `canvas` module:
- On some systems, you may need to install native dependencies
- Consider using the Electron-based CLI instead: `npm run cli-export`

## See Also

- [README.md](../README.md) - Main project documentation
- [tech-stacks.md](tech-stacks.md) - Technology stack details
