import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  onSearchChange?: (search: string) => void;
  loading?: boolean;
  maxVisibleOptions?: number;
}

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado",
  disabled = false,
  className,
  onSearchChange,
  loading = false,
  maxVisibleOptions = 250,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const selectedLabel = useMemo(() => {
    return options.find((option) => option.value === value)?.label || value || "";
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (onSearchChange) {
      return options;
    }

    const normalizedSearch = normalizeText(search);

    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) =>
      normalizeText(`${option.label} ${option.value}`).includes(normalizedSearch)
    );
  }, [onSearchChange, options, search]);

  const visibleOptions = useMemo(() => {
    if (filteredOptions.length <= maxVisibleOptions) {
      return filteredOptions;
    }

    const limitedOptions = filteredOptions.slice(0, maxVisibleOptions);

    if (!value || limitedOptions.some((option) => option.value === value)) {
      return limitedOptions;
    }

    const selectedOption = filteredOptions.find((option) => option.value === value);

    if (!selectedOption) {
      return limitedOptions;
    }

    return [selectedOption, ...limitedOptions.slice(0, maxVisibleOptions - 1)];
  }, [filteredOptions, maxVisibleOptions, value]);

  const showResultLimitHint = visibleOptions.length < filteredOptions.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearch(nextValue);
                onSearchChange?.(nextValue);
              }}
              className="h-9 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : visibleOptions.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none",
                  value === option.value && "bg-muted/40"
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === option.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{option.label}</span>
              </button>
            ))
          )}
        </div>

        {showResultLimitHint && !loading && (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Mostrando {visibleOptions.length} de {filteredOptions.length} opções. Continue digitando para refinar.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
