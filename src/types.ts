export type BatteryChemistry =
  | "LITHIUM_THIONYL_CHLORIDE"
  | "LITHIUM_MANGANESE_DIOXIDE"
  | "ALKALINE_ZN_MNO2"
  | "ZINC_AIR"
  | "CUSTOM";

export type LoadType = "CONSTANT_CURRENT" | "CONSTANT_POWER" | "CONSTANT_RESISTANCE";

export interface BatterySpecification {
  id: string;
  name: string;
  chemistry: BatteryChemistry;
  nominal_voltage_v: number;
  nominal_capacity_mah: number;
  reference_discharge_current_ma: number;
  cutoff_voltage_v: number;

  // Equivalent Circuit Model (ECM)
  internal_resistance_ohm: number;
  r1_polarization_ohm: number;
  c1_polarization_f: number;
  r2_diffusion_ohm: number;
  c2_diffusion_f: number;

  // Kinetic & Rate Capacity (KiBaM)
  peukert_coefficient: number;
  kibam_c_ratio: number;
  kibam_k_rate: number;

  // Passivation Dynamics
  has_passivation: boolean;
  initial_passivation_resistance_ohm: number;
  max_passivation_resistance_ohm: number;
  passivation_breakdown_rate: number;
  passivation_regrowth_rate: number;

  // Temperature & Environmental
  reference_temperature_c: number;
  temp_resistance_coeff_pct: number;
  self_discharge_annual_pct: number;
  arrhenius_activation_energy_j_mol: number;
}

export interface LoadSegment {
  segment_id: string;
  name: string;
  load_type: LoadType;
  value: number; // mA, mW, or Ohms
  duration_s: number;
  temperature_c?: number;
}

export interface ElectricalLoadProfile {
  profile_id: string;
  name: string;
  is_periodic: boolean;
  repeat_count: number; // -1 for until cutoff
  max_simulation_time_s: number;
  segments: LoadSegment[];
}

export interface SimulationStepResult {
  time_s: number;
  dt_s: number;
  segment_name: string;
  current_ma: number;
  terminal_voltage_v: number;
  ocv_v: number;
  total_internal_resistance_ohm: number;
  passivation_resistance_ohm: number;
  consumed_capacity_mah: number;
  consumed_energy_mwh: number;
  soc_pct: number;
  soh_pct: number;
  temperature_c: number;
  cutoff_breached: boolean;
}

export interface SimulationReport {
  battery_id: string;
  battery_name: string;
  chemistry: string;
  nominal_capacity_mah: number;
  termination_reason: string;
  total_simulated_time_s: number;
  total_simulated_time_hours: number;
  total_simulated_time_days: number;
  total_simulated_time_years: number;
  remaining_useful_life_hours: number;
  remaining_useful_life_days: number;
  remaining_useful_life_years: number;
  total_cycles_completed: number;
  total_capacity_consumed_mah: number;
  total_energy_consumed_mwh: number;
  capacity_efficiency_pct: number;
  min_terminal_voltage_v: number;
  max_voltage_dip_v: number;
  final_soc_pct: number;
  final_soh_pct: number;
  average_current_ma: number;
  average_power_mw: number;
  time_series: SimulationStepResult[];
}

export type ActiveTab = "battery" | "load" | "results" | "cli" | "sensitivity";
