import type { CSSProperties, ReactNode } from "react";

type ProfilePerimeterBorderProps = {
  children: ReactNode;
  className?: string;
  /** Stagger animation start (ms) */
  delay?: number;
  style?: CSSProperties;
};

export default function ProfilePerimeterBorder({
  children,
  className = "",
  delay = 0,
  style,
}: ProfilePerimeterBorderProps) {
  return (
    <div
      className={`profile-perimeter-border ${className}`.trim()}
      style={
        {
          ...style,
          ["--perimeter-delay" as string]: `${delay}ms`,
        } as CSSProperties
      }
    >
      <div className="profile-perimeter-border__inner">{children}</div>
    </div>
  );
}
