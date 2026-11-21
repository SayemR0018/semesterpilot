import "server-only";
import {
  APIErrorCode,
  Client,
  collectPaginatedAPI,
  extractNotionId,
  isFullDataSource,
  isFullPage,
  isNotionClientError,
} from "@notionhq/client";
import type { DataSourceObjectResponse, PageObjectResponse } from "@notionhq/client";
import config from "@/notion.config";
import type { Plan } from "./scoring";
import { asNumber, effortMultiplier, mapProperties, readProp, type FieldMap, type PropSchema } from "./schema";
import type { Assignment } from "./types";

export const NOTION_VERSION = "2026-03-11";

export class SetupError extends Error {}

let client: Client | null = null;
export function notion(): Client {
  if (!process.env.NOTION_API_KEY) throw new SetupError("NOTION_API_KEY is not set");
  client ??= new Client({ auth: process.env.NOTION_API_KEY, notionVersion: NOTION_VERSION });
  return client;
}

const plain = (rt: { plain_text: string }[]) => rt.map((t) => t.plain_text).join("");

export type Schema = {
  assignments: DataSourceObjectResponse;
  courses: DataSourceObjectResponse | null;
  fields: FieldMap;
  warnings: string[];
};

/** Resolve a configured ID (database ID, data source ID, or URL) to a data source. */
async function resolveDataSource(idOrUrl: string): Promise<DataSourceObjectResponse> {
  const id = extractNotionId(idOrUrl) ?? idOrUrl;
  try {
    const ds = await notion().dataSources.retrieve({ data_source_id: id });
    if (isFullDataSource(ds)) return ds;
  } catch (err) {
    if (!isNotionClientError(err) || err.code !== APIErrorCode.ObjectNotFound) throw err;
  }
  const db = await notion().databases.retrieve({ database_id: id });
  const first = "data_sources" in db ? db.data_sources[0] : undefined;
  if (!first) throw new SetupError(`Database ${id} has no data sources`);
  const ds = await notion().dataSources.retrieve({ data_source_id: first.id });
  if (!isFullDataSource(ds)) throw new SetupError(`Could not read data source ${first.id}`);
  return ds;
}

/** Search every data source shared with the integration and pick the best title match. */
async function searchDataSources(): Promise<DataSourceObjectResponse[]> {
  const out: DataSourceObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion().search({
      filter: { property: "object", value: "data_source" },
      page_size: 100,
      start_cursor: cursor,
    });
    for (const r of res.results) if (isFullDataSource(r) && !r.in_trash) out.push(r);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

let schemaCache: { at: number; schema: Schema } | null = null;

export async function discoverSchema(): Promise<Schema> {
  if (schemaCache && Date.now() - schemaCache.at < 5 * 60_000) return schemaCache.schema;
  const warnings: string[] = [];
  const needSearch = !config.assignments.id || !config.courses.id;
  const all = needSearch ? await searchDataSources() : [];
  const byTitle = (re: RegExp, exclude?: string) =>
    all
      .filter((d) => d.id !== exclude && re.test(plain(d.title)))
      .sort((a, b) => Object.keys(b.properties).length - Object.keys(a.properties).length)[0];

  const assignments = config.assignments.id
    ? await resolveDataSource(config.assignments.id)
    : byTitle(config.assignments.titleMatch) ??
      all.find((d) => d.database_type === "tasks") ??
      all.find((d) => Object.values(d.properties).some((p) => p.type === "date"));
  if (!assignments) {
    throw new SetupError(
      all.length
        ? `Found ${all.length} database(s) but none look like Assignments/Tasks (${all.map((d) => plain(d.title)).join(", ")}). Set NOTION_ASSIGNMENTS_DB_ID or edit notion.config.ts.`
        : "No databases are shared with your integration. Share your Courses and Assignments databases with it (••• → Connections).",
    );
  }
  const courses = config.courses.id
    ? await resolveDataSource(config.courses.id)
    : byTitle(config.courses.titleMatch, assignments.id) ?? null;
  if (!courses) warnings.push("No Courses database found; using the course property text where possible.");

  const fields = mapProperties(
    assignments.properties as unknown as Record<string, PropSchema>,
    config.assignments.properties,
    courses?.id,
  );
  if (!fields.due) warnings.push(`No due date property found in "${plain(assignments.title)}"; urgency will be low for all items.`);
  if (!fields.effort) warnings.push("No effort/estimate property found; assuming 60 min per assignment.");
  if (!fields.weight) warnings.push("No weight property found; using Priority (or 10%) instead.");

  const schema = { assignments, courses, fields, warnings };
  schemaCache = { at: Date.now(), schema };
  return schema;
}

async function loadCourseNames(courses: DataSourceObjectResponse | null): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!courses) return names;
  const pages = await collectPaginatedAPI(notion().dataSources.query, { data_source_id: courses.id, page_size: 100 });
  const titleProp =
    config.courses.nameProperty ?? Object.values(courses.properties).find((p) => p.type === "title")?.name ?? "Name";
  for (const p of pages) if (isFullPage(p)) names.set(p.id, String(readProp(p.properties[titleProp]) ?? "Untitled course"));
  return names;
}

function toAssignment(page: PageObjectResponse, fields: FieldMap, courseNames: Map<string, string>): Assignment {
  const get = (f?: string) => (f ? readProp(page.properties[f]) : null);
  const courseRaw = get(fields.course);
  const course = Array.isArray(courseRaw)
    ? courseRaw.map((id) => courseNames.get(id) ?? "").filter(Boolean).join(", ") || "No course"
    : courseRaw
      ? String(courseRaw)
      : "No course";
  const statusRaw = get(fields.status);
  const status =
    typeof statusRaw === "boolean"
      ? statusRaw ? "Done" : "Open"
      : statusRaw && config.doneStatuses.includes(String(statusRaw).toLowerCase())
        ? "Done"
        : (statusRaw as string | null);
  const effort = asNumber(get(fields.effort));
  const due = get(fields.due);
  return {
    id: page.id,
    title: String(get(fields.title) ?? "Untitled"),
    course,
    due: typeof due === "string" ? due.slice(0, 10) : null,
    status,
    effortMinutes: effort === null ? null : Math.round(effort * effortMultiplier(fields.effort, config.effortUnit)),
    weight: asNumber(get(fields.weight)),
    priority: (get(fields.priority) as string | null) ?? null,
    url: page.url,
  };
}

export async function loadNotionAssignments(): Promise<{ assignments: Assignment[]; warnings: string[] }> {
  const schema = await discoverSchema();
  const [pages, courseNames] = await Promise.all([
    collectPaginatedAPI(notion().dataSources.query, { data_source_id: schema.assignments.id, page_size: 100 }),
    loadCourseNames(schema.courses),
  ]);
  const assignments = pages.filter(isFullPage).filter((p) => !p.in_trash).map((p) => toAssignment(p, schema.fields, courseNames));
  return { assignments, warnings: schema.warnings };
}

export type PushResult = { url: string; updated: number; skipped: string[] };

/** Create the plan page (markdown → blocks) and optionally stamp Planned Date / Priority on assignments. */
export async function pushPlanToNotion(plan: Plan, title: string, markdown: string, today: string): Promise<PushResult> {
  const schema = await discoverSchema();
  const skipped: string[] = [];
  const parentId =
    config.writeBack.planParentPageId ??
    (schema.assignments.database_parent?.type === "page_id" ? schema.assignments.database_parent.page_id : undefined);
  const page = await notion().pages.create({
    ...(parentId ? { parent: { page_id: extractNotionId(parentId) ?? parentId } } : {}),
    icon: { type: "emoji", emoji: "🧭" },
    properties: { title: { title: [{ text: { content: title } }] } },
    markdown,
  });
  const url = "url" in page ? page.url : `https://www.notion.so/${page.id.replace(/-/g, "")}`;

  const scheduled = plan.decisions.filter((d) => d.allocatedMinutes > 0);
  const { plannedDate, priority } = schema.fields;
  type PropsArg = Parameters<Client["pages"]["update"]>[0]["properties"];
  const priorityProp = priority ? schema.assignments.properties[priority] : undefined;
  const priorityOptions =
    priorityProp?.type === "select" ? priorityProp.select.options.map((o) => o.name) : [];
  const pickOption = (re: RegExp) => priorityOptions.find((o) => re.test(o));
  const levels = [pickOption(/high|urgent|p1/i), pickOption(/med|normal|p2/i), pickOption(/low|p3/i)];

  if (!config.writeBack.plannedDate) skipped.push("Planned Date write-back disabled in notion.config.ts");
  else if (!plannedDate) skipped.push("no Planned Date property");
  if (config.writeBack.priority && (!priority || !levels.some(Boolean))) skipped.push("no Priority select with High/Medium/Low options");

  let updated = 0;
  for (const d of scheduled) {
    const properties: NonNullable<PropsArg> = {};
    if (config.writeBack.plannedDate && plannedDate) properties[plannedDate] = { date: { start: today } };
    if (config.writeBack.priority && priority && priorityProp?.type === "select") {
      const level = d.rank <= 3 ? levels[0] : levels[1] ?? levels[0];
      if (level) properties[priority] = { select: { name: level } };
    }
    if (!Object.keys(properties).length) break;
    try {
      await notion().pages.update({ page_id: d.assignmentId, properties });
      updated++;
    } catch (err) {
      skipped.push(`${d.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { url, updated, skipped };
}

/** Human-friendly message + hint for Notion API errors. */
export function describeNotionError(err: unknown): { error: string; hint?: string } {
  if (isNotionClientError(err)) {
    if (err.code === APIErrorCode.Unauthorized)
      return { error: "Notion rejected the token (unauthorized).", hint: "Check NOTION_API_KEY in .env.local; tokens start with ntn_." };
    if (err.code === APIErrorCode.ObjectNotFound || err.code === APIErrorCode.RestrictedResource)
      return {
        error: err.message,
        hint: "Share your Courses and Assignments databases (and the plan parent page) with the integration: ••• → Connections.",
      };
    if (err.code === APIErrorCode.RateLimited) return { error: "Notion rate limit hit.", hint: "Wait a few seconds and retry." };
    return { error: err.message };
  }
  if (err instanceof SetupError) return { error: err.message, hint: "See the README section 'Notion Student OS integration'." };
  return { error: err instanceof Error ? err.message : String(err) };
}
