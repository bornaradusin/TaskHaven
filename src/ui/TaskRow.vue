<script setup lang="ts">
// A task in a list: done box, number, title, labels, due date, priority, people, star.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AlignLeft, CalendarClock, ListChecks, Repeat, Star } from 'lucide-vue-next'
import Checkbox from './Checkbox.vue'
import LabelChip from './LabelChip.vue'
import Avatars from './Avatars.vue'
import PriorityLabel from './PriorityLabel.vue'
import { dueText } from '@/logic/dates'
import { isOverdue, taskIdentifier } from '@/logic/tasks'
import { checklist, isEmpty } from './html'
import { attempt, canEdit, isFavoriteTask, project, setDone, toggleFavoriteTask } from '@/state'
import { repeats, type Task } from '@/model'

const props = withDefaults(defineProps<{ task: Task; showProject?: boolean; compact?: boolean }>(), { showProject: false, compact: false })
const router = useRouter()
const p = computed(() => project(props.task.projectId))
const writable = computed(() => canEdit(p.value))
const overdue = computed(() => isOverdue(props.task))
const checks = computed(() => checklist(props.task.description))
const hasDescription = computed(() => !isEmpty(props.task.description))
const favorite = computed(() => isFavoriteTask(props.task))

function open() {
  void router.push({ name: 'task', params: { projectId: props.task.projectId, taskId: props.task.id } })
}
</script>

<template>
  <div class="task-row" :class="{ done: task.done, compact }" role="link" tabindex="0" @click="open" @keydown.enter="open">
    <Checkbox :checked="task.done" :disabled="!writable" @change="(v) => attempt(() => setDone(task, v))" />
    <div class="main">
      <div class="line">
        <span v-if="showProject && p" class="project" :style="{ color: p.color || undefined }">{{ p.title }} <span class="sep">›</span></span>
        <span v-if="taskIdentifier(task, p)" class="id">{{ taskIdentifier(task, p) }}</span>
        <span class="title">{{ task.title }}</span>
        <PriorityLabel :priority="task.priority" :done="task.done" />
        <LabelChip v-for="l in task.labels" :key="l.id" :label="l" class="label" />
      </div>
      <div v-if="task.dueDate || hasDescription || checks[1] || repeats(task.repeat)" class="meta">
        <span v-if="task.dueDate" class="due" :class="{ overdue }" :title="new Date(task.dueDate).toLocaleString()">
          <CalendarClock :size="14" /> {{ dueText(task.dueDate) }}
        </span>
        <span v-if="repeats(task.repeat)" title="Repeats"><Repeat :size="14" /></span>
        <span v-if="hasDescription" title="Has a description"><AlignLeft :size="14" /></span>
        <span v-if="checks[1]" class="checks"><ListChecks :size="14" /> {{ checks[0] }}/{{ checks[1] }}</span>
      </div>
    </div>
    <Avatars v-if="task.assignees.length" :ids="task.assignees" :size="24" />
    <button
      v-if="writable || favorite"
      class="icon-button small star"
      :class="{ on: favorite }"
      :aria-label="favorite ? 'Unstar' : 'Star'"
      @click.stop="attempt(() => toggleFavoriteTask(task))"
    >
      <Star :size="16" :fill="favorite ? 'currentColor' : 'none'" />
    </button>
  </div>
</template>

<style scoped>
.task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px 9px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
}

.task-row:hover,
.task-row:focus-visible {
  background: var(--hover);
}

.main {
  flex: 1;
  min-width: 0;
}

.line {
  line-height: 1.5;
}

/* in a row like words, so a long title wraps under its number */
.line > * {
  margin-right: 7px;
}

.line > .chip {
  vertical-align: 1px;
  margin-right: 4px;
}

.project {
  font-weight: 600;
  color: var(--muted);
  font-size: 0.88rem;
  white-space: nowrap;
}

.sep {
  color: var(--faint);
}

.id {
  color: var(--faint);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.title {
  overflow-wrap: anywhere;
}

.done .title {
  color: var(--muted);
  text-decoration: line-through;
}

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.82rem;
}

.meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.due.overdue {
  color: var(--danger);
  font-weight: 600;
}

.done .due.overdue {
  color: var(--muted);
  font-weight: 400;
}

.star {
  color: var(--faint);
  opacity: 0;
}

.star.on {
  color: #e0a21b;
  opacity: 1;
}

.task-row:hover .star,
.star:focus-visible {
  opacity: 1;
}

@media (hover: none) {
  .star:not(.on) {
    display: none;
  }
}

.compact {
  padding-top: 7px;
  padding-bottom: 7px;
}
</style>
