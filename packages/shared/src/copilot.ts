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
      status: z.literal("completed"),
      output: z.array(
        z.object({
          type: z.string(),
          content: z
            .array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
                refusal: z.string().optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .parse(response);
  const texts: string[] = [];
  for (const item of envelope.output) {
    if (item.type !== "message") continue;
    if (!item.content) throw new Error("Responses message has no content");
    for (const part of item.content) {
      if (part.type === "refusal") throw new Error(part.refusal);
      if (part.type === "output_text") {
        if (part.text === undefined)
          throw new Error("Responses output_text has no text");
        texts.push(part.text);
      }
    }
  }
  const advice = adviceSchema.parse(JSON.parse(texts.join("\n")));
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
