import type { UIState, UIActions, Slice, CursorStyles, SidePanelTab } from '../../types'
import { DEFAULTS } from '../../lib/constants'

const initialCursorStyles: CursorStyles = {
  showCursor: DEFAULTS.CURSOR.SHOW_CURSOR.defaultValue,
  shadowBlur: DEFAULTS.CURSOR.SHADOW.BLUR.defaultValue,
  shadowOffsetX: DEFAULTS.CURSOR.SHADOW.OFFSET_X.defaultValue,
  shadowOffsetY: DEFAULTS.CURSOR.SHADOW.OFFSET_Y.defaultValue,
  shadowColor: DEFAULTS.CURSOR.SHADOW.DEFAULT_COLOR_RGBA,
  clickRippleEffect: DEFAULTS.CURSOR.CLICK_RIPPLE.ENABLED.defaultValue,
  clickRippleColor: DEFAULTS.CURSOR.CLICK_RIPPLE.COLOR.defaultValue,
  clickRippleSize: DEFAULTS.CURSOR.CLICK_RIPPLE.SIZE.defaultValue,
  clickRippleDuration: DEFAULTS.CURSOR.CLICK_RIPPLE.DURATION.defaultValue,
  clickScaleEffect: DEFAULTS.CURSOR.CLICK_SCALE.ENABLED.defaultValue,
  clickScaleAmount: DEFAULTS.CURSOR.CLICK_SCALE.AMOUNT.defaultValue,
  clickScaleDuration: DEFAULTS.CURSOR.CLICK_SCALE.DURATION.defaultValue,
  clickScaleEasing: DEFAULTS.CURSOR.CLICK_SCALE.EASING.defaultValue,
  // ENHANCED: Cursor FX - Glow Effect (now enabled by default)
  cursorGlowEffect: DEFAULTS.CURSOR.CURSOR_GLOW.ENABLED.defaultValue,
  cursorGlowColor: DEFAULTS.CURSOR.CURSOR_GLOW.COLOR.defaultValue,
  cursorGlowSize: DEFAULTS.CURSOR.CURSOR_GLOW.SIZE.defaultValue,
  cursorGlowIntensity: DEFAULTS.CURSOR.CURSOR_GLOW.INTENSITY.defaultValue,
  // ENHANCED: Cursor FX - Motion Trail (now enabled by default)
  cursorMotionTrail: DEFAULTS.CURSOR.MOTION_TRAIL.ENABLED.defaultValue,
  motionTrailLength: DEFAULTS.CURSOR.MOTION_TRAIL.LENGTH.defaultValue,
  motionTrailOpacity: DEFAULTS.CURSOR.MOTION_TRAIL.OPACITY.defaultValue,
  // ENHANCED: Cursor FX - Motion Blur (now enabled by default)
  cursorMotionBlur: DEFAULTS.CURSOR.MOTION_BLUR.ENABLED.defaultValue,
  motionBlurIntensity: DEFAULTS.CURSOR.MOTION_BLUR.INTENSITY.defaultValue,
  motionBlurThreshold: DEFAULTS.CURSOR.MOTION_BLUR.THRESHOLD.defaultValue,
  // NEW: Automatic Swoosh FX
  swooshEffect: DEFAULTS.CURSOR.SWOOSH_EFFECT.ENABLED.defaultValue,
  swooshIntensity: DEFAULTS.CURSOR.SWOOSH_EFFECT.INTENSITY.defaultValue,
  swooshThreshold: DEFAULTS.CURSOR.SWOOSH_EFFECT.THRESHOLD.defaultValue,
  // NEW: Speed Lines FX
  speedLines: DEFAULTS.CURSOR.SPEED_LINES.ENABLED.defaultValue,
  speedLinesIntensity: DEFAULTS.CURSOR.SPEED_LINES.INTENSITY.defaultValue,
  speedLinesThreshold: DEFAULTS.CURSOR.SPEED_LINES.THRESHOLD.defaultValue,
  // NEW: Click Explosion FX
  clickExplosion: DEFAULTS.CURSOR.CLICK_EXPLOSION.ENABLED.defaultValue,
  clickExplosionIntensity: DEFAULTS.CURSOR.CLICK_EXPLOSION.INTENSITY.defaultValue,
  clickExplosionParticles: DEFAULTS.CURSOR.CLICK_EXPLOSION.PARTICLES.defaultValue,
}

export const initialUIState: UIState = {
  mode: 'light',
  isPreviewFullScreen: false,
  cursorThemeName: 'default',
  cursorStyles: initialCursorStyles,
  activeSidePanelTab: 'general',
}

const updateWindowsTitleBar = (mode: 'light' | 'dark', platform: NodeJS.Platform | null) => {
  if (platform !== 'win32') return

  const options =
    mode === 'dark'
      ? { color: '#1D2025', symbolColor: '#EEEEEE' } // Matches dark card/sidebar
      : { color: '#F9FAFB', symbolColor: '#333333' } // Matches light card/sidebar
  window.electronAPI.updateTitleBarOverlay(options)
}

export const createUISlice: Slice<UIState, UIActions> = (set, get) => ({
  ...initialUIState,
  toggleMode: () => {
    const newMode = get().mode === 'dark' ? 'light' : 'dark'
    set((state) => {
      state.mode = newMode
    })
    window.electronAPI.setSetting('appearance.mode', newMode)
    updateWindowsTitleBar(newMode, get().platform)
  },
  initializeSettings: async () => {
    try {
      const appearance = await window.electronAPI.getSetting<{
        mode: 'light' | 'dark'
        cursorThemeName: string
        cursorStyles: Partial<CursorStyles>
      }>('appearance')

      let finalMode: 'light' | 'dark' = 'light'

      if (appearance?.mode) {
        finalMode = appearance.mode
        set((state) => {
          state.mode = appearance.mode
        })
      }
      if (appearance?.cursorThemeName) {
        set((state) => {
          state.cursorThemeName = appearance.cursorThemeName
        })
      }
      if (appearance?.cursorStyles) {
        set((state) => {
          state.cursorStyles = { ...initialCursorStyles, ...appearance.cursorStyles }
        })
      }
      updateWindowsTitleBar(finalMode, get().platform)
    } catch (error) {
      console.error('Could not load app settings:', error)
    }
  },
  togglePreviewFullScreen: () =>
    set((state) => {
      state.isPreviewFullScreen = !state.isPreviewFullScreen
    }),
  setCursorThemeName: (themeName: string) => {
    set((state) => {
      state.cursorThemeName = themeName
    })
    window.electronAPI.setSetting('appearance.cursorThemeName', themeName)
  },
  updateCursorStyle: (style: Partial<CursorStyles>) => {
    set((state) => {
      Object.assign(state.cursorStyles, style)
    })
    window.electronAPI.setSetting('appearance.cursorStyles', get().cursorStyles)
  },
  setActiveSidePanelTab: (tab: SidePanelTab) => {
    set((state) => {
      state.activeSidePanelTab = tab
    })
  },
})
