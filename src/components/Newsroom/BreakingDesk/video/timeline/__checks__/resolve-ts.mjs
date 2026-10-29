// Lets plain node (>= 23.6, native type stripping) run the studio's .ts files, whose imports omit the extension.
// Usage: node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs <file.check.ts>
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
      try { return await next(specifier + ".ts", context); } catch {}
      return next(specifier + "/index.ts", context);
    }
    throw err;
  }
}`),
);
