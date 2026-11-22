import 'server-only'

import { GoogleGenAI } from '@google/genai'
import { normalizePlate } from '@/lib/plate'

export const MAX_IMAGE_BYTES = 3_500_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateImage(value: FormDataEntryValue | null | undefined): { image: File } | { error: string; status: number } {
  if (!(value instanceof File) || value.size === 0) return { error: 'Selecciona una foto de la placa.', status: 400 }
  if (!IMAGE_TYPES.has(value.type) || value.size > MAX_IMAGE_BYTES) {
    return { error: 'La foto debe ser JPG, PNG o WebP y no superar 3.5 MB.', status: 413 }
  }
  return { image: value }
}

/** Lee la placa con Gemini 2.5 Flash. Devuelve null si no hay placa legible; lanza si el servicio falla. */
const PROMPT =
  'La imagen puede mostrar una placa vehicular peruana (3 letras/números, guion, 3 letras/números; por ejemplo ABC-123), '
  + 'incluso si es pequeña o está impresa en papel. Ignora la palabra "PERÚ" y cualquier otro texto. '
  + 'Responde SOLO con los 6 caracteres de la placa en formato ABC-123. Si no hay ninguna placa visible, responde SIN_PLACA.'

function parsePlate(text: string) {
  const upper = text.toUpperCase().replace(/PER[UÚ]/g, ' ')
  const match = upper.match(/[A-Z0-9]{3}\s*[-–—]\s*[A-Z0-9]{3}/) ?? upper.match(/[A-Z0-9]{3}\s*[A-Z0-9]{3}/)
  return normalizePlate(match ? match[0] : upper)
}

async function readWithGemini(bytes: string, mimeType: string): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const contents = [{ text: PROMPT }, { inlineData: { data: bytes, mimeType } }]
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  let text: string
  try {
    // El modelo "piensa" por defecto y esos tokens cuentan dentro de maxOutputTokens; se apaga el razonamiento.
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { maxOutputTokens: 128, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    })
    text = response.text ?? ''
  } catch {
    const response = await ai.models.generateContent({ model, contents, config: { maxOutputTokens: 1024, temperature: 0 } })
    text = response.text ?? ''
  }
  return parsePlate(text)
}

/** Respaldo opcional: Claude (Anthropic) por HTTP, sin dependencias nuevas. Se activa con ANTHROPIC_API_KEY. */
async function readWithClaude(bytes: string, mimeType: string): Promise<string | null> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 40,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: bytes } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Claude HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`)
  const data = (await response.json()) as { content?: { type: string; text?: string }[] }
  return parsePlate((data.content ?? []).map((block) => block.text ?? '').join(' '))
}

/** Alternativa gratuita: OCR.space (clave gratis en ocr.space/ocrapi/freekey). Se activa con OCR_SPACE_API_KEY. */
async function readWithOcrSpace(bytes: string, mimeType: string): Promise<string | null> {
  const form = new FormData()
  form.set('apikey', process.env.OCR_SPACE_API_KEY ?? '')
  form.set('base64Image', `data:${mimeType};base64,${bytes}`)
  form.set('language', 'eng')
  form.set('OCREngine', '2')
  form.set('scale', 'true')
  form.set('detectOrientation', 'true')
  const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form, signal: AbortSignal.timeout(25_000) })
  if (!response.ok) throw new Error(`OCR.space HTTP ${response.status}`)
  const data = (await response.json()) as { IsErroredOnProcessing?: boolean; ErrorMessage?: string[] | string; ParsedResults?: { ParsedText?: string }[] }
  if (data.IsErroredOnProcessing) throw new Error(`OCR.space: ${[data.ErrorMessage].flat().join(' ').slice(0, 160)}`)
  return parsePlate((data.ParsedResults ?? []).map((result) => result.ParsedText ?? '').join(' '))
}

/** API propia (Tesseract + OpenCV, carpeta api_placas). Se activa con OWN_OCR_URL, p. ej. https://usuario-parkgate-ocr.hf.space */
async function readWithOwnApi(image: File): Promise<string | null> {
  const form = new FormData()
  form.set('image', image, 'placa.jpg')
  const token = process.env.OWN_OCR_TOKEN
  const response = await fetch(`${(process.env.OWN_OCR_URL ?? '').replace(/\/+$/, '')}/read`, {
    method: 'POST',
    body: form,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`API propia HTTP ${response.status}`)
  const data = (await response.json()) as { plate?: string | null }
  return data.plate ? normalizePlate(data.plate) : null
}

/**
 * Lee la placa. Orden por defecto: Gemini -> API propia (OWN_OCR_URL) -> Claude -> OCR.space.
 * LPR_PROVIDER=own, claude u ocr fuerza ese proveedor desde el inicio.
 */
export async function readPlate(image: File): Promise<string | null> {
  const bytes = Buffer.from(await image.arrayBuffer()).toString('base64')
  const forced = process.env.LPR_PROVIDER
  if (forced === 'own' && process.env.OWN_OCR_URL) return readWithOwnApi(image)
  if (forced === 'claude' && process.env.ANTHROPIC_API_KEY) return readWithClaude(bytes, image.type)
  if (forced === 'ocr' && process.env.OCR_SPACE_API_KEY) return readWithOcrSpace(bytes, image.type)
  try {
    return await readWithGemini(bytes, image.type)
  } catch (geminiError) {
    console.error('[lpr] Gemini falló:', geminiError)
    if (process.env.OWN_OCR_URL) return readWithOwnApi(image)
    if (process.env.ANTHROPIC_API_KEY) return readWithClaude(bytes, image.type)
    if (process.env.OCR_SPACE_API_KEY) return readWithOcrSpace(bytes, image.type)
    throw geminiError
  }
}
