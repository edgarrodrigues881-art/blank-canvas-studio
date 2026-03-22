import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPerfMonitor } from "./lib/perfMonitor";

document.documentElement.setAttribute("translate", "no");
document.body.classList.add("notranslate");

createRoot(document.getElementById("root")!).render(<App />);

initPerfMonitor();
