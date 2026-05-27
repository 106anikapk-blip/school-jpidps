import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { searchStudents } from "@/lib/fees.functions";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type StudentRow = {
  id: string;
  name: string;
  class_name: string;
  section: string | null;
  admission_no: string | null;
  phone: string | null;
};

export function StudentCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string, student: StudentRow | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const search = useServerFn(searchStudents);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["students-search", debounced],
    queryFn: () => search({ data: { q: debounced } }),
  });

  const selected = useMemo(
    () => results?.find((s) => s.id === value) ?? null,
    [results, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select student"
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.name} · {selected.class_name}
              {selected.admission_no ? ` · ${selected.admission_no}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Search by name, admission no, or phone…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              value={q}
              onValueChange={setQ}
              placeholder="Search students…"
              className="h-10"
            />
          </div>
          <CommandList>
            {isFetching && !results?.length ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : (
              <CommandEmpty>No students found.</CommandEmpty>
            )}
            <CommandGroup>
              {results?.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => {
                    onChange(s.id, s);
                    setOpen(false);
                  }}
                  className="flex items-start gap-2"
                >
                  <Check
                    className={cn(
                      "mt-1 h-4 w-4",
                      value === s.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Class {s.class_name}
                      {s.section ? ` · ${s.section}` : ""}
                      {s.admission_no ? ` · ${s.admission_no}` : ""}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
