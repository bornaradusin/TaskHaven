<script setup lang="ts">
// The table: the columns one picks, sorted by any of them.
import { computed, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-vue-next'
import Dropdown from '@/ui/Dropdown.vue'
import LabelChip from '@/ui/LabelChip.vue'
import Avatars from '@/ui/Avatars.vue'
import Avatar from '@/ui/Avatar.vue'
import PriorityLabel from '@/ui/PriorityLabel.vue'
import Checkbox from '@/ui/Checkbox.vue'
import { filtered } from '@/ui/useTasks'
import { remembered } from '@/ui/remember'
import type { ViewOptions } from '@/ui/ViewFilter.vue'
import { formatDateTime } from '@/logic/dates'
import { isOverdue, sortTasks, taskIdentifier, type SortKey } from '@/logic/tasks'
import { attempt, canEdit, setDone } from '@/state'
import type { Project, Task } from '@/model'

const props = defineProps<{ project: Project; tasks: Task[]; options: ViewOptions }>()
const router = useRouter()
const shown = filtered(toRef(props, 'tasks'), toRef(props, 'options'))
const editable = computed(() => canEdit(props.project))

type Column = 'index' | 'done' | 'title' | 'priority' | 'labels' | 'assignees' | 'dueDate' | 'startDate' | 'endDate' | 'percentDone' | 'doneAt' | 'created' | 'updated' | 'createdBy'
const COLUMNS: { key: Column; label: string; sort?: SortKey }[] = [
  { key: 'index', label: '#', sort: 'index' },
  { key: 'done', label: 'Done' },
  { key: 'title', label: 'Title', sort: 'title' },
  { key: 'priority', label: 'Priority', sort: 'priority' },
  { key: 'labels', label: 'Labels' },
  { key: 'assignees', label: 'Assignees' },
  { key: 'dueDate', label: 'Due date', sort: 'dueDate' },
  { key: 'startDate', label: 'Start date', sort: 'startDate' },
  { key: 'endDate', label: 'End date', sort: 'endDate' },
  { key: 'percentDone', label: 'Done %', sort: 'percentDone' },
  { key: 'doneAt', label: 'Done at', sort: 'doneAt' },
  { key: 'created', label: 'Created', sort: 'created' },
  { key: 'updated', label: 'Updated', sort: 'updated' },
  { key: 'createdBy', label: 'Created by' },
]

const visible = remembered<Record<Column, boolean>>('table.columns', {
  index: true, done: true, title: true, priority: true, labels: true, assignees: true, dueDate: true,
  startDate: false, endDate: false, percentDone: false, doneAt: false, created: false, updated: false, createdBy: false,
})
const sort = remembered<{ key: SortKey; descending: boolean }>('table.sort', { key: 'index', descending: true })
const columns = computed(() => COLUMNS.filter((c) => visible.value[c.key]))
const rows = computed(() => sortTasks(shown.value, sort.value.key, sort.value.descending))

function sortBy(key?: SortKey) {
  if (!key) return
  sort.value = sort.value.key === key ? { key, descending: !sort.value.descending } : { key, descending: false }
}

function open(t: Task) {
  void router.push({ name: 'task', params: { projectId: t.projectId, taskId: t.id } })
}

const when = (iso: string | null) => (iso ? formatDateTime(new Date(iso)) : '')
</script>

<template>
  <div class="table-view">
    <div class="row tools">
      <span class="muted small">{{ rows.length }} {{ rows.length === 1 ? 'task' : 'tasks' }}</span>
      <span class="spacer" />
      <Dropdown align="right" label="Columns">
        <template #trigger="{ toggle }">
          <button class="button secondary small" @click.stop="toggle"><Columns3 :size="16" /> Columns</button>
        </template>
        <div class="columns" @click.stop>
          <label v-for="c in COLUMNS" :key="c.key" class="item check"><input v-model="visible[c.key]" type="checkbox" /> {{ c.label }}</label>
        </div>
      </Dropdown>
    </div>
    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="[c.key, { sortable: c.sort }]" @click="sortBy(c.sort)">
              {{ c.label }}
              <template v-if="c.sort && sort.key === c.sort">
                <ArrowDown v-if="sort.descending" :size="13" />
                <ArrowUp v-else :size="13" />
              </template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in rows" :key="t.id" :class="{ done: t.done }" @click="open(t)">
            <td v-for="c in columns" :key="c.key" :class="c.key">
              <template v-if="c.key === 'index'">{{ taskIdentifier(t, project) }}</template>
              <Checkbox v-else-if="c.key === 'done'" :checked="t.done" :disabled="!editable" @change="(v) => attempt(() => setDone(t, v))" />
              <template v-else-if="c.key === 'title'">{{ t.title }}</template>
              <PriorityLabel v-else-if="c.key === 'priority'" :priority="t.priority" always />
              <span v-else-if="c.key === 'labels'" class="labels"><LabelChip v-for="l in t.labels" :key="l.id" :label="l" /></span>
              <Avatars v-else-if="c.key === 'assignees'" :ids="t.assignees" :size="24" />
              <span v-else-if="c.key === 'dueDate'" :class="{ overdue: isOverdue(t) }">{{ when(t.dueDate) }}</span>
              <template v-else-if="c.key === 'startDate'">{{ when(t.startDate) }}</template>
              <template v-else-if="c.key === 'endDate'">{{ when(t.endDate) }}</template>
              <template v-else-if="c.key === 'percentDone'">{{ t.percentDone ? `${t.percentDone}%` : '' }}</template>
              <template v-else-if="c.key === 'doneAt'">{{ when(t.doneAt) }}</template>
              <template v-else-if="c.key === 'created'">{{ when(t.created) }}</template>
              <template v-else-if="c.key === 'updated'">{{ when(t.updated) }}</template>
              <Avatar v-else-if="c.key === 'createdBy'" :id="t.createdBy" :size="24" />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty">No tasks to show.</div>
    </div>
  </div>
</template>

<style scoped>
.tools {
  margin-bottom: 10px;
}

.columns {
  max-height: 60vh;
  overflow-y: auto;
}

.check {
  cursor: pointer;
}

.check input {
  accent-color: var(--primary);
}

.scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}

th,
td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

th {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
  user-select: none;
}

th.sortable {
  cursor: pointer;
}

th.sortable:hover {
  color: var(--text);
}

th svg {
  vertical-align: -2px;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--hover);
}

tbody tr:last-child td {
  border-bottom: 0;
}

td.title {
  white-space: normal;
  min-width: 220px;
  font-weight: 500;
}

td.index {
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}

tr.done td.title {
  color: var(--muted);
  text-decoration: line-through;
}

.labels {
  display: inline-flex;
  gap: 4px;
}

.overdue {
  color: var(--danger);
  font-weight: 600;
}
</style>
