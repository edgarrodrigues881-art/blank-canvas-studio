import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";
import logo from "@/assets/logo-new.png";

const Navbar = () => {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0D0D0D] border-b border-white/5" style={{ contain: "layout style" }}>
      <div className="container flex items-center justify-between h-16 px-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src={logo} alt="DG Contingência PRO" width={36} height={36} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg" />
          <span className="text-xs sm:text-sm font-bold text-white tracking-tight whitespace-nowrap">
            <span className="text-[#07C160]">DG</span> Contingência <span className="text-[#07C160]">PRO</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <button
            onClick={() => document.getElementById("para-quem")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Como funciona
          </button>
          <button
            onClick={() => document.getElementById("confianca")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Confiança
          </button>
          <button
            onClick={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Planos
          </button>
          <a
            href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Suporte
          </a>
          <button
            onClick={() => document.getElementById("comunidade")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors border border-amber-500/30 rounded-full px-4 py-1.5 bg-amber-500/10 hover:bg-amber-500/15"
          >
            ⭐ Comunidade
          </button>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-full px-3 py-1">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-orange-400">87%</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/auth")}
            className="text-xs sm:text-sm text-white/60 hover:text-white hover:bg-white/5 px-2 sm:px-3 btn-press"
          >
            Entrar
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/auth?mode=signup")}
            className="text-xs sm:text-sm bg-[#07C160] hover:bg-[#06a050] text-white px-3 sm:px-4 btn-press"
          >
            Criar conta
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
