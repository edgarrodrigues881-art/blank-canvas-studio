import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={4000}
      visibleToasts={4}
      expand={true}
      gap={8}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!bg-emerald-950 group-[.toaster]:!text-emerald-50 group-[.toaster]:!border-emerald-500/30",
          error: "group-[.toaster]:!bg-red-950 group-[.toaster]:!text-red-50 group-[.toaster]:!border-red-500/30",
          info: "group-[.toaster]:!bg-blue-950 group-[.toaster]:!text-blue-50 group-[.toaster]:!border-blue-500/30",
          warning: "group-[.toaster]:!bg-amber-950 group-[.toaster]:!text-amber-50 group-[.toaster]:!border-amber-500/30",
        },
      }}
      style={
        {
          "--normal-bg": "hsl(var(--background))",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border": "hsl(var(--border))",
          "--error-bg": "hsl(346 87% 20%)",
          "--error-text": "hsl(0 0% 98%)",
          "--error-border": "hsl(0 84% 60% / 0.3)",
          "--success-bg": "hsl(152 81% 10%)",
          "--success-text": "hsl(0 0% 98%)",
          "--success-border": "hsl(152 69% 31% / 0.3)",
          "--info-bg": "hsl(217 91% 10%)",
          "--info-text": "hsl(0 0% 98%)",
          "--info-border": "hsl(217 91% 60% / 0.3)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster, toast };
