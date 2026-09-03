import {
  DEFAULT_SCORING_CONFIG,
  healthStateFor,
  type HealthState,
  type ScoringConfig,
} from "@observatory/shared";

/**
 * Agent health (BUILD.md sections 25, 26).
 *
 * A weighted average of five measured components, each expressed so that
 * "higher is better", scaled to 0-100.
 *
 * ## Unmeasurable components are excluded, not zeroed
 *
 * This is the load-bearing decision. A session with no failures has no recovery
 * rate - and recovery is 30% of the weighting. Scoring that absence as zero
 * would cap a flawless session at 70 and make "never failed once" look worse
 * than "failed and recovered". So missing components drop out and the remaining
 * weights are renormalised over what was actually measured.
 *
 * The consequence, reported honestly rather than hidden: a score computed from
 * two components is less trustworthy than one computed from five, so
 * `measuredComponents` travels with the score and the UI can say so.
 */

export interface HealthComponent {
  readonly name: keyof ScoringConfig["health"]["weights"];
  /** 0-1, higher is better. Null when the input was not measurable. */
  readonly value: number | null;
  readonly weight: number;
  /** Weight after renormalising over measured components. */
  readonly effectiveWeight: number;
  /** value * effectiveWeight * 100. */
  readonly contribution: number;
}

export interface HealthResult {
  /** 0-100, or null when too little was measurable to score at all. */
  readonly score: number | null;
  readonly state: HealthState | "insufficient_data";
  readonly components: readonly HealthComponent[];
  readonly measuredComponents: number;
}

export interface HealthInputs {
  readonly recoveryRate: number | null;
  readonly toolEfficiency: number | null;
  readonly repetitionRate: number | null;
  readonly goalAdherence: number | null;
  readonly contextPressure: number | null;
}

export function computeHealth(
  inputs: HealthInputs,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): HealthResult {
  const weights = config.health.weights;

  // Each component is stated as "higher is better": repetition and context
  // pressure are inverted here so the weighted sum needs no special cases.
  const raw: readonly { name: HealthComponent["name"]; value: number | null; weight: number }[] = [
    { name: "recovery", value: inputs.recoveryRate, weight: weights.recovery },
    { name: "toolEfficiency", value: inputs.toolEfficiency, weight: weights.toolEfficiency },
    {
      name: "repetitionAvoidance",
      value: inputs.repetitionRate === null ? null : 1 - inputs.repetitionRate,
      weight: weights.repetitionAvoidance,
    },
    { name: "goalAdherence", value: inputs.goalAdherence, weight: weights.goalAdherence },
    {
      name: "contextManagement",
      value: inputs.contextPressure === null ? null : 1 - inputs.contextPressure,
      weight: weights.contextManagement,
    },
  ];

  const measured = raw.filter((component) => component.value !== null);
  const totalWeight = measured.reduce((total, component) => total + component.weight, 0);

  if (measured.length < config.health.minComponents || totalWeight <= 0) {
    return {
      score: null,
      state: "insufficient_data",
      components: raw.map((component) => ({
        ...component,
        effectiveWeight: 0,
        contribution: 0,
      })),
      measuredComponents: measured.length,
    };
  }

  const components: HealthComponent[] = raw.map((component) => {
    if (component.value === null) {
      return { ...component, effectiveWeight: 0, contribution: 0 };
    }
    const effectiveWeight = component.weight / totalWeight;
    return {
      ...component,
      effectiveWeight,
      contribution: component.value * effectiveWeight * 100,
    };
  });

  const score = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        components.reduce((total, part) => total + part.contribution, 0),
      ),
    ),
  );

  return {
    score,
    state: healthStateFor(score, config),
    components,
    measuredComponents: measured.length,
  };
}
