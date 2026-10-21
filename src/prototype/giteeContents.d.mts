export interface GiteeContentsContext {
  owner: string
  repo: string
  token: string
  remoteBranch: string
}

export class CollaborationConflictError extends Error {
  constructor(message?: string)
}

export function collaborationBranchKey(branch: string): string
export function jsonValuesEqual(left: unknown, right: unknown): boolean
export function validateCollaborationManifest(value: unknown): void
export function selectGiteeFileResponse(response: unknown, requestedPath: string): { content: string; sha: string } | null
export function readGiteeJson(context: GiteeContentsContext, path: string): Promise<{ value: unknown; sha: string } | null>
export function writeGiteeJson(context: GiteeContentsContext, path: string, value: unknown, sha: string | null | undefined, message: string): Promise<void>
