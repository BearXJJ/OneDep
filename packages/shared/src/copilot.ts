import { z } from "zod";
const target = z.object({
  targetId: z.string(),
  label: z.string(),
  disabled: z.boolean(),
});
export const snapshotSchema = z.object({
  page: z.string(),
  title: z.string(),
  fields: z.array(
    target.extend({
      type: z.string(),
      required: z.boolean(),
      value: z.string(),
      empty: z.boolean(),
      valid: z.boolean(),
      websiteInvalid: z.boolean(),
    }),
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
  return advice;
}
