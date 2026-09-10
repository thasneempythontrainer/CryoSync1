export const CARRIERS = [
  'StemCyte Branch Courier', 'World Courier', 'DHL Medical Express',
  'FedEx Clinical Logistics', 'Blue Dart Healthcare', 'Local Branch Transfer',
]

export const TEMPERATURE_REGIMES = [
  { id: 'ambient', label: 'Ambient', min: 15, max: 25, color: 'slate' },
  { id: 'refrigerated_2_8', label: '2°C to 8°C', min: 2, max: 8, color: 'blue' },
  { id: 'frozen_minus_20', label: '-20°C', min: -25, max: -15, color: 'cyan' },
  { id: 'ultra_frozen_minus_80', label: '-80°C', min: -85, max: -65, color: 'violet' },
  { id: 'liquid_nitrogen', label: 'Liquid Nitrogen (-196°C)', min: -200, max: -180, color: 'purple' },
]

export const PRODUCT_CATEGORIES = [
  { id: 'hybrid_banking', label: 'Hybrid Cord Blood Banking' },
  { id: 'univercell_banking', label: 'UniverCell Banking' },
  { id: 'cord_blood_unit', label: 'Cord Blood Unit' },
  { id: 'maternal_sample', label: 'Maternal Sample' },
  { id: 'test_report', label: 'Laboratory Test Report' },
  { id: 'cellular_therapy_release', label: 'Clinical Release' },
]

export const DEVIATION_TYPES = [
  { id: 'temperature_excursion', label: 'Temperature Excursion' },
  { id: 'documentation_gap', label: 'Documentation Gap' },
  { id: 'quality_deviation', label: 'Quality Deviation' },
  { id: 'chain_of_custody_break', label: 'Chain of Custody Break' },
  { id: 'storage_violation', label: 'Storage Violation' },
  { id: 'labeling_error', label: 'Labeling Error' },
  { id: 'contamination_suspected', label: 'Contamination (Suspected)' },
  { id: 'equipment_malfunction', label: 'Equipment Malfunction' },
  { id: 'human_error', label: 'Human Error' },
  { id: 'packaging_failure', label: 'Packaging Failure' },
]
