import type { z } from "zod";

export interface EventValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

/**
 * Thrown when an incoming payload is not a valid event.
 *
 * Carries the individual issues so the API can return a useful 400 instead of
 * "invalid request", and so a collector reading a malformed transcript line can
 * log precisely what it could not understand.
 */
export class EventValidationError extends Error {
  readonly issues: readonly EventValidationIssue[];

  constructor(issues: readonly EventValidationIssue[]) {
    const summary = issues
      .map((issue) => `${issue.path === "" ? "(root)" : issue.path}: ${issue.message}`)
      .join("; ");
    super(`Invalid agent event - ${summary}`);
    this.name = "EventValidationError";
    this.issues = issues;
  }

  static fromZodError(error: z.ZodError): EventValidationError {
    return new EventValidationError(
      error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
        code: issue.code,
      })),
    );
  }

  toJSON(): { error: string; issues: readonly EventValidationIssue[] } {
    return { error: "invalid_event", issues: this.issues };
  }
}
