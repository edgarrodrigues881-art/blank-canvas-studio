import { motion, AnimatePresence } from "framer-motion";
import { Lock, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaintenanceModalProps {
  open: boolean;
  onClose: () => void;
  featureName: string;
  message?: string | null;
}

const DEFAULT_MESSAGE = "Esta funcionalidade está temporariamente indisponível enquanto realizamos ajustes e melhorias para garantir uma experiência mais estável e segura.\n\nEm breve ela estará disponível novamente.";

export function MaintenanceModal({ open, onClose, featureName, message }: MaintenanceModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors z-10"
            >
              <X size={16} />
            </button>

            {/* Top accent bar */}
            <div className="h-1 bg-gradient-to-r from-amber-500/60 via-primary/60 to-amber-500/60" />

            <div className="px-8 py-10 text-center space-y-6">
              {/* Icon */}
              <motion.div
                className="mx-auto w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: "spring", damping: 15 }}
              >
                <div className="relative">
                  <Wrench size={32} className="text-amber-500" />
                  <Lock size={14} className="text-amber-600 absolute -bottom-1 -right-1" />
                </div>
              </motion.div>

              {/* Title */}
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">Em Manutenção</h2>
                <p className="text-sm text-primary font-medium">{featureName}</p>
              </div>

              {/* Message */}
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {message || DEFAULT_MESSAGE}
              </p>

              {/* Button */}
              <Button onClick={onClose} className="w-full">
                Entendi
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
