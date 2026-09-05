"""
Primary battery cell models and chemistry-specific electrochemical characteristics.
"""

from abc import ABC, abstractmethod
import math
from typing import Tuple
from .models import BatterySpecification, BatteryChemistry


class AbstractBatteryCell(ABC):
    """
    Abstract base class for primary battery cells.
    Implements core electrochemical relationships:
    - OCV vs SoC characteristic
    - Ohmic and polarization resistances
    - Temperature derating via Arrhenius
    - Kinetic capacity effects
    """

    def __init__(self, spec: BatterySpecification):
        self.spec = spec
        self.current_passivation_r = spec.initial_passivation_resistance_ohm if spec.has_passivation else 0.0

    @abstractmethod
    def calculate_ocv(self, soc_normalized: float) -> float:
        """
        Calculate open circuit voltage given normalized SoC (0.0 to 1.0).
        """
        pass

    def get_temperature_resistance_factor(self, temp_c: float) -> float:
        """
        Calculates resistance multiplier based on ambient temperature deviation.
        Internal resistance increases sharply at low temperatures.
        """
        delta_t = self.spec.reference_temperature_c - temp_c
        # Percentage increase per degree C drop
        factor = 1.0 + (delta_t * (abs(self.spec.temp_resistance_coeff_pct) / 100.0))
        # Prevent non-physical or negative resistance
        return max(0.2, factor)

    def calculate_self_discharge_current_ma(self, temp_c: float) -> float:
        """
        Calculates equivalent self-discharge loss in mA using Arrhenius temperature scaling.
        """
        t_ref_k = self.spec.reference_temperature_c + 273.15
        t_cur_k = temp_c + 273.15
        r_gas = 8.314  # J/(mol*K)
        
        # Arrhenius acceleration factor
        exponent = (-self.spec.arrhenius_activation_energy_j_mol / r_gas) * ((1.0 / t_cur_k) - (1.0 / t_ref_k))
        arrhenius_factor = math.exp(max(-10.0, min(10.0, exponent)))

        # Base nominal loss per year converted to mA
        annual_loss_fraction = self.spec.self_discharge_annual_pct / 100.0
        base_current_ma = (self.spec.nominal_capacity_mah * annual_loss_fraction) / 8760.0  # 8760 hours in year
        return base_current_ma * arrhenius_factor

    def update_passivation(self, current_ma: float, dt_s: float) -> float:
        """
        Updates the LiCl / surface passivation film resistance over a time step.
        Returns the updated passivation resistance in Ohms.
        """
        if not self.spec.has_passivation:
            return 0.0

        # When current is drawn (> 0.2 mA), the passivation film breaks down rapidly
        if current_ma > 0.2:
            # Exponential electrochemical / mechanical breakdown under current flux
            rate = max(0.01, self.spec.passivation_breakdown_rate)
            decay_const = (current_ma / 10.0) * rate * 15.0
            decay = math.exp(-decay_const * dt_s)
            self.current_passivation_r = max(0.0, self.current_passivation_r * decay)
        else:
            # When idle or very low current, film slowly rebuilds toward max limit
            regrowth = self.spec.passivation_regrowth_rate * dt_s
            deficit = max(0.0, self.spec.max_passivation_resistance_ohm - self.current_passivation_r)
            self.current_passivation_r = min(
                self.spec.max_passivation_resistance_ohm,
                self.current_passivation_r + regrowth * (deficit / max(1.0, self.spec.max_passivation_resistance_ohm))
            )

        return self.current_passivation_r

    def calculate_peukert_effective_current(self, load_current_ma: float) -> float:
        """
        Rate-capacity effect: high currents deplete available primary capacity faster
        than the nominal low-current rating (Peukert equation).
        """
        ref_i = max(0.001, self.spec.reference_discharge_current_ma)
        if load_current_ma <= ref_i:
            return load_current_ma
        
        # Ratio of actual current to reference
        ratio = load_current_ma / ref_i
        # Effective current drained from battery charge reservoir
        effective_current = load_current_ma * math.pow(ratio, self.spec.peukert_coefficient - 1.0)
        return effective_current


class LiSOCl2Cell(AbstractBatteryCell):
    """
    Lithium Thionyl Chloride (Li-SOCl2) cell model.
    Key characteristics:
    - Very flat ~3.65V open-circuit voltage for ~90% of discharge
    - Sharp voltage drop off in final 8% of capacity
    - Prone to passivation voltage delay on radio transmission pulses
    - Extremely low self-discharge (1-2%/year)
    """

    def calculate_ocv(self, soc_normalized: float) -> float:
        soc = max(0.0, min(1.0, soc_normalized))
        nominal = self.spec.nominal_voltage_v

        # LiSOCl2 has an exceptionally flat discharge curve followed by a knee
        if soc > 0.95:
            # Initial slight high fresh cell voltage (up to 3.67V)
            return nominal + 0.02 * ((soc - 0.95) / 0.05)
        elif soc >= 0.15:
            # Flat plateau with very slight linear decline (~20 mV drop across plateau)
            return nominal - 0.03 * (1.0 - soc)
        elif soc >= 0.04:
            # Beginning of knee
            ratio = (0.15 - soc) / 0.11
            return (nominal - 0.03) - 0.55 * math.pow(ratio, 1.4)
        else:
            # Terminal depletion cliff down to cutoff
            ratio = max(0.0, (0.04 - soc) / 0.04)
            return (nominal - 0.58) - 1.2 * math.pow(ratio, 1.2)


class LiMnO2Cell(AbstractBatteryCell):
    """
    Lithium Manganese Dioxide (Li-MnO2) cell model (e.g. CR2032, CR123A).
    Key characteristics:
    - 3.0V nominal
    - Sloping discharge curve (3.1V fresh down to 2.4V)
    - Negligible passivation delay
    - Higher internal resistance than LiSOCl2 bobbin cells, but very stable
    """

    def calculate_ocv(self, soc_normalized: float) -> float:
        soc = max(0.0, min(1.0, soc_normalized))
        # Continuous sloping characteristic typical of solid-cathode intercalation
        if soc > 0.90:
            return 3.05 + 0.15 * ((soc - 0.90) / 0.10)
        elif soc >= 0.20:
            return 2.70 + 0.35 * ((soc - 0.20) / 0.70)
        else:
            return 2.00 + 0.70 * math.pow(soc / 0.20, 1.3)


class AlkalineCell(AbstractBatteryCell):
    """
    Alkaline Zinc-Manganese Dioxide (Zn-MnO2) cell model (AA, AAA).
    Key characteristics:
    - Nominal 1.5V
    - Continuous sloping discharge from 1.55V down to 0.9V cutoff
    - Internal resistance increases 5x - 10x as zinc anode oxidizes
    """

    def calculate_ocv(self, soc_normalized: float) -> float:
        soc = max(0.0, min(1.0, soc_normalized))
        # Standard sigmoidal/sloping profile for Alkaline
        return 0.88 + 0.65 * math.pow(soc, 0.7) + 0.05 * math.pow(soc, 3.0)


class GenericPrimaryCell(AbstractBatteryCell):
    """
    Generic primary cell adapting to arbitrary nominal voltage and cutoff specs.
    """

    def calculate_ocv(self, soc_normalized: float) -> float:
        soc = max(0.0, min(1.0, soc_normalized))
        v_nom = self.spec.nominal_voltage_v
        v_cut = self.spec.cutoff_voltage_v
        delta = v_nom - v_cut
        # Smooth curve from nominal + 3% down to cutoff
        return v_cut + delta * (0.85 * math.pow(soc, 0.45) + 0.15 * soc)


def create_cell_from_spec(spec: BatterySpecification) -> AbstractBatteryCell:
    """Factory function to instantiate chemistry-specific cell model."""
    chem = spec.chemistry
    if chem == BatteryChemistry.LITHIUM_THIONYL_CHLORIDE:
        return LiSOCl2Cell(spec)
    elif chem == BatteryChemistry.LITHIUM_MANGANESE_DIOXIDE:
        return LiMnO2Cell(spec)
    elif chem == BatteryChemistry.ALKALINE_ZN_MNO2:
        return AlkalineCell(spec)
    else:
        return GenericPrimaryCell(spec)
