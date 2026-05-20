"use client";

interface Props {
  score: number; // 0..10
}

export function ConfidenceMeter({ score }: Props) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const colorClass =
    clamped >= 7
      ? "from-emerald-500 to-emerald-400"
      : clamped >= 4
        ? "from-amber-500 to-amber-400"
        : "from-rose-500 to-rose-400";
  const labelColor =
    clamped >= 7 ? "text-emerald-300" : clamped >= 4 ? "text-amber-300" : "text-rose-300";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="label-mono text-ink-500">CONFIDENCE</span>
        <span className={`font-mono text-xs tabular-nums ${labelColor}`}>
          {clamped.toFixed(1)}
          <span className="text-ink-600 font-normal"> / 10</span>
        </span>
      </div>
      <div className="relative h-1 overflow-hidden rounded-sm bg-white/[0.05]">
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colorClass} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
        {/* Tick marks */}
        {[2, 4, 6, 8].map((t) => (
          <span
            key={t}
            className="absolute inset-y-0 w-px bg-black/40"
            style={{ left: `${t * 10}%` }}
          />
        ))}
      </div>
    </div>
  );
}
