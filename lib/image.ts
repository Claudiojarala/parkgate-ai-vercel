'use client'

export async function compressPhoto(file: File) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  const objectUrl = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No se pudo abrir la foto. Prueba con otra imagen.'))
      image.src = objectUrl
    })
    const scale = Math.min(1, 1_280 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('El navegador no pudo procesar la imagen.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la foto.')), 'image/jpeg', 0.8)
    })
    if (jpeg.size > 3_500_000) throw new Error('La imagen sigue siendo muy grande. Toma una foto más cercana a la placa.')
    return jpeg
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
