import {
  BinaryBitmap,
  DecodeHintType,
  BarcodeFormat,
  MultiFormatReader,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  HTMLCanvasElementLuminanceSource,
} from "@zxing/library"

export interface DecodedCode {
  text: string
  format: string
}

const SUPPORTED_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]

function buildHints(tryHarder: boolean) {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS)
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

function attemptDecode(canvas: HTMLCanvasElement, binarizer: "global" | "hybrid", tryHarder: boolean): DecodedCode | null {
  const reader = new MultiFormatReader()
  reader.setHints(buildHints(tryHarder))
  const luminance = new HTMLCanvasElementLuminanceSource(canvas)
  const bitmap = new BinaryBitmap(
    binarizer === "hybrid" ? new HybridBinarizer(luminance) : new GlobalHistogramBinarizer(luminance),
  )
  const result = reader.decode(bitmap)
  const text = result.getText()
  const format = result.getBarcodeFormat()?.toString() ?? "UNKNOWN"
  if (!text) return null
  return { text, format }
}

export function decodeCanvas(canvas: HTMLCanvasElement): DecodedCode | null {
  if (canvas.width < 2 || canvas.height < 2) return null
  const attempts: Array<[boolean, boolean]> = [
    [true, true],
    [false, true],
  ]
  for (const [binarizer, tryHarder] of attempts) {
    try {
      const decoded = attemptDecode(canvas, binarizer ? "global" : "hybrid", tryHarder)
      if (decoded) return decoded
    } catch {
      // NotFoundException or other decode failures -> try next strategy
    }
  }
  return null
}

interface NativeDetectorWindow extends Window {
  BarcodeDetector?: new (options?: { formats?: string[] }) => {
    detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; format: string }>>
  }
}

const FORMAT_NAMES = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
]

export async function decodeWithNativeDetector(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  const w = window as NativeDetectorWindow
  if (!w.BarcodeDetector) return null
  try {
    const detector = new w.BarcodeDetector({ formats: FORMAT_NAMES })
    const results = await detector.detect(canvas)
    const first = results[0]
    if (!first?.rawValue) return null
    return { text: first.rawValue, format: first.format ?? "UNKNOWN" }
  } catch {
    return null
  }
}

export function isNativeDetectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window
}

export async function decodeFrame(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  const native = await decodeWithNativeDetector(canvas)
  if (native) return native
  return decodeCanvas(canvas)
}

export interface ScanRegion {
  x: number
  y: number
  w: number
  h: number
}

const X_PHASE_SHIFTS = [0, -0.5, 0.5]

export async function decodeVideoRegion(
  video: HTMLVideoElement,
  region: ScanRegion,
  maxWidth = 1280,
): Promise<DecodedCode | null> {
  if (!video || region.w < 2 || region.h < 2) return null
  const scale = Math.min(1, maxWidth / region.w)
  const dw = Math.max(2, Math.round(region.w * scale))
  const dh = Math.max(2, Math.round(region.h * scale))

  const canvas = document.createElement("canvas")
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null

  for (const shift of X_PHASE_SHIFTS) {
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(video, region.x + shift, region.y, region.w, region.h, 0, 0, dw, dh)
    const code = await decodeFrame(canvas)
    if (code) return code
  }
  return null
}
