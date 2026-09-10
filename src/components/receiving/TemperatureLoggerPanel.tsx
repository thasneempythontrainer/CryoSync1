import { useState, useEffect, useRef } from "react"
import {
  Thermometer,
  Plus,
  Upload,
  Radio,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/toast"
import { useShipment, useAddShipmentLogger, useUploadShipmentReadings } from "@/services"
import type { RawTemperatureReading } from "@/services/shipment-service"
import { TEMPERATURE_REGIMES } from "@/constants/enterprise"
import { formatDateTime, formatTemperature } from "@/utils/formatters"

function parseTemperatureCsv(text: string): RawTemperatureReading[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const hasHeader = /timestamp|datetime|date|time/i.test(lines[0])
  const rows: RawTemperatureReading[] = []
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim())
    if (cols.length < 2) continue
    const temp = Number(cols[1])
    if (Number.isNaN(temp)) continue
    rows.push({
      timestamp: cols[0] || undefined,
      temperature: temp,
      location: cols[2] || undefined,
    })
  }
  return rows
}

function TemperatureLoggerPanel({ shipmentId }: { shipmentId: string }) {
  const { data: shipment } = useShipment(shipmentId)
  const addLogger = useAddShipmentLogger()
  const upload = useUploadShipmentReadings()

  const [loggerId, setLoggerId] = useState("")
  const [loggerModel, setLoggerModel] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<RawTemperatureReading[] | null>(null)
  const [liveOn, setLiveOn] = useState(false)
  const [liveTemp, setLiveTemp] = useState<number | null>(null)
  const [liveExcursion, setLiveExcursion] = useState(false)
  const liveTimer = useRef<number | null>(null)
  const lastTemp = useRef<number | null>(null)

  const readings = shipment?.temperatureReadings ?? []
  const loggers = shipment?.loggers ?? []
  const regime = shipment?.temperatureRegime ?? "refrigerated_2_8"
  const regimeInfo = TEMPERATURE_REGIMES.find((r) => r.id === regime)
  const activeLoggerId = loggers[0]?.id ?? "LOGGER-DEMO"

  useEffect(() => {
    return () => {
      if (liveTimer.current) {
        window.clearInterval(liveTimer.current)
        liveTimer.current = null
      }
    }
  }, [])

  function handleConnect() {
    const id = loggerId.trim()
    if (!id) return
    addLogger.mutate(
      { id: shipmentId, data: { loggerId: id, model: loggerModel.trim() } },
      {
        onSuccess: () => {
          setLoggerId("")
          setLoggerModel("")
          toast.add({
            title: "Logger Connected",
            description: `${id} is now linked to this shipment.`,
            type: "success",
          })
        },
        onError: () => {
          toast.add({
            title: "Connection Failed",
            description: "Unable to connect the logger. Try again.",
            type: "error",
          })
        },
      },
    )
  }

  function handleFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseTemperatureCsv(String(reader.result ?? ""))
      setCsvFile(file)
      setCsvPreview(rows)
    }
    reader.readAsText(file)
  }

  function handleUpload() {
    if (!csvPreview || csvPreview.length === 0) return
    upload.mutate(
      { id: shipmentId, data: { loggerId: activeLoggerId, readings: csvPreview } },
      {
        onSuccess: (res) => {
          setCsvFile(null)
          setCsvPreview(null)
          toast.add({
            title: res.excursions > 0 ? "Excursions Detected" : "Readings Uploaded",
            description:
              res.excursions > 0
                ? `${res.added} readings stored, ${res.excursions} outside the ${regimeInfo?.label ?? ""} range.`
                : `${res.added} readings stored for ${activeLoggerId}.`,
            type: res.excursions > 0 ? "warning" : "success",
          })
        },
        onError: () => {
          toast.add({
            title: "Upload Failed",
            description: "Unable to store the readings. Try again.",
            type: "error",
          })
        },
      },
    )
  }

  function startLive() {
    const base = regimeInfo ? (regimeInfo.min + regimeInfo.max) / 2 : 4
    lastTemp.current = lastTemp.current ?? base
    setLiveTemp(lastTemp.current)
    setLiveExcursion(false)
    setLiveOn(true)
    liveTimer.current = window.setInterval(() => {
      const prev = lastTemp.current ?? base
      let t = prev + (Math.random() - 0.5) * 0.8
      if (Math.random() < 0.06) {
        t += (Math.random() < 0.5 ? -1 : 1) * 6
      }
      lastTemp.current = t
      const excursion = regimeInfo ? t < regimeInfo.min || t > regimeInfo.max : false
      setLiveTemp(t)
      setLiveExcursion(excursion)
      upload.mutate({
        id: shipmentId,
        data: {
          loggerId: activeLoggerId,
          readings: [{ timestamp: new Date().toISOString(), temperature: Math.round(t * 100) / 100 }],
        },
      })
    }, 2500)
  }

  function stopLive() {
    if (liveTimer.current) {
      window.clearInterval(liveTimer.current)
      liveTimer.current = null
    }
    setLiveOn(false)
  }

  const chartData = readings
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-120)

  const minThreshold = regimeInfo?.min
  const maxThreshold = regimeInfo?.max

  return (
    <div className="space-y-5">
      {liveOn && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
            liveExcursion
              ? "border-danger/30 bg-danger/10"
              : "border-success/30 bg-success/10"
          }`}
        >
          <Radio className={`size-4 animate-pulse ${liveExcursion ? "text-danger" : "text-success"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Live — {formatTemperature(liveTemp ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Streaming from {activeLoggerId} every 2.5s
            </p>
          </div>
          {liveExcursion && (
            <Badge variant="outline" className="border-danger/30 bg-danger/10 text-danger">
              <AlertTriangle className="size-3" />
              Excursion
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={stopLive}>
            Stop
          </Button>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-3.5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Temperature Trace</p>
          </div>
          <Badge variant="outline">{regimeInfo?.label ?? regime}</Badge>
        </div>
        <div className="h-44 rounded-lg border border-border/60 p-2">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No readings yet — upload a logger file or start the live demo.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="timestamp"
                  fontSize={10}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val: string) => {
                    const d = new Date(val)
                    return Number.isNaN(d.getTime())
                      ? ""
                      : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  }}
                  minTickGap={28}
                />
                <YAxis
                  fontSize={10}
                  className="fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  domain={["dataMin - 2", "dataMax + 2"]}
                  tickFormatter={(val: number) => `${val}°`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--color-popover-foreground)",
                  }}
                  labelFormatter={(val: unknown) => formatDateTime(String(val))}
                  formatter={(value: unknown) => formatTemperature(Number(value))}
                />
                {minThreshold !== undefined && (
                  <ReferenceLine
                    y={minThreshold}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={1.2}
                  />
                )}
                {maxThreshold !== undefined && (
                  <ReferenceLine
                    y={maxThreshold}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={1.2}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="temperature"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name="Temperature"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            Connected Loggers
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({loggers.length})
            </span>
          </p>
        </div>
        {loggers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
            No loggers linked yet. Connect the serial number on the device that shipped with this
            load.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/60">
            {loggers.map((logger) => (
              <li key={logger.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Thermometer className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium text-foreground">
                    {logger.id}
                    {logger.model ? ` · ${logger.model}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {logger.readingCount} readings · last{" "}
                    {formatDateTime(logger.lastReadingAt)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    logger.status === "uploaded"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-info/30 bg-info/10 text-info"
                  }
                >
                  {logger.status === "uploaded" ? "Uploaded" : "Connected"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Input
            value={loggerId}
            onChange={(e) => setLoggerId(e.target.value)}
            placeholder="Logger serial (e.g. LOGGER-0042)"
            className="h-10 min-w-44 flex-1"
          />
          <Input
            value={loggerModel}
            onChange={(e) => setLoggerModel(e.target.value)}
            placeholder="Model (optional)"
            className="h-10 w-36"
          />
          <Button size="sm" onClick={handleConnect} disabled={!loggerId.trim() || addLogger.isPending}>
            {addLogger.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Connect
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Upload Logger Data</p>
        <p className="text-xs text-muted-foreground">
          CSV columns: <code className="rounded bg-muted px-1 py-0.5">timestamp,temperature</code>{" "}
          with optional <code className="rounded bg-muted px-1 py-0.5">,location</code>. USB readers,
          BLE downloads, and cloud exports can all be imported here.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          id="logger-csv-input"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("logger-csv-input")?.click()}
          >
            <Upload className="size-4" />
            {csvFile ? csvFile.name : "Choose CSV file"}
          </Button>
          {csvPreview && (
            <>
              <span className="text-xs text-muted-foreground">
                {csvPreview.length} reading{csvPreview.length !== 1 ? "s" : ""} parsed
              </span>
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={csvPreview.length === 0 || upload.isPending}
              >
                {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Upload to {activeLoggerId}
              </Button>
            </>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Live Tracking</p>
        <p className="text-xs text-muted-foreground">
          Simulated telemetry stream for demo. In production this is where a cloud-connected logger
          (or dock reader) pushes readings every few seconds.
        </p>
        <Button
          variant={liveOn ? "outline" : "default"}
          size="sm"
          onClick={liveOn ? stopLive : startLive}
          disabled={!shipment}
        >
          <Radio className="size-4" />
          {liveOn ? "Stop live stream" : "Start live demo"}
        </Button>
      </div>
    </div>
  )
}

export { TemperatureLoggerPanel }
