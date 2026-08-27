import type {
  HttpMethod,
  MatchedOperation,
  OpenApiSpec,
  PathItem,
} from "./types.js";

interface CompiledPath {
  paramNames: string[];
  pathItem: PathItem;
  regex: RegExp;
  template: string;
}

function decodePathParameter(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Compile OpenAPI path templates into regexes for efficient matching.
 * E.g. "/users/{id}" → /^\/users\/([^/]+)$/
 */
function compilePaths(spec: OpenApiSpec): CompiledPath[] {
  const compiled: CompiledPath[] = [];

  for (const [template, pathItem] of Object.entries(spec.paths)) {
    const paramNames: string[] = [];
    // Escape regex special chars except {}, then replace {param} with capture group
    const regexStr = template
      .replace(/[.*+?^${}()|[\]\\]/g, (match) => {
        if (match === "{" || match === "}") {
          return match;
        }
        return `\\${match}`;
      })
      .replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
        paramNames.push(paramName);
        return "([^/]+)";
      });

    compiled.push({
      paramNames,
      pathItem,
      regex: new RegExp(`^${regexStr}$`),
      template,
    });
  }

  // Sort so that concrete paths come before parameterized ones
  // e.g. "/users/me" before "/users/{id}"
  compiled.sort((a, b) => {
    const aParams = a.paramNames.length;
    const bParams = b.paramNames.length;
    if (aParams !== bParams) {
      return aParams - bParams;
    }
    return a.template.localeCompare(b.template);
  });

  return compiled;
}

export function createMatcher(spec: OpenApiSpec) {
  const compiled = compilePaths(spec);

  return function matchOperation(
    method: string,
    pathname: string
  ): MatchedOperation | null {
    const normalizedMethod = method.toLowerCase() as HttpMethod;

    for (const entry of compiled) {
      const match = entry.regex.exec(pathname);
      // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for non-matching paths.
      if (!match) {
        continue;
      }

      const operation = entry.pathItem[normalizedMethod];
      if (!operation) {
        continue;
      }

      const pathParams: Record<string, string> = {};
      for (let i = 0; i < entry.paramNames.length; i += 1) {
        pathParams[entry.paramNames[i]] = decodePathParameter(match[i + 1]);
      }

      return {
        operation,
        pathParams,
        pathTemplate: entry.template,
      };
    }

    return null;
  };
}
