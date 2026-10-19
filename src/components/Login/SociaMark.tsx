import React from "react";

// The Socia mark: a story at the centre of the ring, and a second dot that has left through
// the opening on the right, out to the platforms. It pairs with the assignment desk's mark,
// where a story comes in from the left. Drawn in currentColor so it follows the text colour.
// app/icon.svg is the same mark on a tile.
export default function SociaMark({ size = 28 }: { size?: number }) {
  return (
    <svg height={size} width={(size * 130) / 110} viewBox="0 0 130 110" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M89.64 75 A40 40 0 1 1 89.64 35" stroke="currentColor" strokeWidth="15" />
      <circle cx="55" cy="55" r="13" fill="currentColor" />
      <circle cx="115" cy="55" r="13" fill="currentColor" />
    </svg>
  );
}
