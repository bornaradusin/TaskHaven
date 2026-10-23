<script setup lang="ts">
// The list: quick add, sub-projects, and the tasks in order (drag them to reorder).
import { computed, onMounted, ref, toRef } from 'vue'
import { GripVertical, ListTodo } from 'lucide-vue-next'
import QuickAdd from '@/ui/QuickAdd.vue'
import TaskRow from '@/ui/TaskRow.vue'
import { filtered } from '@/ui/useTasks'
import { startDrag } from '@/ui/drag'
import type { ViewOptions } from '@/ui/ViewFilter.vue'
import { listOrder, positionBetween } from '@/logic/tasks'
import { attempt, canEdit, childProjects, loadOrder, setPosition } from '@/state'
import type { Project, Task } from '@/model'

const props = defineProps<{ project: Project; tasks: Task[]; options: ViewOptions }>()
// the list's own order is the server's (it's fetched when the list opens)
onMounted(() => void loadOrder(props.project).catch(() => undefined))
const shown = filtered(toRef(props, 'tasks'), toRef(props, 'options'))
const ordered = computed(() => listOrder(shown.value))
const children = computed(() => childProjects(props.project.id).filter((c) => !c.archived))
const editable = computed(() => canEdit(props.project))
const list = ref<HTMLElement | null>(null)
const dropAt = ref<number | null>(null)

/** Where in the list the pointer is: the index a task would go to. */
function indexAt(y: number): number {
  const rows = [...(list.value?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
  for (const [i, row] of rows.entries()) {
    const r = row.getBoundingClientRect()
    if (y < r.top + r.height / 2) return i
  }
  return rows.length
}

function grab(e: PointerEvent, task: Task) {
  const row = (e.currentTarget as HTMLElement).closest('[data-row]') as HTMLElement
  startDrag(e, row, {
    move: (_x, y) => (dropAt.value = indexAt(y)),
    cancel: () => (dropAt.value = null),
    drop: (_x, y) => {
      dropAt.value = null
      const to = indexAt(y)
      const others = ordered.value.filter((t) => t.id !== task.id)
      const from = ordered.value.findIndex((t) => t.id === task.id)
      const at = to > from ? to - 1 : to
      if (at === from) return
      const position = positionBetween(others[at - 1]?.position, others[at]?.position)
      void attempt(() => setPosition(task, position))
    },
  })
}
</script>

<template>
  <div class="list-view">
    <QuickAdd v-if="editable" class="add" :project-id="project.id" />

    <div v-if="children.length" class="children">
      <RouterLink v-for="c in children" :key="c.id" :to="{ name: 'project', params: { id: c.id } }" class="child card">
        <span class="dot" :style="{ background: c.color || 'var(--faint)' }" /> {{ c.title }}
      </RouterLink>
    </div>

    <div ref="list" class="card tasks">
      <div v-for="(t, i) in ordered" :key="t.id" class="row-wrap" data-row>
        <div v-if="dropAt === i" class="drop-line" />
        <span v-if="editable && !t.done" class="grip" title="Drag to move" @pointerdown="grab($event, t)"><GripVertical :size="16" /></span>
        <TaskRow :task="t" />
      </div>
      <div v-if="dropAt === ordered.length" class="drop-line end" />
      <div v-if="!ordered.length" class="empty">
        <ListTodo :size="36" />
        <p v-if="tasks.length">All done here{{ options.search || options.query ? ' (or nothing matches the filters)' : '' }}.</p>
        <p v-else>No tasks yet.{{ editable ? ' Add one above!' : '' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add {
  margin-bottom: 16px;
}

.children {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.child {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  color: var(--text);
  font-weight: 600;
  text-decoration: none !important;
}

.child:hover {
  box-shadow: var(--shadow-lg);
}

.tasks {
  padding: 6px;
}

.row-wrap {
  position: relative;
}

.grip {
  position: absolute;
  left: -2px;
  top: 50%;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 32px;
  transform: translateY(-50%);
  color: var(--faint);
  cursor: grab;
  opacity: 0;
  touch-action: none;
}

.row-wrap:hover .grip {
  opacity: 1;
}

@media (hover: none) {
  .grip {
    opacity: 0.6;
    width: 22px;
  }
}

.drop-line {
  position: absolute;
  left: 8px;
  right: 8px;
  top: -1px;
  height: 3px;
  border-radius: 2px;
  background: var(--brand);
  z-index: 2;
}

.drop-line.end {
  position: relative;
  top: 0;
}
</style>
