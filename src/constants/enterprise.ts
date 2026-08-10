export const CARRIERS = [
  'DHL PharmaTrans', 'FedEx ColdCare', 'UPS Healthcare', 'Marken',
  'World Courier', 'DB Schenker Pharma', 'CEVA ColdChain', 'DSV Panalpina',
]

export const TEMPERATURE_REGIMES = [
  { id: 'ambient', label: 'Ambient', min: 15, max: 25, color: 'slate' },
  { id: 'refrigerated_2_8', label: '2°C to 8°C', min: 2, max: 8, color: 'blue' },
  { id: 'frozen_minus_20', label: '-20°C', min: -25, max: -15, color: 'cyan' },
  { id: 'ultra_frozen_minus_80', label: '-80°C', min: -85, max: -65, color: 'violet' },
  { id: 'liquid_nitrogen', label: 'Liquid Nitrogen (-196°C)', min: -200, max: -180, color: 'purple' },
]

export const PRODUCT_CATEGORIES = [
  { id: 'pcr_reagents', label: 'PCR Reagents' },
  { id: 'dna_extraction_kits', label: 'DNA Extraction Kits' },
  { id: 'rna_isolation_kits', label: 'RNA Isolation Kits' },
  { id: 'elisa_kits', label: 'ELISA Kits' },
  { id: 'diagnostic_test_kits', label: 'Diagnostic Test Kits' },
  { id: 'cryogenic_vials', label: 'Cryogenic Vials' },
  { id: 'cell_culture_media', label: 'Cell Culture Media' },
  { id: 'monoclonal_antibodies', label: 'Monoclonal Antibodies' },
  { id: 'vaccines', label: 'Vaccines' },
  { id: 'insulin_products', label: 'Insulin Products' },
  { id: 'blood_collection_tubes', label: 'Blood Collection Tubes' },
  { id: 'biologics', label: 'Biologics' },
  { id: 'laboratory_chemicals', label: 'Laboratory Chemicals' },
  { id: 'reference_standards', label: 'Reference Standards' },
  { id: 'cold_chain_medicines', label: 'Cold Chain Medicines' },
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
