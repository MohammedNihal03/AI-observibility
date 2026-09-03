import Image from "next/image";

/**
 * The drifting backdrop.
 *
 * Two Claude marks, repeated at different scales and depths, slowly moving on a
 * fixed layer behind everything. Three rules keep it from turning into
 * decoration that fights the data:
 *
 * - it is `fixed` and `pointer-events-none`, so it never scrolls (repainting a
 *   blurred layer inside a scroll container is what makes pages like this
 *   stutter) and never intercepts a click;
 * - only `transform` and `opacity` animate, so the whole field stays on the
 *   compositor;
 * - opacity tops out low. The marks are atmosphere. The numbers on top of them
 *   are the product.
 */

interface Mark {
  readonly src: string;
  readonly size: number;
  readonly top: string;
  readonly left: string;
  readonly opacity: number;
  readonly blur: number;
  readonly duration: number;
  readonly delay: number;
}

const MARKS: readonly Mark[] = [
  {
    src: "/brand/claude-mark.png",
    size: 260,
    top: "-2%",
    left: "66%",
    opacity: 0.16,
    blur: 0,
    duration: 34,
    delay: 0,
  },
  {
    src: "/brand/claude-code-mark.png",
    size: 108,
    top: "14%",
    left: "6%",
    opacity: 0.14,
    blur: 0,
    duration: 41,
    delay: -8,
  },
  {
    src: "/brand/claude-mark.png",
    size: 132,
    top: "44%",
    left: "90%",
    opacity: 0.13,
    blur: 0,
    duration: 47,
    delay: -19,
  },
  {
    src: "/brand/claude-code-mark.png",
    size: 168,
    top: "66%",
    left: "12%",
    opacity: 0.11,
    blur: 1,
    duration: 39,
    delay: -26,
  },
  {
    src: "/brand/claude-mark.png",
    size: 92,
    top: "84%",
    left: "52%",
    opacity: 0.15,
    blur: 0,
    duration: 29,
    delay: -13,
  },
  {
    src: "/brand/claude-code-mark.png",
    size: 74,
    top: "30%",
    left: "40%",
    opacity: 0.08,
    blur: 1,
    duration: 52,
    delay: -34,
  },
  {
    src: "/brand/claude-mark.png",
    size: 118,
    top: "92%",
    left: "84%",
    opacity: 0.1,
    blur: 0.5,
    duration: 44,
    delay: -21,
  },
];

export function BackgroundField() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Ambient clay light, so the marks read as lit rather than pasted on. */}
      <div className="absolute -left-[18%] -top-[28%] size-[820px] rounded-full bg-clay/[0.07] blur-[140px]" />
      <div className="absolute -right-[22%] top-[34%] size-[680px] rounded-full bg-clay-deep/[0.06] blur-[150px]" />

      {MARKS.map((mark, index) => (
        <div
          key={`${mark.src}-${index}`}
          className="absolute will-change-transform"
          style={{
            top: mark.top,
            left: mark.left,
            opacity: mark.opacity,
            filter: `drop-shadow(0 0 18px rgb(217 119 87 / 0.8)) drop-shadow(0 0 55px rgb(217 119 87 / 0.45)) blur(${mark.blur}px)`,
            animation: `drift ${mark.duration}s ease-in-out ${mark.delay}s infinite`,
          }}
        >
          <Image
            src={mark.src}
            alt=""
            width={mark.size}
            height={mark.size}
            priority={index < 2}
            className="select-none"
          />
        </div>
      ))}

      {/* Vignette: pulls the eye back to the centre column without swallowing
          the marks, which is why it stays transparent well past the midpoint. */}
      <div className="absolute inset-0 bg-[radial-gradient(135%_95%_at_50%_10%,transparent_58%,color-mix(in_oklab,var(--color-canvas-deep)_88%,transparent)_100%)]" />

      {/* Film grain. Fixed layer only - never inside anything that scrolls. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
