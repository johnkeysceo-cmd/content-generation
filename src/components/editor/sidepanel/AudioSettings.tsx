import { useEditorStore } from '../../../store/editorStore'
import { useShallow } from 'zustand/react/shallow'
import {
  Microphone,
  Volume,
  Volume2 as MinVolume,
  Volume as MaxVolume,
  Volume3 as MuteVolume,
  Music,
  BrandSpotify,
  Cut,
  Loader2,
} from 'tabler-icons-react'
import { Collapse } from '../../ui/collapse'
import { Slider } from '../../ui/slider'
import { Button } from '../../ui/button'
import { cn } from '../../../lib/utils'
import { DEFAULTS } from '../../../lib/constants'
import { analyzeAudio, loadAudioFromFile } from '../../../lib/audio-utils'
import { useCallback } from 'react'

export function AudioSettings() {
  const {
    volume,
    isMuted,
    setVolume,
    toggleMute,
    hasAudioTrack,
    setIsMuted,
    beatAnalysisResult,
    isAnalyzingAudio,
    beatMatchingSettings,
    setBeatAnalysisResult,
    setIsAnalyzingAudio,
    setBeatMatchingEnabled,
    updateBeatMatchingSettings,
    applyBeatMatchingToTimeline,
    addCutRegion,
    duration,
  } = useEditorStore(
    useShallow((state) => ({
      volume: state.volume,
      isMuted: state.isMuted,
      setVolume: state.setVolume,
      toggleMute: state.toggleMute,
      hasAudioTrack: state.hasAudioTrack,
      setIsMuted: state.setIsMuted,
      beatAnalysisResult: state.beatAnalysisResult,
      isAnalyzingAudio: state.isAnalyzingAudio,
      beatMatchingEnabled: state.beatMatchingEnabled,
      beatMatchingSettings: state.beatMatchingSettings,
      setBeatAnalysisResult: state.setBeatAnalysisResult,
      setIsAnalyzingAudio: state.setIsAnalyzingAudio,
      setBeatMatchingEnabled: state.setBeatMatchingEnabled,
      updateBeatMatchingSettings: state.updateBeatMatchingSettings,
      applyBeatMatchingToTimeline: state.applyBeatMatchingToTimeline,
      addCutRegion: state.addCutRegion,
      duration: state.duration,
    })),
  )

  const VolumeIcon = isMuted || volume === 0 ? MuteVolume : volume < 0.5 ? MinVolume : MaxVolume

  const handleResetVolume = () => {
    setVolume(DEFAULTS.AUDIO.VOLUME.defaultValue)
    setIsMuted(DEFAULTS.AUDIO.MUTED.defaultValue)
  }

  // Handle analyzing audio from a file
  const handleAnalyzeAudio = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsAnalyzingAudio(true)
    try {
      const audioBuffer = await loadAudioFromFile(file)
      const result = await analyzeAudio(audioBuffer)
      setBeatAnalysisResult(result)
    } catch (error) {
      console.error('Failed to analyze audio:', error)
    } finally {
      setIsAnalyzingAudio(false)
    }
  }, [setIsAnalyzingAudio, setBeatAnalysisResult])

  // Handle applying beat matching to timeline
  const handleApplyBeatMatching = useCallback(() => {
    applyBeatMatchingToTimeline(addCutRegion, duration)
    setBeatMatchingEnabled(true)
  }, [applyBeatMatchingToTimeline, addCutRegion, duration, setBeatMatchingEnabled])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Microphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">Audio Settings</h2>
            <p className="text-sm text-muted-foreground">Adjust volume and effects</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar">
        <div className="p-6 space-y-6">
          {/* Master Volume - only show when video has audio */}
          {hasAudioTrack && (
            <Collapse
              title="Master Volume"
              description="Control the overall volume of the video"
              icon={<Volume className="w-4 h-4 text-primary" />}
              defaultOpen={true}
              onReset={handleResetVolume}
            >
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleMute}
                    className="flex-shrink-0 h-10 w-10"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    <VolumeIcon className="w-5 h-5" />
                  </Button>
                  <div className="flex-1">
                    <Slider
                      min={DEFAULTS.AUDIO.VOLUME.min}
                      max={DEFAULTS.AUDIO.VOLUME.max}
                      step={DEFAULTS.AUDIO.VOLUME.step}
                      value={isMuted ? 0 : volume}
                      onChange={(value) => setVolume(value)}
                      disabled={isMuted}
                    />
                  </div>
                  <span className="text-xs font-semibold text-primary tabular-nums w-10 text-right">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
                <Button
                  onClick={() => setVolume(1)}
                  disabled={isMuted}
                  className={cn(
                    'w-full h-11 font-semibold transition-all duration-300',
                    'bg-primary hover:bg-primary/90 text-primary-foreground',
                  )}
                >
                  <MaxVolume className="w-4 h-4 mr-2" />
                  Set to Max Volume
                </Button>
              </div>
            </Collapse>
          )}

          {/* Beat Matching Section - always available */}
          <Collapse
            title="Beat Matching"
            description="Auto-sync cuts to music beats"
            icon={<Music className="w-4 h-4 text-primary" />}
            defaultOpen={true}
          >
            <div className="space-y-4 pt-2">
              {/* Upload audio file */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Upload Audio File</label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAnalyzeAudio}
                  disabled={isAnalyzingAudio}
                  className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
              </div>

              {isAnalyzingAudio && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Analyzing audio...</span>
                </div>
              )}

              {beatAnalysisResult && !isAnalyzingAudio && (
                <>
                  {/* Show analysis results */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BrandSpotify className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Detected BPM</span>
                      </div>
                      <span className="text-lg font-bold text-primary">{beatAnalysisResult.bpm}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Detected Beats</span>
                      <span className="text-sm font-medium">{beatAnalysisResult.beats.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Duration</span>
                      <span className="text-sm font-medium">{beatAnalysisResult.duration.toFixed(1)}s</span>
                    </div>
                  </div>

                  {/* Beat matching settings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Cut Duration</span>
                      <div className="w-24">
                        <Slider
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={beatMatchingSettings?.cutDuration || 0.3}
                          onChange={(value) => updateBeatMatchingSettings({ cutDuration: value })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Min Interval</span>
                      <div className="w-24">
                        <Slider
                          min={0.2}
                          max={2.0}
                          step={0.1}
                          value={beatMatchingSettings?.minInterval || 0.5}
                          onChange={(value) => updateBeatMatchingSettings({ minInterval: value })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Beat Threshold</span>
                      <div className="w-24">
                        <Slider
                          min={0.1}
                          max={0.8}
                          step={0.05}
                          value={beatMatchingSettings?.beatStrengthThreshold || 0.3}
                          onChange={(value) => updateBeatMatchingSettings({ beatStrengthThreshold: value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Apply button */}
                  <Button
                    onClick={handleApplyBeatMatching}
                    className={cn(
                      'w-full h-11 font-semibold transition-all duration-300',
                      'bg-primary hover:bg-primary/90 text-primary-foreground',
                    )}
                  >
                    <Cut className="w-4 h-4 mr-2" />
                    Apply Beat Cuts
                  </Button>
                </>
              )}
            </div>
          </Collapse>
        </div>
      </div>
    </div>
  )
}
