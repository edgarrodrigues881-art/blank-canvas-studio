import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface Preset {
  name: string;
  label: string;
  description: string;
  values: Record<string, any>;
}

const PRESETS: Preset[] = [
  {
    name: "light",
    label: "Leve",
    description: "Poucos envios, delays longos",
    values: {
      min_delay_seconds: 60,
      max_delay_seconds: 180,
      pause_after_messages_min: 3,
      pause_after_messages_max: 5,
      pause_duration_min: 300,
      pause_duration_max: 600,
      messages_per_cycle_min: 5,
      messages_per_cycle_max: 10,
      daily_limit_per_group: 10,
      daily_limit_total: 50,
    },
  },
  {
    name: "moderate",
    label: "Moderado",
    description: "Equilíbrio entre volume e naturalidade",
    values: {
      min_delay_seconds: 40,
      max_delay_seconds: 120,
      pause_after_messages_min: 5,
      pause_after_messages_max: 10,
      pause_duration_min: 180,
      pause_duration_max: 420,
      messages_per_cycle_min: 10,
      messages_per_cycle_max: 25,
      daily_limit_per_group: 30,
      daily_limit_total: 150,
    },
  },
  {
    name: "intense",
    label: "Intenso",
    description: "Alto volume, delays curtos",
    values: {
      min_delay_seconds: 15,
      max_delay_seconds: 60,
      pause_after_messages_min: 8,
      pause_after_messages_max: 15,
      pause_duration_min: 120,
      pause_duration_max: 300,
      messages_per_cycle_min: 20,
      messages_per_cycle_max: 50,
      daily_limit_per_group: 50,
      daily_limit_total: 300,
    },
  },
];

interface Props {
  onApply: (values: Record<string, any>) => void;
  current?: string;
}

export default function GIPresets({ onApply, current }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESETS.map((p) => (
        <Button
          key={p.name}
          size="sm"
          variant={current === p.name ? "default" : "outline"}
          className="gap-1.5 text-xs"
          onClick={() => onApply({ ...p.values, preset_name: p.name })}
        >
          <Zap className="w-3 h-3" />
          {p.label}
        </Button>
      ))}
    </div>
  );
}
