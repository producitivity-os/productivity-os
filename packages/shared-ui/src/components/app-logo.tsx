import type { CSSProperties } from "react";

export function AppLogo({ color = "currentColor", size = 28, className, style, label = "Productivity OS" }: {
  color?: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const accessibility = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color, ...style }} {...accessibility}>
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 27L24 44M18 27L24 44M18 27H30M41 34L30 27M41 14L30 27M41 14L24 17M30 27L24 17M24 4V17M7 14L24 17M18 27L24 17M18 27L7 14M18 27L7 34" />
        <path d="M41.3207 14L24.0002 4L6.67969 14V34L24.0002 44L41.3207 34V14Z" />
      </g>
    </svg>
  );
}
