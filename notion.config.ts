/**
 * Optional overrides for Notion schema discovery.
 *
 * SemesterPilot auto-discovers your Courses and Assignments databases by title and maps
 * properties by name/type. If your Student OS uses different names, set them here.
 * Leave a value as `undefined` to keep auto-discovery for it.
 *
 * IDs can be a database ID, a data source ID, or a full Notion URL.
 */
export type PropertyOverrides = {
  title?: string;
  due?: string;
  course?: string;
  status?: string;
  priority?: string;
  effort?: string;
  weight?: string;
  plannedDate?: string;
};

export type NotionConfig = {
  assignments: { id?: string; titleMatch: RegExp; properties: PropertyOverrides };
  courses: { id?: string; titleMatch: RegExp; nameProperty?: string };
  /** Unit of the effort number property. "auto" = hours if the property name mentions hours, else minutes. */
  effortUnit: "auto" | "minutes" | "hours";
  /** Statuses (case-insensitive) that count as finished, in addition to checkbox=true. */
  doneStatuses: string[];
  writeBack: {
    /** Page under which "SemesterPilot Plan - <date>" pages are created. Defaults to the Assignments database's parent page. */
    planParentPageId?: string;
    /** Set the Planned Date property (if found) to today for scheduled items. */
    plannedDate: boolean;
    /** Set the Priority select (if found and it has High/Medium/Low-like options) based on today's rank. */
    priority: boolean;
  };
};

const config: NotionConfig = {
  assignments: {
    id: process.env.NOTION_ASSIGNMENTS_DB_ID || undefined,
    titleMatch: /assignment|task|to-?do|homework|deadline/i,
    properties: {},
  },
  courses: {
    id: process.env.NOTION_COURSES_DB_ID || undefined,
    titleMatch: /course|class|subject|module/i,
  },
  effortUnit: "auto",
  doneStatuses: ["done", "complete", "completed", "submitted", "finished", "graded", "archived"],
  writeBack: {
    planParentPageId: process.env.NOTION_PLAN_PARENT_PAGE_ID || undefined,
    plannedDate: true,
    priority: false,
  },
};

export default config;
