export { apiClient } from './api'
export type { ApiClient } from './api'

export {
  getDashboardData,
  refreshDashboard,
  useDashboardData,
  useDashboardKPIs,
  useDashboardCharts,
} from './dashboard-service'
export type { DashboardFilters } from './dashboard-service'

export {
  getShipments,
  getShipmentById,
  createShipment,
  updateShipmentStatus,
  updateShipment,
  addShipmentLogger,
  uploadShipmentReadings,
  deleteShipment,
  useShipments,
  useShipment,
  useCreateShipment,
  useUpdateShipmentStatus,
  useUpdateShipment,
  useAddShipmentLogger,
  useUploadShipmentReadings,
  useDeleteShipment,
} from './shipment-service'
export type { ShipmentListParams, LoggerInput, RawTemperatureReading, ReadingsUploadInput } from './shipment-service'

export {
  getComplianceIncidents,
  getComplianceIncidentById,
  createComplianceIncident,
  resolveIncident,
  assignIncident,
  getAuditLog,
  useComplianceIncidents,
  useComplianceIncident,
  useResolveIncident,
  useAssignIncident,
  useCreateComplianceIncident,
} from './compliance-service'
export type { ComplianceListParams, ReportIncidentData, ResolveIncidentData, AssignIncidentData } from './compliance-service'

export {
  getInventoryLots,
  getInventoryLotById,
  getStorageZones,
  useInventoryLots,
  useStorageZones,
} from './inventory-service'
export type { InventoryListParams } from './inventory-service'

export {
  getConversations,
  getConversation,
  createConversation,
  saveAgentContext,
  deleteConversation,
  useConversations,
  useConversation,
  useCreateConversation,
  useDeleteConversation,
} from './genie-service'

export {
  getSystemHealth,
  getSystemLogs,
  useSystemHealth,
  useSystemLogs,
} from './system-service'
export type { SystemLogsParams } from './system-service'

export {
  getFacilities,
  getProducts,
  getSuppliers,
  getUsers,
  useFacilities,
  useProducts,
  useSuppliers,
  useUsers,
} from './reference-service'

export { scanTemperatureIncidents, resolveAllOpenIncidents } from './ai-service'
export type {
  TempIncidentScanParams,
  TempIncidentScanSummary,
  TempIncidentScanResult,
  ResolveOpenIncidentsParams,
  ResolveOpenIncidentsResult,
} from './ai-service'

export { agentChat, runAgentTurn } from './agent-service'
export { allAgentTools, toHandlerDefinitions } from './agent-tools'
export type { AgentToolsDeps } from './agent-tools'

export { login, fetchMe, logout } from './auth-service'


