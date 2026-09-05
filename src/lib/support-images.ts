import type { SupportAttachment } from '@/types';

export const supportImageLimit = 3;
export const supportImageSourceMaxBytes = 12 * 1024 * 1024;

// The support API accepts three attachments in one request. Keep each encoded
// image below this threshold so a full message remains inside the API payload cap.
const supportImageTransportMaxBytes = 1_250_000;
const supportImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export type SupportImagePreparation =
  | { attachment: SupportAttachment; optimized: boolean }
  | { error: 'type' | 'size' | 'read' };

function blobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('image read failed')));
    reader.addEventListener('error', () => reject(new Error('image read failed')));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener('load', () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    }, { once: true });
    image.src = url;
  });
}

function canvasAsJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function jpegFileName(name: string) {
  const base = name.trim().replace(/\.[^./\\]+$/, '').slice(0, 108) || 'image';
  return `${base}.jpg`;
}

async function optimizeImage(file: File): Promise<File | null> {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  if (!longestSide) return null;

  for (const maxSide of [1920, 1600, 1360, 1120, 960]) {
    const scale = Math.min(1, maxSide / longestSide);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58]) {
      const blob = await canvasAsJpeg(canvas, quality);
      if (blob && blob.size > 0 && blob.size <= supportImageTransportMaxBytes) {
        return new File([blob], jpegFileName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
  }
  return null;
}

export async function prepareSupportImage(file: File): Promise<SupportImagePreparation> {
  if (!supportImageMimeTypes.has(file.type)) return { error: 'type' };
  if (file.size <= 0 || file.size > supportImageSourceMaxBytes) return { error: 'size' };

  try {
    const deliveryFile = file.size <= supportImageTransportMaxBytes ? file : await optimizeImage(file);
    if (!deliveryFile) return { error: 'size' };
    return {
      optimized: deliveryFile !== file,
      attachment: {
        id: crypto.randomUUID(),
        name: deliveryFile.name.trim().slice(0, 120) || 'image',
        mimeType: deliveryFile.type,
        dataUrl: await blobAsDataUrl(deliveryFile),
      },
    };
  } catch {
    return { error: 'read' };
  }
}
