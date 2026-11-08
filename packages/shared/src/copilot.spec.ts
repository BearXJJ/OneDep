import { describe, it, expect } from "vitest";
import { parseAdvice, type Snapshot } from "./copilot.js";
const snapshot: Snapshot = {
  page: "contact",
  title: "Contact",
  fields: [],
  errors: [],
  notices: [],
  busy: false,
  buttons: [{ targetId: "save", label: "Save", disabled: false }],
  focusId: null,
  text: "",
};
const reply = (targetId: string) => ({
  status: "completed",
  output: [
    { type: "reasoning" },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            title: "Save draft",
            message: "Save the contact information.",
            targetId,
          }),
        },
      ],
    },
  ],
});
describe("Copilot response binding", () => {
  it("accepts a target on the supplied page and rejects a fabricated one", () => {
    expect(parseAdvice(reply("save"), snapshot).targetId).toBe("save");
    expect(() => parseAdvice(reply("invented"), snapshot)).toThrow(
      "unknown target",
    );
  });
  it("rejects incomplete responses and invalid JSON without fabricated advice", () => {
    expect(() =>
      parseAdvice({ ...reply("save"), status: "incomplete" }, snapshot),
    ).toThrow();
    expect(() =>
      parseAdvice(
        {
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "not JSON" }],
            },
          ],
        },
        snapshot,
      ),
    ).toThrow();
  });
});
