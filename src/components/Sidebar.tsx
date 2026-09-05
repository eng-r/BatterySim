import React from "react";
import {
  BatteryCharging,
  Zap,
  LineChart,
  Terminal,
  Thermometer,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { ActiveTab, SimulationReport } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  report: SimulationReport | null;
  batteryName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  report,
  batteryName,
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: "battery",
      label: "Battery Spec",
      icon: <BatteryCharging className="w-5 h-5" />,
    },
    {
      id: "load",
      label: "Load Profile",
      icon: <Zap className="w-5 h-5" />,
    },
    {
      id: "results",
      label: "Simulation Results",
      icon: <LineChart className="w-5 h-5" />,
      badge: report ? `${report.total_simulated_time_years}y` : undefined,
    },
    {
      id: "motor",
      label: "DC Motor Lab (150°C)",
      icon: <Cpu className="w-5 h-5" />,
      badge: "150°C",
    },
    {
      id: "cli",
      label: "Python CLI & Adaptor",
      icon: <Terminal className="w-5 h-5" />,
      badge: "OOP",
    },
    {
      id: "sensitivity",
      label: "Temp Sensitivity",
      icon: <Thermometer className="w-5 h-5" />,
    },
  ];

  return (
    <aside
      id="app-sidebar"
      className="w-72 bg-white border-r border-slate-200/90 flex flex-col justify-between shrink-0 h-screen sticky top-0 shadow-sm select-none"
    >
      {/* Brand Header */}
      <div>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-violet-200">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 tracking-tight text-lg">BatteryRUL</span>
                <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Engine
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">Primary Cell Modeling</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="px-4 py-6 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Workspace
          </div>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-violet-50 text-violet-700 font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={isActive ? "text-violet-600" : "text-slate-600"}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? "bg-violet-200/80 text-violet-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Telemetry Quick Status Widget */}
      <div className="p-4 m-4 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-violet-500/20 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Active Cell
          </span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
        <p className="text-sm font-semibold text-white truncate mb-3">{batteryName}</p>

        {report && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Projected Life:</span>
              <span className="font-semibold text-emerald-400">
                {report.total_simulated_time_years} Years
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Cycles:</span>
              <span className="font-mono text-slate-200">
                {report.total_cycles_completed.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Efficiency:</span>
              <span className="font-semibold text-violet-300">
                {report.capacity_efficiency_pct}%
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => setActiveTab("results")}
          className="mt-3.5 w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
        >
          <span>View Telemetry</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
