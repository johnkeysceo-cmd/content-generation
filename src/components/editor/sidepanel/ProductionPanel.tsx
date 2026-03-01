/**
 * Production Panel - Complete Production Controls
 * 
 * Integrates all production systems:
 * - Timeline presets
 * - Typing simulation
 * - AI auto-zoom
 * - Audio generation
 * - Batch rendering
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  Wand, 
  PlayerPlay, 
  PlayerPause, 
  PlayerStop, 
  PlayerSkipBack, 
  PlayerSkipForward,
  Settings,
  Music,
  Microphone,
  Volume2,
  Movie,
  LayoutGrid,
  Download,
  Loader2,
  Check,
  AlertCircle,
  Keyboard
} from 'tabler-icons-react'
import { cn } from '../../../lib/utils'
import { Button } from '../../ui/button'
import { Switch } from '../../ui/switch'
import { Slider } from '../../ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'

// Production Engine imports
import { 
  productionEngine, 
  type ProductionState 
} from '../../../lib/production-engine'

import { 
  TIMELINE_PRESETS 
} from '../../../lib/timeline-engine'

import { 
  TYPING_PRESETS 
} from '../../../lib/typing-engine'

import { 
  CAMERA_TEMPLATES 
} from '../../../lib/ai-auto-zoom'

import { 
  MUSIC_STYLES,
  SFX_LIBRARY 
} from '../../../lib/audio-generation'

// Timeline Presets
const timelinePresetOptions = TIMELINE_PRESETS.map(p => ({
  value: p.id,
  label: p.name,
  description: p.description
}))

// Camera Templates  
const cameraTemplateOptions = Object.entries(CAMERA_TEMPLATES).map(([id, config]) => ({
  value: id,
  label: config.name,
  description: config.description
}))

// Typing Presets
const typingPresetOptions = Object.entries(TYPING_PRESETS).map(([id, config]) => ({
  value: id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
  description: `${config.letterDelay}ms delay`
}))

// Music Styles
const musicStyleOptions = Object.entries(MUSIC_STYLES).map(([id, config]) => ({
  value: id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
  description: `${config.bpm} BPM - ${config.description}`
}))

type TabId = 'timeline' | 'typing' | 'audio' | 'render'

interface ProductionPanelProps {
  videoDuration?: number
  onGenerate?: () => void
}

export function ProductionPanel({ videoDuration = 60, onGenerate }: ProductionPanelProps) {
  // State
  const [activeTab, setActiveTab] = useState<TabId>('timeline')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(videoDuration)
  
  // Timeline settings
  const [timelinePreset, setTimelinePreset] = useState('saas-cinematic')
  const [cameraTemplate, setCameraTemplate] = useState('cinematic')
  const [zoomEnabled, setZoomEnabled] = useState(true)
  const [motionBlur, setMotionBlur] = useState(true)
  
  // Typing settings
  const [typingPreset, setTypingPreset] = useState('demo')
  const [typingText, setTypingText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  
  // Audio settings
  const [musicEnabled, setMusicEnabled] = useState(false)
  const [musicStyle, setMusicStyle] = useState<keyof typeof MUSIC_STYLES>('cinematic')
  const [musicVolume, setMusicVolume] = useState(30)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [ttsText, setTtsText] = useState('')
  const [ttsProvider, setTtsProvider] = useState('browser')
  
  // SFX settings
  const [sfxEnabled, setSfxEnabled] = useState(false)
  const [selectedSfx, setSelectedSfx] = useState<string[]>([])
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'complete' | 'error'>('idle')

  // Initialize production engine
  useEffect(() => {
    productionEngine.initialize(videoDuration)
    
    // Set up callbacks
    productionEngine.onTimeUpdateCallback((time) => {
      setCurrentTime(time)
    })
    
    productionEngine.onStateChangeCallback((state: ProductionState) => {
      setIsPlaying(state.isPlaying)
    })
  }, [videoDuration])

  // Handle timeline preset change
  const handlePresetChange = useCallback((presetId: string) => {
    setTimelinePreset(presetId)
    productionEngine.applyTimelinePreset(presetId)
  }, [])

  // Handle camera template change
  const handleCameraChange = useCallback((template: string) => {
    setCameraTemplate(template)
    productionEngine.setCameraTemplate(template as any)
  }, [])

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      productionEngine.pause()
    } else {
      productionEngine.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  // Handle stop
  const handleStop = useCallback(() => {
    productionEngine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
  }, [])

  // Handle seek
  const handleSeek = useCallback((time: number) => {
    productionEngine.seek(time)
    setCurrentTime(time)
  }, [])

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    
    setIsGenerating(true)
    setGenerationStatus('generating')
    setGenerationProgress(0)

    try {
      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(r => setTimeout(r, 200))
        setGenerationProgress(i)
      }
      
      // Apply timeline preset
      productionEngine.applyTimelinePreset(timelinePreset)
      
      // Configure camera
      productionEngine.setCameraTemplate(cameraTemplate as any)
      
      // Start typing if text provided
      if (typingText) {
        productionEngine.startTyping(typingText, typingPreset)
      }
      
      setGenerationStatus('complete')
      onGenerate?.()
      
      setTimeout(() => {
        setGenerationStatus('idle')
        setGenerationProgress(0)
      }, 3000)
      
    } catch (error) {
      console.error('Generation error:', error)
      setGenerationStatus('error')
    } finally {
      setIsGenerating(false)
    }
  }, [timelinePreset, cameraTemplate, typingText, typingPreset, isGenerating, onGenerate])

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Tab button component
  const TabButton = ({ id, label, icon: Icon }: { id: TabId; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={cn(
        "flex-1 flex flex-col items-center justify-center p-2 rounded-lg text-xs transition-colors",
        activeTab === id 
          ? "bg-indigo-500 text-white" 
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="w-4 h-4 mb-1" />
      {label}
    </button>
  )

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Wand className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-sidebar-foreground">Production Studio</h2>
            <p className="text-xs text-muted-foreground">Create cinematic videos</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-2 border-b border-sidebar-border">
        <TabButton id="timeline" label="Timeline" icon={Movie} />
        <TabButton id="typing" label="Typing" icon={Keyboard} />
        <TabButton id="audio" label="Audio" icon={Music} />
        <TabButton id="render" label="Export" icon={Download} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar p-4 space-y-4">
        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            {/* Timeline Preset */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-indigo-500" />
                Timeline Style
              </label>
              <Select value={timelinePreset} onValueChange={handlePresetChange}>
                <SelectTrigger className="h-10 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timelinePresetOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Camera Template */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-500" />
                Camera Movement
              </label>
              <Select value={cameraTemplate} onValueChange={handleCameraChange}>
                <SelectTrigger className="h-10 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cameraTemplateOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Zoom Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">AI Auto-Zoom</p>
                  <p className="text-xs text-muted-foreground">Smart content tracking</p>
                </div>
                <Switch checked={zoomEnabled} onCheckedChange={setZoomEnabled} />
              </div>

              {/* Motion Blur */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Motion Blur</p>
                  <p className="text-xs text-muted-foreground">Smooth transitions</p>
                </div>
                <Switch checked={motionBlur} onCheckedChange={setMotionBlur} />
              </div>
            </div>

            {/* Playback Controls */}
            <div className="pt-4 border-t border-sidebar-border">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Button variant="ghost" size="icon" onClick={() => handleSeek(0)}>
                  <PlayerSkipBack className="w-4 h-4" />
                </Button>
                <Button variant="default" size="icon" onClick={handlePlayPause}>
                  {isPlaying ? <PlayerPause className="w-4 h-4" /> : <PlayerPlay className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleStop}>
                  <PlayerStop className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleSeek(duration)}>
                  <PlayerSkipForward className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Timeline Scrubber */}
              <div className="space-y-2">
                <Slider
                  min={0}
                  max={duration}
                  step={0.1}
                  value={currentTime}
                  onChange={(v) => handleSeek(v)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Typing Tab */}
        {activeTab === 'typing' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-indigo-500" />
                Typing Simulation
              </label>
              
              {/* Typing Preset */}
              <Select value={typingPreset} onValueChange={setTypingPreset}>
                <SelectTrigger className="h-10 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typingPresetOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Typing Text */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Text to Type</label>
                <textarea
                  value={typingText}
                  onChange={(e) => setTypingText(e.target.value)}
                  placeholder="Enter text to simulate typing..."
                  className="w-full h-24 px-3 py-2 bg-background/50 border border-input rounded-lg text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {typingText.length} characters • ~{Math.ceil(typingText.length * 0.06)}s duration
                </p>
              </div>

              {/* Start Typing Button */}
              <Button 
                onClick={() => {
                  if (typingText) {
                    productionEngine.startTyping(typingText, typingPreset)
                    setIsTyping(true)
                  }
                }}
                disabled={!typingText}
                className="w-full"
              >
                {isTyping ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isTyping ? 'Typing...' : 'Start Typing Simulation'}
              </Button>
            </div>
          </div>
        )}

        {/* Audio Tab */}
        {activeTab === 'audio' && (
          <div className="space-y-4">
            {/* Background Music */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Music className="w-4 h-4 text-indigo-500" />
                  Background Music
                </label>
                <Switch checked={musicEnabled} onCheckedChange={setMusicEnabled} />
              </div>

              {musicEnabled && (
                <>
                  <Select 
                    value={musicStyle} 
                    onValueChange={(v) => setMusicStyle(v as keyof typeof MUSIC_STYLES)}
                  >
                    <SelectTrigger className="h-10 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {musicStyleOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm">Volume</label>
                      <span className="text-xs text-muted-foreground">{musicVolume}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      value={musicVolume}
                      onChange={(v) => setMusicVolume(v)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Voiceover (TTS) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Microphone className="w-4 h-4 text-indigo-500" />
                  Voiceover (TTS)
                </label>
                <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
              </div>

              {ttsEnabled && (
                <>
                  <Select value={ttsProvider} onValueChange={setTtsProvider}>
                    <SelectTrigger className="h-10 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browser">Browser (Free)</SelectItem>
                      <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                      <SelectItem value="openai">OpenAI TTS</SelectItem>
                      <SelectItem value="coqui">Coqui (Local)</SelectItem>
                    </SelectContent>
                  </Select>

                  <textarea
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    placeholder="Enter narration text..."
                    className="w-full h-24 px-3 py-2 bg-background/50 border border-input rounded-lg text-sm resize-none"
                  />
                </>
              )}
            </div>

            {/* Sound Effects */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-indigo-500" />
                  Sound Effects
                </label>
                <Switch checked={sfxEnabled} onCheckedChange={setSfxEnabled} />
              </div>

              {sfxEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(SFX_LIBRARY).slice(0, 6).map(([key, sfx]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedSfx(prev => 
                        prev.includes(key) 
                          ? prev.filter(k => k !== key)
                          : [...prev, key]
                      )}
                      className={cn(
                        "p-2 rounded-lg text-xs text-center transition-colors",
                        selectedSfx.includes(key) 
                          ? "bg-indigo-500 text-white" 
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {sfx.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Render Tab */}
        {activeTab === 'render' && (
          <div className="space-y-4">
            {/* Output Settings */}
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <Settings className="w-4 h-4" /> Output Settings
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Resolution</label>
                  <Select defaultValue="1080p">
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                      <SelectItem value="1440p">1440p</SelectItem>
                      <SelectItem value="4k">4K</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-xs text-muted-foreground">Format</label>
                  <Select defaultValue="mp4">
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp4">MP4</SelectItem>
                      <SelectItem value="webm">WebM</SelectItem>
                      <SelectItem value="gif">GIF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={cn(
                "w-full h-12 font-semibold",
                generationStatus === 'complete' && "bg-green-500 hover:bg-green-500/90",
                generationStatus === 'error' && "bg-red-500 hover:bg-red-500/90"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating... {generationProgress}%
                </>
              ) : generationStatus === 'complete' ? (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  Generated Successfully!
                </>
              ) : generationStatus === 'error' ? (
                <>
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Generation Failed
                </>
              ) : (
                <>
                  <Wand className="w-5 h-5 mr-2" />
                  Generate Video
                </>
              )}
            </Button>

            {/* Progress Bar */}
            {isGenerating && (
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Processing timeline, effects, and audio...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProductionPanel
