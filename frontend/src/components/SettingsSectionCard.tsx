import type { CSSProperties, ReactNode } from "react";

export type SettingsSectionVariant =
  | "notifications"
  | "appearance"
  | "account"
  | "blocks"
  | "tokens"
  | "session"
  | "danger";

type SettingsSectionCardProps = {
  children: ReactNode;
  variant: SettingsSectionVariant;
  className?: string;
  id?: string;
  /** Stagger animated border start (ms) */
  delay?: number;
};

export default function SettingsSectionCard({
  children,
  variant,
  className = "",
  id,
  delay = 0,
}: SettingsSectionCardProps) {
  const innerClass = [
    "settings-perimeter-border__inner",
    "settings-section",
    "settings-section--bordered",
    variant === "danger" ? "danger-zone" : "",
    variant === "session" ? "settings-session-section" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={id}
      className={`settings-perimeter-border settings-perimeter-border--${variant} ${className}`.trim()}
      style={
        {
          ["--perimeter-delay" as string]: `${delay}ms`,
        } as CSSProperties
      }
    >
      <div className={innerClass}>{children}</div>
    </div>
  );
}
