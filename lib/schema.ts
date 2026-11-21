import type { PropertyOverrides } from "@/notion.config";

/** Minimal shape of a Notion data source property schema entry. */
export type PropSchema = { name: string; type: string; relation?: { data_source_id?: string } };

export type FieldMap = {
  title?: string;
  due?: string;
  course?: string;
  status?: string;
  priority?: string;
  effort?: string;
  weight?: string;
  plannedDate?: string;
};

export const FIELDS: (keyof FieldMap)[] = ["title", "due", "course", "status", "priority", "effort", "weight", "plannedDate"];

const NUMERIC = ["number", "formula", "rollup"];

type Rule = { types: string[]; name?: RegExp; exclude?: RegExp };

const RULES: Record<keyof FieldMap, Rule[]> = {
  title: [{ types: ["title"] }],
  plannedDate: [{ types: ["date"], name: /planned|do date|scheduled|work on|plan/i }],
  due: [
    { types: ["date"], name: /due|deadline/i },
    { types: ["date", "formula", "rollup"], name: /due|deadline/i },
    { types: ["date"], exclude: /planned|do date|scheduled|start|created|edited|plan/i },
  ],
  course: [
    { types: ["relation"], name: /course|class|subject|module/i },
    { types: ["relation"] },
    { types: ["select", "rich_text", "rollup"], name: /course|class|subject|module/i },
  ],
  status: [
    { types: ["status"] },
    { types: ["select"], name: /status|state|progress/i },
    { types: ["checkbox"], name: /done|complete|submitted|finished/i },
  ],
  priority: [{ types: ["select", "status"], name: /priority|importance/i }],
  effort: [{ types: NUMERIC, name: /effort|estimate|est\.?|duration|time|hours|hrs|minutes|mins/i }],
  weight: [{ types: NUMERIC, name: /weight|worth|% of grade|percent|grade %|value/i }],
};

/**
 * Map a data source's properties to the fields SemesterPilot needs.
 * Explicit overrides win (if the property exists), otherwise rules are tried in order.
 */
export function mapProperties(
  props: Record<string, PropSchema>,
  overrides: PropertyOverrides = {},
  coursesDataSourceId?: string,
): FieldMap {
  const list = Object.values(props);
  const used = new Set<string>();
  const out: FieldMap = {};
  for (const field of FIELDS) {
    const o = overrides[field];
    if (o && props[o]) {
      out[field] = o;
      used.add(o);
    }
  }
  for (const field of FIELDS) {
    if (out[field]) continue;
    const rules = RULES[field];
    if (field === "course" && coursesDataSourceId) {
      const norm = (s?: string) => s?.replace(/-/g, "");
      const linked = list.find((p) => p.type === "relation" && norm(p.relation?.data_source_id) === norm(coursesDataSourceId));
      if (linked && !used.has(linked.name)) {
        out.course = linked.name;
        used.add(linked.name);
        continue;
      }
    }
    for (const r of rules) {
      const hit = list.find(
        (p) => !used.has(p.name) && r.types.includes(p.type) && (!r.name || r.name.test(p.name)) && !(r.exclude && r.exclude.test(p.name)),
      );
      if (hit) {
        out[field] = hit.name;
        used.add(hit.name);
        break;
      }
    }
  }
  return out;
}

export function effortMultiplier(propName: string | undefined, unit: "auto" | "minutes" | "hours"): number {
  if (unit === "hours") return 60;
  if (unit === "minutes") return 1;
  return propName && /hour|hrs|\(h\)/i.test(propName) ? 60 : 1;
}

type RichText = { plain_text: string }[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProp = any;

/** Read a Notion page property value as a plain JS value. */
export function readProp(p: AnyProp): string | number | boolean | string[] | null {
  if (!p) return null;
  const text = (rt: RichText | undefined) => (rt ?? []).map((t) => t.plain_text).join("").trim() || null;
  switch (p.type) {
    case "title":
      return text(p.title);
    case "rich_text":
      return text(p.rich_text);
    case "number":
      return p.number;
    case "checkbox":
      return p.checkbox;
    case "select":
      return p.select?.name ?? null;
    case "status":
      return p.status?.name ?? null;
    case "multi_select":
      return p.multi_select?.map((s: { name: string }) => s.name) ?? null;
    case "date":
      return p.date?.start ?? null;
    case "relation":
      return p.relation?.map((r: { id: string }) => r.id) ?? [];
    case "formula": {
      const f = p.formula;
      if (!f) return null;
      if (f.type === "date") return f.date?.start ?? null;
      return f[f.type] ?? null;
    }
    case "rollup": {
      const r = p.rollup;
      if (!r) return null;
      if (r.type === "number") return r.number;
      if (r.type === "date") return r.date?.start ?? null;
      if (r.type === "array") {
        const first = r.array?.[0];
        return first ? readProp(first) : null;
      }
      return null;
    }
    default:
      return null;
  }
}

export const asNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
