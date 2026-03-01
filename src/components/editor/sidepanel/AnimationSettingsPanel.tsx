import { useState } from 'react'
import { useEditorStore } from '../../../store/editorStore'
import { Route, Wand, Check, Blur } from 'tabler-icons-react'
import { ZOOM, DEFAULTS } from '../../../lib/constants'
import { EASING_MAP } from '../../../lib/easing'
import { cn } from '../../../lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { Slider } from '../../ui/slider'
import { Button } from '../../ui/button'
import { Collapse } from '../../ui/collapse'
import { Switch } from '../../ui/switch'

const speedOptions = Object.keys(ZOOM.SPEED_OPTIONS)
const easingOptions = Object.keys(EASING_MAP)

export function AnimationSettingsPanel() {
  const { applyAnimationSettingsToAll, zoomRegions, updateRegion } = useEditorStore.getState()

  // Local state
  const [speed, setSpeed] = useState(DEFAULTS.ANIMATION.SPEED.defaultValue)
  const [easing, setEasing] = useState(DEFAULTS.ANIMATION.EASING.defaultValue)
  const [zoomLevel, setZoomLevel] = useState(DEFAULTS.ANIMATION.ZOOM_LEVEL.defaultValue)
  const [blurEnabled, setBlurEnabled] = useState(DEFAULTS.ANIMATION.ZOOM_BLUR.ENABLED.defaultValue)
  const [blurAmount, setBlurAmount] = useState(DEFAULTS.ANIMATION.ZOOM_BLUR.AMOUNT.defaultValue)
  const [applyStatus, setApplyStatus] = useState<'idle' | 'applied'>('idle')

  const handleApplyToAll = () => {
    if (applyStatus !== 'idle') return

    const transitionDuration = ZOOM.SPEED_OPTIONS[speed as keyof typeof ZOOM.SPEED_OPTIONS]
    applyAnimationSettingsToAll({ transitionDuration, easing, zoomLevel })

    // Also apply blur settings to all zoom regions
    Object.keys(zoomRegions).forEach((id) => {
      updateRegion(id, { blurEnabled, blurAmount })
    })

    setApplyStatus('applied')
    setTimeout(() => setApplyStatus('idle'), 2000)
  }

  const handleResetAnimation = () => {
    setSpeed(DEFAULTS.ANIMATION.SPEED.defaultValue)
    setEasing(DEFAULTS.ANIMATION.EASING.defaultValue)
    setZoomLevel(DEFAULTS.ANIMATION.ZOOM_LEVEL.defaultValue)
    setBlurEnabled(DEFAULTS.ANIMATION.ZOOM_BLUR.ENABLED.defaultValue)
    setBlurAmount(DEFAULTS.ANIMATION.ZOOM_BLUR.AMOUNT.defaultValue)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Route className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">Global Animation</h2>
            <p className="text-sm text-muted-foreground">Set default animation for all zoom regions</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar p-6 space-y-6">
        {/* Animation Settings Collapse */}
        <Collapse
          title="Animation Settings"
          description="These settings will be applied to all zoom regions."
          icon={<Route />}
          defaultOpen={true}
          onReset={handleResetAnimation}
        >
          <div className="space-y-6 pt-2">
            {/* Speed Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">Speed</label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-muted/50 rounded-lg">
                {speedOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      'py-2 text-sm font-medium rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      speed === s
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Easing Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">Style (Easing)</label>
              <Select value={easing} onValueChange={setEasing}>
                <SelectTrigger className="h-10 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {easingOptions.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Zoom Level */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-sidebar-foreground">Zoom Level</label>
                <span className="text-xs font-semibold text-primary tabular-nums">{zoomLevel.toFixed(1)}x</span>
              </div>
              <Slider
                min={DEFAULTS.ANIMATION.ZOOM_LEVEL.min}
                max={DEFAULTS.ANIMATION.ZOOM_LEVEL.max}
                step={DEFAULTS.ANIMATION.ZOOM_LEVEL.step}
                value={zoomLevel}
                onChange={setZoomLevel}
              />
            </div>

            {/* NEW: Zoom Blur Effect */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Blur className="w-4 h-4 text-primary" />
                  <label className="text-sm font-medium text-sidebar-foreground">Zoom Blur</label>
                </div>
                <Switch
                  checked={blurEnabled}
                  onCheckedChange={setBlurEnabled}
                />
              </div>
              {blurEnabled && (
                <div className="pl-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Blur Amount</span>
                    <span className="text-xs font-semibold text-primary tabular-nums">{blurAmount.toFixed(1)}px</span>
                  </div>
                  <Slider
                    min={DEFAULTS.ANIMATION.ZOOM_BLUR.AMOUNT.min}
                    max={DEFAULTS.ANIMATION.ZOOM_BLUR.AMOUNT.max}
                    step={DEFAULTS.ANIMATION.ZOOM_BLUR.AMOUNT.step}
                    value={blurAmount}
                    onChange={setBlurAmount}
                  />
                  <p className="text-xs text-muted-foreground">
                    Adds subtle blur during zoom transitions for a smoother effect.
                  </p>
                </div>
              )}
            </div>

            {/* Apply Collapse */}
            <div className="space-y-3">
              <Button
                onClick={handleApplyToAll}
                disabled={applyStatus !== 'idle'}
                className={cn(
                  'w-full h-11 font-semibold transition-all duration-300',
                  applyStatus === 'applied' && 'bg-green-500 hover:bg-green-500/90',
                )}
              >
                {applyStatus === 'idle' ? (
                  <>
                    <Wand className="w-4 h-4 mr-2" />
                    Apply to All Zoom Regions
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Applied!
                  </>
                )}
              </Button>
            </div>
          </div>
        </Collapse>
      </div>
    </div>
  )
}
