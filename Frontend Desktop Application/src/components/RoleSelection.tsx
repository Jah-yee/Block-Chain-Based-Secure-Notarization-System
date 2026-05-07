import { Shield } from "lucide-react";
import { Button } from "./ui/button";

interface RoleSelectionProps {
  onSelectRole: (role: "admin" | "notary") => void;
}

export function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A2540] via-[#0D1B2A] to-[#0A2540] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgxNiwgMTg1LCAxMjksIDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50"></div>

      <div className="relative z-10 w-full max-w-2xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/20 rounded-2xl mb-6 shadow-lg shadow-emerald-500/20">
            <Shield className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-emerald-400 mb-3">BBSNS Secure Notarization System</h1>
          <p className="text-gray-400">Select your role to continue</p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <button
            onClick={() => onSelectRole("admin")}
            className="group bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-8 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
          >
            <div className="w-16 h-16 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500/30 transition-all">
              <Shield className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-emerald-400 mb-2">Admin Login</h3>
            <p className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">Manage system and notaries</p>
          </button>

          <button
            onClick={() => onSelectRole("notary")}
            className="group bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-8 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 transition-all"
          >
            <div className="w-16 h-16 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition-all">
              <Shield className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-blue-400 mb-2">Notary Login</h3>
            <p className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">Process notarization requests</p>
          </button>
        </div>

        <div className="text-center">
          <p className="text-slate-700 text-[10px] font-bold uppercase tracking-[0.3em]">
            BBSNS Domain Authority | Cryptographic Root of Trust
          </p>
        </div>
      </div>
    </div>
  );
}
