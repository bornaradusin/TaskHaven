<script setup lang="ts">
// A project: its title, the view switcher (list, Gantt, table, Kanban), and the view.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChartNoAxesGantt, ChevronRight, Columns3, List, Share2, Table2 } from 'lucide-vue-next'
import ProjectMenu from '@/ui/ProjectMenu.vue'
import ViewFilter, { type ViewOptions } from '@/ui/ViewFilter.vue'
import Avatars from '@/ui/Avatars.vue'
import ListView from './project/ListView.vue'
import TableView from './project/TableView.vue'
import KanbanView from './project/KanbanView.vue'
import GanttView from './project/GanttView.vue'
import { remembered } from '@/ui/remember'
import { canManage } from '@/logic/sharing'
import { getShares, project, projectPeople, store, visitProject } from '@/state'
import type { Shares, ViewKind } from '@/model'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const p = computed(() => project(id.value))
const parent = computed(() => project(p.value?.parentId))
const lastView = remembered<Record<string, ViewKind>>('views', {})
const view = computed<ViewKind>(() => (route.params.view as ViewKind) || lastView.value[id.value] || 'list')
const options = remembered<ViewOptions>(`filters.${id.value}`, { showDone: false, search: '', query: '' })
const tasks = computed(() => store.tasks[id.value] ?? [])
const admin = computed(() => canManage(p.value))
const shares = ref<Shares | null>(null)
// who sees it (for the faces at the top)
const people = computed(() => (p.value ? projectPeople(p.value, shares.value) : []))

watch(
  () => p.value?.id,
  async (pid) => {
    if (!pid) return
    visitProject(pid)
    shares.value = await getShares(p.value!).catch(() => null)
  },
  { immediate: true },
)

watch(view, (v) => (lastView.value = { ...lastView.value, [id.value]: v }))

const VIEWS: { kind: ViewKind; label: string; icon: unknown }[] = [
  { kind: 'list', label: 'List', icon: List },
  { kind: 'gantt', label: 'Gantt', icon: ChartNoAxesGantt },
  { kind: 'table', label: 'Table', icon: Table2 },
  { kind: 'kanban', label: 'Kanban', icon: Columns3 },
]

function show(kind: ViewKind) {
  void router.replace({ name: 'project', params: { id: id.value, view: kind } })
}
</script>

<template>
  <div v-if="p" class="page" :class="{ wide: view !== 'list' }">
    <div class="head">
      <div class="titles">
        <div v-if="parent" class="crumb">
          <RouterLink :to="{ name: 'project', params: { id: parent.id } }">{{ parent.title }}</RouterLink>
          <ChevronRight :size="14" />
        </div>
        <div class="page-title">
          <span class="dot big" :style="{ background: p.color || 'var(--faint)' }" />
          <h1>{{ p.title }}</h1>
          <span v-if="p.archived" class="chip archived">Archived</span>
          <ProjectMenu :project="p" />
        </div>
      </div>
      <span class="spacer" />
      <RouterLink v-if="people.length > 1 || admin" :to="{ name: 'project-share', params: { id: p.id } }" class="share" :title="admin ? 'Share' : 'Who sees it'">
        <Avatars v-if="people.length > 1" :ids="people" :size="28" :max="4" />
        <span v-else class="button secondary small"><Share2 :size="15" /> Share</span>
      </RouterLink>
    </div>

    <div class="bar">
      <nav class="tabs views" aria-label="Views">
        <button v-for="v in VIEWS" :key="v.kind" class="tab" :class="{ active: view === v.kind }" @click="show(v.kind)">
          <component :is="v.icon" :size="16" /> {{ v.label }}
        </button>
      </nav>
      <span class="spacer" />
      <ViewFilter v-model="options" />
    </div>

    <p v-if="p.archived" class="note">This project is archived: it can be seen, but not changed. Restore it from its menu.</p>

    <ListView v-if="view === 'list'" :project="p" :tasks="tasks" :options="options" />
    <TableView v-else-if="view === 'table'" :project="p" :tasks="tasks" :options="options" />
    <KanbanView v-else-if="view === 'kanban'" :project="p" :tasks="tasks" :options="options" />
    <GanttView v-else :project="p" :tasks="tasks" :options="options" />
  </div>
  <div v-else class="page">
    <div v-if="!store.projects.length && !store.ready" class="empty">Loading…</div>
    <div v-else class="card empty">
      <h2>This project isn’t here</h2>
      <p>It may have been deleted, or it’s no longer shared with you.</p>
      <RouterLink class="button" :to="{ name: 'home' }">Go to the overview</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.titles {
  min-width: 0;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 2px;
  color: var(--muted);
  font-size: 0.9rem;
}

.crumb a {
  color: var(--muted);
}

.page-title {
  margin-bottom: 12px;
}

.dot.big {
  width: 14px;
  height: 14px;
}

.archived {
  background: var(--surface-3);
  color: var(--muted);
}

.share {
  margin-bottom: 14px;
  text-decoration: none !important;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.views {
  padding: 3px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.note {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
}

.page.wide {
  max-width: none;
}

@media (max-width: 760px) {
  .views .tab {
    padding: 7px 9px;
  }
}

@media (max-width: 480px) {
  .views .tab {
    font-size: 0;
    gap: 0;
  }

  .views .tab svg {
    width: 18px;
    height: 18px;
  }
}
</style>
