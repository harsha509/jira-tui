export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface Issue {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  type: string;
  priority: string | null;
  updated: string;
}

export interface IssueComment {
  author: string;
  created: string;
  body: string;
}

export interface IssueDetail extends Issue {
  reporter: string | null;
  created: string;
  description: string;
  labels: string[];
  parent: string | null;
  comments: IssueComment[];
}

export interface Transition {
  id: string;
  name: string;
  /** Name of the status the transition lands on. */
  to: string;
}

export interface CreateIssueInput {
  project: string;
  type: string;
  summary: string;
  description?: string;
}
