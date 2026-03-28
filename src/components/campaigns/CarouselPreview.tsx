import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Link, Phone, Smartphone } from "lucide-react";
import { CarouselCard } from "./carousel-types";

interface CarouselPreviewProps {
  cards: CarouselCard[];
  message?: string;
  previewMode?: "sent" | "received";
}

export function CarouselPreview({ cards, message, previewMode = "sent" }: CarouselPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const isSent = previewMode === "sent";

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 220;
    const newPos = direction === "left" ? scrollPos - amount : scrollPos + amount;
    scrollRef.current.scrollTo({ left: newPos, behavior: "smooth" });
    setScrollPos(newPos);
  };

  const hasCards = cards.length > 0 && cards.some(c => c.text.trim() || c.mediaUrl);

  return (
    <div className="rounded-[20px] overflow-hidden border-2 border-[hsl(210_10%_18%)] shadow-2xl shadow-black/40 flex flex-col" style={{ height: "520px" }}>
      {/* Header */}
      <div className="bg-[#202C33] px-4 py-3 flex items-center gap-3 border-b border-[#313D45]">
        <div className="w-9 h-9 rounded-full bg-[#6B7B8D]/30 flex items-center justify-center">
          <Smartphone className="w-4 h-4 text-[#AEBAC1]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#E9EDEF] text-[14px] font-medium leading-tight">Destinatário</p>
          <p className="text-[#8696A0] text-[11px]">online</p>
        </div>
      </div>

      {/* Chat area */}
      <div
        className="p-4 flex-1 min-h-0 overflow-y-auto flex flex-col"
        style={{
          backgroundColor: "#0B141A",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M50 50v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm30-30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 0v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {!hasCards ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#8696A0]/50 text-[13px] italic text-center">
              Adicione cards para<br />visualizar o carrossel
            </p>
          </div>
        ) : (
          <div className={cn("flex flex-col gap-2", isSent ? "items-end" : "items-start")}>
            {/* Main message bubble */}
            {message?.trim() && (
              <div className={cn(
                "rounded-[12px] px-3 py-2 max-w-[85%] shadow-sm",
                isSent ? "bg-[#005C4B]" : "bg-[#202C33]"
              )}>
                <p className="text-[13px] text-[#E9EDEF] whitespace-pre-wrap leading-[1.45]">{message}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[10px] text-[#8696A0]/65">12:00</span>
                  {isSent && <span className="text-[10px] text-[#53BDEB]/70">✓✓</span>}
                </div>
              </div>
            )}
            {/* Carousel scroll container */}
            <div className="w-full relative">
              {cards.length > 1 && (
                <>
                  <button
                    onClick={() => scroll("left")}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-[#202C33]/90 border border-[#313D45] flex items-center justify-center text-[#AEBAC1] hover:bg-[#2A3942] transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scroll("right")}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-[#202C33]/90 border border-[#313D45] flex items-center justify-center text-[#AEBAC1] hover:bg-[#2A3942] transition-colors"
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
                      isSent ? "bg-[#005C4B]" : "bg-[#202C33]"
                    )}
                    style={{ width: "200px", maxWidth: "200px" }}
                  >
                    {/* Card media */}
                    {card.mediaUrl && (
                      <img
                        src={card.mediaUrl}
                        alt={`Card ${i + 1}`}
                        className="w-full h-28 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}

                    {/* Card text */}
                    <div className="px-3 py-2.5 flex-1">
                      <p className="text-[12px] text-[#E9EDEF] whitespace-pre-wrap leading-[1.5] break-words line-clamp-4">
                        {card.text || <span className="italic text-[#8696A0]/50">Sem texto</span>}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-1.5">
                        <span className="text-[10px] text-[#8696A0]/65 leading-none">12:00</span>
                        {isSent && <span className="text-[10px] text-[#53BDEB]/70 leading-none">✓✓</span>}
                      </div>
                    </div>

                    {/* Card buttons */}
                    {card.buttons.filter(b => b.text.trim()).length > 0 && (
                      <div className="flex flex-col gap-[1px] border-t border-[#313D45]/40">
                        {card.buttons.filter(b => b.text.trim()).map((btn) => (
                          <button
                            key={btn.id}
                            className={cn(
                              "w-full px-2 py-[8px] flex items-center justify-center gap-1.5",
                              isSent ? "hover:bg-[#006B57]" : "hover:bg-[#2A3942]"
                            )}
                          >
                            {btn.type === "url" && <Link className="w-3 h-3 text-[#00A5F4]" />}
                            {btn.type === "phone" && <Phone className="w-3 h-3 text-[#00A5F4]" />}
                            <span className="text-[11px] text-[#00A5F4] font-medium truncate">{btn.text}</span>
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
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#8696A0]/40" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
