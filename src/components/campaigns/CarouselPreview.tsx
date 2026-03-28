import React, { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Link, Smartphone, Reply, ExternalLink } from "lucide-react";
import { CarouselCard } from "./carousel-types";
import { useTheme } from "next-themes";

interface CarouselPreviewProps {
  cards: CarouselCard[];
  message?: string;
  previewMode?: "sent" | "received";
}

export function CarouselPreview({ cards, message, previewMode = "received" }: CarouselPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isSent = previewMode === "sent";
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  const palette = useMemo(() => {
    if (isLight) {
      return {
        shellBg: "bg-[#f0ebe3]",
        shellBorder: "border-border/60",
        header: "bg-[#f0f2f5] border-border/40",
        avatar: "bg-[#dfe5e7]",
        avatarIcon: "text-[#54656f]",
        title: "text-[#111b21]",
        subtitle: "text-[#667781]",
        chatBg: "#efeae2",
        sentBubble: "bg-[#d9fdd3]",
        sentText: "text-[#111b21]",
        receivedBubble: "bg-white",
        receivedText: "text-[#111b21]",
        metaText: "text-[#667781]/70",
        checkColor: "text-[#53BDEB]",
        accentText: "text-[#027eb5]",
        btnBg: "bg-white/80",
        btnBorder: "border-[#e9edef]",
        btnHover: "hover:bg-[#f0f2f5]",
        dotActive: "bg-[#25d366]",
        dotInactive: "bg-[#667781]/25",
        navBtn: "bg-white/90 border-[#e9edef] text-[#54656f] shadow-sm hover:bg-[#f0f2f5]",
        cardShadow: "shadow-[0_1px_3px_rgba(0,0,0,0.08)]",
      };
    }
    return {
      shellBg: "bg-[#0b141a]",
      shellBorder: "border-[#233138]",
      header: "bg-[#202c33] border-[#313d45]",
      avatar: "bg-[#6b7b8d]/30",
      avatarIcon: "text-[#aebac1]",
      title: "text-[#e9edef]",
      subtitle: "text-[#8696a0]",
      chatBg: "#0b141a",
      sentBubble: "bg-[#0b7a69]",
      sentText: "text-[#e9edef]",
      receivedBubble: "bg-[#202c33]",
      receivedText: "text-[#e9edef]",
      metaText: "text-[#8696a0]/60",
      checkColor: "text-[#53BDEB]/70",
      accentText: "text-[#00a5f4]",
      btnBg: "bg-[#202c33]/80",
      btnBorder: "border-[#313d45]/60",
      btnHover: "hover:bg-[#2a3942]",
      dotActive: "bg-[#00a884]",
      dotInactive: "bg-[#8696a0]/30",
      navBtn: "bg-[#202c33]/90 border-[#313d45] text-[#aebac1] shadow-md hover:bg-[#2a3942]",
      cardShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.25)]",
    };
  }, [isLight]);

  const visibleCards = cards.filter(c => c.text.trim() || c.mediaUrl);
  const hasCards = visibleCards.length > 0;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const cardWidth = 196;
    const newIndex = direction === "left"
      ? Math.max(0, activeIndex - 1)
      : Math.min(visibleCards.length - 1, activeIndex + 1);
    setActiveIndex(newIndex);
    scrollRef.current.scrollTo({ left: newIndex * cardWidth, behavior: "smooth" });
  };

  const handleScroll = (e: React.UIEvent) => {
    const el = e.target as HTMLDivElement;
    const newIndex = Math.round(el.scrollLeft / 196);
    setActiveIndex(Math.min(newIndex, visibleCards.length - 1));
  };

  return (
    <div
      className={cn("rounded-2xl overflow-hidden border-2 flex flex-col", palette.shellBorder)}
      style={{ height: "520px" }}
    >
      {/* Header */}
      <div className={cn("px-4 py-2.5 flex items-center gap-3 border-b shrink-0", palette.header)}>
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center", palette.avatar)}>
          <Smartphone className={cn("w-4 h-4", palette.avatarIcon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-[13px] font-semibold leading-tight", palette.title)}>Destinatário</p>
          <p className={cn("text-[11px]", palette.subtitle)}>online</p>
        </div>
      </div>

      {/* Chat area */}
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-end p-3 gap-2"
        style={{ backgroundColor: palette.chatBg }}
      >
        {!hasCards && !message?.trim() ? (
          <div className="flex-1 flex items-center justify-center">
            <p className={cn("text-[13px] italic text-center", palette.metaText)}>
              Digite a legenda para<br />visualizar o preview
            </p>
          </div>
        ) : !hasCards ? (
          <div className={cn("flex flex-col gap-1", isSent ? "items-end" : "items-start")}>
            {message?.trim() && (
              <div className={cn("max-w-[85%] rounded-lg px-3 py-2", isSent ? palette.sentBubble : palette.receivedBubble, palette.cardShadow)}>
                <p className={cn("text-[13px] leading-snug whitespace-pre-wrap", isSent ? palette.sentText : palette.receivedText)}>{message}</p>
                <p className={cn("text-[10px] mt-1 text-right", palette.metaText)}>agora</p>
              </div>
            )}
            <p className={cn("text-[11px] italic text-center mt-2", palette.metaText)}>
              Adicione cards ao carrossel
            </p>
          </div>
        ) : (
          <div className={cn("flex flex-col gap-1", isSent ? "items-end" : "items-start")}>
            {/* Main message bubble */}
            {message?.trim() && (
              <div className={cn(
                "rounded-lg px-3 py-[7px] max-w-[85%]",
                palette.cardShadow,
                isSent ? palette.sentBubble : palette.receivedBubble
              )}>
                <p className={cn("text-[13px] whitespace-pre-wrap leading-[1.4]", isSent ? palette.sentText : palette.receivedText)}>
                  {message}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className={cn("text-[10px]", palette.metaText)}>12:00</span>
                  {isSent && <span className={cn("text-[10px]", palette.checkColor)}>✓✓</span>}
                </div>
              </div>
            )}

            {/* Carousel */}
            <div className="w-full relative">
              {visibleCards.length > 1 && (
                <>
                  <button
                    onClick={() => scroll("left")}
                    className={cn(
                      "absolute left-1 top-[40%] -translate-y-1/2 z-10 w-7 h-7 rounded-full border flex items-center justify-center transition-all",
                      palette.navBtn,
                      activeIndex === 0 && "opacity-0 pointer-events-none"
                    )}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scroll("right")}
                    className={cn(
                      "absolute right-1 top-[40%] -translate-y-1/2 z-10 w-7 h-7 rounded-full border flex items-center justify-center transition-all",
                      palette.navBtn,
                      activeIndex >= visibleCards.length - 1 && "opacity-0 pointer-events-none"
                    )}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto pb-1.5 snap-x snap-mandatory"
                onScroll={handleScroll}
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {visibleCards.map((card, i) => (
                  <div
                    key={card.id}
                    className={cn(
                      "flex-shrink-0 snap-start rounded-xl overflow-hidden flex flex-col",
                      palette.cardShadow,
                      isSent ? palette.sentBubble : palette.receivedBubble
                    )}
                    style={{ width: "188px" }}
                  >
                    {/* Media */}
                    {card.mediaUrl && (
                      card.mediaType === "video" ? (
                        <video src={card.mediaUrl} className="w-full h-24 object-cover" muted playsInline />
                      ) : (
                        <img
                          src={card.mediaUrl}
                          alt={`Card ${i + 1}`}
                          className="w-full h-24 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )
                    )}

                    {/* Text */}
                    <div className="px-2.5 py-2 flex-1">
                      <p className={cn(
                        "text-[11.5px] whitespace-pre-wrap leading-[1.45] break-words line-clamp-3",
                        isSent ? palette.sentText : palette.receivedText
                      )}>
                        {card.text || <span className={cn("italic text-[11px]", palette.metaText)}>Sem texto</span>}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className={cn("text-[9px]", palette.metaText)}>12:00</span>
                        {isSent && <span className={cn("text-[9px]", palette.checkColor)}>✓✓</span>}
                      </div>
                    </div>

                    {/* Buttons */}
                    {card.buttons.filter(b => b.text.trim()).length > 0 && (
                      <div className="flex flex-col">
                        {card.buttons.filter(b => b.text.trim()).map((btn) => (
                          <div
                            key={btn.id}
                            className={cn(
                              "border-t px-2 py-[6px] flex items-center justify-center gap-1.5",
                              palette.btnBorder,
                              palette.btnHover,
                              "transition-colors cursor-default"
                            )}
                          >
                            {btn.type === "reply" && <Reply className={cn("w-3 h-3 shrink-0", palette.accentText)} />}
                            {btn.type === "url" && <ExternalLink className={cn("w-3 h-3 shrink-0", palette.accentText)} />}
                            <span className={cn("text-[10.5px] font-medium truncate", palette.accentText)}>
                              {btn.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Dots */}
              {visibleCards.length > 1 && (
                <div className="flex items-center gap-1.5 justify-center w-full mt-1.5">
                  {visibleCards.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-full transition-all duration-200",
                        i === activeIndex
                          ? cn("w-2 h-2", palette.dotActive)
                          : cn("w-1.5 h-1.5", palette.dotInactive)
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
