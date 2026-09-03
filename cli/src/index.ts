#!/usr/bin/env node
import { buildProgram, NotImplementedYetError } from "./program.js";

import { ServerUnreachableError } from "./api.js";

function report(error: unknown): never {
  // Two failures a user can act on get a plain message instead of a stack: a
  // command that does not exist yet, and a server that is not running.
  if (error instanceof NotImplementedYetError || error instanceof ServerUnreachableError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

try {
  // `parseAsync`, because `demo --stream` is asynchronous. With `parse`, a
  // rejected action would surface as an unhandled rejection and a zero exit
  // code - a failed stream that reports success.
  await buildProgram().parseAsync(process.argv);
} catch (error: unknown) {
  report(error);
}
