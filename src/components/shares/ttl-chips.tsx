"use client";

import { ALLOW_DEV_TTL } from "@/lib/shares/dev";
import { ttlOptions } from "@/lib/shares/ttl";

export function TtlChips({
  value,
  onChange,
  label = "Caducidad",
  includeDev = true,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  includeDev?: boolean;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {ttlOptions(ALLOW_DEV_TTL && includeDev).map((o) => {
          const active = o.label === value;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.label)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                active ? "border-primary-strong bg-primary/25 text-fg" : "border-border bg-subtle text-fg-2 hover:text-fg"
              } ${o.label === "5m" ? "border-dashed" : ""}`}
            >
              {o.text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
