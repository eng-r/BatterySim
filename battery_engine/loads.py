"""
Electrical load profile generators, duty cycle parsers, and load converters.
"""

from abc import ABC, abstractmethod
from typing import List, Tuple, Optional
import math
from .models import LoadType, LoadSegment, ElectricalLoadProfile


class AbstractLoadProfile(ABC):
    """Abstract representation of an electrical load profile."""

    @abstractmethod
    def get_load_at_time(self, time_s: float) -> Tuple[LoadType, float, str, Optional[float]]:
        """
        Returns (load_type, value, segment_name, segment_temperature_c).
        """
        pass

    @abstractmethod
    def get_cycle_duration_s(self) -> float:
        """Total duration of a single repeating cycle."""
        pass


class DutyCycleProfile(AbstractLoadProfile):
    """
    Periodic or multi-phase load profile (e.g. IoT duty cycle: Sleep -> Read -> TX -> RX).
    """

    def __init__(self, profile: ElectricalLoadProfile):
        self.profile = profile
        if not profile.segments:
            # Fallback default segment
            self.segments = [
                LoadSegment("default", "Default Load", LoadType.CONSTANT_CURRENT, 1.0, 1.0)
            ]
        else:
            self.segments = profile.segments

        self._cycle_duration = sum(s.duration_s for s in self.segments)
        if self._cycle_duration <= 0.0:
            self._cycle_duration = 1.0

    def get_cycle_duration_s(self) -> float:
        return self._cycle_duration

    def get_load_at_time(self, time_s: float) -> Tuple[LoadType, float, str, Optional[float]]:
        if self.profile.is_periodic:
            t_within_cycle = time_s % self._cycle_duration
        else:
            t_within_cycle = min(time_s, self._cycle_duration - 1e-9)

        accumulated = 0.0
        for seg in self.segments:
            accumulated += seg.duration_s
            if t_within_cycle < accumulated or seg == self.segments[-1]:
                return seg.load_type, seg.value, seg.name, seg.temperature_c

        last = self.segments[-1]
        return last.load_type, last.value, last.name, last.temperature_c


class ConstantLoadProfile(AbstractLoadProfile):
    """Continuous constant current, constant power, or constant resistance."""

    def __init__(self, load_type: LoadType, value: float):
        self.load_type = load_type
        self.value = value

    def get_cycle_duration_s(self) -> float:
        return 1.0

    def get_load_at_time(self, time_s: float) -> Tuple[LoadType, float, str, Optional[float]]:
        return self.load_type, self.value, "Continuous Load", None


def convert_load_to_current_ma(
    load_type: LoadType,
    value: float,
    estimated_voltage_v: float
) -> float:
    """
    Converts constant current, constant power, or constant resistance to instantaneous current in mA.
    Handles low voltage clamps to avoid mathematical divergence.
    """
    v = max(0.1, estimated_voltage_v)

    if load_type == LoadType.CONSTANT_CURRENT:
        return max(0.0, value)
    elif load_type == LoadType.CONSTANT_POWER:
        # P = V * I  => I = P / V. Value is in mW, so I is in mA
        return max(0.0, value / v)
    elif load_type == LoadType.CONSTANT_RESISTANCE:
        # I = V / R. Value in Ohms, so V / R is in Amperes. Convert to mA (* 1000)
        r_ohm = max(0.01, value)
        return (v / r_ohm) * 1000.0
    else:
        return max(0.0, value)


def create_load_profile(profile_def: ElectricalLoadProfile) -> AbstractLoadProfile:
    return DutyCycleProfile(profile_def)
