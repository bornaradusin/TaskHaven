<script setup lang="ts">
// Search: tasks (by words or number, like HOME-12), projects, labels and teams.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Tag, Users } from 'lucide-vue-next'
import TaskRow from '@/ui/TaskRow.vue'
import LabelChip from '@/ui/LabelChip.vue'
import { taskIdentifier } from '@/logic/tasks'
import { toText } from '@/ui/html'
import { allTasks, project, store } from '@/state'

const route = useRoute()
const router = useRouter()
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const input = ref<HTMLInputElement | null>(null)
const words = computed(() => q.value.trim().toLowerCase())

const tasks = computed(() => {
  const w = words.value
  if (!w) return []
  return allTasks(true)
    .filter((t) => t.title.toLowerCase().includes(w) || taskIdentifier(t, project(t.projectId)).toLowerCase() === w || toText(t.description).toLowerCase().includes(w) || t.labels.some((l) => l.title.toLowerCase() === w))
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(!a.title.toLowerCase().startsWith(w)) - Number(!b.title.toLowerCase().startsWith(w)))
    .slice(0, 50)
})
const projects = computed(() => (words.value ? store.projects.filter((p) => p.title.toLowerCase().includes(words.value)) : []))
const labels = computed(() => (words.value ? store.labels.filter((l) => l.title.toLowerCase().includes(words.value)) : []))
const teams = computed(() => (words.value ? store.teams.filter((t) => t.name.toLowerCase().includes(words.value)) : []))

onMounted(() => input.value?.focus())

function update() {
  void router.replace({ query: q.value ? { q: q.value } : {} })
}
</script>

<template>
  <div class="page">
    <div class="box card">
      <Search :size="20" class="muted" />
      <input ref="input" v-model="q" class="field" placeholder="Search tasks, projects, labels…" aria-label="Search" @input="update" />
    </div>

    <template v-if="words">
      <section v-if="projects.length">
        <h3>Projects</h3>
        <div class="chips">
          <RouterLink v-for="p in projects" :key="p.id" :to="{ name: 'project', params: { id: p.id } }" class="hit card">
            <span class="dot" :style="{ background: p.color || 'var(--faint)' }" /> {{ p.title }}
          </RouterLink>
        </div>
      </section>
      <section v-if="teams.length">
        <h3>Teams</h3>
        <div class="chips">
          <RouterLink v-for="t in teams" :key="t.id" :to="{ name: 'team', params: { id: t.id } }" class="hit card"><Users :size="15" /> {{ t.name }}</RouterLink>
        </div>
      </section>
      <section v-if="labels.length">
        <h3>Labels</h3>
        <div class="chips">
          <a v-for="l in labels" :key="l.id" href="#" @click.prevent="q = l.title; update()"><LabelChip :label="l" /></a>
        </div>
      </section>
      <section>
        <h3>Tasks</h3>
        <div class="card list">
          <TaskRow v-for="t in tasks" :key="t.id" :task="t" show-project />
          <div v-if="!tasks.length" class="empty">No tasks with “{{ q.trim() }}”.</div>
        </div>
      </section>
    </template>
    <div v-else class="empty"><Tag :size="0" />Type to search everything you can see. A task’s number (HOME-12) finds it too.</div>
  </div>
</template>

<style scoped>
.box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 14px;
  margin-bottom: 22px;
}

.field {
  flex: 1;
  min-height: 46px;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 1.05rem;
}

section {
  margin-bottom: 20px;
}

h3 {
  color: var(--muted);
  font-size: 0.9rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  color: var(--text);
  font-weight: 600;
  text-decoration: none !important;
}

.list {
  padding: 6px;
}
</style>
