import { Moon, Sun, Globe, Key, FileText, ExternalLink, Settings as SettingsIcon, Shield, Bell } from "lucide-react";
import { useConfig } from "../../contexts/ConfigAuthority";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";

interface SettingsProps {
}

export function Settings({ }: SettingsProps) {
  const { config } = useConfig();
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e]">
      {/* Header */}
      <div className="flex-none border-b border-border bg-background/95 backdrop-blur-sm z-20 shadow-sm p-8 pt-12 pb-6">
        <div>
          <h1 className="text-foreground mb-1 tracking-tight">System Settings</h1>
          <p className="text-sm text-muted-foreground">Configure application preferences and system parameters</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 pb-24 custom-scrollbar">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="bg-muted/50 border border-border/50 p-1.5 rounded-2xl mb-8 flex justify-start w-fit">
            <TabsTrigger value="general" className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:text-foreground transition-all">
              <SettingsIcon size={14} className="mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:text-foreground transition-all">
              <Shield size={14} className="mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:text-foreground transition-all">
              <Bell size={14} className="mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="network" className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:text-foreground transition-all">
              <Globe size={14} className="mr-2" />
              Network
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:text-foreground transition-all">
              <FileText size={14} className="mr-2" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* GENERAL TAB */}
          <TabsContent value="general" className="space-y-6 outline-none">
            {/* App Info */}
            <Card className="bg-card border-border overflow-hidden rounded-2xl">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-black uppercase tracking-tighter text-foreground">Application Information</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Version</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Current application version</p>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black uppercase tracking-widest">
                      v27.8.20
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Build Date</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Last compilation timestamp</p>
                    </div>
                    <span className="text-xs font-black text-foreground uppercase tracking-tight">October 16, 2024</span>
                  </div>
                  <div className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Platform</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Runtime environment</p>
                    </div>
                    <span className="text-xs font-black text-foreground uppercase tracking-tight">Electron + Node.js</span>
                  </div>
                </div>
              </CardContent>
            </Card>


          </TabsContent>

          {/* SECURITY TAB */}
          <TabsContent value="security" className="space-y-6 outline-none">
            <Card className="bg-card border-border rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-black uppercase tracking-tighter text-foreground">Security Infrastructure</CardTitle>
              </CardHeader>
              <CardContent className="p-12 text-center">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Shield className="text-primary" size={48} />
                  </div>
                  <p className="text-muted-foreground font-medium max-w-xs uppercase tracking-widest text-[10px] font-black opacity-60">
                    On-chain security monitoring and Multi-Sig threshold advanced options are currently under cryptographic lock.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* NOTIFICATIONS TAB */}
          <TabsContent value="notifications" className="space-y-6 outline-none">
            <Card className="bg-card border-border rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-black uppercase tracking-tighter text-foreground">Notification Relays</CardTitle>
              </CardHeader>
              <CardContent className="p-12 text-center">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="p-4 bg-amber-500/10 rounded-full">
                    <Bell className="text-amber-500" size={48} />
                  </div>
                  <p className="text-muted-foreground font-medium max-w-xs uppercase tracking-widest text-[10px] font-black opacity-60">
                    No active notification channels or webhooks configured for this administrative instance.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* NETWORK TAB */}
          <TabsContent value="network" className="space-y-6 outline-none">
            <Card className="bg-card border-border rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-black uppercase tracking-tighter text-foreground">Blockchain Immutable Anchor</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 flex items-start gap-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0 mt-0.5">
                    <Globe className="text-blue-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-blue-400 mb-1 font-black uppercase tracking-widest">Hard-Coded Network Peg</p>
                    <p className="text-[10px] text-blue-300/80 font-medium uppercase tracking-tight leading-relaxed">
                      This application is cryptographically pegged to the BNB Smart Chain ecosystem. Manual network selection is disabled for protocol integrity.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/30 rounded-2xl border border-border">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Target Network</p>
                    <p className="text-sm text-foreground font-black uppercase tracking-tighter">BNB Smart Chain</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-2xl border border-border">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Active Chain ID</p>
                    <p className="text-sm text-foreground font-mono font-bold tracking-widest">{config?.chainId || "97"}</p>
                  </div>
                </div>

                <div className="p-4 bg-muted/30 rounded-2xl border border-border group transition-all hover:border-primary/20">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Multi-Sig Logic Hub</p>
                  <p className="text-sm text-primary font-mono font-bold break-all opacity-80 group-hover:opacity-100 transition-opacity tracking-tighter">
                    {config?.contracts.multisig || "0x..."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LOGS TAB */}
          <TabsContent value="logs" className="space-y-6 outline-none">
            <Card className="bg-card border-border rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-black uppercase tracking-tighter text-foreground">Forensic Audit Trail</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  <div className="flex items-center justify-between p-6 hover:bg-muted/10 transition-colors">
                    <div>
                      <p className="text-xs font-black text-foreground uppercase tracking-widest">Verbose Forensic View</p>
                      <p className="text-[10px] text-muted-foreground font-medium mt-1 uppercase tracking-tight opacity-60">Expose raw stack traces and internal metadata in the UI</p>
                    </div>
                    <Switch />
                  </div>

                  <div className="flex items-center justify-between p-6 hover:bg-muted/10 transition-colors">
                    <div>
                      <p className="text-xs font-black text-foreground uppercase tracking-widest">Log Retention Policy</p>
                      <p className="text-[10px] text-muted-foreground font-medium mt-1 uppercase tracking-tight opacity-60">Control the lifecycle of local audit fragments</p>
                    </div>
                    <Select defaultValue="30">
                      <SelectTrigger className="w-40 bg-muted/50 border-border text-foreground rounded-xl h-10 text-[10px] font-black uppercase tracking-widest">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground rounded-xl">
                        <SelectItem value="7">Purge Weekly</SelectItem>
                        <SelectItem value="30">Purge Monthly</SelectItem>
                        <SelectItem value="90">Purge Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-6 bg-muted/10">
                  <Button variant="outline" className="w-full bg-card border-border text-muted-foreground hover:bg-muted rounded-xl h-12 font-black uppercase tracking-[0.2em] text-[10px] shadow-sm">
                    <FileText size={14} className="mr-3 text-primary" />
                    Secure Export Audit Trail
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
