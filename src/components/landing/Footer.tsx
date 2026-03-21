import logo from "@/assets/logo-new.png";

const Footer = () => (
  <footer className="py-10 bg-transparent">
    <div className="container flex flex-col items-center gap-5">
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="DG Contingência" width={28} height={28} loading="lazy" className="w-7 h-7 rounded-lg" />
        <span className="text-sm font-medium text-white">DG Contingência PRO</span>
      </div>
      <p className="text-xs text-white/40 text-center max-w-xl leading-relaxed">
        A performance da operação depende da estratégia aplicada pelo usuário. A plataforma fornece infraestrutura e ferramentas de gestão.
      </p>
      <p className="text-xs text-white/30">
        © {new Date().getFullYear()} DG Contingência PRO. Todos os direitos reservados.
      </p>
    </div>
  </footer>
);

export default Footer;
