#!/usr/bin/env node
import { buildProgram, NotImplementedYetError } from "./program.js";

try {
  buildProgram().parse(process.argv);
} catch (error: unknown) {
  if (error instanceof NotImplementedYetError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
