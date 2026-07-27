import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20default%20undefined",
      };
    }

    if (specifier === "next/navigation") {
      return nextResolve("next/navigation.js", context);
    }

    if (
      context.parentURL?.startsWith("file:") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !specifier.match(/\.(?:[cm]?[jt]s|json)$/i)
    ) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { shortCircuit: true, url: candidate.href };
      }
    }

    return nextResolve(specifier, context);
  },
});
