import React, { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Link, Phone, Smartphone, Reply } from "lucide-react";
import { CarouselCard } from "./carousel-types";
import { useTheme } from "next-themes";

interface CarouselPreviewProps {
  cards: CarouselCard[];
  message?: string;
  previewMode?: "sent" | "received";
}

export function CarouselPreview({ cards, message, previewMode = "sent" }: CarouselPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const isSent = previewMode === "sent";
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  const palette = useMemo(() => {
    if (isLight) {
      return {
        shellBorder: "border-border",
        shellShadow: "shadow-black/10",
        header: "bg-card border-border/60",
        avatar: "bg-muted",
        avatarIcon: "text-muted-foreground",
        title: "text-foreground",
        subtitle: "text-muted-foreground",
        chatBg: "#efeae2",
        pattern: "%23d6d0c8",
        sentBubble: "bg-primary text-primary-foreground",
        receivedBubble: "bg-card text-foreground",
        buttonHoverSent: "hover:brightness-95",
        buttonHoverReceived: "hover:bg-muted",
        subtleText: "text-muted-foreground",
        accentText: "text-primary",
        divider: "border-border/50",
        navButton: "bg-background/95 border-border text-foreground hover:bg-muted",
      };
    }

    return {
      shellBorder: "border-[hsl(210_10%_18%)]",
      shellShadow: "shadow-black/40",
      header: "bg-[#202C33] border-[#313D45]",
      avatar: "bg-[#6B7B8D]/30",
      avatarIcon: "text-[#AEBAC1]",
      title: "text-[#E9EDEF]",
      subtitle: "text-[#8696A0]",
      chatBg: "#0B141A",
      pattern: "%23ffffff",
      sentBubble: "bg-[#0b7a69] text-[#E9EDEF]",
      receivedBubble: "bg-[#202C33] text-[#E9EDEF]",
      buttonHoverSent: "hover:bg-[#006B57]",
      buttonHoverReceived: "hover:bg-[#2A3942]",
      subtleText: "text-[#8696A0]/65",
      accentText: "text-[#00A5F4]",
      divider: "border-[#313D45]/40",
      navButton: "bg-[#202C33]/90 border-[#313D45] text-[#AEBAC1] hover:bg-[#2A3942]",
    };
  }, [isLight]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 220;
    const newPos = direction === "left" ? scrollPos - amount : scrollPos + amount;
    scrollRef.current.scrollTo({ left: newPos, behavior: "smooth" });
    setScrollPos(newPos);
  };

  const hasCards = cards.length > 0 && cards.some(c => c.text.trim() || c.mediaUrl);

  return (
    <div className={cn("rounded-[20px] overflow-hidden border-2 shadow-2xl flex flex-col", palette.shellBorder, palette.shellShadow)} style={{ height: "520px" }}>
      {/* Header */}
      <div className={cn("px-4 py-3 flex items-center gap-3 border-b", palette.header)}>
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center", palette.avatar)}>
          <Smartphone className={cn("w-4 h-4", palette.avatarIcon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-[14px] font-medium leading-tight", palette.title)}>Destinatário</p>
          <p className={cn("text-[11px]", palette.subtitle)}>online</p>
        </div>
      </div>

      {/* Chat area */}
      <div
        className="p-4 flex-1 min-h-0 overflow-y-auto flex flex-col"
        style={{
          backgroundColor: palette.chatBg,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='${palette.pattern}' fill-opacity='0.02'%3E%3Cpath d='M50 50v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm30-30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {!hasCards ? (
          <div className="flex-1 flex items-center justify-center">
            <p className={cn("text-[13px] italic text-center", palette.subtleText)}>
              Adicione cards para<br />visualizar o carrossel
            </p>
          </div>
        ) : (
          <div className={cn("flex flex-col gap-2", isSent ? "items-end" : "items-start")}>
            {/* Main message bubble */}
            {message?.trim() && (
              <div className={cn(
                "rounded-[12px] px-3 py-2 max-w-[85%] shadow-sm",
                isSent ? palette.sentBubble : palette.receivedBubble
              )}>
                <p className="text-[13px] whitespace-pre-wrap leading-[1.45]">{message}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className={cn("text-[10px]", palette.subtleText)}>12:00</span>
                  {isSent && <span className={cn("text-[10px]", palette.accentText)}>✓✓</span>}
                </div>
              </div>
            )}
            {/* Carousel scroll container */}
            <div className="w-full relative">
              {cards.length > 1 && (
                <>
                  <button
                    onClick={() => scroll("left")}
                    className={cn("absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full border flex items-center justify-center transition-colors", palette.navButton)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scroll("right")}
                    className={cn("absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full border flex items-center justify-center transition-colors", palette.navButton)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto scrollbar-none pb-1 snap-x snap-mandatory"
                onScroll={(e) => setScrollPos((e.target as HTMLDivElement).scrollLeft)}
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {cards.filter(c => c.text.trim() || c.mediaUrl).map((card, i) => (
                  <div
                    key={card.id}
                    className={cn(
                      "flex-shrink-0 snap-start rounded-[12px] overflow-hidden shadow-md flex flex-col",
                      isSent ? palette.sentBubble : palette.receivedBubble
                    )}
                    style={{ width: "200px", maxWidth: "200px" }}
                  >
                    {/* Card media */}
                    {card.mediaUrl && (
                      card.mediaType === "video" ? (
                        <video
                          src={card.mediaUrl}
                          className="w-full h-28 object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={card.mediaUrl}
                          alt={`Card ${i + 1}`}
                          className="w-full h-28 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )
                    )}

                    {/* Card text */}
                    <div className="px-3 py-2.5 flex-1">
                      <p className="text-[12px] whitespace-pre-wrap leading-[1.5] break-words line-clamp-4">
                        {card.text || <span className={cn("italic", palette.subtleText)}>Sem texto</span>}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-1.5">
                        <span className={cn("text-[10px] leading-none", palette.subtleText)}>12:00</span>
                        {isSent && <span className={cn("text-[10px] leading-none", palette.accentText)}>✓✓</span>}
                      </div>
                    </div>

                    {/* Card buttons */}
                    {card.buttons.filter(b => b.text.trim()).length > 0 && (
                      <div className={cn("flex flex-col gap-[1px] border-t", palette.divider)}>
                        {card.buttons.filter(b => b.text.trim()).map((btn) => (
                          <button
                            key={btn.id}
                            className={cn(
                              "w-full px-2 py-[8px] flex items-center justify-center gap-1.5",
                              isSent ? palette.buttonHoverSent : palette.buttonHoverReceived
                            )}
                          >
                            {btn.type === "reply" && <Reply className={cn("w-3 h-3", palette.accentText)} />}
                            {btn.type === "url" && <Link className={cn("w-3 h-3", palette.accentText)} />}
                            {btn.type === "phone" && <Phone className={cn("w-3 h-3", palette.accentText)} />}
                            <span className={cn("text-[11px] font-medium truncate", palette.accentText)}>{btn.text}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Card indicator dots */}
            {cards.filter(c => c.text.trim() || c.mediaUrl).length > 1 && (
              <div className="flex items-center gap-1 justify-center w-full mt-1">
                {cards.filter(c => c.text.trim() || c.mediaUrl).map((_, i) => (
                  <div key={i} className={cn("w-1.5 h-1.5 rounded-full", isLight ? "bg-muted-foreground/30" : "bg-[#8696A0]/40")} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
