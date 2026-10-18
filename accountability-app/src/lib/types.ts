export type Goal = {
  id: string;
  title: string;
  /** Why this matters to me; shown on the Today screen as a nudge. */
  why: string;
  createdAt: string; // ISO timestamp
  archived: boolean;
};

/** Map of goalId -> list of completed days as 'YYYY-MM-DD'. */
export type CheckIns = Record<string, string[]>;

export type AppData = {
  goals: Goal[];
  checkIns: CheckIns;
};
