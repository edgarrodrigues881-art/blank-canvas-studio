import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Send, Image as ImageIcon, Video, Mic, Type, History, CheckCircle2, XCircle } from "lucide-react";

type Device = { id: string; name: string; number: string | null; status: string };
type StatusPost = {
  id: string;
  type: string;
  text_content: string | null;
  caption: string | null;
  status: string;
  success_count: number;
  error_count: number;
  created_at: string;
};

const STATUS_COLORS = ["#25D366", "#128C7E", "#075E54", "#34B7F1", "#FF6B6B", "#FFD93D", "#9B59B6", "#000000"];

export default function StatusPost() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [type, setType] = useState<"text" | "image" | "video" | "audio">("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState("#25D366");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<StatusPost[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user.id)
        .neq("login_type", "report_wa")
        .order("created_at");
      setDevices((data || []) as Device[]);
    })();
    loadHistory();
  }, [user]);

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("status_posts")
      .select("id, type, text_content, caption, status, success_count, error_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data || []) as StatusPost[]);
  };

  const onlineDevices = useMemo(
    () => devices.filter((d) => ["Ready", "Connected", "authenticated", "open", "active"].includes(d.status)),
    [devices]
  );

  const toggleAll = () => {
    if (selected.length === onlineDevices.length) setSelected([]);
    else setSelected(onlineDevices.map((d) => d.id));
  };

  const uploadMedia = async (): Promise<string | null> => {
    if (!file || !user) return null;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/status/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      toast.error("Falha no upload: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSend = async () => {
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma instância");
      return;
    }
    if (type === "text" && !text.trim()) {
      toast.error("Digite o texto do status");
      return;
    }
    if (type !== "text" && !file) {
      toast.error("Selecione um arquivo de mídia");
      return;
    }

    setSending(true);
    try {
      let mediaUrl: string | null = null;
      if (type !== "text") {
        mediaUrl = await uploadMedia();
        if (!mediaUrl) { setSending(false); return; }
      }

      const { data, error } = await supabase.functions.invoke("status-post", {
        body: {
          type,
          text_content: type === "text" ? text.trim() : undefined,
          media_url: mediaUrl || undefined,
          caption: type !== "text" && type !== "audio" ? caption.trim() : undefined,
          background_color: type === "text" ? bgColor : undefined,
          font: type === "text" ? 1 : undefined,
          device_ids: selected,
        },
      });

      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      const succ = (data as any)?.success_count ?? 0;
      const err = (data as any)?.error_count ?? 0;

      if (err === 0) {
        toast.success(`Status publicado em ${succ} instância(s)`);
      } else if (succ === 0) {
        toast.error(`Falha em todas as instâncias`);
      } else {
        toast.warning(`Publicado: ${succ} • Falhas: ${err}`);
      }

      setText("");
      setCaption("");
      setFile(null);
      loadHistory();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao publicar status");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Postagem de Status</h1>
        <p className="text-sm text-muted-foreground">Publique status (stories) no WhatsApp em uma ou várias instâncias.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conteúdo do Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={type} onValueChange={(v) => setType(v as any)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="text"><Type className="w-4 h-4 mr-1.5" />Texto</TabsTrigger>
                <TabsTrigger value="image"><ImageIcon className="w-4 h-4 mr-1.5" />Imagem</TabsTrigger>
                <TabsTrigger value="video"><Video className="w-4 h-4 mr-1.5" />Vídeo</TabsTrigger>
                <TabsTrigger value="audio"><Mic className="w-4 h-4 mr-1.5" />Áudio</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-4 mt-4">
                <div>
                  <Label>Texto</Label>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escreva seu status..."
                    rows={5}
                    maxLength={700}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{text.length}/700</p>
                </div>
                <div>
                  <Label>Cor de fundo</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {STATUS_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBgColor(c)}
                        className={`w-9 h-9 rounded-lg border-2 transition ${bgColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div
                  className="rounded-lg p-6 min-h-[140px] flex items-center justify-center text-center text-white text-lg font-semibold whitespace-pre-wrap break-words"
                  style={{ backgroundColor: bgColor }}
                >
                  {text || "Pré-visualização"}
                </div>
              </TabsContent>

              <TabsContent value="image" className="space-y-4 mt-4">
                <div>
                  <Label>Imagem</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
                <div>
                  <Label>Legenda (opcional)</Label>
                  <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} />
                </div>
              </TabsContent>

              <TabsContent value="video" className="space-y-4 mt-4">
                <div>
                  <Label>Vídeo</Label>
                  <Input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <p className="text-xs text-muted-foreground mt-1">Máx. 30 segundos para status.</p>
                </div>
                <div>
                  <Label>Legenda (opcional)</Label>
                  <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} />
                </div>
              </TabsContent>

              <TabsContent value="audio" className="space-y-4 mt-4">
                <div>
                  <Label>Áudio</Label>
                  <Input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
              </TabsContent>
            </Tabs>

            <Button onClick={handleSend} disabled={sending || selected.length === 0} className="w-full" size="lg">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Publicar Status ({selected.length})
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Instâncias</CardTitle>
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.length === onlineDevices.length ? "Limpar" : "Todas"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-auto">
            {devices.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma instância encontrada.</p>}
            {devices.map((d) => {
              const online = ["Ready", "Connected", "authenticated", "open", "active"].includes(d.status);
              return (
                <label
                  key={d.id}
                  className={`flex items-center gap-3 rounded-md p-2 border ${online ? "hover:bg-accent cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                >
                  <Checkbox
                    checked={selected.includes(d.id)}
                    disabled={!online}
                    onCheckedChange={(c) => {
                      setSelected((prev) => (c ? [...prev, d.id] : prev.filter((x) => x !== d.id)));
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.number || "—"}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                </label>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" />Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma publicação ainda.</p>}
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 p-3 border rounded-md">
                <Badge variant="outline" className="capitalize">{h.type}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{h.text_content || h.caption || "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />{h.success_count}</span>
                  <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" />{h.error_count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
