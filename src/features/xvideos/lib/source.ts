// Where the X Videos desk gets its clips: "demo" (default: the 26 sample clips in ../data) or "api" (the backend's
// /xvideos routes: the real clips on the video share). NEXT_PUBLIC_XVIDEOS_SOURCE=api switches it.
export const XVIDEOS_SOURCE: "demo" | "api" = process.env.NEXT_PUBLIC_XVIDEOS_SOURCE === "api" ? "api" : "demo";
