<script setup lang="ts">
// Related tasks: subtasks, blocking and blocked, duplicates, before and after.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, X } from 'lucide-vue-next'
import Checkbox from '../Checkbox.vue'
import { taskIdentifier } from '@/logic/tasks'
import { allTasks, attempt, canEdit, findTask, project, relate, RELATION_NAMES, setDone, unrelate } from '@/state'
import type { Relation, RelationKind, Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean; adding?: boolean }>()
const emit = defineEmits<{ done: [] }>()
const router = useRouter()
const kind = ref<RelationKind>('related')
const query = ref('')

const groups = computed(() => {
  const by = new Map<RelationKind, { relation: Relation; other: Task | undefined }[]>()
  for (const r of props.task.relations) {
    const list = by.get(r.kind) ?? []
    list.push({ relation: r, other: findTask(r.projectId, r.taskId) })
    by.set(r.kind, list)
  }
  return [...by.entries()]
})

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const already = new Set(props.task.relations.filter((r) => r.kind === kind.value).map((r) => r.taskId))
  return allTasks()
    .filter((t) => t.id !== props.task.id && !already.has(t.id))
    .filter((t) => t.title.toLowerCase().includes(q) || taskIdentifier(t, project(t.projectId)).toLowerCase() === q)
    .slice(0, 8)
})

async function add(other: Task) {
  query.value = ''
  await attempt(() => relate(props.task, kind.value, other))
  emit('done')
}

function open(t: Task) {
  void router.push({ name: 'task', params: { projectId: t.projectId, taskId: t.id } })
}
</script>

<template>
  <section v-if="task.relations.length || adding" class="relations">
    <h3>Related tasks</h3>
    <div v-for="[k, list] in groups" :key="k" class="group">
      <div class="kind">{{ RELATION_NAMES[k] }}</div>
      <div v-for="{ relation, other } in list" :key="relation.taskId" class="rel">
        <template v-if="other">
          <Checkbox :checked="other.done" :disabled="!canEdit(project(other.projectId))" @change="(v) => attempt(() => setDone(other!, v))" />
          <a href="#" class="title" :class="{ done: other.done }" @click.prevent="open(other)">
            <span v-if="other.projectId !== task.projectId" class="muted">{{ project(other.projectId)?.title }} › </span>
            <span class="muted">{{ taskIdentifier(other, project(other.projectId)) }}</span> {{ other.title }}
          </a>
        </template>
        <span v-else class="muted title">A task you can’t see</span>
        <button v-if="editable" class="icon-button small" aria-label="Remove relation" @click="attempt(() => unrelate(task, relation))"><X :size="14" /></button>
      </div>
    </div>
    <div v-if="adding && editable" class="add">
      <select v-model="kind" class="select slim" aria-label="Kind of relation">
        <option v-for="(name, k) in RELATION_NAMES" :key="k" :value="k">{{ name }}</option>
      </select>
      <div class="search">
        <input v-model="query" class="input slim" placeholder="Find a task…" aria-label="Find a task" autofocus />
        <div v-if="matches.length" class="results card">
          <button v-for="t in matches" :key="t.id" class="item" @click="add(t)">
            <Plus :size="14" />
            <span class="muted">{{ project(t.projectId)?.title }} ›</span> {{ t.title }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.group {
  margin-bottom: 10px;
}

.kind {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.rel {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
}

.title {
  flex: 1;
  color: var(--text);
}

.title.done {
  color: var(--muted);
  text-decoration: line-through;
}

.add {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.slim {
  width: auto;
  min-height: 34px;
  padding: 4px 8px;
}

.search {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search .input {
  width: 100%;
}

.results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  padding: 4px;
  box-shadow: var(--shadow-lg);
}

.item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
}

.item:hover {
  background: var(--hover);
}
</style>
