import React, { useState } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Clock,
  Repeat,
  Download,
  Upload,
  Layers,
  ArrowRight,
  Info,
  Check,
  ChevronDown,
} from "lucide-react";
import { ElectricalLoadProfile, LoadSegment, LoadType } from "../types";
import { LOAD_PRESETS } from "../data/presets";

interface LoadProfileViewProps {
  load: ElectricalLoadProfile;
  setLoad: (l: ElectricalLoadProfile) => void;
  nominalVoltageV: number;
}

export const LoadProfileView: React.FC<LoadProfileViewProps> = ({
  load,
  setLoad,
  nominalVoltageV,
}) => {
  const updateSegment = (index: number, updated: Partial<LoadSegment>) => {
    const newSegments = [...load.segments];
    newSegments[index] = { ...newSegments[index], ...updated };
    setLoad({ ...load, segments: newSegments });
  };

  const addSegment = () => {
    const newSeg: LoadSegment = {
      segment_id: `seg_${Date.now()}`,
      name: `Segment ${load.segments.length + 1}`,
      load_type: "CONSTANT_CURRENT",
      value: 10.0,
      duration_s: 1.0,
    };
    setLoad({ ...load, segments: [...load.segments, newSeg] });
  };

  const removeSegment = (index: number) => {
    if (load.segments.length <= 1) {
      alert("A load profile must contain at least one segment.");
      return;
    }
    const newSegments = load.segments.filter((_, i) => i !== index);
    setLoad({ ...load, segments: newSegments });
  };

  const exportLoadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(load, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${load.profile_id || "load_profile"}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setLoad(parsed);
      } catch (err) {
        alert("Invalid JSON format in load profile file.");
      }
    };
    reader.readAsText(file);
  };

  // Compute profile summary statistics
  const totalDurationS = load.segments.reduce((acc, s) => acc + s.duration_s, 0);
  const totalCapacityPerCycleMah = load.segments.reduce((acc, s) => {
    let curMa = s.value;
    if (s.load_type === "CONSTANT_POWER") curMa = s.value / Math.max(0.1, nominalVoltageV);
    else if (s.load_type === "CONSTANT_RESISTANCE") curMa = (Math.max(0.1, nominalVoltageV) / Math.max(0.1, s.value)) * 1000.0;
    return acc + (curMa * s.duration_s) / 3600.0;
  }, 0);

  const averageCurrentMa = totalDurationS > 0 ? (totalCapacityPerCycleMah / (totalDurationS / 3600.0)) : 0;
  const maxCurrentMa = Math.max(
    ...load.segments.map((s) => {
      if (s.load_type === "CONSTANT_POWER") return s.value / Math.max(0.1, nominalVoltageV);
      if (s.load_type === "CONSTANT_RESISTANCE") return (Math.max(0.1, nominalVoltageV) / Math.max(0.1, s.value)) * 1000.0;
      return s.value;
    })
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md">
              Electrical Load & Duty Cycle Profile
            </span>
            <span className="text-xs font-mono text-slate-600">ID: {load.profile_id}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{load.name}</h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Design multi-stage sleep, sensor sampling, radio transmission (TX/RX), and peak pulse bursts.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <label
            htmlFor="upload-load-json"
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
            <input
              id="upload-load-json"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleJsonUpload}
            />
          </label>
          <button
            id="btn-export-load-json"
            onClick={exportLoadJson}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Preset Chips */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Standard IoT Load Profiles
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(LOAD_PRESETS).map(([key, item]) => {
            const isSelected = load.profile_id === item.profile_id;
            return (
              <button
                key={key}
                onClick={() => setLoad(item)}
                className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-violet-50/80 border-violet-400 text-violet-900 shadow-xs ring-1 ring-violet-400"
                    : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate">{item.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
                  <span>{item.segments.length} segments</span>
                  <span className="font-mono">
                    {item.segments.reduce((a, s) => a + s.duration_s, 0) >= 3600
                      ? `${(item.segments.reduce((a, s) => a + s.duration_s, 0) / 3600).toFixed(1)} hr cycle`
                      : `${item.segments.reduce((a, s) => a + s.duration_s, 0).toFixed(1)} s cycle`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cycle Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cycle Duration</span>
          <p className="text-xl font-bold text-slate-900 mt-0.5">
            {totalDurationS >= 3600
              ? `${(totalDurationS / 3600).toFixed(2)} hrs`
              : `${totalDurationS.toFixed(1)} s`}
          </p>
          <span className="text-[11px] text-slate-500 font-mono">{totalDurationS.toLocaleString()} seconds</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Peak Pulse Current</span>
          <p className="text-xl font-bold text-violet-600 mt-0.5">{maxCurrentMa.toFixed(1)} mA</p>
          <span className="text-[11px] text-slate-500">Highest transient segment</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Average Continuous Drain</span>
          <p className="text-xl font-bold text-slate-900 mt-0.5">
            {averageCurrentMa < 1.0
              ? `${(averageCurrentMa * 1000.0).toFixed(1)} µA`
              : `${averageCurrentMa.toFixed(2)} mA`}
          </p>
          <span className="text-[11px] text-slate-500 font-mono">{(averageCurrentMa * nominalVoltageV).toFixed(3)} mW avg power</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Capacity / Cycle</span>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{totalCapacityPerCycleMah.toFixed(4)} mAh</p>
          <span className="text-[11px] text-slate-500">Excluding self-discharge</span>
        </div>
      </div>

      {/* Visual Duty Cycle Timeline */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
            <Clock className="w-4 h-4 text-violet-600" />
            <span>Duty Cycle Timeline Visualization</span>
          </h3>
          <span className="text-xs text-slate-500">Total: {totalDurationS}s</span>
        </div>

        {/* Proportional Segment Bar */}
        <div className="h-10 w-full bg-slate-100 rounded-xl overflow-hidden flex border border-slate-200/80 p-1 space-x-1">
          {load.segments.map((seg, idx) => {
            const widthPct = Math.max(8, Math.min(60, (seg.duration_s / totalDurationS) * 100));
            const colors = [
              "bg-indigo-600 text-white",
              "bg-violet-500 text-white",
              "bg-amber-500 text-white",
              "bg-emerald-600 text-white",
              "bg-sky-600 text-white",
            ];
            const colorClass = colors[idx % colors.length];

            return (
              <div
                key={seg.segment_id}
                style={{ flexGrow: Math.max(1, Math.round(seg.duration_s)) }}
                className={`${colorClass} rounded-lg flex items-center justify-between px-2.5 text-[11px] font-semibold overflow-hidden transition-all shadow-2xs`}
                title={`${seg.name}: ${seg.value} ${seg.load_type === "CONSTANT_CURRENT" ? "mA" : seg.load_type === "CONSTANT_POWER" ? "mW" : "Ω"} (${seg.duration_s}s)`}
              >
                <span className="truncate">{seg.name}</span>
                <span className="shrink-0 text-[10px] opacity-90 font-mono ml-1">{seg.duration_s}s</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Segments Table Editor */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-violet-600" />
              <span>Duty Cycle Load Segments</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sequentially executed stages within each operating period.
            </p>
          </div>

          <button
            id="btn-add-segment"
            onClick={addSegment}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Segment</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">Segment Name</th>
                <th className="py-3 px-4 w-48">Load Type</th>
                <th className="py-3 px-4 w-36">Value</th>
                <th className="py-3 px-4 w-36">Duration (s)</th>
                <th className="py-3 px-4 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {load.segments.map((seg, idx) => (
                <tr key={seg.segment_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={seg.name}
                      onChange={(e) => updateSegment(idx, { name: e.target.value })}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={seg.load_type}
                      onChange={(e) => updateSegment(idx, { load_type: e.target.value as LoadType })}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="CONSTANT_CURRENT">Constant Current (mA)</option>
                      <option value="CONSTANT_POWER">Constant Power (mW)</option>
                      <option value="CONSTANT_RESISTANCE">Constant Resistance (Ω)</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      step="any"
                      value={seg.value}
                      onChange={(e) => updateSegment(idx, { value: parseFloat(e.target.value) || 0 })}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={seg.duration_s}
                      onChange={(e) => updateSegment(idx, { duration_s: parseFloat(e.target.value) || 0.1 })}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500"
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => removeSegment(idx)}
                      disabled={load.segments.length <= 1}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors p-1"
                      title="Delete segment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Profile Execution Rules */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <Repeat className="w-4 h-4 text-violet-600" />
          <span>Profile Execution Limits</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-800">Periodic Loop</span>
              <p className="text-[11px] text-slate-500">Repeat cycle periodically</p>
            </div>
            <input
              id="checkbox-is-periodic"
              type="checkbox"
              checked={load.is_periodic}
              onChange={(e) => setLoad({ ...load, is_periodic: e.target.checked })}
              className="w-4 h-4 text-violet-600 rounded-sm focus:ring-violet-500"
            />
          </div>

          <div>
            <label htmlFor="input-repeat-count" className="block text-xs font-semibold text-slate-700 mb-1">
              Repeat Cycles (-1 for until cutoff)
            </label>
            <input
              id="input-repeat-count"
              type="number"
              value={load.repeat_count}
              onChange={(e) => setLoad({ ...load, repeat_count: parseInt(e.target.value) || -1 })}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Set to -1 to run full longevity mission simulation.</p>
          </div>

          <div>
            <label htmlFor="input-max-sim-time" className="block text-xs font-semibold text-slate-700 mb-1">
              Max Simulation Horizon (Years)
            </label>
            <input
              id="input-max-sim-time"
              type="number"
              step="1"
              value={Number((load.max_simulation_time_s / (3600 * 24 * 365.25)).toFixed(1))}
              onChange={(e) =>
                setLoad({
                  ...load,
                  max_simulation_time_s: (parseFloat(e.target.value) || 10) * 3600 * 24 * 365.25,
                })
              }
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Cap simulation time in years (e.g. 10 or 15 yrs).</p>
          </div>
        </div>
      </div>
    </div>
  );
};
