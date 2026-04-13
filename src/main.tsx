import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { initPerfMonitor } from "./lib/perfMonitor";

document.documentElement.setAttribute("translate", "no");
document.body.classList.add("notranslate");

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    registration?.update().catch(() => undefined);
  },
});

createRoot(document.getElementById("root")!).render(<App />);

initPerfMonitor();
