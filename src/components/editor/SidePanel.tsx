import { useEditorStore } from '../../store/editorStore'
import { RegionSettingsPanel } from './RegionSettingsPanel'
import { Microphone, DeviceComputerCamera, LayoutBoard, Route, Pointer, Star, Wand } from 'tabler-icons-react'
import { BackgroundSettings } from './sidepanel/BackgroundSettings'
import { FrameEffectsSettings } from './sidepanel/FrameEffectsSettings'
import { CameraSettings } from './sidepanel/CameraSettings'
import { CursorSettings } from './sidepanel/CursorSettings'
import { AnimationSettingsPanel } from './sidepanel/AnimationSettingsPanel'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo } from 'react'
import { cn } from '../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { AudioSettings } from './sidepanel/AudioSettings'
import { AIZoomSettingsPanel } from './sidepanel/AIZoomSettings'
import { ProductionPanel } from './sidepanel/ProductionPanel'
import type { ZoomRegion } from '../../types'

interface SidePanelProps {
  videoRef?: React.RefObject<HTMLVideoElement | null>
}

interface TabButtonProps {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
  disabled?: boolean
}

function TabButton({ label, icon, isActive, onClick, disabled }: TabButtonProps) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'w-full flex flex-col items-center justify-center p-1 rounded-lg transition-colors',
              'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-sidebar',
              isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
            )}
            aria-label={label}
            disabled={disabled}
          >
            <div className="w-6 h-6 flex items-center justify-center">{icon}</div>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          sideOffset={8}
          className="capitalize px-3 py-1.5 text-sm font-medium bg-popover text-popover-foreground shadow-md rounded-md border border-border/50 dark:bg-popover/95 dark:border-border/80 dark:text-foreground"
        >
          <p className="whitespace-nowrap">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function FrameSettingsPanel() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutBoard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">General Settings</h2>
            <p className="text-sm text-muted-foreground">Customize your video's appearance</p>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar">
        <div className="p-6 space-y-8">
          <BackgroundSettings />
          <FrameEffectsSettings />
        </div>
      </div>
    </div>
  )
}

export function SidePanel({ videoRef }: SidePanelProps) {
  // Get necessary states from the store
  const {
    selectedRegionId,
    zoomRegions,
    cutRegions,
    webcamVideoUrl,
    setSelectedRegionId,
    activeSidePanelTab,
    setActiveSidePanelTab,
    metadata,
    duration,
  } = useEditorStore(
    useShallow((state) => ({
      selectedRegionId: state.selectedRegionId,
      zoomRegions: state.zoomRegions,
      cutRegions: state.cutRegions,
      webcamVideoUrl: state.webcamVideoUrl,
      hasAudioTrack: state.hasAudioTrack,
      setSelectedRegionId: state.setSelectedRegionId,
      activeSidePanelTab: state.activeSidePanelTab,
      setActiveSidePanelTab: state.setActiveSidePanelTab,
      metadata: state.metadata,
      duration: state.duration,
    })),
  )

  // Get video element from ref
  const videoElement = videoRef?.current || null

  // Handle adding AI-generated zoom regions
  const handleRegionsGenerated = (regions: ZoomRegion[]) => {
    // Add each region to the timeline
    const { addZoomRegion, updateRegion } = useEditorStore.getState()
    
    // Clear existing AI regions first
    Object.keys(zoomRegions).forEach(id => {
      if (id.startsWith('ai-zoom-')) {
        useEditorStore.getState().deleteRegion(id)
      }
    })
    
    // Add new regions
    regions.forEach((region) => {
      addZoomRegion()
      // Get the last added region (should be the one we just added)
      const state = useEditorStore.getState()
      const regionIds = Object.keys(state.zoomRegions)
      if (regionIds.length > 0) {
        const lastId = regionIds[regionIds.length - 1]
        updateRegion(lastId, region)
      }
    })
  }

  // Optimize region lookup using useMemo
  const selectedRegion = useMemo(() => {
    if (!selectedRegionId) return null
    return zoomRegions[selectedRegionId] || cutRegions[selectedRegionId]
  }, [selectedRegionId, zoomRegions, cutRegions])

  // Auto switch to 'general' tab when a region is selected
  useEffect(() => {
    if (selectedRegion) {
      setActiveSidePanelTab('general')
    }
  }, [selectedRegion, setActiveSidePanelTab])

  // Handle Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedRegionId) {
        setSelectedRegionId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedRegionId, setSelectedRegionId])

  return (
    <div className="h-full flex">
      {/* Main content area */}
      <div className="flex-1 bg-sidebar overflow-hidden relative">
        {/* Render all panels but only show the active one.
            This prevents unmounting and preserves the internal state of components like Collapse. */}
        <div className="h-full" hidden={activeSidePanelTab !== 'general'}>
          {selectedRegion ? <RegionSettingsPanel region={selectedRegion} /> : <FrameSettingsPanel />}
        </div>
        <div className="h-full" hidden={activeSidePanelTab !== 'camera'}>
          <CameraSettings />
        </div>
        <div className="h-full" hidden={activeSidePanelTab !== 'audio'}>
          <AudioSettings />
        </div>
        <div className="h-full" hidden={activeSidePanelTab !== 'animation'}>
          <AnimationSettingsPanel />
        </div>
        <div className="h-full" hidden={activeSidePanelTab !== 'cursor'}>
          <CursorSettings />
        </div>
        {/* AI Zoom Panel - hidden by default */}
        <div className="h-full" hidden={activeSidePanelTab !== 'ai-zoom'}>
          <AIZoomSettingsPanel 
            videoElement={videoElement}
            duration={duration}
            metadata={metadata}
            onRegionsGenerated={handleRegionsGenerated}
          />
        </div>
        {/* Production Panel */}
        <div className="h-full" hidden={activeSidePanelTab !== 'production'}>
          <ProductionPanel 
            videoDuration={duration}
          />
        </div>
      </div>

      {/* Vertical Tab Navigator (Always visible) */}
      <div className="w-[64px] flex-shrink-0 p-3 border-l border-sidebar-border bg-sidebar/80">
        <div className="flex flex-col items-center space-y-2">
          <TabButton
            label="General"
            icon={<LayoutBoard className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'general'}
            onClick={() => setActiveSidePanelTab('general')}
          />
          <TabButton
            label="Camera"
            icon={<DeviceComputerCamera className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'camera'}
            onClick={() => setActiveSidePanelTab('camera')}
            disabled={!webcamVideoUrl}
          />
          <TabButton
            label="Audio"
            icon={<Microphone className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'audio'}
            onClick={() => setActiveSidePanelTab('audio')}
          />
          <TabButton
            label="Animation"
            icon={<Route className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'animation'}
            onClick={() => setActiveSidePanelTab('animation')}
          />
          <TabButton
            label="Cursor"
            icon={<Pointer className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'cursor'}
            onClick={() => setActiveSidePanelTab('cursor')}
          />
          {/* AI Zoom Tab */}
          <TabButton
            label="AI Zoom"
            icon={<Star className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'ai-zoom'}
            onClick={() => setActiveSidePanelTab('ai-zoom')}
          />
          {/* Production Tab */}
          <TabButton
            label="Production"
            icon={<Wand className="w-5 h-5" />}
            isActive={activeSidePanelTab === 'production'}
            onClick={() => setActiveSidePanelTab('production')}
          />
        </div>
      </div>
    </div>
  )
}
