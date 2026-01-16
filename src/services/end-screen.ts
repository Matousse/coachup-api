/**
 * End Screen Generation Service - FFMPEG
 *
 * Creates an animated end screen for coach videos:
 * - Background: Coach gym photo (9:16 vertical)
 * - Overlay: Large semi-transparent rectangle (85% x 85%, centered)
 * - Button: PNG image with smooth pulsing fade effect
 * - Duration: 5 seconds
 *
 * === FFMPEG Pulsing Fade Effect ===
 *
 * For smooth fade in/out (pulsation), we use the colorchannelmixer filter
 * to modulate the alpha channel over time:
 *
 *   colorchannelmixer=aa='abs(sin(t*PI*2))'
 *
 * How it works:
 * - `t` = current time in seconds
 * - `sin(t*PI*2)` = sine wave completing one cycle per second
 * - `abs()` = makes it always positive (0→1→0→1...)
 *
 * Result: Smooth pulsing effect where opacity goes 0%→100%→0% every second
 *
 * Variations:
 * - Faster pulse: `abs(sin(t*PI*4))` (2 cycles per second)
 * - Slower pulse: `abs(sin(t*PI))` (0.5 cycles per second)
 * - Always visible with pulse: `0.5+0.5*sin(t*PI*2)` (50%→100%→50%)
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

// Storage paths
const STORAGE_BASE = path.join(__dirname, '../../storage')
const TEMP_DIR = path.join(STORAGE_BASE, 'temp')
const OUTPUT_DIR = path.join(STORAGE_BASE, 'videos')

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// Video dimensions (9:16 vertical for Instagram/TikTok)
const VIDEO_WIDTH = 1080
const VIDEO_HEIGHT = 1920

// Title bar settings (top rectangle)
const TITLE_BAR_HEIGHT = 280 // Taller for two lines
const TITLE_BAR_COLOR = '555555'
const TITLE_BAR_OPACITY = 0.75

// Button settings
const BUTTON_IMAGE = path.join(STORAGE_BASE, 'button.png')
const BUTTON_SCALE = 2.0 // 2x bigger
const PULSE_SPEED = 0.83 // ~3x slower (was 2.5)

// Animation settings
const END_SCREEN_DURATION = 5 // seconds

// Font settings - Noto Sans Bold (modern, clean)
const FONT_PATH = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'

export interface EndScreenParams {
  backgroundImagePath: string
  buttonImagePath?: string // Optional custom button, defaults to storage/button.png
  firstName?: string // e.g., "Darren"
  role?: string // e.g., "Coach Sportif à Strasbourg"
  outputPath?: string
}

export interface EndScreenResult {
  success: boolean
  videoPath?: string
  error?: string
}

export interface ConcatResult {
  success: boolean
  finalVideoPath?: string
  error?: string
}

/**
 * Generate the end screen video with pulsing button overlay
 *
 * Design:
 * - Background image scaled to 1080x1920
 * - Large gray rectangle overlay (85% x 85%, centered)
 * - Button PNG centered with smooth pulsing fade effect
 */
export async function generateEndScreen(params: EndScreenParams): Promise<EndScreenResult> {
  const { backgroundImagePath } = params
  const buttonPath = params.buttonImagePath || BUTTON_IMAGE
  const outputPath = params.outputPath || path.join(TEMP_DIR, `end_screen_${Date.now()}.mp4`)
  const firstName = params.firstName || 'Darren'
  const role = params.role || 'Coach Sportif à Strasbourg'

  console.log('[EndScreen] Generating end screen with pulsing button...')
  console.log('[EndScreen] Background:', backgroundImagePath)
  console.log('[EndScreen] Button:', buttonPath)
  console.log('[EndScreen] First name:', firstName)
  console.log('[EndScreen] Role:', role)

  if (!fs.existsSync(backgroundImagePath)) {
    return { success: false, error: `Background image not found: ${backgroundImagePath}` }
  }

  if (!fs.existsSync(buttonPath)) {
    return { success: false, error: `Button image not found: ${buttonPath}` }
  }

  // Title bar at top (full width, fixed height)
  const titleBarY = 80 // Small margin from top
  const titleBarWidth = VIDEO_WIDTH - 100 // 50px margin each side
  const titleBarX = 50

  // Text positions (two lines inside title bar)
  const firstNameY = titleBarY + 70 // First line - name
  const roleY = titleBarY + 170 // Second line - role

  // Button position - moved up by 15% (from 0.65 to 0.50)
  const buttonY = Math.floor(VIDEO_HEIGHT * 0.50)

  // Pulse expression using geq filter for time-based alpha modulation
  // geq supports time variable 'T' (timestamp in seconds)
  // Slower pulse (0.83 cycles/sec = ~3x slower than before)
  const pulseExpr = `alpha(X,Y)*(0.3+0.7*abs(sin(T*PI*${PULSE_SPEED})))`

  // Escape special characters for FFMPEG drawtext
  const escapedFirstName = firstName.replace(/'/g, "'\\''").replace(/:/g, '\\:')
  const escapedRole = role.replace(/'/g, "'\\''").replace(/:/g, '\\:')

  // Build the complex FFMPEG filter
  const filterComplex = [
    // Input 0: Background image - scale and crop to exact dimensions
    `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1[bg]`,

    // Draw title bar (gray rectangle at top)
    `[bg]drawbox=x=${titleBarX}:y=${titleBarY}:w=${titleBarWidth}:h=${TITLE_BAR_HEIGHT}:color=${TITLE_BAR_COLOR}@${TITLE_BAR_OPACITY}:t=fill[titlebar]`,

    // Draw first name (large, white, centered, first line)
    `[titlebar]drawtext=fontfile='${FONT_PATH}':text='${escapedFirstName}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=${firstNameY}[withname]`,

    // Draw role (smaller, white, centered, second line)
    `[withname]drawtext=fontfile='${FONT_PATH}':text='${escapedRole}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${roleY}[withrole]`,

    // Input 1: Button image - scale 2x bigger, ensure RGBA format, apply pulsing alpha
    `[1:v]scale=iw*${BUTTON_SCALE}:ih*${BUTTON_SCALE},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${pulseExpr}'[btn_pulse]`,

    // Overlay the pulsing button centered horizontally, positioned higher
    `[withrole][btn_pulse]overlay=(W-w)/2:${buttonY}:format=auto[out]`,
  ].join(';')

  // FFMPEG command with two inputs (background + button)
  const ffmpegCmd = [
    'ffmpeg -y',
    `-loop 1 -i "${backgroundImagePath}"`, // Input 0: background
    `-loop 1 -i "${buttonPath}"`, // Input 1: button PNG
    `-filter_complex "${filterComplex}"`,
    '-map "[out]"',
    `-t ${END_SCREEN_DURATION}`,
    '-c:v libx264',
    '-pix_fmt yuv420p',
    '-r 30',
    '-preset fast',
    `"${outputPath}"`,
  ].join(' ')

  console.log('[EndScreen] FFMPEG filter explanation:')
  console.log(`  - Title bar: ${titleBarWidth}x${TITLE_BAR_HEIGHT} at top, gray #${TITLE_BAR_COLOR}`)
  console.log(`  - First name: "${firstName}" (size 72)`)
  console.log(`  - Role: "${role}" (size 48)`)
  console.log(`  - Button: ${BUTTON_SCALE}x scale, pulsing at ${PULSE_SPEED} cycles/sec, positioned at Y=${buttonY}`)
  console.log('[EndScreen] Running FFMPEG...')

  try {
    const { stderr } = await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 })

    if (stderr) {
      console.log('[EndScreen] FFMPEG stderr (last 500 chars):', stderr.slice(-500))
    }

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath)
      console.log('[EndScreen] End screen created:', outputPath)
      console.log('[EndScreen] File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB')
      return { success: true, videoPath: outputPath }
    } else {
      return { success: false, error: 'Output file not created' }
    }
  } catch (error: any) {
    console.error('[EndScreen] FFMPEG error:', error.message)
    console.error('[EndScreen] stderr:', error.stderr?.slice(-1500))
    return { success: false, error: error.message }
  }
}

/**
 * Concatenate the main video with the end screen
 */
export async function concatenateVideos(
  mainVideoPath: string,
  endScreenPath: string,
  outputPath?: string
): Promise<ConcatResult> {
  const finalPath = outputPath || path.join(OUTPUT_DIR, `final_${Date.now()}.mp4`)

  console.log('[EndScreen] Concatenating videos...')
  console.log('[EndScreen] Main video:', mainVideoPath)
  console.log('[EndScreen] End screen:', endScreenPath)

  if (!fs.existsSync(mainVideoPath)) {
    return { success: false, error: `Main video not found: ${mainVideoPath}` }
  }
  if (!fs.existsSync(endScreenPath)) {
    return { success: false, error: `End screen not found: ${endScreenPath}` }
  }

  // Create a concat file list
  const concatListPath = path.join(TEMP_DIR, `concat_${Date.now()}.txt`)
  const concatContent = `file '${mainVideoPath}'\nfile '${endScreenPath}'`
  fs.writeFileSync(concatListPath, concatContent)

  const ffmpegCmd = [
    'ffmpeg -y',
    `-f concat -safe 0 -i "${concatListPath}"`,
    '-c:v libx264',
    '-pix_fmt yuv420p',
    '-r 30',
    '-preset fast',
    '-c:a aac -ar 44100',
    `"${finalPath}"`,
  ].join(' ')

  console.log('[EndScreen] Running concat command...')

  try {
    const { stderr } = await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024 })

    if (stderr) {
      console.log('[EndScreen] FFMPEG concat stderr (last 500 chars):', stderr.slice(-500))
    }

    fs.unlinkSync(concatListPath)

    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath)
      console.log('[EndScreen] Final video created:', finalPath)
      console.log('[EndScreen] Final size:', (stats.size / 1024 / 1024).toFixed(2), 'MB')
      return { success: true, finalVideoPath: finalPath }
    } else {
      return { success: false, error: 'Final output file not created' }
    }
  } catch (error: any) {
    console.error('[EndScreen] Concat error:', error.message)
    if (fs.existsSync(concatListPath)) {
      fs.unlinkSync(concatListPath)
    }
    return { success: false, error: error.message }
  }
}

/**
 * Full pipeline: Generate end screen and concatenate with main video
 */
export async function createFinalVideo(
  mainVideoPath: string,
  backgroundImagePath: string,
  firstName?: string,
  role?: string,
  outputPath?: string
): Promise<ConcatResult> {
  console.log('[EndScreen] === Starting full pipeline ===')

  const endScreenResult = await generateEndScreen({
    backgroundImagePath,
    firstName,
    role,
  })

  if (!endScreenResult.success || !endScreenResult.videoPath) {
    return { success: false, error: `End screen generation failed: ${endScreenResult.error}` }
  }

  const concatResult = await concatenateVideos(mainVideoPath, endScreenResult.videoPath, outputPath)

  // Clean up temporary end screen
  if (endScreenResult.videoPath && fs.existsSync(endScreenResult.videoPath)) {
    fs.unlinkSync(endScreenResult.videoPath)
    console.log('[EndScreen] Cleaned up temp end screen')
  }

  return concatResult
}
