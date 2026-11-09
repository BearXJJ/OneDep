import { describe, it, expect } from "vitest";
import { parseAdvice, type Snapshot } from "./copilot.js";
const snapshot: Snapshot = {
  language:"en",
  page: "contact",
  title: "Contact",
  fields: [],
  evidence: [],
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
            suggestions: [],
            question: null,
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

it("rejects suggestions with invented sources or unsupported choices", () => {
  const input: Snapshot = {
    ...snapshot,
    fields: [
      {
        targetId: "source",
        label: "Source",
        disabled: false,
        type: "dropdown",
        help: "",
        canSuggest: true,
        choices: [{ value: "SYNCHROTRON", label: "Synchrotron" }],
        required: true,
        value: "",
        empty: true,
        valid: true,
        websiteInvalid: false,
      },
    ],
    evidence: [{ id: "beamline", source: "CIF", text: "RRCAT BL-21" }],
  };
  const response = (value: string, evidenceIds: string[]) => ({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              title: "Source",
              message: "From the beamline.",
              targetId: "source",
              question: null,
              suggestions: [
                {
                  targetId: "source",
                  value,
                  reason: "Beamline identifies synchrotron",
                  evidenceIds,
                },
              ],
            }),
          },
        ],
      },
    ],
  });
  expect(
    parseAdvice(response("SYNCHROTRON", ["beamline"]), input).suggestions,
  ).toHaveLength(1);
  expect(() =>
    parseAdvice(response("SYNCHROTRON", ["invented"]), input),
  ).toThrow("unknown evidence");
  expect(() =>
    parseAdvice(response("home source", ["beamline"]), input),
  ).toThrow("unknown choice");
});
