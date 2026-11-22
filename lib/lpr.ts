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
export async function readPlate(image: File): Promise<string | null> {
  const bytes = Buffer.from(await image.arrayBuffer()).toString('base64')
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        text:
          'La imagen puede mostrar una placa vehicular peruana (3 letras/números, guion, 3 letras/números; por ejemplo ABC-123), '
          + 'incluso si es pequeña o está impresa en papel. Ignora la palabra "PERÚ" y cualquier otro texto. '
          + 'Responde SOLO con los 6 caracteres de la placa en formato ABC-123. Si no hay ninguna placa visible, responde SIN_PLACA.',
      },
      { inlineData: { data: bytes, mimeType: image.type } },
    ],
    // gemini-2.5-flash "piensa" por defecto y esos tokens cuentan dentro de maxOutputTokens:
    // con un límite de 24 la respuesta salía vacía (SIN_LECTURA). Se apaga el razonamiento.
    config: { maxOutputTokens: 128, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  })
  const text = (response.text ?? '').toUpperCase()
  const match = text.match(/[A-Z0-9]{3}\s*[-–—]?\s*[A-Z0-9]{3}/)
  return normalizePlate(match ? match[0] : text)
}
