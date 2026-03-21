import { Users, Wifi } from "lucide-react";
import { IconBadge } from "@/components/ui/icon-badge";

interface Props {
  totalClients: number;
  totalConnected: number;
}

const StatCard = ({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-[14px] p-4 flex items-start gap-3">
    <IconBadge variant="primary" size="md">
      <Icon className="w-[18px] h-[18px]" />
    </IconBadge>
    <div className="flex-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  </div>
);

const StatsCards = ({ totalClients, totalConnected }: Props) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <StatCard icon={Users} label="Clientes ativos">
      <p className="text-xl font-bold text-foreground">{totalClients}</p>
    </StatCard>
    <StatCard icon={Wifi} label="Instâncias conectadas">
      <p className="text-xl font-bold text-foreground">{totalConnected}</p>
    </StatCard>
  </div>
);

export default StatsCards;
