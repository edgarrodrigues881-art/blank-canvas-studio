import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, GitMerge, Settings, ScrollText, Heart } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import CommunityPoolTab from "./community/CommunityPoolTab";
import CommunityPairsTab from "./community/CommunityPairsTab";
import CommunityRulesTab from "./community/CommunityRulesTab";
import CommunityAuditTab from "./community/CommunityAuditTab";

const AdminCommunityWarmer = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <Heart size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Aquecedor Comunitário</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Governança do pool de comunidade — somente admin</p>
        </div>
      </div>

      <Tabs defaultValue="pool" className="space-y-5">
        <ScrollArea className="w-full">
          <TabsList className="bg-card border border-border w-max sm:w-auto inline-flex h-10">
            <TabsTrigger value="pool" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs px-3">
              <Globe size={13} />
              <span className="hidden sm:inline">Visão Global</span>
              <span className="sm:hidden">Global</span>
            </TabsTrigger>
            <TabsTrigger value="pairs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs px-3">
              <GitMerge size={13} />
              Pares
            </TabsTrigger>
            <TabsTrigger value="rules" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs px-3">
              <Settings size={13} />
              Regras
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs px-3">
              <ScrollText size={13} />
              <span className="hidden sm:inline">Auditoria</span>
              <span className="sm:hidden">Audit</span>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>

        <TabsContent value="pool"><CommunityPoolTab /></TabsContent>
        <TabsContent value="pairs"><CommunityPairsTab /></TabsContent>
        <TabsContent value="rules"><CommunityRulesTab /></TabsContent>
        <TabsContent value="audit"><CommunityAuditTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCommunityWarmer;
