"use client";

import { Search } from "lucide-react";

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex max-w-xs flex-1 items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15">
      <Search size={16} className="shrink-0 text-black/40 dark:text-white/40" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent focus:outline-none"
      />
    </div>
  );
}
