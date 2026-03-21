import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Server, Clock, Shield, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AdminInfra = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ccfsxwmvgyxsoscofqoh";
  const tickUrl = `https://${projectId}.supabase.co/functions/v1/warmup-tick`;

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copiado!" });
  };

  const testTick = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("warmup-tick", {
        body: { action: "tick" },
        headers: { "x-internal-secret": "TEST_FROM_ADMIN" },
      });
      if (error) {
        setTestResult({ error: error.message || "Unauthorized (expected if secret mismatch)" });
      } else {
        setTestResult(data);
      }
    } catch (e: any) {
      setTestResult({ error: e.message });
    }
    setTesting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Server size={20} className="text-primary" />
        <h2 className="text-lg font-bold text-foreground">Infraestrutura do Motor de Aquecimento</h2>
        <Badge variant="outline" className="text-[10px]">DOCS</Badge>
      </div>

      {/* Endpoints */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Endpoints Internos</h3>

        <div className="space-y-3">
          {/* Tick */}
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-teal-500/15 text-teal-400 border-teal-500/30 text-[10px]">POST</Badge>
              <span className="text-sm font-mono text-foreground">/functions/v1/warmup-tick</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Processa até 50 jobs pendentes (run_at ≤ now). Deve ser chamado por um scheduler externo (cron) a cada 1-5 minutos.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase font-medium w-16">URL</span>
                <code className="text-[11px] bg-background px-2 py-1 rounded border border-border flex-1 text-foreground truncate">{tickUrl}</code>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyText(tickUrl, "url")}>
                  {copied === "url" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase font-medium w-16">Header</span>
                <code className="text-[11px] bg-background px-2 py-1 rounded border border-border flex-1 text-foreground">x-internal-secret: ●●●●●●●●</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase font-medium w-16">Body</span>
                <code className="text-[11px] bg-background px-2 py-1 rounded border border-border flex-1 text-foreground">
                  {`{"action": "tick"}`}
                </code>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyText(`{"action": "tick"}`, "body")}>
                  {copied === "body" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </Button>
              </div>
            </div>
          </div>

          {/* Daily */}
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">POST</Badge>
              <span className="text-sm font-mono text-foreground">/functions/v1/warmup-tick</span>
              <Badge variant="outline" className="text-[9px]">action: daily</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Força daily_reset para todos os ciclos ativos. Opcional — o motor já agenda daily_reset automaticamente via jobs. Use apenas como fallback.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground uppercase font-medium w-16">Body</span>
              <code className="text-[11px] bg-background px-2 py-1 rounded border border-border flex-1 text-foreground">
                {`{"action": "daily"}`}
              </code>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyText(`{"action": "daily"}`, "daily-body")}>
                {copied === "daily-body" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Response Format */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Formato da Resposta (tick)</h3>
        <pre className="text-xs text-foreground bg-background p-3 rounded border border-border overflow-x-auto">
{`{
  "ok": true,
  "processed_jobs_count": 12,
  "succeeded": 11,
  "failed": 1,
  "next_pending_run_at": "2025-03-06T15:30:00Z"
}`}
        </pre>
      </div>

      {/* Security */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Segurança</h3>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>O endpoint valida o header <code className="text-foreground">x-internal-secret</code> contra a env var <code className="text-foreground">INTERNAL_TICK_SECRET</code>.</li>
          <li>Sem header válido, retorna <Badge variant="destructive" className="text-[9px] ml-1">401</Badge></li>
          <li>Utiliza <code className="text-foreground">SUPABASE_SERVICE_ROLE_KEY</code> internamente para processar jobs de todos os usuários.</li>
          <li>Nunca exponha o secret no frontend ou em logs.</li>
        </ul>
      </div>

      {/* Cron Setup Guide */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Configuração do Scheduler</h3>
        </div>
        <p className="text-xs text-muted-foreground">Configure um scheduler externo (cron job) para chamar o endpoint de tick periodicamente:</p>

        <div className="space-y-2">
          <div className="bg-muted/30 rounded p-3 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Opção 1: Cron-job.org / EasyCron</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Frequência: <strong className="text-foreground">a cada 2 minutos</strong> (recomendado)</li>
              <li>Método: POST</li>
              <li>Headers: <code className="text-foreground">x-internal-secret</code> + <code className="text-foreground">Content-Type: application/json</code></li>
              <li>Body: <code className="text-foreground">{`{"action":"tick"}`}</code></li>
            </ul>
          </div>

          <div className="bg-muted/30 rounded p-3 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Opção 2: Make (Integromat)</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Trigger: Schedule → a cada 2 minutos</li>
              <li>Módulo: HTTP → POST para a URL acima</li>
              <li>Configurar headers e body conforme acima</li>
            </ul>
          </div>

          <div className="bg-muted/30 rounded p-3 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Opção 3: GitHub Actions / Vercel Cron</p>
            <p className="text-xs text-muted-foreground">Qualquer scheduler que suporte POST com headers customizados.</p>
          </div>
        </div>
      </div>

      {/* Test */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Teste Manual</h3>
        <p className="text-xs text-muted-foreground">
          Clique para enviar um tick de teste. Nota: este teste pode retornar 401 se o secret enviado não corresponder ao configurado.
        </p>
        <Button variant="outline" size="sm" onClick={testTick} disabled={testing}>
          {testing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <ExternalLink size={14} className="mr-1" />}
          Testar Tick
        </Button>
        {testResult && (
          <pre className="text-xs bg-background p-3 rounded border border-border overflow-x-auto text-foreground">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

export default AdminInfra;
