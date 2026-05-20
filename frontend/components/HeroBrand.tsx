"use client";

/** Dotted-sphere brand glyph, inspired by mission-control telemetry imagery.
 *  A grid of dots is shaped into a circle, then four colored "indicator"
 *  dots (one per agent) sit on the equator like tracked satellites. The
 *  whole composition drifts subtly to feel alive without being noisy.
 */
export function HeroBrand() {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 88;
  const dotSpacing = 7;

  // Build the dotted-sphere grid.
  const dots: { x: number; y: number; opacity: number }[] = [];
  for (let y = cy - radius; y <= cy + radius; y += dotSpacing) {
    for (let x = cx - radius; x <= cx + radius; x += dotSpacing) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      // Falloff toward the edge — gives the sphere subtle volume.
      const t = dist / radius;
      const opacity = Math.pow(1 - t * 0.85, 1.4);
      dots.push({ x, y, opacity });
    }
  }

  // Four "tracked agents" on a circular orbit slightly outside the sphere.
  const orbitR = radius + 8;
  const agents = [
    { color: "#9d7feb", angle: -90, label: "C" },     // top
    { color: "#5ec0d7", angle: 0, label: "R" },       // right
    { color: "#d39d3d", angle: 90, label: "V" },      // bottom
    { color: "#5fb88a", angle: 180, label: "S" },     // left
  ];

  return (
    <div className="relative mx-auto mb-8 flex items-center justify-center animate-drift" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {/* Soft outer rings */}
        <circle cx={cx} cy={cy} r={radius + 12} stroke="rgba(255,255,255,0.05)" fill="none" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={radius + 20} stroke="rgba(255,255,255,0.025)" fill="none" strokeWidth="1" strokeDasharray="2 4" />

        {/* Dotted sphere */}
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="0.9" fill="#f5f5f4" opacity={d.opacity * 0.6} />
        ))}

        {/* Agent indicator dots */}
        {agents.map((a, i) => {
          const rad = (a.angle * Math.PI) / 180;
          const x = cx + orbitR * Math.cos(rad);
          const y = cy + orbitR * Math.sin(rad);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="6" fill={a.color} opacity="0.18" />
              <circle cx={x} cy={y} r="2.5" fill={a.color} />
            </g>
          );
        })}

        {/* Crosshair through center */}
        <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke="#f5f5f4" strokeWidth="1" opacity="0.5" />
        <line x1={cx} y1={cy - 3} x2={cx} y2={cy + 3} stroke="#f5f5f4" strokeWidth="1" opacity="0.5" />
      </svg>
    </div>
  );
}
