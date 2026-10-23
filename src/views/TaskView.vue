<script setup lang="ts">
// A task, all of it: its title and number, what's set (people, priority, dates, reminders,
// repeating, progress, colour, labels), the description, files, related tasks and comments;
// and the buttons to set the rest.
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Check,
  FolderInput,
  Gauge,
  Link2,
  Palette,
  Paperclip,
  Repeat,
  RotateCcw,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-vue-next'
import Modal from '@/ui/Modal.vue'
import Editor from '@/ui/Editor.vue'
import DatePicker from '@/ui/DatePicker.vue'
import AssigneeEdit from '@/ui/task/AssigneeEdit.vue'
import LabelEdit from '@/ui/task/LabelEdit.vue'
import RemindersEdit from '@/ui/task/RemindersEdit.vue'
import RepeatEdit from '@/ui/task/RepeatEdit.vue'
import Comments from '@/ui/task/Comments.vue'
import Attachments from '@/ui/task/Attachments.vue'
import Relations from '@/ui/task/Relations.vue'
import Avatar from '@/ui/Avatar.vue'
import { isOverdue, taskIdentifier } from '@/logic/tasks'
import { relativeDay } from '@/logic/dates'
import { attempt, succeeded, canEdit, deleteTask, findTask, getShares, isFavoriteTask, moveTask, personName, project, projectPeople, setDone, store, toggleFavoriteTask, updateTask } from '@/state'
import { COLORS, PRIORITIES, repeats, type Priority, type Shares } from '@/model'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId))
const taskId = computed(() => String(route.params.taskId))
const task = computed(() => findTask(projectId.value, taskId.value))
// (the task's own project: it may have moved since the link was made)
const p = computed(() => project(task.value?.projectId ?? projectId.value))
const editable = computed(() => canEdit(p.value))
const loaded = computed(() => Object.keys(store.loaded).length > 0)
const shares = ref<Shares | null>(null)
const people = computed(() => (p.value ? projectPeople(p.value, shares.value) : []))
watch(
  () => p.value?.id,
  async () => (shares.value = p.value ? await getShares(p.value).catch(() => null) : null),
  { immediate: true },
)

type Field = 'assignees' | 'priority' | 'dueDate' | 'startDate' | 'endDate' | 'reminders' | 'repeat' | 'percentDone' | 'color' | 'labels'
const opened = ref<Set<Field>>(new Set())
/** Fields whose whole editor shows (the others show what's set, with a button to change it). */
const expanded = ref<Set<Field>>(new Set())
const relating = ref(false)
const confirmDelete = ref(false)
const moving = ref(false)
const moveTo = ref('')
const attachments = ref<InstanceType<typeof Attachments> | null>(null)
const title = ref('')

watch(
  () => task.value?.title,
  (t) => (title.value = t ?? ''),
  { immediate: true },
)

function has(f: Field): boolean {
  const t = task.value
  if (!t) return false
  if (opened.value.has(f)) return true
  switch (f) {
    case 'assignees':
      return t.assignees.length > 0
    case 'priority':
      return t.priority > 0
    case 'reminders':
      return t.reminders.length > 0
    case 'repeat':
      return repeats(t.repeat)
    case 'percentDone':
      return t.percentDone > 0
    case 'color':
      return !!t.color
    case 'labels':
      return t.labels.length > 0
    default:
      return !!t[f]
  }
}

function expand(f: Field) {
  expanded.value = new Set([...expanded.value, f])
}

async function show(f: Field) {
  opened.value = new Set([...opened.value, f])
  expand(f)
  await nextTick()
  document.getElementById(`field-${f}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function save(patch: Parameters<typeof updateTask>[1]) {
  if (task.value) void attempt(() => updateTask(task.value!, patch))
}

function saveTitle() {
  const t = title.value.trim()
  if (!task.value) return
  if (!t) {
    title.value = task.value.title
    return
  }
  if (t !== task.value.title) save({ title: t })
}

async function remove() {
  confirmDelete.value = false
  const t = task.value
  if (!t) return
  const done = await succeeded(() => deleteTask(t), 'Task deleted.')
  if (done) void router.push({ name: 'project', params: { id: t.projectId } })
}

async function move() {
  moving.value = false
  const t = task.value
  if (!t || !moveTo.value) return
  const saved = await attempt(() => moveTask(t, moveTo.value), 'Task moved.')
  if (saved) void router.replace({ name: 'task', params: { projectId: saved.projectId, taskId: saved.id } })
}

const targets = computed(() => store.projects.filter((x) => x.id !== projectId.value && canEdit(x)))

function back() {
  if (window.history.state?.back) router.back()
  else void router.push({ name: 'project', params: { id: projectId.value } })
}

const ACTIONS: { field?: Field; label: string; icon: unknown; run?: () => void }[] = [
  { field: 'assignees', label: 'Assign', icon: Users },
  { field: 'labels', label: 'Labels', icon: Tag },
  { field: 'priority', label: 'Priority', icon: TriangleAlert },
  { field: 'dueDate', label: 'Due date', icon: CalendarClock },
  { field: 'startDate', label: 'Start date', icon: CalendarPlus },
  { field: 'endDate', label: 'End date', icon: CalendarCheck },
  { field: 'reminders', label: 'Reminders', icon: Bell },
  { field: 'repeat', label: 'Repeat', icon: Repeat },
  { field: 'percentDone', label: 'Progress', icon: Gauge },
  { field: 'color', label: 'Colour', icon: Palette },
]
</script>

<template>
  <div v-if="task && p" class="page task-page">
    <div class="crumbs">
      <button class="icon-button small" aria-label="Back" @click="back"><ArrowLeft :size="18" /></button>
      <RouterLink :to="{ name: 'project', params: { id: p.id } }" class="crumb">{{ p.title }}</RouterLink>
    </div>

    <header class="heading">
      <div class="idline">
        <span class="id">{{ taskIdentifier(task, p) }}</span>
        <span v-if="task.done" class="chip donechip"><Check :size="12" /> Done</span>
        <span v-if="isOverdue(task)" class="chip overdue">Overdue</span>
      </div>
      <textarea
        v-if="editable"
        v-model="title"
        class="title-input"
        rows="1"
        aria-label="Title"
        @blur="saveTitle"
        @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
      />
      <h1 v-else class="title-text">{{ task.title }}</h1>
      <p class="muted small created">
        Made {{ relativeDay(new Date(task.created)) }} by {{ personName(task.createdBy) }}
        <template v-if="Date.parse(task.updated) - Date.parse(task.created) > 5000"> · changed {{ relativeDay(new Date(task.updated)) }}</template>
        <template v-if="task.done && task.doneAt"> · done {{ relativeDay(new Date(task.doneAt)) }}</template>
      </p>
    </header>

    <div class="columns">
      <div class="main">
        <div class="fields">
          <div v-if="has('assignees')" id="field-assignees" class="field-row">
            <span class="label"><Users :size="15" /> Assignees</span>
            <AssigneeEdit :task="task" :editable="editable" />
          </div>
          <div v-if="has('priority')" id="field-priority" class="field-row">
            <span class="label"><TriangleAlert :size="15" /> Priority</span>
            <select class="select slim" :value="task.priority" :disabled="!editable" @change="save({ priority: Number(($event.target as HTMLSelectElement).value) as Priority })">
              <option v-for="(name, i) in PRIORITIES" :key="i" :value="i">{{ name }}</option>
            </select>
          </div>
          <div v-if="has('dueDate')" id="field-dueDate" class="field-row">
            <span class="label"><CalendarClock :size="15" /> Due</span>
            <DatePicker :model-value="task.dueDate" :disabled="!editable" @update:model-value="(v) => save({ dueDate: v })" />
          </div>
          <div v-if="has('startDate')" id="field-startDate" class="field-row">
            <span class="label"><CalendarPlus :size="15" /> Starts</span>
            <DatePicker :model-value="task.startDate" :disabled="!editable" @update:model-value="(v) => save({ startDate: v })" />
          </div>
          <div v-if="has('endDate')" id="field-endDate" class="field-row">
            <span class="label"><CalendarCheck :size="15" /> Ends</span>
            <DatePicker :model-value="task.endDate" :disabled="!editable" @update:model-value="(v) => save({ endDate: v })" />
          </div>
          <div v-if="has('reminders')" id="field-reminders" class="field-row">
            <span class="label"><Bell :size="15" /> Reminders</span>
            <RemindersEdit :task="task" :editable="editable" :compact="!expanded.has('reminders')" @expand="expand('reminders')" />
          </div>
          <div v-if="has('repeat')" id="field-repeat" class="field-row">
            <span class="label"><Repeat :size="15" /> Repeats</span>
            <RepeatEdit :task="task" :editable="editable" :compact="!expanded.has('repeat')" @expand="expand('repeat')" />
          </div>
          <div v-if="has('percentDone')" id="field-percentDone" class="field-row">
            <span class="label"><Gauge :size="15" /> Progress</span>
            <div class="progress-edit">
              <input type="range" min="0" max="100" step="10" :value="task.percentDone" :disabled="!editable" aria-label="Progress" @change="save({ percentDone: Number(($event.target as HTMLInputElement).value) })" />
              <b>{{ task.percentDone }}%</b>
            </div>
          </div>
          <div v-if="has('color')" id="field-color" class="field-row">
            <span class="label"><Palette :size="15" /> Colour</span>
            <div class="swatches">
              <button
                v-for="c in COLORS"
                :key="c"
                class="swatch"
                :class="{ on: task.color === c }"
                :style="{ background: c }"
                :aria-label="`Colour ${c}`"
                :disabled="!editable"
                @click="save({ color: c })"
              />
              <button v-if="task.color && editable" class="button ghost small" @click="save({ color: '' })">None</button>
            </div>
          </div>
          <div v-if="has('labels')" id="field-labels" class="field-row">
            <span class="label"><Tag :size="15" /> Labels</span>
            <LabelEdit :task="task" :editable="editable" />
          </div>
        </div>

        <section class="description">
          <h3>Description</h3>
          <Editor :model-value="task.description" :editable="editable" @save="(h) => save({ description: h })" />
        </section>

        <Attachments ref="attachments" :task="task" :editable="editable" />
        <Relations :task="task" :editable="editable" :adding="relating" @done="relating = false" />
        <Comments :task="task" :editable="editable" />
      </div>

      <aside class="actions">
        <button v-if="editable" class="button wide done-button" :class="{ secondary: task.done }" @click="attempt(() => setDone(task!, !task!.done))">
          <component :is="task.done ? RotateCcw : Check" :size="17" />
          {{ task.done ? 'Not done yet' : 'Done!' }}
        </button>
        <div class="action-list">
          <template v-if="editable">
            <button v-for="a in ACTIONS" :key="a.label" class="action" :class="{ set: a.field && has(a.field) }" @click="a.field && show(a.field)">
              <component :is="a.icon" :size="16" /> {{ a.label }}
            </button>
            <button class="action" @click="attachments?.pick()"><Paperclip :size="16" /> Attach a file</button>
            <button class="action" @click="relating = true"><Link2 :size="16" /> Relate a task</button>
            <button class="action" @click="moving = true; moveTo = targets[0]?.id ?? ''"><FolderInput :size="16" /> Move</button>
          </template>
          <button v-if="editable" class="action" :class="{ set: isFavoriteTask(task) }" @click="attempt(() => toggleFavoriteTask(task!))">
            <Star :size="16" :fill="isFavoriteTask(task) ? 'currentColor' : 'none'" /> {{ isFavoriteTask(task) ? 'Starred' : 'Star' }}
          </button>
          <button v-if="editable" class="action danger" @click="confirmDelete = true"><Trash2 :size="16" /> Delete</button>
        </div>
        <p v-if="!editable" class="muted small">{{ p.archived ? 'The project is archived.' : 'You can see this project’s tasks, but not change them.' }}</p>
        <div class="people">
          <span class="muted small">Who sees this project</span>
          <div class="row wrap"><Avatar v-for="m in people" :key="m" :id="m" :size="26" /></div>
        </div>
      </aside>
    </div>

    <Modal v-if="confirmDelete" title="Delete this task?" @close="confirmDelete = false">
      <p>“{{ task.title }}”, its comments and files will be deleted for everyone. This can’t be undone.</p>
      <template #footer>
        <button class="button ghost" @click="confirmDelete = false">Cancel</button>
        <button class="button danger" @click="remove">Delete</button>
      </template>
    </Modal>
    <Modal v-if="moving" title="Move to another project" @close="moving = false">
      <label v-if="targets.length" class="field">
        <span>Project</span>
        <select v-model="moveTo" class="select">
          <option v-for="x in targets" :key="x.id" :value="x.id">{{ x.title }}</option>
        </select>
      </label>
      <p v-else class="muted">There’s no other project you can add tasks to.</p>
      <p class="help">It gets a new number there, and takes its comments and files with it.</p>
      <template #footer>
        <button class="button ghost" @click="moving = false">Cancel</button>
        <button class="button" :disabled="!moveTo" @click="move">Move</button>
      </template>
    </Modal>
  </div>
  <div v-else class="page">
    <div v-if="!loaded && store.projects.length" class="empty">Loading…</div>
    <div v-else class="card empty">
      <h2>This task isn’t here</h2>
      <p>It may have been deleted or moved, or you’re no longer in its project.</p>
      <RouterLink class="button" :to="{ name: 'home' }">Go to the overview</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.task-page {
  max-width: 1100px;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -6px 0 8px -6px;
}

.crumb {
  color: var(--muted);
  font-weight: 600;
}

.idline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.id {
  color: var(--faint);
  font-weight: 600;
}

.donechip {
  background: var(--success-soft);
  color: var(--success);
}

.chip.overdue {
  background: var(--danger-soft);
  color: var(--danger);
}

.title-input,
.title-text {
  display: block;
  width: 100%;
  margin: 2px 0 4px -8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.25;
  resize: none;
  field-sizing: content;
  overflow: hidden;
}

.title-input:hover {
  background: var(--hover);
}

.title-input:focus {
  outline: none;
  border-color: var(--brand);
  background: var(--surface);
}

.created {
  margin-bottom: 18px;
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: 28px;
  align-items: start;
}

.fields {
  display: grid;
  gap: 2px;
  margin-bottom: 20px;
}

.field-row {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
  scroll-margin: 80px;
}

.field-row:last-child {
  border-bottom: 0;
}

.field-row .label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.slim {
  width: auto;
  min-height: 34px;
  padding: 4px 8px;
}

.progress-edit {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-edit input {
  flex: 1;
  max-width: 260px;
  accent-color: var(--brand);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.swatch {
  width: 26px;
  height: 26px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}

.swatch.on {
  box-shadow: 0 0 0 2px var(--text);
}

.main > section {
  margin-bottom: 26px;
}

.actions {
  position: sticky;
  top: calc(var(--top) + 12px);
  display: grid;
  gap: 12px;
}

.done-button {
  min-height: 44px;
  font-size: 1rem;
}

.action-list {
  display: grid;
  gap: 2px;
}

.action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: left;
}

.action svg {
  color: var(--muted);
}

.action:hover {
  background: var(--hover);
}

.action.set svg {
  color: var(--primary);
}

.action.danger,
.action.danger svg {
  color: var(--danger);
}

.people {
  display: grid;
  gap: 6px;
  margin-top: 6px;
}

.wrap {
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 860px) {
  .columns {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .actions {
    position: static;
    order: -1;
  }

  .action-list {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    margin: 0 -12px;
    padding: 2px 12px 6px;
    scrollbar-width: none;
  }

  .action-list::-webkit-scrollbar {
    display: none;
  }

  .action {
    flex: none;
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .people {
    display: none;
  }

  .field-row {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px 0;
  }

  .title-input,
  .title-text {
    font-size: 1.4rem;
  }
}
</style>
