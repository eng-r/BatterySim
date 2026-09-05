"""
Standard industry battery cell presets and typical IoT load profiles.
"""

from typing import Dict
from .models import (
    BatterySpecification,
    BatteryChemistry,
    ElectricalLoadProfile,
    LoadSegment,
    LoadType,
)

# Standard Battery Cell Presets
BATTERY_PRESETS: Dict[str, BatterySpecification] = {
    "lisocl2_saft_ls14500": BatterySpecification(
        id="lisocl2_saft_ls14500",
        name="Saft LS14500 (Li-SOCl2 AA 3.6V Bobbin)",
        chemistry=BatteryChemistry.LITHIUM_THIONYL_CHLORIDE,
        nominal_voltage_v=3.65,
        nominal_capacity_mah=2600.0,
        reference_discharge_current_ma=2.0,
        cutoff_voltage_v=2.0,
        internal_resistance_ohm=2.8,
        r1_polarization_ohm=1.8,
        c1_polarization_f=1.5,
        r2_diffusion_ohm=2.2,
        c2_diffusion_f=12.0,
        peukert_coefficient=1.05,
        kibam_c_ratio=0.85,
        kibam_k_rate=1.8e-4,
        has_passivation=True,
        initial_passivation_resistance_ohm=4.5,
        max_passivation_resistance_ohm=25.0,
        passivation_breakdown_rate=0.35,
        passivation_regrowth_rate=0.0003,
        reference_temperature_c=25.0,
        temp_resistance_coeff_pct=-1.2,
        self_discharge_annual_pct=1.0,
        arrhenius_activation_energy_j_mol=54000.0,
    ),
    "lisocl2_saft_lsh14_spiral": BatterySpecification(
        id="lisocl2_saft_lsh14_spiral",
        name="Saft LSH14 (Li-SOCl2 C-Size 3.6V Spiral High-Pulse)",
        chemistry=BatteryChemistry.LITHIUM_THIONYL_CHLORIDE,
        nominal_voltage_v=3.65,
        nominal_capacity_mah=5800.0,
        reference_discharge_current_ma=15.0,
        cutoff_voltage_v=2.0,
        internal_resistance_ohm=0.35,
        r1_polarization_ohm=0.25,
        c1_polarization_f=4.0,
        r2_diffusion_ohm=0.45,
        c2_diffusion_f=25.0,
        peukert_coefficient=1.03,
        kibam_c_ratio=0.90,
        kibam_k_rate=3.5e-4,
        has_passivation=True,
        initial_passivation_resistance_ohm=0.8,
        max_passivation_resistance_ohm=5.0,
        passivation_breakdown_rate=0.40,
        passivation_regrowth_rate=0.0002,
        reference_temperature_c=25.0,
        temp_resistance_coeff_pct=-0.9,
        self_discharge_annual_pct=1.5,
        arrhenius_activation_energy_j_mol=52000.0,
    ),
    "lisocl2_tadiran_tl5903": BatterySpecification(
        id="lisocl2_tadiran_tl5903",
        name="Tadiran TL-5903 (Li-SOCl2 1/2AA 3.6V Bobbin)",
        chemistry=BatteryChemistry.LITHIUM_THIONYL_CHLORIDE,
        nominal_voltage_v=3.65,
        nominal_capacity_mah=1200.0,
        reference_discharge_current_ma=1.0,
        cutoff_voltage_v=2.0,
        internal_resistance_ohm=5.5,
        r1_polarization_ohm=3.2,
        c1_polarization_f=0.8,
        r2_diffusion_ohm=4.0,
        c2_diffusion_f=8.0,
        peukert_coefficient=1.06,
        kibam_c_ratio=0.80,
        kibam_k_rate=1.4e-4,
        has_passivation=True,
        initial_passivation_resistance_ohm=7.0,
        max_passivation_resistance_ohm=30.0,
        passivation_breakdown_rate=0.30,
        passivation_regrowth_rate=0.0004,
        reference_temperature_c=25.0,
        temp_resistance_coeff_pct=-1.3,
        self_discharge_annual_pct=1.2,
        arrhenius_activation_energy_j_mol=53000.0,
    ),
    "limno2_cr2032": BatterySpecification(
        id="limno2_cr2032",
        name="Panasonic CR2032 (Li-MnO2 Coin 3.0V)",
        chemistry=BatteryChemistry.LITHIUM_MANGANESE_DIOXIDE,
        nominal_voltage_v=3.0,
        nominal_capacity_mah=225.0,
        reference_discharge_current_ma=0.2,
        cutoff_voltage_v=2.0,
        internal_resistance_ohm=30.0,
        r1_polarization_ohm=45.0,
        c1_polarization_f=0.1,
        r2_diffusion_ohm=80.0,
        c2_diffusion_f=2.0,
        peukert_coefficient=1.12,
        kibam_c_ratio=0.70,
        kibam_k_rate=8.0e-5,
        has_passivation=False,
        initial_passivation_resistance_ohm=0.0,
        max_passivation_resistance_ohm=0.0,
        passivation_breakdown_rate=0.0,
        passivation_regrowth_rate=0.0,
        reference_temperature_c=25.0,
        temp_resistance_coeff_pct=-0.9,
        self_discharge_annual_pct=1.0,
        arrhenius_activation_energy_j_mol=48000.0,
    ),
    "limno2_cr123a": BatterySpecification(
        id="limno2_cr123a",
        name="Energizer CR123A (Li-MnO2 Cylindrical 3.0V)",
        chemistry=BatteryChemistry.LITHIUM_MANGANESE_DIOXIDE,
        nominal_voltage_v=3.0,
        nominal_capacity_mah=1500.0,
        reference_discharge_current_ma=20.0,
        cutoff_voltage_v=2.0,
        internal_resistance_ohm=0.35,
        r1_polarization_ohm=0.5,
        c1_polarization_f=2.5,
        r2_diffusion_ohm=1.2,
        c2_diffusion_f=20.0,
        peukert_coefficient=1.04,
        kibam_c_ratio=0.88,
        kibam_k_rate=3.0e-4,
        has_passivation=False,
        initial_passivation_resistance_ohm=0.0,
        max_passivation_resistance_ohm=0.0,
        passivation_breakdown_rate=0.0,
        passivation_regrowth_rate=0.0,
        reference_temperature_c=25.0,
        temp_resistance_coeff_pct=-0.8,
        self_discharge_annual_pct=0.8,
        arrhenius_activation_energy_j_mol=46000.0,
    ),
    "alkaline_energizer_e91_aa": BatterySpecification(
        id="alkaline_energizer_e91_aa",
        name="Energizer E91 (Alkaline AA 1.5V)",
        chemistry=BatteryChemistry.ALKALINE_ZN_MNO2,
        nominal_voltage_v=1.5,
        nominal_capacity_mah=2800.0,
        reference_discharge_current_ma=25.0,
        cutoff_voltage_v=0.9,
        internal_resistance_ohm=0.25,
        r1_polarization_ohm=0.8,
        c1_polarization_f=1.5,
        r2_diffusion_ohm=2.5,
        c2_diffusion_f=15.0,
        peukert_coefficient=1.22,
        kibam_c_ratio=0.65,
        kibam_k_rate=6.0e-5,
        has_passivation=False,
        initial_passivation_resistance_ohm=0.0,
        max_passivation_resistance_ohm=0.0,
        passivation_breakdown_rate=0.0,
        passivation_regrowth_rate=0.0,
        reference_temperature_c=25.0,
        temp_resistance_coeff_pct=-1.1,
        self_discharge_annual_pct=3.0,
        arrhenius_activation_energy_j_mol=58000.0,
    ),
}

# Standard IoT Load Profiles
LOAD_PRESETS: Dict[str, ElectricalLoadProfile] = {
    "nbiot_asset_tracker": ElectricalLoadProfile(
        profile_id="nbiot_asset_tracker",
        name="NB-IoT Asset Tracker (Hourly Periodic TX)",
        is_periodic=True,
        repeat_count=-1,
        max_simulation_time_s=3.1536e8,  # 10 years
        segments=[
            LoadSegment("s1", "Deep Sleep PSM", LoadType.CONSTANT_CURRENT, value=0.0035, duration_s=3595.0), # 3.5 uA
            LoadSegment("s2", "GPS Cold Fix", LoadType.CONSTANT_CURRENT, value=25.0, duration_s=2.5),
            LoadSegment("s3", "NB-IoT Transmit +23dBm", LoadType.CONSTANT_CURRENT, value=75.0, duration_s=1.5),
            LoadSegment("s4", "NB-IoT Receive Window", LoadType.CONSTANT_CURRENT, value=25.0, duration_s=1.0),
        ]
    ),
    "lorawan_smart_meter": ElectricalLoadProfile(
        profile_id="lorawan_smart_meter",
        name="LoRaWAN Smart Water Meter (SF10 EU868)",
        is_periodic=True,
        repeat_count=-1,
        max_simulation_time_s=4.7304e8,  # 15 years
        segments=[
            LoadSegment("s1", "Ultra-Low Power Sleep", LoadType.CONSTANT_CURRENT, value=0.002, duration_s=1797.0), # 2 uA
            LoadSegment("s2", "Hall Sensor Pulse Read", LoadType.CONSTANT_CURRENT, value=1.2, duration_s=0.5),
            LoadSegment("s3", "LoRa TX +14dBm (SF10)", LoadType.CONSTANT_CURRENT, value=38.0, duration_s=1.8),
            LoadSegment("s4", "RX1 / RX2 Windows", LoadType.CONSTANT_CURRENT, value=12.0, duration_s=0.7),
        ]
    ),
    "ble_sensor_beacon": ElectricalLoadProfile(
        profile_id="ble_sensor_beacon",
        name="BLE Environmental Beacon (1-second Interval)",
        is_periodic=True,
        repeat_count=-1,
        max_simulation_time_s=1.5768e8,  # 5 years
        segments=[
            LoadSegment("s1", "Sleep State", LoadType.CONSTANT_CURRENT, value=0.0018, duration_s=0.985), # 1.8 uA
            LoadSegment("s2", "I2C Sensor Sampling", LoadType.CONSTANT_CURRENT, value=2.8, duration_s=0.005),
            LoadSegment("s3", "BLE ADV Advertising Pulse", LoadType.CONSTANT_CURRENT, value=15.0, duration_s=0.010),
        ]
    ),
    "continuous_emergency_beacon": ElectricalLoadProfile(
        profile_id="continuous_emergency_beacon",
        name="Continuous Search & Rescue Radio (Constant Load)",
        is_periodic=True,
        repeat_count=-1,
        max_simulation_time_s=604800.0, # 7 days
        segments=[
            LoadSegment("s1", "Continuous Strobe & Radio Pulse", LoadType.CONSTANT_CURRENT, value=45.0, duration_s=1.0),
        ]
    ),
}


def get_battery_preset(preset_key: str) -> BatterySpecification:
    if preset_key not in BATTERY_PRESETS:
        raise KeyError(f"Unknown battery preset '{preset_key}'. Available: {list(BATTERY_PRESETS.keys())}")
    return BATTERY_PRESETS[preset_key]


def get_load_preset(preset_key: str) -> ElectricalLoadProfile:
    if preset_key not in LOAD_PRESETS:
        raise KeyError(f"Unknown load preset '{preset_key}'. Available: {list(LOAD_PRESETS.keys())}")
    return LOAD_PRESETS[preset_key]
