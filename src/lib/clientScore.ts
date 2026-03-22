/**
 * Score Interno do Cliente
 * 
 * Pontuação de 0-100 (maior = melhor)
 * - Pagamentos atrasados (ciclos pendentes): -15 cada
 * - Suspensões anteriores (logs toggle-status → suspended): -20 cada
 * - Flag de risco manual: -30
 * - Descontos frequentes (ciclos com amount < preço base): -5 cada
 * 
 * Classificação:
 * - Verde (≥ 70): Bom pagador
 * - Amarelo (40-69): Instável  
 * - Vermelho (< 40): Alto risco
 */

export interface ScoreInput {
  risk_flag: boolean;
  cycles: Array<{ status: string; cycle_amount: number; plan_name: string }>;
  admin_logs: Array<{ action: string; details: string | null }>;
}

const PLAN_PRICES: Record<string, number> = {
  Essencial: 89.9,
  Start: 159.9,
  Pro: 349.9,
  Scale: 549.9,
  Elite: 999.9,
};

export type ScoreLevel = "green" | "yellow" | "red";

export interface ClientScore {
  score: number;
  level: ScoreLevel;
  label: string;
  breakdown: { label: string; penalty: number }[];
}

export function calculateClientScore(input: ScoreInput): ClientScore {
  let score = 100;
  const breakdown: { label: string; penalty: number }[] = [];

  // 1. Risk flag
  if (input.risk_flag) {
    score -= 30;
    breakdown.push({ label: "Flag de risco manual", penalty: -30 });
  }

  // 2. Pending/overdue cycles
  const pendingCycles = input.cycles.filter(c => c.status === "pending").length;
  if (pendingCycles > 0) {
    const penalty = pendingCycles * 15;
    score -= penalty;
    breakdown.push({ label: `${pendingCycles} ciclo(s) pendente(s)`, penalty: -penalty });
  }

  // 3. Previous suspensions
  const suspensions = input.admin_logs.filter(
    l => l.action === "toggle-status" && l.details?.includes("suspended")
  ).length;
  if (suspensions > 0) {
    const penalty = suspensions * 20;
    score -= penalty;
    breakdown.push({ label: `${suspensions} suspensão(ões) anterior(es)`, penalty: -penalty });
  }

  // 4. Frequent discounts
  const discountedCycles = input.cycles.filter(c => {
    const basePrice = PLAN_PRICES[c.plan_name] || 0;
    return basePrice > 0 && Number(c.cycle_amount) < basePrice;
  }).length;
  if (discountedCycles > 0) {
    const penalty = discountedCycles * 5;
    score -= penalty;
    breakdown.push({ label: `${discountedCycles} ciclo(s) com desconto`, penalty: -penalty });
  }

  score = Math.max(0, Math.min(100, score));

  const level: ScoreLevel = score >= 70 ? "green" : score >= 40 ? "yellow" : "red";
  const label = level === "green" ? "Bom pagador" : level === "yellow" ? "Instável" : "Alto risco";

  return { score, level, label, breakdown };
}

export const scoreColors: Record<ScoreLevel, { bg: string; text: string; dot: string }> = {
  green: { bg: "bg-green-500/15", text: "text-green-500", dot: "bg-green-500" },
  yellow: { bg: "bg-yellow-500/15", text: "text-yellow-500", dot: "bg-yellow-500" },
  red: { bg: "bg-destructive/15", text: "text-destructive", dot: "bg-destructive" },
};
