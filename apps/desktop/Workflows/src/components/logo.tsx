import { AppLogo } from "@productivity-os/shared-ui/components/app-logo";
import type { CSSProperties } from "react";

type LogoProps = {
  color?: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  label?: string;
};

export function Logo({ color = "#fff", size = 28, className, style, label = "Workflows" }: LogoProps) {
  return <AppLogo color={color} size={size} className={className} style={style} label={label} />;
}
