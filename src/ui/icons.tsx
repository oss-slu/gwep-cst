/**
 * Arrows drawn beside button text. They are decorative: the text is always
 * the control's name, so the icons are hidden from assistive technology.
 */
function Arrow({ points }: { readonly points: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={points} />
    </svg>
  );
}

export function ArrowLeft() {
  return <Arrow points="M19 12H5M11 6l-6 6 6 6" />;
}

export function ArrowRight() {
  return <Arrow points="M5 12h14M13 6l6 6-6 6" />;
}
