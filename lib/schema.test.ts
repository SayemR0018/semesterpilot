import { describe, expect, it } from "vitest";
import { asNumber, effortMultiplier, mapProperties, readProp, type PropSchema } from "./schema";

const schema = (entries: [string, string, string?][]): Record<string, PropSchema> =>
  Object.fromEntries(entries.map(([name, type, ds]) => [name, { name, type, ...(ds ? { relation: { data_source_id: ds } } : {}) }]));

describe("mapProperties", () => {
  it("auto-maps a typical Student OS assignments database", () => {
    const fields = mapProperties(
      schema([
        ["Assignment", "title"],
        ["Due Date", "date"],
        ["Do Date", "date"],
        ["Class", "relation", "ds-courses"],
        ["Status", "status"],
        ["Priority", "select"],
        ["Est. Hours", "number"],
        ["Weight (%)", "number"],
      ]),
      {},
      "ds-courses",
    );
    expect(fields).toEqual({
      title: "Assignment",
      due: "Due Date",
      plannedDate: "Do Date",
      course: "Class",
      status: "Status",
      priority: "Priority",
      effort: "Est. Hours",
      weight: "Weight (%)",
    });
  });

  it("handles checkbox status, select course and missing fields", () => {
    const fields = mapProperties(schema([["Name", "title"], ["Deadline", "date"], ["Done", "checkbox"], ["Course", "select"]]));
    expect(fields).toEqual({ title: "Name", due: "Deadline", status: "Done", course: "Course" });
  });

  it("prefers overrides from notion.config.ts when the property exists", () => {
    const fields = mapProperties(schema([["Name", "title"], ["When", "date"], ["Exam date", "date"]]), { due: "When", effort: "Nope" });
    expect(fields.due).toBe("When");
    expect(fields.effort).toBeUndefined();
  });
});

describe("value helpers", () => {
  it("reads common property types", () => {
    expect(readProp({ type: "title", title: [{ plain_text: "Lab " }, { plain_text: "5" }] })).toBe("Lab 5");
    expect(readProp({ type: "date", date: { start: "2026-11-21T10:00:00Z" } })).toBe("2026-11-21T10:00:00Z");
    expect(readProp({ type: "formula", formula: { type: "number", number: 3 } })).toBe(3);
    expect(readProp({ type: "relation", relation: [{ id: "a" }] })).toEqual(["a"]);
    expect(readProp({ type: "status", status: null })).toBeNull();
  });
  it("parses numbers and effort units", () => {
    expect(asNumber("15%")).toBe(15);
    expect(asNumber(null)).toBeNull();
    expect(effortMultiplier("Est. Hours", "auto")).toBe(60);
    expect(effortMultiplier("Effort (min)", "auto")).toBe(1);
  });
});
