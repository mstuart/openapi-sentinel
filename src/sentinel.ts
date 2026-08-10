import { loadSpec } from "./loader.js";
import { createMatcher } from "./matcher.js";
import { DriftReporter } from "./reporter.js";
import type { SentinelOptions, Violation } from "./types.js";
import {
  validateRequest as doValidateRequest,
  validateResponse as doValidateResponse,
} from "./validator.js";

export class OpenApiSentinel {
  private readonly match: ReturnType<typeof createMatcher>;
  private readonly onViolation: "throw" | "warn" | "log";
  private readonly reporter: DriftReporter;
  private readonly validateReq: boolean;
  private readonly validateRes: boolean;

  constructor(opts: SentinelOptions) {
    const spec = loadSpec(opts.spec);
    this.match = createMatcher(spec);
    this.reporter = new DriftReporter(opts.report?.driftReportPath);
    this.validateReq = opts.validate.request !== false;
    this.validateRes = opts.validate.response === true;
    this.onViolation = opts.validate.onViolation;
  }

  /**
   * Web Standards middleware compatible with Hono and similar frameworks.
   * Signature: (req: Request, next: () => Promise<Response>) => Promise<Response>
   */
  middleware(): (
    req: Request,
    next: () => Promise<Response>
  ) => Promise<Response> {
    return async (
      req: Request,
      next: () => Promise<Response>
    ): Promise<Response> => {
      const { pathname } = new URL(req.url, "http://localhost");
      const matched = this.match(req.method, pathname);

      // If the path is not in the spec, pass through
      if (!matched) {
        return next();
      }

      // Validate request
      if (this.validateReq) {
        const violations = await doValidateRequest(req, matched, pathname);
        if (violations.length > 0) {
          this.handleViolations(violations);
        }
      }

      // Call next handler
      const response = await next();

      // Validate response
      if (this.validateRes) {
        const violations = await doValidateResponse(
          req,
          response,
          matched,
          pathname
        );
        if (violations.length > 0) {
          this.handleViolations(violations);
        }
      }

      return response;
    };
  }

  /**
   * Directly validate a request (useful for testing).
   */
  async validateRequest(req: Request): Promise<Violation[]> {
    const { pathname } = new URL(req.url, "http://localhost");
    const matched = this.match(req.method, pathname);

    if (!matched) {
      return [];
    }

    const violations = await doValidateRequest(req, matched, pathname);
    this.reporter.add(violations);
    return violations;
  }

  /**
   * Directly validate a response (useful for testing).
   */
  async validateResponse(req: Request, res: Response): Promise<Violation[]> {
    const { pathname } = new URL(req.url, "http://localhost");
    const matched = this.match(req.method, pathname);

    if (!matched) {
      return [];
    }

    const violations = await doValidateResponse(req, res, matched, pathname);
    this.reporter.add(violations);
    return violations;
  }

  /**
   * Get all accumulated violations.
   */
  getViolations(): Violation[] {
    return this.reporter.getViolations();
  }

  private handleViolations(violations: Violation[]): void {
    this.reporter.add(violations);

    switch (this.onViolation) {
      case "throw":
        throw new Error(
          `OpenAPI violation: ${violations.map((v) => v.issue).join("; ")}`
        );
      case "warn":
        for (const v of violations) {
          console.warn(
            `[openapi-sentinel] ${v.type} ${v.method} ${v.path}: ${v.issue}`
          );
        }
        break;
      case "log":
        for (const v of violations) {
          console.log(
            `[openapi-sentinel] ${v.type} ${v.method} ${v.path}: ${v.issue}`
          );
        }
        break;
      default:
        return;
    }
  }
}

export function createSentinel(opts: SentinelOptions): OpenApiSentinel {
  return new OpenApiSentinel(opts);
}
