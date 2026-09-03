#!/usr/bin/env node
import { ApiError, ServerUnreachableError } from "./api.js";
import { NoTranscriptError } from "./import.js";
import { buildProgram } from "./program.js";

/**
 * The `observatory` binary.
 *
 * Failures a user can act on print one plain line instead of a stack trace: a
 * server that is not running, a transcript that does not exist, an API that
 * refused. Everything else is a bug and gets the stack, because hiding those
 * only makes them harder to report.
 */
function report(error: unknown): never {
  if (
    error instanceof ServerUnreachableError ||
    error instanceof NoTranscriptError ||
    error instanceof ApiError
  ) {
    console.error(error.message);
    process.exit(1);
  }

  // Commander already printed its own message for a usage error.
  if (error instanceof Error && error.name === "CommanderError") process.exit(1);

  throw error;
}

try {
  // `parseAsync`, because several commands are asynchronous. With `parse`, a
  // rejected action surfaces as an unhandled rejection and a zero exit code -
  // a failed command that reports success.
  await buildProgram().parseAsync(process.argv);
} catch (error: unknown) {
  report(error);
}
