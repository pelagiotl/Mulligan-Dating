import type { CSSProperties, ReactNode } from "react";

export type ProfilePerimeterVariant =
  | "default"
  | "stat"
  | "mini"
  | "section"
  | "photos"
  | "interests"
  | "dealbreakers"
  | "qualities"
  | "lifestyle";

type ProfilePerimeterBorderProps = {
  children: ReactNode;
  className?: string;
  /** Stagger animation start (ms) */
  delay?: number;
  /** Accent palette + modifier class for detail sections */
  variant?: ProfilePerimeterVariant;
  style?: CSSProperties;
};

const VARIANT_CLASS: Record<ProfilePerimeterVariant, string> = {
  default: "",
  stat: "profile-perimeter-border--stat",
  mini: "profile-perimeter-border--mini",
  section: "profile-perimeter-border--section",
  photos: "profile-perimeter-border--section profile-perimeter-border--photos",
  interests: "profile-perimeter-border--section profile-perimeter-border--interests",
  dealbreakers: "profile-perimeter-border--section profile-perimeter-border--dealbreakers",
  qualities: "profile-perimeter-border--section profile-perimeter-border--qualities",
  lifestyle: "profile-perimeter-border--section profile-perimeter-border--lifestyle",
};

export default function ProfilePerimeterBorder({
  children,
  className = "",
  delay = 0,
  variant = "default",
  style,
}: ProfilePerimeterBorderProps) {
  const variantClass = VARIANT_CLASS[variant];

  return (
    <div
      className={`profile-perimeter-border ${variantClass} ${className}`.trim()}
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
