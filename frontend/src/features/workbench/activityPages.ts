import type { WorkbenchActivityDto } from '../../api/workbench';

/** Server pages are newest first. Append history without truncating the newest events. */
export function appendActivityPage(current: WorkbenchActivityDto[], history: WorkbenchActivityDto[]) {
  return [...new Map([...history, ...current].map(item => [item.id, item])).values()]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.id.localeCompare(right.id));
}
