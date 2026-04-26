/**
 * CRM Style Guide - Componentes e Estilos Reutilizáveis
 * Define a identidade visual do CRM com cores vibrantes e design premium
 */

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

// ─── CORES E GRADIENTES ───
export const CRM_COLORS = {
  primary: "from-lime-500 to-lime-600",
  secondary: "from-blue-500 to-blue-600",
  accent: "from-purple-500 to-purple-600",
  success: "from-emerald-500 to-emerald-600",
  warning: "from-amber-500 to-amber-600",
  danger: "from-red-500 to-red-600",
  info: "from-cyan-500 to-cyan-600",
};

export const CRM_BG = {
  primary: "bg-lime-500/5",
  secondary: "bg-blue-500/5",
  accent: "bg-purple-500/5",
  success: "bg-emerald-500/5",
  warning: "bg-amber-500/5",
  danger: "bg-red-500/5",
  info: "bg-cyan-500/5",
};

export const CRM_BORDER = {
  primary: "border-lime-500/30",
  secondary: "border-blue-500/30",
  accent: "border-purple-500/30",
  success: "border-emerald-500/30",
  warning: "border-amber-500/30",
  danger: "border-red-500/30",
  info: "border-cyan-500/30",
};

// ─── TÍTULOS COM GRADIENTE ───
export function CrmPageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn(
      "text-4xl font-bold tracking-tight bg-gradient-to-r from-lime-500 via-blue-500 to-purple-500 bg-clip-text text-transparent",
      className
    )}>
      {children}
    </h1>
  );
}

export function CrmSectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn(
      "text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent",
      className
    )}>
      {children}
    </h2>
  );
}

// ─── BOTÕES COM CORES ───
export const BUTTON_VARIANTS = {
  primary: "bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-600 hover:to-lime-700 text-white shadow-lg shadow-lime-500/20",
  secondary: "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/20",
  accent: "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg shadow-purple-500/20",
  success: "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20",
  warning: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20",
  danger: "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/20",
  info: "bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white shadow-lg shadow-cyan-500/20",
};

// ─── CARDS PREMIUM ───
export const CARD_CLASSES = {
  base: "rounded-xl border-2 transition-all duration-300 hover:shadow-2xl",
  default: "border-border/50 bg-card hover:border-primary/30",
  premium: "border-2 bg-gradient-to-br from-card to-card/80 shadow-lg",
};

// ─── BADGES COM CORES ───
export const BADGE_VARIANTS = {
  primary: "bg-lime-500/15 text-lime-400 border-lime-500/20",
  secondary: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  accent: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/15 text-red-400 border-red-500/20",
  info: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
};

// ─── ANIMAÇÕES ───
export const ANIMATION_CLASSES = {
  fadeIn: "animate-in fade-in duration-500",
  slideUp: "animate-in slide-in-from-bottom-4 duration-500",
  scaleIn: "animate-in zoom-in duration-300",
};

// ─── UTILITÁRIOS ───
export function getColorByStatus(status: string): string {
  const statusMap: Record<string, string> = {
    novo: "from-blue-500 to-blue-600",
    respondeu: "from-cyan-500 to-cyan-600",
    interessado: "from-amber-500 to-amber-600",
    agendado: "from-indigo-500 to-indigo-600",
    negociacao: "from-purple-500 to-purple-600",
    fechado: "from-emerald-500 to-emerald-600",
    perdido: "from-red-500 to-red-600",
    ativo: "from-emerald-500 to-emerald-600",
    inativo: "from-slate-500 to-slate-600",
  };
  return statusMap[status] || "from-slate-500 to-slate-600";
}

export function getBackgroundByStatus(status: string): string {
  const statusMap: Record<string, string> = {
    novo: "bg-blue-500/5",
    respondeu: "bg-cyan-500/5",
    interessado: "bg-amber-500/5",
    agendado: "bg-indigo-500/5",
    negociacao: "bg-purple-500/5",
    fechado: "bg-emerald-500/5",
    perdido: "bg-red-500/5",
    ativo: "bg-emerald-500/5",
    inativo: "bg-slate-500/5",
  };
  return statusMap[status] || "bg-slate-500/5";
}

export function getBorderByStatus(status: string): string {
  const statusMap: Record<string, string> = {
    novo: "border-blue-500/30",
    respondeu: "border-cyan-500/30",
    interessado: "border-amber-500/30",
    agendado: "border-indigo-500/30",
    negociacao: "border-purple-500/30",
    fechado: "border-emerald-500/30",
    perdido: "border-red-500/30",
    ativo: "border-emerald-500/30",
    inativo: "border-slate-500/30",
  };
  return statusMap[status] || "border-slate-500/30";
}
