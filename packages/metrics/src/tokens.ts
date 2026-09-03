import type {
  AgentEvent,
  ContextUsage,
  CostEstimate,
  MaximumSource,
  ModelPricing,
  PricingRegistry,
  TokenUsage,
} from "@observatory/shared";

import { rate } from "./ratio.js";

/**
 * Tokens, context and cost (BUILD.md sections 29, 30).
 *
 * The rule that governs this whole module: an unknown is reported as unknown.
 * No context maximum is inferred from a model name we do not have pricing or
 * limits for, and no cost is estimated without configured pricing.
 */

export function computeTokenUsage(events: readonly AgentEvent[]): TokenUsage {
  let input = 0;
  let output = 0;
  let cached = 0;

  for (const event of events) {
    input += event.tokens?.input ?? 0;
    output += event.tokens?.output ?? 0;
    cached += event.tokens?.cached ?? 0;
  }

  return { input, output, cached, total: input + output + cached };
}

export interface ContextOptions {
  /**
   * A maximum the agent itself reported. Codex reports `model_context_window`
   * per turn, so for Codex sessions this is a measured value.
   */
  readonly reportedMaximum?: number | null;
  /**
   * A maximum from local configuration, used when the agent does not report
   * one. Claude Code transcripts do not state a context limit, so any figure
   * for them is configured, and the UI must label it as such.
   */
  readonly configuredMaximum?: number | null;
}

/**
 * Context utilization (section 29).
 *
 * "Used" is the size of the live context, which is NOT the sum of all tokens
 * ever spent. The last reported input plus cached read is the closest honest
 * approximation available from event data: it is what the model was handed on
 * the most recent turn. Summing every turn would produce a number many times
 * larger than any real window and a utilization above 100%.
 */
export function computeContextUsage(
  events: readonly AgentEvent[],
  options: ContextOptions = {},
): ContextUsage {
  const tokens = computeTokenUsage(events);

  let used = 0;
  for (const event of events) {
    if (event.tokens === undefined) continue;
    const live = (event.tokens.input ?? 0) + (event.tokens.cached ?? 0);
    // Later events overwrite rather than accumulate: context is a level, not a
    // total. Take the largest seen so a mid-session compaction does not make
    // the session look like it never filled up.
    if (live > used) used = live;
  }

  let maximum: number | null = null;
  let maximumSource: MaximumSource = "unknown";

  if (typeof options.reportedMaximum === "number" && options.reportedMaximum > 0) {
    maximum = options.reportedMaximum;
    maximumSource = "reported";
  } else if (typeof options.configuredMaximum === "number" && options.configuredMaximum > 0) {
    maximum = options.configuredMaximum;
    maximumSource = "configured";
  }

  return {
    tokens,
    used,
    maximum,
    maximumSource,
    utilization: maximum === null ? null : rate(used, maximum),
  };
}

export interface CostOptions {
  /**
   * A figure the agent reported. Claude Code records real spend in its
   * transcript, so this is preferred over any estimate.
   */
  readonly reportedUsd?: number | null;
  /** Pricing for this session's model, from configuration. */
  readonly pricing?: ModelPricing | undefined;
}

/**
 * Session cost (section 30).
 *
 * Order of preference:
 *
 * 1. A reported figure, used as-is.
 * 2. An estimate from configured pricing, labelled `estimated`.
 * 3. `unavailable`, with a null amount.
 *
 * No pricing table ships with this package. Section 30 forbids hard-coding one
 * model's pricing into the analytics engine, and a stale built-in table would
 * be worse than an honest "Cost unavailable" - it would be wrong silently.
 */
export function computeCost(tokens: TokenUsage, options: CostOptions = {}): CostEstimate {
  if (typeof options.reportedUsd === "number" && Number.isFinite(options.reportedUsd)) {
    return { amountUsd: options.reportedUsd, source: "reported" };
  }

  const pricing = options.pricing;
  if (pricing === undefined) {
    return { amountUsd: null, source: "unavailable" };
  }

  const perMillion = (count: number, price: number): number => (count / 1_000_000) * price;
  const cachedPrice = pricing.cachedInputPerMillionUsd ?? pricing.inputPerMillionUsd;

  const amountUsd =
    perMillion(tokens.input, pricing.inputPerMillionUsd) +
    perMillion(tokens.output, pricing.outputPerMillionUsd) +
    perMillion(tokens.cached, cachedPrice);

  return { amountUsd, source: "estimated" };
}

/**
 * Looks up pricing for a model.
 *
 * Exact match only. Prefix or fuzzy matching would silently price
 * `claude-opus-5` using a `claude-opus-4` entry, and a wrong number presented
 * confidently is the failure mode this whole product is meant to avoid.
 */
export function resolvePricing(
  model: string | null | undefined,
  registry: PricingRegistry | undefined,
): ModelPricing | undefined {
  if (model === null || model === undefined || registry === undefined) return undefined;
  return registry[model];
}
