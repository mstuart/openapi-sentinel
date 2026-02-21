import type { OpenApiSpec } from './types.js';

/**
 * Parse an OpenAPI spec from a string (JSON) or return as-is if already an object.
 * YAML is not supported directly — users should use js-yaml to parse YAML before passing.
 */
export function loadSpec(spec: object | string): OpenApiSpec {
  if (typeof spec === 'string') {
    try {
      return JSON.parse(spec) as OpenApiSpec;
    } catch {
      throw new Error(
        'Failed to parse spec string as JSON. For YAML specs, parse with js-yaml first and pass the resulting object.'
      );
    }
  }
  return spec as OpenApiSpec;
}
