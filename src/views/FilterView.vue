<script setup lang="ts">
// A saved filter: tasks from every project that match it. "new" makes one.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Filter, Pencil, Trash2 } from 'lucide-vue-next'
import TaskRow from '@/ui/TaskRow.vue'
import { checkFilter, compileFilter } from '@/logic/filter'
import { sortTasks } from '@/logic/tasks'
import { allTasks, attempt, deleteFilter, saveFilter, store } from '@/state'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const saved = computed(() => store.filters.find((f) => f.id === id.value))
const editing = ref(id.value === 'new')
const title = ref('')
const query = ref('done = false && dueDate < now+7d')

watch(
  saved,
  (f) => {
    if (f) {
      title.value = f.title
      query.value = f.query
    }
  },
  { immediate: true },
)

const ctx = () => ({ projects: store.projects, people: Object.values(store.people), now: new Date() })
const error = computed(() => checkFilter(query.value, ctx()))
const tasks = computed(() => {
  if (error.value) return []
  const test = compileFilter(query.value, ctx())
  return sortTasks(
    allTasks().filter((t) => test(t)),
    'dueDate',
  )
})

async function save() {
  if (!title.value.trim() || error.value) return
  const fid = await attempt(() => saveFilter({ id: saved.value?.id, title: title.value.trim(), description: saved.value?.description ?? '', query: query.value }), 'Filter saved.')
  editing.value = false
  if (fid && fid !== id.value) void router.replace({ name: 'filter', params: { id: fid } })
}

async function remove() {
  await attempt(() => deleteFilter(id.value), 'Filter deleted.')
  void router.push({ name: 'home' })
}

const EXAMPLES = [
  ['Due this week', 'done = false && dueDate < now+7d'],
  ['Important', 'done = false && priority >= 3'],
  ['Mine', `done = false && assignees in ${store.user?.username ?? 'me'}`],
  ['Overdue', 'done = false && dueDate < now'],
]
</script>

<template>
  <div class="page">
    <div class="page-title">
      <Filter :size="22" class="muted" />
      <h1>{{ saved?.title ?? 'New saved filter' }}</h1>
      <span class="spacer" />
      <template v-if="saved && !editing">
        <button class="button secondary small" @click="editing = true"><Pencil :size="15" /> Edit</button>
        <button class="icon-button" aria-label="Delete filter" @click="remove"><Trash2 :size="18" /></button>
      </template>
    </div>

    <form v-if="editing" class="card card-body form" @submit.prevent="save">
      <label class="field"><span>Name</span><input v-model="title" class="input" placeholder="Due this week" required /></label>
      <label class="field">
        <span>Filter</span>
        <input v-model="query" class="input mono" spellcheck="false" />
      </label>
      <p v-if="error" class="error-text">{{ error }}</p>
      <p class="help">
        Fields: done, priority, percentDone, dueDate, startDate, endDate, doneAt, created, updated, labels, assignees, project, title.
        Operators: = != &gt; &gt;= &lt; &lt;= like in. Dates: now, now+7d, now-1w, 2026-12-24. Join with &amp;&amp; and ||.
      </p>
      <div class="examples">
        <button v-for="[name, q] in EXAMPLES" :key="name" type="button" class="button secondary small" @click="query = q; title ||= name">{{ name }}</button>
      </div>
      <p class="help">Saved on the server: it’s in Vikunja’s web pages too.</p>
      <div class="row end">
        <button v-if="saved" type="button" class="button ghost" @click="editing = false">Cancel</button>
        <button class="button" :disabled="!title.trim() || !!error">Save filter</button>
      </div>
    </form>

    <div class="card list">
      <TaskRow v-for="t in tasks" :key="t.id" :task="t" show-project />
      <div v-if="!tasks.length" class="empty">{{ error ? 'Fix the filter to see tasks.' : 'No tasks match.' }}</div>
    </div>
  </div>
</template>

<style scoped>
.form {
  margin-bottom: 16px;
}

.mono {
  font-family: ui-monospace, monospace;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 12px;
}

.end {
  justify-content: flex-end;
}

.list {
  padding: 6px;
}
</style>
