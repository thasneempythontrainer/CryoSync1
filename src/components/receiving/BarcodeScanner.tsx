import { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Scan,
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  Package,
  Ship,
  Thermometer,
  Building2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getStatusBg } from "@/utils/formatters"
import { getShipments } from "@/services/shipment-service"
import { useAuth } from "@/hooks"
import type { Shipment } from "@/types"
import { decodeVideoRegion } from "@/lib/barcode-decoder"

interface CameraDevice {
  id: string
  label: string
}

interface BarcodeScannerProps {
  onCreateShipment?: (shipmentNumber: string) => void
}

function describeCameraError(err: unknown): string {
  if (typeof err === "string") {
    const s = err.toLowerCase()
    if (s.includes("notallowed") || s.includes("permission")) {
      return "Camera access was denied. Allow camera permission in your browser settings and try again."
    }
    if (s.includes("insecure") || s.includes("secure context") || s.includes("mediaDevices not supported")) {
      return "Camera access requires a secure (HTTPS) connection or localhost. The current page is not served securely, so the browser blocks the camera."
    }
    if (s.includes("notfound") || s.includes("devicesnotfound") || s.includes("no camera")) {
      return "No camera was found on this device. Connect a camera and try again."
    }
    if (s.includes("notreadable") || s.includes("trackstart") || s.includes("in use")) {
      return "The camera is already in use by another application. Close other apps using the camera and try again."
    }
    if (s.includes("overconstrained")) {
      return "The selected camera cannot provide the requested video settings. Pick a different camera."
    }
    return err
  }
  const name = (err as DOMException | null)?.name ?? ""
  const n = name.toLowerCase()
  if (n === "notallowederror" || n === "securityerror" || n === "permissiondeniederror") {
    return "Camera access was denied. Allow camera permission in your browser settings and try again."
  }
  if (n === "notfounderror" || n === "devicesnotfounderror") {
    return "No camera was found on this device. Connect a camera and try again."
  }
  if (n === "notreadableerror" || n === "trackstarterror") {
    return "The camera is already in use by another application. Close other apps using the camera and try again."
  }
  if (n === "overconstrainederror") {
    return "The selected camera cannot provide the requested video settings. Pick a different camera."
  }
  if (n === "aborterror" || n === "idnotfounderror") {
    return "The selected camera was not found. Pick a different camera."
  }
  return err instanceof Error ? err.message : "Failed to access camera"
}

const MAX_DECODE_WIDTH = 1280

const EAN_DIGIT_LENGTHS = new Set([6, 8, 12, 13, 14])

function isPlausibleBarcode(text: string): boolean {
  const t = text.trim()
  if (t.length < 6) return false
  if (/^[0-9]+$/.test(t) && !EAN_DIGIT_LENGTHS.has(t.length)) return false
  return true
}

function BarcodeScanner({ onCreateShipment }: BarcodeScannerProps) {
  const { can } = useAuth()
  const canCreateShipment = can("act:create_cbu")
  const [manualBarcode, setManualBarcode] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [scannedData, setScannedData] = useState<Shipment | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [showFlash, setShowFlash] = useState(false)
  const [lastScannedCode, setLastScannedCode] = useState("")
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>("")

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<number | null>(null)
  const decodeRegionRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const cameraActiveRef = useRef(false)
  const decodingRef = useRef(false)
  const stoppingRef = useRef(false)
  const frameReadyRef = useRef(false)
  const startTimeRef = useRef(0)
  const lastDecodeAtRef = useRef(0)
  const pendingDecodeRef = useRef<{ text: string; count: number } | null>(null)
  const scanLockRef = useRef("")

  const refreshCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameras([])
        setSelectedCameraId("")
        return
      }
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({ id: d.deviceId, label: d.label }))
      setCameras(videoDevices)
      const backCamera = videoDevices.find((d) => /back|rear|environment/i.test(d.label))
      const preferred = videoDevices[1] ?? backCamera ?? videoDevices[0]
      setSelectedCameraId((current) =>
        current && videoDevices.some((d) => d.id === current) ? current : (preferred?.id ?? ""),
      )
    } catch {
      setCameras([])
      setSelectedCameraId("")
    }
  }, [])

  useEffect(() => {
    refreshCameras()
  }, [refreshCameras])

  const stopMedia = useCallback(() => {
    stoppingRef.current = true
    cameraActiveRef.current = false
    frameReadyRef.current = false
    pendingDecodeRef.current = null
    scanLockRef.current = ""
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current)
      loopRef.current = null
    }
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
    decodeRegionRef.current = null
    stoppingRef.current = false
  }, [])

  const handleDetectedCode = useCallback(async (barcode: string) => {
    setScanError(null)
    scanLockRef.current = barcode
    pendingDecodeRef.current = null
    setIsScanning(true)

    try {
      const result = await getShipments({ search: barcode, pageSize: 50 })
      const shipment = result.data.find(
        (s) => s.shipmentNumber.toLowerCase() === barcode.trim().toLowerCase(),
      )

      setTimeout(() => {
        setIsScanning(false)

        if (shipment) {
          setScannedData(shipment as unknown as Shipment)
        } else {
          setScannedData(null)
        }
        setLastScannedCode(barcode)
        setShowFlash(true)
        setTimeout(() => setShowFlash(false), 600)
      }, 800)
    } catch {
      setIsScanning(false)
      setScannedData(null)
      setLastScannedCode(barcode)
      setShowFlash(true)
      setTimeout(() => setShowFlash(false), 600)
    }
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCameraError(
        "Camera access requires a secure (HTTPS) connection or localhost. The current page is not served securely, so the browser blocks the camera.",
      )
      return
    }
    setIsStarting(true)
    try {
      const constraintsToTry: MediaTrackConstraints[] = []
      if (selectedCameraId) constraintsToTry.push({ deviceId: { exact: selectedCameraId } })
      constraintsToTry.push({ facingMode: "environment" }, { facingMode: "user" })

      let stream: MediaStream | null = null
      let lastError: unknown = "No camera was found on this device."
      for (const videoConstraints of constraintsToTry) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          })
          break
        } catch (err) {
          lastError = err
        }
      }

      if (!stream) throw lastError

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        throw "Video element not available"
      }

      stoppingRef.current = false
      streamRef.current = stream
      cameraActiveRef.current = true
      frameReadyRef.current = false
      startTimeRef.current = performance.now()
      lastDecodeAtRef.current = 0
      pendingDecodeRef.current = null
      scanLockRef.current = ""
      video.srcObject = stream
      video.addEventListener("loadedmetadata", () => {
        frameReadyRef.current = true
      }, { once: true })
      await video.play()
      setCameraActive(true)
      setIsStarting(false)
      refreshCameras()

      const tick = async () => {
        if (decodingRef.current || !cameraActiveRef.current) return
        const v = videoRef.current
        if (!v || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return
        if (!frameReadyRef.current && performance.now() - startTimeRef.current < 600) return
        frameReadyRef.current = true
        if (performance.now() - lastDecodeAtRef.current < 600) return

        let region = decodeRegionRef.current
        if (!region || region.w !== Math.round(v.videoWidth * 0.92)) {
          const rw = Math.round(v.videoWidth * 0.92)
          const rh = Math.round(v.videoHeight * 0.62)
          region = {
            x: Math.round((v.videoWidth - rw) / 2),
            y: Math.round((v.videoHeight - rh) / 2),
            w: rw,
            h: rh,
          }
          decodeRegionRef.current = region
        }

        decodingRef.current = true
        try {
          const code = await decodeVideoRegion(v, region, MAX_DECODE_WIDTH)
          if (!code || stoppingRef.current || !cameraActiveRef.current) {
            scanLockRef.current = ""
            pendingDecodeRef.current = null
          } else if (code.text !== scanLockRef.current && isPlausibleBarcode(code.text)) {
            const pending = pendingDecodeRef.current
            if (pending && pending.text === code.text) {
              pending.count += 1
            } else {
              pendingDecodeRef.current = { text: code.text, count: 1 }
            }
            if (pendingDecodeRef.current && pendingDecodeRef.current.count >= 3) {
              lastDecodeAtRef.current = performance.now()
              handleDetectedCode(code.text)
            }
          }
        } finally {
          decodingRef.current = false
        }
      }

      if (loopRef.current !== null) window.clearInterval(loopRef.current)
      loopRef.current = window.setInterval(tick, 100)
      tick()
    } catch (err) {
      stopMedia()
      setIsStarting(false)
      setCameraActive(false)
      setCameraError(describeCameraError(err))
    }
  }, [selectedCameraId, handleDetectedCode, refreshCameras, stopMedia])

  const stopCamera = useCallback(() => {
    stopMedia()
    setCameraActive(false)
  }, [stopMedia])

  useEffect(() => {
    return () => {
      stopMedia()
    }
  }, [stopMedia])

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualBarcode.trim()
    if (!trimmed) {
      setScanError("Please enter a barcode value.")
      return
    }
    handleDetectedCode(trimmed)
  }, [manualBarcode, handleDetectedCode])

  const clearScan = useCallback(() => {
    setScannedData(null)
    setLastScannedCode("")
    setManualBarcode("")
    setScanError(null)
    scanLockRef.current = ""
    pendingDecodeRef.current = null
  }, [])

  const toggleCamera = useCallback(() => {
    if (cameraActive) {
      stopCamera()
    } else {
      startCamera()
    }
  }, [cameraActive, startCamera, stopCamera])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card size="sm" className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Scan className="size-5" />
            Barcode / QR Scanner
          </CardTitle>
          <CardDescription>Scan a shipment barcode or enter the code manually</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20">
            <AnimatePresence>
              {showFlash && (
                <motion.div
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                   className="absolute inset-0 z-10 bg-success/30"
                />
              )}
            </AnimatePresence>

            <div
              id="barcode-scanner-container"
              className={
                "relative z-10 flex h-full w-full items-center justify-center " +
                (cameraActive ? "" : "pointer-events-none")
              }
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-contain"
              />
              {cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[62%] w-[92%] rounded-xl border-2 border-primary/60" />
                </div>
              )}
            </div>

            {!cameraActive && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                {cameraError ? (
                  <>
                    <XCircle className="size-12 opacity-40" />
                    <span className="text-sm font-medium text-destructive">Camera Error</span>
                    <span className="text-xs max-w-[260px] text-center">{cameraError}</span>
                  </>
                ) : (
                  <>
                    <Camera className="size-12 opacity-40" />
                    <span className="text-sm font-medium">Camera Inactive</span>
                    <span className="text-xs">Click &quot;Start Camera&quot; to begin scanning</span>
                  </>
                )}
              </div>
            )}

            {isScanning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[2px]"
              >
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">Scanning...</span>
                </div>
              </motion.div>
            )}
          </div>

          {!cameraActive && cameras.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Camera Source</label>
              <div className="flex gap-2">
                <Select value={selectedCameraId} onValueChange={(value) => setSelectedCameraId(value ?? "")}>
                  <SelectTrigger className="h-11 w-full" aria-label="Camera source">
                    <SelectValue placeholder="Default camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {cameras.map((cam) => (
                      <SelectItem key={cam.id} value={cam.id}>
                        {cam.label || `Camera ${cam.id.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon-xl"
                  onClick={refreshCameras}
                  disabled={isStarting}
                  aria-label="Refresh cameras"
                >
                  <RefreshCw className="size-5" />
                </Button>
              </div>
            </div>
          )}

          <Button
            variant={cameraActive ? "destructive" : "default"}
            size="xl"
            onClick={toggleCamera}
            disabled={isScanning || isStarting}
            className="w-full"
          >
            {isStarting ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Starting Camera...
              </>
            ) : cameraActive ? (
              <>
                <CameraOff className="size-5" />
                Stop Camera
              </>
            ) : (
              <>
                <Camera className="size-5" />
                Start Camera
              </>
            )}
          </Button>

          {!window.isSecureContext && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              Camera preview requires HTTPS or localhost. Open the app on localhost (npm run dev) or over HTTPS to enable live scanning.
            </p>
          )}

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-foreground">Manual Entry</label>
            <div className="flex gap-2">
              <Input
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Enter barcode number..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualSubmit()
                }}
                className="h-11 flex-1"
              />
              <Button
                variant="default"
                size="xl"
                onClick={handleManualSubmit}
                disabled={isScanning}
                className="shrink-0"
              >
                <Scan className="size-4" />
                Lookup
              </Button>
            </div>
            {scanError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <XCircle className="size-3" />
                {scanError}
              </p>
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Shipment lookups use live LakeBase data.</p>
            <Button variant="outline" size="lg" onClick={clearScan} disabled={!scannedData && !lastScannedCode}>
              <RefreshCw className="size-4" />
              New Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Package className="size-5" />
                Scan Result
              </CardTitle>
              <CardDescription>
                {scannedData
                  ? `Result for ${lastScannedCode}`
                  : "Awaiting scan..."}
              </CardDescription>
            </div>
            {(scannedData || lastScannedCode) && (
              <Button variant="outline" size="lg" onClick={clearScan}>
                <RefreshCw className="size-4" />
                New Scan
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <AnimatePresence mode="wait">
            {scannedData ? (
              <motion.div
                key={lastScannedCode}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-success" />
                    <span className="font-semibold text-foreground">{scannedData.shipmentNumber}</span>
                  </div>
                  <Badge className={getStatusBg(scannedData.status)}>
                    {scannedData.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                <Separator />

                <div className="grid gap-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow icon={<Building2 className="size-3.5" />} label="Supplier" value={scannedData.supplierName} />
                    <InfoRow icon={<Ship className="size-3.5" />} label="Carrier" value={scannedData.carrier} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow label="Origin" value={scannedData.origin} />
                    <InfoRow label="Destination" value={scannedData.destination} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow icon={<Package className="size-3.5" />} label="Category" value={scannedData.category.replace(/_/g, " ")} />
                    <InfoRow icon={<Thermometer className="size-3.5" />} label="Temperature" value={scannedData.temperatureRegime.replace(/_/g, " ")} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow label="Products" value={String(scannedData.productCount)} />
                    <InfoRow label="Lots" value={String(scannedData.lotCount)} />
                  </div>
                  <InfoRow label="Condition" value={scannedData.condition} />
                  <InfoRow label="PO Number" value={scannedData.purchaseOrderNumber} />
                  <InfoRow label="Priority" value={scannedData.priority} />
                </div>

                <Separator />

                <div className="flex gap-2">
                  {canCreateShipment ? (
                    <Button size="xl" className="flex-1" onClick={() => onCreateShipment?.(scannedData.shipmentNumber)}>
                      Start Receiving
                    </Button>
                  ) : (
                    <Button size="xl" className="flex-1" disabled>
                      Start Receiving
                    </Button>
                  )}
                  <Button size="xl" variant="outline" className="flex-1" onClick={clearScan}>
                    New Scan
                  </Button>
                </div>
              </motion.div>
            ) : lastScannedCode ? (
              <motion.div
                key="not-found"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="size-5 text-warning" />
                    <span className="font-semibold text-foreground">{lastScannedCode}</span>
                  </div>
                  <Badge variant="outline">Not in LakeBase</Badge>
                </div>

                <Separator />

                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <Package className="size-10 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">No shipment found in LakeBase</p>
                    <p className="text-xs text-muted-foreground">This barcode was not found in the data lake. Start a new intake to create a shipment record.</p>
                  </div>
                </div>

                <Separator />

                {canCreateShipment ? (
                  <Button size="xl" className="w-full" onClick={() => onCreateShipment?.(lastScannedCode)}>
                    <Package className="size-4" />
                    Create New Shipment for {lastScannedCode}
                  </Button>
                ) : (
                  <Button size="xl" className="w-full" disabled>
                    <Package className="size-4" />
                    Create New Shipment for {lastScannedCode}
                  </Button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              >
                <Scan className="mb-3 size-12 opacity-30" />
                <p className="text-sm font-medium">No data scanned yet</p>
                <p className="text-xs">Scan a barcode or enter it manually to look up LakeBase shipment data</p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>

        {scannedData && (
          <CardFooter className="border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Scanned at {new Date().toLocaleTimeString()} &middot; Data from LakeBase
            </p>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground">{label}:</span>
      <span className="ml-auto font-medium capitalize text-foreground">{value}</span>
    </div>
  )
}

export { BarcodeScanner }
