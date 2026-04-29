import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Strikethrough, Code, Quote, List } from "lucide-react";

export type WhatsAppTextEditorHandle = {
  focus: () => void;
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  showPreview?: boolean;
  previewClassName?: string;
  previewStyle?: React.CSSProperties;
  className?: string;
}

const FORMATS: Record<string, { open: string; close: string; key?: string; ctrlKey?: boolean; shiftKey?: boolean; icon: any; label: string }> = {
  bold: { open: "*", close: "*", key: "b", ctrlKey: true, icon: Bold, label: "Negrito (Ctrl+B)" },
  italic: { open: "_", close: "_", key: "i", ctrlKey: true, icon: Italic, label: "Itálico (Ctrl+I)" },
  strike: { open: "~", close: "~", key: "x", ctrlKey: true, shiftKey: true, icon: Strikethrough, label: "Riscado (Ctrl+Shift+X)" },
  mono: { open: "```", close: "```", key: "m", ctrlKey: true, shiftKey: true, icon: Code, label: "Monoespaçado (Ctrl+Shift+M)" },
};

function applyFormat(
  textarea: HTMLTextAreaElement,
  current: string,
  fmt: keyof typeof FORMATS,
  setValue: (v: string) => void,
) {
  const { open, close } = FORMATS[fmt];
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = current.slice(0, start);
  const selected = current.slice(start, end);
  const after = current.slice(end);

  // Toggle: if selection already wrapped, unwrap
  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length);
    const next = before + inner + after;
    setValue(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + inner.length);
    });
    return;
  }

  const wrapped = `${open}${selected || ""}${close}`;
  const next = before + wrapped + after;
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    if (selected) {
      textarea.setSelectionRange(start, start + wrapped.length);
    } else {
      const caret = start + open.length;
      textarea.setSelectionRange(caret, caret);
    }
  });
}

// Render WhatsApp markdown to HTML (escaped)
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderWhatsAppMarkdown(input: string): string {
  if (!input) return "";
  let s = escapeHtml(input);
  // Monospace block ```...``` (greedy single-line ok)
  s = s.replace(/```([\s\S]+?)```/g, '<code class="font-mono bg-black/20 px-1 rounded">$1</code>');
  // Bold *text* (not part of word)
  s = s.replace(/(^|[\s\n(])\*([^*\n]+?)\*(?=$|[\s\n.,!?;:)])/g, '$1<strong>$2</strong>');
  // Italic _text_
  s = s.replace(/(^|[\s\n(])_([^_\n]+?)_(?=$|[\s\n.,!?;:)])/g, '$1<em>$2</em>');
  // Strikethrough ~text~
  s = s.replace(/(^|[\s\n(])~([^~\n]+?)~(?=$|[\s\n.,!?;:)])/g, '$1<span style="text-decoration: line-through">$2</span>');
  // Line breaks
  s = s.replace(/\n/g, "<br/>");
  return s;
}

export const WhatsAppTextEditor = forwardRef<WhatsAppTextEditorHandle, Props>(function WhatsAppTextEditor(
  { value, onChange, placeholder, rows = 5, maxLength, showPreview = false, previewClassName, previewStyle, className },
  ref,
) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
  }));

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const k = e.key.toLowerCase();
      const matched = (Object.keys(FORMATS) as (keyof typeof FORMATS)[]).find((id) => {
        const f = FORMATS[id];
        return f.key === k && Boolean(f.ctrlKey) === ctrl && Boolean(f.shiftKey) === e.shiftKey;
      });
      if (matched && taRef.current) {
        e.preventDefault();
        applyFormat(taRef.current, value, matched, onChange);
      }
    },
    [value, onChange],
  );

  const click = (id: keyof typeof FORMATS) => {
    if (taRef.current) applyFormat(taRef.current, value, id, onChange);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1 mb-1.5 p-1 rounded-md border bg-muted/30 w-fit">
        {(Object.keys(FORMATS) as (keyof typeof FORMATS)[]).map((id) => {
          const f = FORMATS[id];
          const Icon = f.icon;
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title={f.label}
              onClick={() => click(id)}
            >
              <Icon className="w-3.5 h-3.5" />
            </Button>
          );
        })}
        <span className="text-[10px] text-muted-foreground px-1.5 hidden md:inline">WhatsApp</span>
      </div>
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
      />
      {showPreview && (
        <div
          className={previewClassName || "rounded-lg p-6 min-h-[140px] flex items-center justify-center text-center text-white text-lg font-semibold whitespace-pre-wrap break-words mt-3"}
          style={previewStyle}
          dangerouslySetInnerHTML={{ __html: renderWhatsAppMarkdown(value) || '<span class="opacity-60">Pré-visualização</span>' }}
        />
      )}
    </div>
  );
});
