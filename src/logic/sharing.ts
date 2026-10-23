// Who may do what in a project, in words. (The server decides; the app only shows it.)

import { rightAtLeast, type Project, type Right } from '@/model'

/** Whether one may manage a project (rename, share, delete it). */
export function canManage(p: Pick<Project, 'right'> | undefined): boolean {
  return p?.right === 'admin'
}

/** Whether one may change a project's tasks. */
export function canWrite(p: Pick<Project, 'right' | 'archived'> | undefined): boolean {
  return !!p && !p.archived && rightAtLeast(p.right, 'write')
}

export const RIGHT_NAMES: Record<Right, string> = { read: 'Can see', write: 'Can edit', admin: 'Admin' }
