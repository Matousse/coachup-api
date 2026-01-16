/**
 * Image Generation Service - Kie.ai Integration
 *
 * Supports two models:
 * - Flux Kontext: Fast, good for image-to-image transformation (~$0.04/image)
 * - Nano Banana Pro: High quality generation (~$0.09/image)
 */

import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

// Configuration
const KIE_API_BASE = 'https://api.kie.ai/api/v1'
const KIE_API_KEY = process.env.KIE_AI_API_KEY
const IMGBB_API_KEY = process.env.IMGBB_API_KEY

// Storage
const STORAGE_BASE = path.join(__dirname, '../../storage')
const IMAGES_DIR = path.join(STORAGE_BASE, 'images')

// Ensure storage directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true })
  console.log(`[ImageGen] Created images directory: ${IMAGES_DIR}`)
}

export type ImageModel = 'flux-kontext' | 'nano-banana-pro'

export interface ImageGenerationParams {
  model: ImageModel
  prompt: string
  inputImagePath?: string // For image-to-image
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4'
  resolution?: '1K' | '2K' | '4K'
}

export interface ImageGenerationResult {
  success: boolean
  imagePath?: string
  imageUrl?: string
  taskId?: string
  error?: string
}

interface KieTaskResponse {
  code: number
  msg: string
  data?: {
    taskId: string
  }
}

interface KieTaskStatusResponse {
  code: number
  msg: string
  data?: {
    taskId: string
    // Old format
    state?: 'generating' | 'success' | 'failed' | 'pending'
    resultJson?: string
    failMsg?: string | null
    // New format (Flux Kontext, etc.)
    successFlag?: number // 1 = success, 0 = pending, -1 = failed
    errorMessage?: string | null
    response?: {
      resultImageUrl?: string
      originImageUrl?: string | null
    }
  }
}

/**
 * Upload image to imgBB for public URL (required by Kie.ai)
 */
async function uploadToImgBB(imagePath: string): Promise<string | null> {
  if (!IMGBB_API_KEY) {
    console.error('[ImageGen] IMGBB_API_KEY not configured')
    return null
  }

  try {
    const imageBuffer = fs.readFileSync(imagePath)
    const base64Image = imageBuffer.toString('base64')

    const formData = new FormData()
    formData.append('key', IMGBB_API_KEY)
    formData.append('image', base64Image)

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    })

    const result: any = await response.json()

    if (result.success) {
      console.log('[ImageGen] Image uploaded to imgBB:', result.data.url)
      return result.data.url
    } else {
      console.error('[ImageGen] imgBB upload failed:', result)
      return null
    }
  } catch (error) {
    console.error('[ImageGen] imgBB upload error:', error)
    return null
  }
}

/**
 * Generate image using Flux Kontext (image-to-image transformation)
 */
async function generateWithFluxKontext(
  prompt: string,
  inputImageUrl: string,
  aspectRatio: string = '9:16'
): Promise<{ taskId: string } | null> {
  const response = await fetch(`${KIE_API_BASE}/flux/kontext/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      inputImage: inputImageUrl,
      aspectRatio,
      model: 'flux-kontext-pro',
      outputFormat: 'jpeg',
    }),
  })

  const result = await response.json() as KieTaskResponse
  console.log('[ImageGen] Flux Kontext response:', JSON.stringify(result, null, 2))

  if (result.code === 200 && result.data?.taskId) {
    return { taskId: result.data.taskId }
  }

  console.error('[ImageGen] Flux Kontext failed:', result.msg)
  return null
}

/**
 * Generate image using Nano Banana Pro
 */
async function generateWithNanoBanana(
  prompt: string,
  inputImageUrl?: string,
  aspectRatio: string = '9:16',
  resolution: string = '1K'
): Promise<{ taskId: string } | null> {
  const body: any = {
    prompt,
    aspectRatio,
    resolution,
    outputFormat: 'jpeg',
  }

  if (inputImageUrl) {
    body.imageInput = [inputImageUrl]
  }

  const response = await fetch(`${KIE_API_BASE}/nano-banana-pro/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const result = await response.json() as KieTaskResponse
  console.log('[ImageGen] Nano Banana Pro response:', JSON.stringify(result, null, 2))

  if (result.code === 200 && result.data?.taskId) {
    return { taskId: result.data.taskId }
  }

  console.error('[ImageGen] Nano Banana Pro failed:', result.msg)
  return null
}

/**
 * Poll task status until completion
 */
async function pollTaskStatus(
  taskId: string,
  model: ImageModel,
  maxAttempts: number = 450, // 15 minutes max (450 * 2s = 900s)
  intervalMs: number = 2000
): Promise<string | null> {
  const endpoint =
    model === 'flux-kontext'
      ? `${KIE_API_BASE}/flux/kontext/record-info`
      : `${KIE_API_BASE}/nano-banana-pro/record-info`

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${endpoint}?taskId=${taskId}`, {
        headers: {
          Authorization: `Bearer ${KIE_API_KEY}`,
        },
      })

      const result = await response.json() as KieTaskStatusResponse

      // Handle new format (Flux Kontext, etc.) - uses successFlag
      if (result.data?.successFlag !== undefined) {
        console.log(`[ImageGen] Poll attempt ${attempt + 1}/${maxAttempts}, successFlag: ${result.data.successFlag}`)

        if (result.data.successFlag === 1 && result.data.response?.resultImageUrl) {
          console.log('[ImageGen] Generation complete:', result.data.response.resultImageUrl)
          return result.data.response.resultImageUrl
        }

        if (result.data.successFlag === -1) {
          console.error('[ImageGen] Generation failed:', result.data.errorMessage)
          return null
        }

        // successFlag === 0 means still processing, continue polling
      }
      // Handle old format - uses state
      else if (result.data?.state) {
        console.log(`[ImageGen] Poll attempt ${attempt + 1}/${maxAttempts}, state: ${result.data.state}`)

        if (result.data.state === 'success' && result.data.resultJson) {
          const resultData = JSON.parse(result.data.resultJson)
          // The result usually contains an array of image URLs
          const imageUrl = resultData.images?.[0] || resultData.url || resultData.output?.[0]
          if (imageUrl) {
            console.log('[ImageGen] Generation complete:', imageUrl)
            return imageUrl
          }
        }

        if (result.data.state === 'failed') {
          console.error('[ImageGen] Generation failed:', result.data.failMsg)
          return null
        }
      } else {
        console.log(`[ImageGen] Poll attempt ${attempt + 1}/${maxAttempts}, waiting...`)
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    } catch (error) {
      console.error('[ImageGen] Poll error:', error)
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  console.error('[ImageGen] Polling timeout')
  return null
}

/**
 * Download image from URL to local storage
 */
async function downloadImage(imageUrl: string, filename: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok || !response.body) {
      console.error('[ImageGen] Download failed:', response.status)
      return null
    }

    const outputPath = path.join(IMAGES_DIR, filename)
    const fileStream = fs.createWriteStream(outputPath)

    await pipeline(Readable.fromWeb(response.body as any), fileStream)

    console.log('[ImageGen] Image saved to:', outputPath)
    return outputPath
  } catch (error) {
    console.error('[ImageGen] Download error:', error)
    return null
  }
}

/**
 * Main function: Generate image with specified model
 */
export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  console.log('[ImageGen] Starting generation with model:', params.model)
  console.log('[ImageGen] Prompt:', params.prompt)

  if (!KIE_API_KEY) {
    return { success: false, error: 'KIE_AI_API_KEY not configured' }
  }

  // Upload input image to imgBB if provided
  let inputImageUrl: string | undefined
  if (params.inputImagePath) {
    const uploadedUrl = await uploadToImgBB(params.inputImagePath)
    if (!uploadedUrl) {
      return { success: false, error: 'Failed to upload input image' }
    }
    inputImageUrl = uploadedUrl
  }

  // Start generation task
  let taskResult: { taskId: string } | null = null

  if (params.model === 'flux-kontext') {
    if (!inputImageUrl) {
      return { success: false, error: 'Flux Kontext requires an input image' }
    }
    taskResult = await generateWithFluxKontext(
      params.prompt,
      inputImageUrl,
      params.aspectRatio || '9:16'
    )
  } else if (params.model === 'nano-banana-pro') {
    taskResult = await generateWithNanoBanana(
      params.prompt,
      inputImageUrl,
      params.aspectRatio || '9:16',
      params.resolution || '1K'
    )
  }

  if (!taskResult) {
    return { success: false, error: 'Failed to start generation task' }
  }

  console.log('[ImageGen] Task started:', taskResult.taskId)

  // Poll for completion
  const resultUrl = await pollTaskStatus(taskResult.taskId, params.model)

  if (!resultUrl) {
    return { success: false, error: 'Generation timed out or failed', taskId: taskResult.taskId }
  }

  // Download the result
  const filename = `generated_${Date.now()}.jpg`
  const localPath = await downloadImage(resultUrl, filename)

  if (!localPath) {
    return { success: false, error: 'Failed to download generated image', imageUrl: resultUrl }
  }

  return {
    success: true,
    imagePath: localPath,
    imageUrl: resultUrl,
    taskId: taskResult.taskId,
  }
}

/**
 * Generate gym photo from coach profile photo
 */
export async function generateGymPhoto(
  coachPhotoPath: string,
  coachName: string,
  model: ImageModel = 'flux-kontext'
): Promise<ImageGenerationResult> {
  const prompt = `Transform this photo: Show the same person smiling warmly, standing confidently facing the camera, in a modern well-lit gym environment. Professional fitness coach appearance, friendly and approachable. Keep the person's face and features exactly the same. Vertical portrait format, professional lighting.`

  return generateImage({
    model,
    prompt,
    inputImagePath: coachPhotoPath,
    aspectRatio: '9:16',
    resolution: '1K',
  })
}
