import { useEffect, useState, useCallback } from "react";

const notifications = [
  "🔥 João ativou 10 instâncias",
  "🚀 Carlos iniciou aquecimento",
  "⚡ Rafael conectou 5 contas",
  "✅ Mariana completou warmup",
  "📊 Pedro monitorou 20 números",
  "🎯 Lucas disparou campanha",
  "🛡️ Ana configurou proxy",
  "💬 Thiago enviou 342 mensagens",
];

const SocialProofToast = () => {
  const [current, setCurrent] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const showNext = useCallback(() => {
    const msg = notifications[Math.floor(Math.random() * notifications.length)];
    setCurrent(msg);
    setVisible(true);

    setTimeout(() => setVisible(false), 4000);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const delay = 6000 + Math.random() * 4000; // first show 6-10s
    const firstTimer = setTimeout(() => {
      showNext();
      startLoop();
    }, delay);

    let interval: ReturnType<typeof setInterval>;
    const startLoop = () => {
      interval = setInterval(() => {
        showNext();
      }, 12000 + Math.random() * 8000);
    };

    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [showNext]);

  if (!current) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-20px)",
        transition: "opacity 400ms cubic-bezier(0.4,0,0.2,1), transform 400ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <div
        className="px-4 py-3 rounded-xl text-[13px] text-white/80 max-w-[280px]"
        style={{
          background: "linear-gradient(145deg, rgba(17,24,39,0.95), rgba(10,15,25,0.92))",
          border: "1px solid rgba(7,193,96,0.15)",
        }}
      >
        {current}
      </div>
    </div>
  );
};

export default SocialProofToast;
