import type {
  HttpMethod,
  MatchedOperation,
  OpenApiSpec,
  Operation,
  Parameter,
  PathItem,
} from "./types.js";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

function inheritParameters(
  operation: Operation,
  inherited?: Parameter[]
): Operation {
  if (!inherited?.length) {
    return operation;
  }
  const parameters = new Map<string, Parameter>();
  for (const parameter of [...inherited, ...(operation.parameters ?? [])]) {
    const name =
      parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name;
    parameters.set(`${parameter.in}:${name}`, parameter);
  }
  return { ...operation, parameters: [...parameters.values()] };
}

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
    if (!HTTP_METHODS.has(normalizedMethod)) {
      return null;
    }

    for (const entry of compiled) {
      const match = entry.regex.exec(pathname);
      // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for non-matching paths.
      if (!match) {
        continue;
      }

      const operation = entry.pathItem[normalizedMethod];
      if (!operation) {
        return null;
      }

      const pathParams: Record<string, string> = {};
      for (let i = 0; i < entry.paramNames.length; i += 1) {
        Object.defineProperty(pathParams, entry.paramNames[i], {
          configurable: true,
          enumerable: true,
          value: decodePathParameter(match[i + 1]),
          writable: true,
        });
      }

      return {
        operation: inheritParameters(operation, entry.pathItem.parameters),
        pathParams,
        pathTemplate: entry.template,
      };
    }

    return null;
  };
}
