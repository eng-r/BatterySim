"""
BatteryRUL Simulator - Primary Battery Modeling Engine
Electrochemical SoC, SoH, and RUL estimation under dynamic electrical loads.
"""

from .models import (
    BatteryChemistry,
    LoadType,
    TerminationReason,
    BatterySpecification,
    LoadSegment,
    ElectricalLoadProfile,
    SimulationStepResult,
    SimulationReport,
)
from .cell import (
    AbstractBatteryCell,
    LiSOCl2Cell,
    LiMnO2Cell,
    AlkalineCell,
    GenericPrimaryCell,
    create_cell_from_spec,
)
from .loads import (
    AbstractLoadProfile,
    DutyCycleProfile,
    ConstantLoadProfile,
    create_load_profile,
)
from .simulator import BatterySimulatorEngine
from .adapters import BatterySimulatorAdapter

__version__ = "1.0.0"
__all__ = [
    "BatteryChemistry",
    "LoadType",
    "TerminationReason",
    "BatterySpecification",
    "LoadSegment",
    "ElectricalLoadProfile",
    "SimulationStepResult",
    "SimulationReport",
    "AbstractBatteryCell",
    "LiSOCl2Cell",
    "LiMnO2Cell",
    "AlkalineCell",
    "GenericPrimaryCell",
    "create_cell_from_spec",
    "AbstractLoadProfile",
    "DutyCycleProfile",
    "ConstantLoadProfile",
    "create_load_profile",
    "BatterySimulatorEngine",
    "BatterySimulatorAdapter",
]
