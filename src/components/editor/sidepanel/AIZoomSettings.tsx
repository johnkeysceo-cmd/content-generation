/**
 * AI Zoom Settings Panel
 * 
 * UI component for configuring AI-powered auto-zoom features.
 */

import { useState, useCallback } from 'react'
import { 
  Wand, 
  Star, 
  Video, 
  Pointer, 
  ZoomIn,
  Loader2,
  Check,
  AlertCircle,
  CircleCheck
} from 'tabler-icons-react'
import { cn } from '../../../lib/utils'
import { Button } from '../../ui/button'
import { Collapse } from '../../ui/collapse'
import { Switch } from '../../ui/switch'
import { Slider } from '../../ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { 
  aiAutoZoom, 
  CAMERA_TEMPLATES,
  type CameraTemplate
} from '../../../lib/ai-auto-zoom'

// Template options for the select dropdown
const templateOptions = [
  { value: 'cinematic', label: 'Cinematic', description: 'Smooth, elegant movements' },
  { value: 'documentary', label: 'Documentary', description: 'Natural, observational' },
  { value: 'tech-demo', label: 'Tech Demo', description: 'Sharp, precise' },
  { value: 'minimal', label: 'Minimal', description: 'Subtle, content-focused' },
  { value: 'dynamic', label: 'Dynamic', description: 'Energetic, dramatic' },
]

interface AIZoomSettingsPanelProps {
  videoElement?: HTMLVideoElement | null
  duration?: number
  metadata?: { timestamp: number; x: number; y: number; type: string }[]
  onRegionsGenerated?: (regions: any[]) => void
}

export function AIZoomSettingsPanel({ 
  videoElement, 
  duration = 0, 
  metadata = [],
  onRegionsGenerated 
}: AIZoomSettingsPanelProps) {
  // Local state
  const [enabled, setEnabled] = useState(false)
  const [template, setTemplate] = useState<CameraTemplate>('cinematic')
  const [sensitivity, setSensitivity] = useState(0.5)
  const [minZoom, setMinZoom] = useState(1.2)
  const [maxZoom, setMaxZoom] = useState(2.5)
  const [smartFocus, setSmartFocus] = useState(true)
  const [layoutAware, setLayoutAware] = useState(true)
  const [microMovements, setMicroMovements] = useState(true)
  const [lookahead, setLookahead] = useState(0.5)
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'complete' | 'error'>('idle')
  const [generatedRegions, setGeneratedRegions] = useState(0)

  // Update AI controller settings
  const updateSettings = useCallback(() => {
    aiAutoZoom.updateSettings({
      enabled,
      template,
      sensitivity,
      minZoom,
      maxZoom,
      smartFocus,
      layoutAware,
      microMovements,
      lookahead,
    })
  }, [enabled, template, sensitivity, minZoom, maxZoom, smartFocus, layoutAware, microMovements, lookahead])

  // Handle generating zoom regions
  const handleGenerateRegions = async () => {
    if (!videoElement || duration === 0) {
      setGenerationStatus('error')
      return
    }

    setIsGenerating(true)
    setGenerationStatus('generating')

    try {
      // Update settings first
      updateSettings()

      // Generate zoom regions
      const regions = await aiAutoZoom.generateZoomRegions(
        videoElement,
        duration,
        metadata as any
      )

      setGeneratedRegions(regions.length)
      setGenerationStatus('complete')
      
      // Callback with generated regions
      if (onRegionsGenerated) {
        onRegionsGenerated(regions)
      }

      // Reset status after delay
      setTimeout(() => {
        setGenerationStatus('idle')
      }, 3000)

    } catch (error) {
      console.error('Failed to generate AI zoom regions:', error)
      setGenerationStatus('error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Reset all settings
  const handleReset = () => {
    setEnabled(false)
    setTemplate('cinematic')
    setSensitivity(0.5)
    setMinZoom(1.2)
    setMaxZoom(2.5)
    setSmartFocus(true)
    setLayoutAware(true)
    setMicroMovements(true)
    setLookahead(0.5)
    aiAutoZoom.reset()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Wand className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">AI Auto-Zoom</h2>
            <p className="text-sm text-muted-foreground">Intelligent camera movements</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar p-6 space-y-6">
        
        {/* Enable/Disable Toggle */}
        <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-sidebar-foreground">AI-Powered Zoom</p>
                <p className="text-xs text-muted-foreground">
                  Automatically create cinematic camera movements
                </p>
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        {enabled && (
          <>
            {/* Template Selection */}
            <Collapse
              title="Camera Style"
              description="Choose how the camera moves"
              icon={<Video className="w-4 h-4 text-purple-500" />}
              defaultOpen={true}
            >
              <div className="space-y-4 pt-2">
                <Select value={template} onValueChange={(v) => setTemplate(v as CameraTemplate)}>
                  <SelectTrigger className="h-11 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Template Preview Description */}
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {CAMERA_TEMPLATES[template].description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CAMERA_TEMPLATES[template].enableRotation && (
                      <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-500 rounded">
                        Rotation
                      </span>
                    )}
                    {CAMERA_TEMPLATES[template].enableMicroMovements && (
                      <span className="px-2 py-0.5 text-xs bg-pink-500/20 text-pink-500 rounded">
                        Micro-movements
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-500 rounded">
                      {CAMERA_TEMPLATES[template].baseZoom}x base zoom
                    </span>
                  </div>
                </div>
              </div>
            </Collapse>

            {/* Smart Focus Settings */}
            <Collapse
              title="Smart Focus"
              description="AI-powered focus point selection"
              icon={<Pointer className="w-4 h-4 text-purple-500" />}
              defaultOpen={true}
            >
              <div className="space-y-4 pt-2">
                {/* Smart Focus Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-sidebar-foreground">Content-Aware Focus</p>
                    <p className="text-xs text-muted-foreground">
                      Detect UI elements and focus intelligently
                    </p>
                  </div>
                  <Switch
                    checked={smartFocus}
                    onCheckedChange={setSmartFocus}
                  />
                </div>

                {/* Layout Aware */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-sidebar-foreground">Layout Detection</p>
                    <p className="text-xs text-muted-foreground">
                      Adapt to screen layout (sidebar, split, etc.)
                    </p>
                  </div>
                  <Switch
                    checked={layoutAware}
                    onCheckedChange={setLayoutAware}
                  />
                </div>

                {/* Sensitivity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-sidebar-foreground">Sensitivity</label>
                    <span className="text-xs font-semibold text-purple-500">{(sensitivity * 100).toFixed(0)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={sensitivity}
                    onChange={(v) => setSensitivity(v)}
                  />
                  <p className="text-xs text-muted-foreground">
                    How responsive the camera is to content changes
                  </p>
                </div>
              </div>
            </Collapse>

            {/* Zoom Range */}
            <Collapse
              title="Zoom Range"
              description="Configure zoom boundaries"
              icon={<ZoomIn className="w-4 h-4 text-purple-500" />}
              defaultOpen={true}
            >
              <div className="space-y-4 pt-2">
                {/* Min Zoom */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-sidebar-foreground">Minimum Zoom</label>
                    <span className="text-xs font-semibold text-purple-500">{minZoom.toFixed(1)}x</span>
                  </div>
                  <Slider
                    min={1}
                    max={2}
                    step={0.1}
                    value={minZoom}
                    onChange={(v) => setMinZoom(v)}
                  />
                </div>

                {/* Max Zoom */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-sidebar-foreground">Maximum Zoom</label>
                    <span className="text-xs font-semibold text-purple-500">{maxZoom.toFixed(1)}x</span>
                  </div>
                  <Slider
                    min={1.5}
                    max={4}
                    step={0.1}
                    value={maxZoom}
                    onChange={(v) => setMaxZoom(v)}
                  />
                </div>

                {/* Micro Movements */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-sidebar-foreground">Micro-Movements</p>
                    <p className="text-xs text-muted-foreground">
                      Subtle camera sway for natural feel
                    </p>
                  </div>
                  <Switch
                    checked={microMovements}
                    onCheckedChange={setMicroMovements}
                  />
                </div>

                {/* Lookahead */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-sidebar-foreground">Predictive Lookahead</label>
                    <span className="text-xs font-semibold text-purple-500">{lookahead.toFixed(1)}s</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={lookahead}
                    onChange={(v) => setLookahead(v)}
                  />
                  <p className="text-xs text-muted-foreground">
                    How far ahead the camera predicts movement
                  </p>
                </div>
              </div>
            </Collapse>

            {/* Generate Button */}
            <div className="space-y-3 pt-4 border-t border-sidebar-border">
              <Button
                onClick={handleGenerateRegions}
                disabled={isGenerating || !videoElement || duration === 0}
                className={cn(
                  'w-full h-12 font-semibold transition-all duration-300',
                  generationStatus === 'complete' && 'bg-green-500 hover:bg-green-500/90',
                  generationStatus === 'error' && 'bg-red-500 hover:bg-red-500/90',
                  !enabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Analyzing Content...
                  </>
                ) : generationStatus === 'complete' ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Generated {generatedRegions} Regions!
                  </>
                ) : generationStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-5 h-5 mr-2" />
                    Generation Failed
                  </>
                ) : (
                  <>
                    <Wand className="w-5 h-5 mr-2" />
                    Generate AI Zoom Regions
                  </>
                )}
              </Button>

              {!videoElement && enabled && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <CircleCheck className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-500">
                    Load a video to generate AI-powered zoom regions
                  </p>
                </div>
              )}
            </div>

            {/* Reset Button */}
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={handleReset}
                className="w-full"
              >
                Reset to Defaults
              </Button>
            </div>
          </>
        )}

        {!enabled && (
          <div className="p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              Enable AI Auto-Zoom to access advanced camera controls and generate intelligent zoom regions automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIZoomSettingsPanel
