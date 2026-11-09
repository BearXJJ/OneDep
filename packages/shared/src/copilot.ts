import { z } from "zod";
const target = z.object({
  targetId: z.string(),
  label: z.string(),
  disabled: z.boolean(),
});
export const snapshotSchema = z.object({
  language:z.enum(["zh","en"]),
  page: z.string(),
  title: z.string(),
  fields: z.array(
    target.extend({
      type: z.string(),
      help: z.string(),
      canSuggest: z.boolean(),
      choices: z.array(z.object({ value: z.string(), label: z.string() })),
      required: z.boolean(),
      value: z.string(),
      empty: z.boolean(),
      valid: z.boolean(),
      websiteInvalid: z.boolean(),
    }),
  ),
  evidence: z.array(
    z.object({ id: z.string(), source: z.string(), text: z.string() }),
  ),
  errors: z.array(z.object({ targetId: z.string(), text: z.string() })),
  notices: z.array(z.string()),
  busy: z.boolean(),
  buttons: z.array(target),
  focusId: z.string().nullable(),
  text: z.string(),
});
export const copilotRequestSchema = z.object({
  snapshot: snapshotSchema,
  mode: z.enum(["next", "explain", "check", "test"]),
});
export const adviceSchema = z
  .object({
    title: z.string().min(1),
    message: z.string().min(1),
    targetId: z.string().nullable(),
    suggestions: z
      .array(
        z
          .object({
            targetId: z.string(),
            value: z.string(),
            reason: z.string().min(1),
            evidenceIds: z.array(z.string()).min(1),
          })
          .strict(),
      )
      .max(3),
    question: z.string().nullable(),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Advice = z.infer<typeof adviceSchema>;
export type Mode = "next" | "explain" | "check";
export function parseAdvice(response: unknown, snapshot: Snapshot): Advice {
  const envelope = z
    .object({
      choices: z.tuple([
        z.object({
          finish_reason: z.literal("stop"),
          message: z.object({
            role: z.literal("assistant"),
            content: z.string().min(1),
          }),
        }),
      ]),
    })
    .parse(response);
  const advice = adviceSchema.parse(
    JSON.parse(envelope.choices[0].message.content),
  );
  if (
    advice.targetId !== null &&
    ![...snapshot.fields, ...snapshot.buttons, ...snapshot.errors].some(
      (t) => t.targetId === advice.targetId,
    )
  )
    throw new Error("Copilot returned an unknown target: " + advice.targetId);
  for (const suggestion of advice.suggestions) {
    const field = snapshot.fields.find(
      (f) => f.targetId === suggestion.targetId,
    );
    if (!field || field.disabled || !field.canSuggest)
      throw new Error("Copilot suggested an unavailable field");
    if (
      field.choices.length &&
      !field.choices.some((c) => c.value === suggestion.value)
    )
      throw new Error("Copilot suggested an unknown choice");
    if (
      suggestion.evidenceIds.some(
        (id) => !snapshot.evidence.some((e) => e.id === id),
      )
    )
      throw new Error("Copilot cited unknown evidence");
  }
  return advice;
}

export const copilotConfigSchema = z.object({
  autoEnabled: z.boolean(),
  idleMs: z.number().positive(),
  hintIdleMs: z.number().positive(),
  debounceMs: z.number().positive(),
  minIntervalMs: z.number().positive(),
  timeoutMs: z.number().positive(),
});
export type CopilotConfig = z.infer<typeof copilotConfigSchema>;
export type Suggestion = Advice["suggestions"][number];
export { z };
