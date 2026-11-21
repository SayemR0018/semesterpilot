export type Assignment = {
  id: string;
  title: string;
  course: string;
  /** ISO date (YYYY-MM-DD) or null if no due date */
  due: string | null;
  status: string | null;
  /** Total estimated effort in minutes (null = unknown) */
  effortMinutes: number | null;
  /** Minutes already spent (optional) */
  effortDoneMinutes?: number | null;
  /** Grade weight in percent (0-100), null = unknown */
  weight: number | null;
  /** Free-form priority label from Notion (High/Medium/Low) */
  priority?: string | null;
  url?: string | null;
};

export type DataSourceMode = "mock" | "notion";

export type LoadResult = {
  mode: DataSourceMode;
  assignments: Assignment[];
  today: string;
  warnings: string[];
};

export type CoachStep = { assignmentId: string; firstStep: string };
export type CoachResult = { headline: string; briefing: string; steps: CoachStep[]; watchOut: string };
