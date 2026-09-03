import type { SVGProps } from "react";

/**
 * Icon primitives.
 *
 * Hand-drawn on a 24-unit grid at a single stroke weight rather than pulled
 * from an icon package: the set is six glyphs, and a dependency for six glyphs
 * is a dependency that has to be kept current forever.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Icon>
  );
}

export function TrendUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17 9.5 10.5l4 4L21 7" />
      <path d="M15 7h6v6" />
    </Icon>
  );
}

export function TrendDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7l6.5 6.5 4-4L21 17" />
      <path d="M15 17h6v-6" />
    </Icon>
  );
}

export function TrendFlat(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h18" />
      <path d="M16 7l5 5-5 5" />
    </Icon>
  );
}

export function Check(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 12.5 5 5L20 6.5" />
    </Icon>
  );
}

export function Cross(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function Alert(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </Icon>
  );
}

export function Dot(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function FileGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5L13.5 3Z" />
      <path d="M13.5 3v5.5H19" />
    </Icon>
  );
}

export function PencilGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </Icon>
  );
}

export function TerminalGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 8 3.5 3.5L5 15" />
      <path d="M12 16h7" />
    </Icon>
  );
}

export function SparkGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="m6.5 6.5 3.2 3.2M14.3 14.3l3.2 3.2M17.5 6.5l-3.2 3.2M9.7 14.3l-3.2 3.2" />
    </Icon>
  );
}
