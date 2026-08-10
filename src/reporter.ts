import { writeFileSync } from "node:fs";
import type { Violation } from "./types.js";

export class DriftReporter {
  private readonly violations: Violation[] = [];
  private readonly driftReportPath: string | undefined;

  constructor(driftReportPath?: string) {
    this.driftReportPath = driftReportPath;

    if (this.driftReportPath) {
      this.registerExitHandler();
    }
  }

  add(violations: Violation[]): void {
    this.violations.push(...violations);
  }

  getViolations(): Violation[] {
    return [...this.violations];
  }

  private registerExitHandler(): void {
    process.on("exit", () => {
      if (this.driftReportPath && this.violations.length > 0) {
        try {
          writeFileSync(
            this.driftReportPath,
            JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                totalViolations: this.violations.length,
                violations: this.violations,
              },
              null,
              2
            )
          );
        } catch {
          // Best-effort write on exit — nothing we can do if it fails
        }
      }
    });
  }
}
