"""
Data models, enums, and dataclasses for primary battery modeling and simulation.
"""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import List, Dict, Any, Optional
import json


class BatteryChemistry(str, Enum):
    LITHIUM_THIONYL_CHLORIDE = "LITHIUM_THIONYL_CHLORIDE"  # Li-SOCl2 (e.g., Saft LS14500, Tadiran TL5903)
    LITHIUM_MANGANESE_DIOXIDE = "LITHIUM_MANGANESE_DIOXIDE"  # Li-MnO2 (e.g., CR2032, CR123A)
    ALKALINE_ZN_MNO2 = "ALKALINE_ZN_MNO2"                   # Zn-MnO2 (e.g., standard AA / AAA)
    ZINC_AIR = "ZINC_AIR"                                   # Zn-Air (hearing aids, high energy density)
    CUSTOM = "CUSTOM"


class LoadType(str, Enum):
    CONSTANT_CURRENT = "CONSTANT_CURRENT"      # Value in mA
    CONSTANT_POWER = "CONSTANT_POWER"          # Value in mW
    CONSTANT_RESISTANCE = "CONSTANT_RESISTANCE"# Value in Ohms


class TerminationReason(str, Enum):
    CUTOFF_VOLTAGE_REACHED = "CUTOFF_VOLTAGE_REACHED"
    CAPACITY_EXHAUSTED = "CAPACITY_EXHAUSTED"
    PROFILE_COMPLETED = "PROFILE_COMPLETED"
    MAX_SIM_TIME_REACHED = "MAX_SIM_TIME_REACHED"
    VOLTAGE_COLLAPSE = "VOLTAGE_COLLAPSE"


@dataclass
class BatterySpecification:
    id: str = "custom_cell_01"
    name: str = "Generic Primary Cell"
    chemistry: BatteryChemistry = BatteryChemistry.LITHIUM_THIONYL_CHLORIDE
    nominal_voltage_v: float = 3.65
    nominal_capacity_mah: float = 2600.0
    reference_discharge_current_ma: float = 2.0
    cutoff_voltage_v: float = 2.0

    # Equivalent Circuit Model (ECM) parameters
    internal_resistance_ohm: float = 15.0       # Ohmic R0
    r1_polarization_ohm: float = 25.0           # Charge-transfer R1
    c1_polarization_f: float = 0.5              # Double-layer capacitance C1
    r2_diffusion_ohm: float = 40.0              # Mass diffusion R2
    c2_diffusion_f: float = 8.0                 # Mass diffusion capacitance C2

    # Kinetic & Rate Capacity (KiBaM / Peukert)
    peukert_coefficient: float = 1.08           # Rate effect (>1.0 reduces effective capacity at high currents)
    kibam_c_ratio: float = 0.75                 # Available charge fraction
    kibam_k_rate: float = 1.2e-4                # Inter-well exchange coefficient (1/s)

    # Passivation layer dynamics (crucial for Li-SOCl2)
    has_passivation: bool = True
    initial_passivation_resistance_ohm: float = 35.0  # Initial LiCl film resistance
    max_passivation_resistance_ohm: float = 200.0     # Deep passivation limit
    passivation_breakdown_rate: float = 0.05          # Ohms broken down per mA*s
    passivation_regrowth_rate: float = 0.002          # Ohms rebuilt per second when idle (<0.1 mA)

    # Environmental & Self-Discharge
    reference_temperature_c: float = 25.0
    temp_resistance_coeff_pct: float = -1.2          # % increase in resistance per deg C drop below reference
    self_discharge_annual_pct: float = 1.5           # Typical 1-2% for LiSOCl2 at 25°C
    arrhenius_activation_energy_j_mol: float = 52000.0

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["chemistry"] = self.chemistry.value if isinstance(self.chemistry, BatteryChemistry) else str(self.chemistry)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BatterySpecification":
        cleaned = dict(data)
        if "chemistry" in cleaned and isinstance(cleaned["chemistry"], str):
            try:
                cleaned["chemistry"] = BatteryChemistry(cleaned["chemistry"])
            except ValueError:
                cleaned["chemistry"] = BatteryChemistry.CUSTOM

        # Map common shorthand or alternate property aliases
        alias_map = {
            "r1": "r1_polarization_ohm",
            "c1": "c1_polarization_f",
            "r2": "r2_diffusion_ohm",
            "c2": "c2_diffusion_f",
            "initial_r_pass": "initial_passivation_resistance_ohm",
            "max_r_pass": "max_passivation_resistance_ohm",
            "passivation_breakdown_coeff": "passivation_breakdown_rate",
            "passivation_growth_rate": "passivation_regrowth_rate",
        }
        for alias, target in alias_map.items():
            if alias in cleaned and target not in cleaned:
                cleaned[target] = cleaned[alias]

        return cls(**{k: v for k, v in cleaned.items() if k in cls.__dataclass_fields__})


@dataclass
class LoadSegment:
    segment_id: str
    name: str
    load_type: LoadType
    value: float              # mA, mW, or Ohms
    duration_s: float          # seconds
    temperature_c: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["load_type"] = self.load_type.value if isinstance(self.load_type, LoadType) else str(self.load_type)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LoadSegment":
        cleaned = dict(data)
        if "load_type" in cleaned and isinstance(cleaned["load_type"], str):
            cleaned["load_type"] = LoadType(cleaned["load_type"])
        # Support both 'value' and 'load_value'
        if "value" not in cleaned and "load_value" in cleaned:
            cleaned["value"] = cleaned["load_value"]
        elif "value" not in cleaned:
            cleaned["value"] = 0.0
        return cls(**{k: v for k, v in cleaned.items() if k in cls.__dataclass_fields__})


@dataclass
class ElectricalLoadProfile:
    profile_id: str = "profile_01"
    name: str = "Standard Profile"
    is_periodic: bool = True
    repeat_count: int = -1     # -1 indicates run until battery depletion/cutoff
    max_simulation_time_s: float = 3.1536e8  # 10 years cap
    segments: List[LoadSegment] = field(default_factory=list)

    @property
    def cycle_duration_s(self) -> float:
        return sum(s.duration_s for s in self.segments)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "name": self.name,
            "is_periodic": self.is_periodic,
            "repeat_count": self.repeat_count,
            "max_simulation_time_s": self.max_simulation_time_s,
            "cycle_duration_s": self.cycle_duration_s,
            "segments": [s.to_dict() for s in self.segments],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ElectricalLoadProfile":
        segments_raw = data.get("segments", [])
        segments = [LoadSegment.from_dict(s) if isinstance(s, dict) else s for s in segments_raw]
        return cls(
            profile_id=data.get("profile_id", "custom_profile"),
            name=data.get("name", "Custom Profile"),
            is_periodic=data.get("is_periodic", True),
            repeat_count=data.get("repeat_count", -1),
            max_simulation_time_s=data.get("max_simulation_time_s", 3.1536e8),
            segments=segments,
        )


@dataclass
class SimulationStepResult:
    time_s: float
    dt_s: float
    segment_name: str
    current_ma: float
    terminal_voltage_v: float
    ocv_v: float
    total_internal_resistance_ohm: float
    passivation_resistance_ohm: float
    consumed_capacity_mah: float
    consumed_energy_mwh: float
    soc_pct: float
    soh_pct: float
    temperature_c: float
    cutoff_breached: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SimulationReport:
    battery_id: str
    battery_name: str
    chemistry: str
    nominal_capacity_mah: float
    termination_reason: str
    total_simulated_time_s: float
    total_simulated_time_hours: float
    total_simulated_time_days: float
    total_simulated_time_years: float
    remaining_useful_life_hours: float
    remaining_useful_life_days: float
    remaining_useful_life_years: float
    total_cycles_completed: int
    total_capacity_consumed_mah: float
    total_energy_consumed_mwh: float
    capacity_efficiency_pct: float
    min_terminal_voltage_v: float
    max_voltage_dip_v: float
    final_soc_pct: float
    final_soh_pct: float
    average_current_ma: float
    average_power_mw: float
    time_series: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self, include_timeseries: bool = True) -> Dict[str, Any]:
        res = asdict(self)
        if not include_timeseries:
            res.pop("time_series", None)
        return res
