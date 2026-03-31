import { Users, FileText, CheckCircle, Image, RefreshCw, TrendingUp, Activity, Loader2, Vote, Gavel, Plus, ExternalLink } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { useConfig } from "../../contexts/ConfigAuthority";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import api from "../../services/api";
import { toast } from "sonner";
import { ethers } from "ethers";
import { Button } from "../ui/button"; // Re-adding Button as it's used later

interface AdminDashboardProps {
  onNavigate?: (screen: string) => void;
  isDarkMode?: boolean;
}

export function AdminDashboard({ onNavigate, isDarkMode }: AdminDashboardProps) {
  const [data, setData] = useState({ users: [], documents: [] });
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartData, setChartData] = useState([]);
  const [isVoting, setIsVoting] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [users, documents, proposalsData] = await Promise.all([
        api.getUsers(),
        api.getDocuments(),
        api.getProposals()
      ]);
      setData({ users, documents });
      setProposals(proposalsData);

      // REAL ANALYTICS: Process chart data from documents
      const monthMap = new Map();
      documents.forEach((doc: any) => {
        const date = new Date(doc.created_at);
        const key = date.toLocaleString('default', { month: 'short' });
        monthMap.set(key, (monthMap.get(key) || 0) + 1);
      });

      const realChartData = Array.from(monthMap.entries()).map(([month, count]) => ({ month, count }));
      if (realChartData.length === 0) {
        // Fallback if empty
        setChartData([{ month: "Jan", count: 0 }, { month: "Today", count: 0 }]);
      } else {
        setChartData(realChartData);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch admin stats.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVote = async (proposalId: number, decision: 'approve' | 'reject') => {
    setIsVoting(proposalId)
    try {
      // 1. Check for Local Wallet (MetaMask)
      // @ts-ignore
      if (window.ethereum) {
        const now = Date.now();
        const message = `BBSNS Governance Vote\nProposal ID: ${proposalId}\nDecision: ${decision}\nTimestamp: ${now}`
        // @ts-ignore
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        // @ts-ignore
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, accounts[0]]
        })

        // Submit to Backend
        const data = await api.voteOnProposal(proposalId, decision, signature, now)
        if (data.executed) {
          toast.success("Proposal Executed! The threshold was met.")
        } else {
          toast.success("Vote recorded successfully")
        }
        fetchData()
        setIsVoting(null)
        return;
      }

      // 2. Fallback: Remote Signing (Electron Environment)
      console.log("[GOV-DASH] window.ethereum not found. Starting Remote Sign Handshake...");
      toast.info("Opening system browser for secure wallet audit...")

      const session = await api.request('/api/governance/remote/vote/session', {
        method: 'POST',
        body: JSON.stringify({ proposalId, decision })
      });

      const { config } = useConfig();
      const webAppUrl = `${config?.webAppUrl}/governance/remote-sign?sessionId=${session.sessionId}`;

      // Open System Browser
      // @ts-ignore
      if (window.electronAPI) {
        // @ts-ignore
        window.electronAPI.openExternal(webAppUrl);
      } else {
        window.open(webAppUrl, '_blank');
      }

      // 3. Polling for Completion
      let pollCount = 0;
      const pollMax = 60; // 2 minutes max
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const status = await api.request(`/api/governance/remote/vote/status/${session.sessionId}`);
          if (status.status === 'authorized') {
            clearInterval(pollInterval);
            toast.success("Audit handshake complete. Vote recorded.");
            setIsVoting(null);
            fetchData();
          } else if (status.status === 'expired' || status.status === 'failed') {
            clearInterval(pollInterval);
            toast.error("Handshake expired or failed.");
            setIsVoting(null);
          } else if (pollCount >= pollMax) {
            clearInterval(pollInterval);
            toast.error("Request timed out. Please try again.");
            setIsVoting(null);
          }
        } catch (e) {
          console.error("Poll Error:", e);
        }
      }, 2000);

    } catch (err: any) {
      toast.error(err.message || "Failed to submit vote")
      setIsVoting(null)
    }
  };

  const stats = [
    {
      label: "Total Users",
      value: data.users.length.toString(),
      icon: Users,
      color: "emerald",
      trend: "Live"
    },
    {
      label: "Pending Documents",
      value: data.documents.filter((d: any) => d.status === 'pending').length.toString(),
      icon: Activity,
      color: "yellow",
      trend: "Action Req"
    },
    {
      label: "Verified Records",
      value: data.documents.filter((d: any) => d.status === 'approved').length.toString(),
      icon: CheckCircle,
      color: "blue",
      trend: "On-Chain"
    },
    {
      label: "Active Proposals",
      value: proposals.filter((p: any) => p.status === 'active').length.toString(),
      icon: Gavel,
      color: "purple",
      trend: "Governance"
    },
  ];

  return (
    <div className="flex-1 bg-background overflow-auto">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-foreground mb-1">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Multisig Governance & Analytics</p>
          </div>
          <Button
            onClick={fetchData}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw size={16} className="mr-2" />}
            Refresh Stats
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            const colorMap: any = {
              emerald: "bg-primary/20 text-primary border-primary/20",
              yellow: "bg-yellow-500/20 text-yellow-500 border-yellow-500/20",
              blue: "bg-blue-500/20 text-blue-500 border-blue-500/20",
              purple: "bg-purple-500/20 text-purple-500 border-purple-500/20",
            };

            return (
              <Card
                key={stat.label}
                className="bg-card border-border rounded-xl p-6 hover:shadow-lg hover:shadow-primary/10 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${colorMap[stat.color]}`}>
                    <Icon size={24} />
                  </div>
                  <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-lg">
                    {stat.trend}
                  </span>
                </div>
                <h2 className="text-foreground mb-1">{isLoading ? "..." : stat.value}</h2>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </Card>
            );
          })}
        </div>

        {/* GOVERNANCE SECTION */}
        <div className="grid grid-cols-1 gap-6">
          {/* REAL ANALYTICS CHART */}
          <Card className="bg-card border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-foreground mb-1">System Traffic</h3>
                <p className="text-sm text-muted-foreground">Real Document Volume</p>
              </div>
              <Activity className="text-primary" size={24} />
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1f2330" : "#e2e8f0"} />
                  <XAxis dataKey="month" stroke={isDarkMode ? "#94a3b8" : "#64748b"} style={{ fontSize: '10px' }} />
                  <YAxis stroke={isDarkMode ? "#94a3b8" : "#64748b"} style={{ fontSize: '10px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
                      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      color: isDarkMode ? "#f1f5f9" : "#0f172a",
                      borderRadius: '12px',
                      border: '1px solid'
                    }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
