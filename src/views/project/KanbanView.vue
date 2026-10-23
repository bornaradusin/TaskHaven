<script setup lang="ts">
// The Kanban board: a column per bucket; drag cards between them. The done column marks tasks done.
import { computed, nextTick, onMounted, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, CalendarClock, CircleCheck, Ellipsis, Gauge, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import Dropdown from '@/ui/Dropdown.vue'
import Modal from '@/ui/Modal.vue'
import QuickAdd from '@/ui/QuickAdd.vue'
import LabelChip from '@/ui/LabelChip.vue'
import Avatars from '@/ui/Avatars.vue'
import PriorityLabel from '@/ui/PriorityLabel.vue'
import { filtered } from '@/ui/useTasks'
import { startDrag } from '@/ui/drag'
import type { ViewOptions } from '@/ui/ViewFilter.vue'
import { dueText } from '@/logic/dates'
import { bucketFull, bucketOf, isOverdue, positionBetween, taskIdentifier } from '@/logic/tasks'
import { addBucket, attempt, canEdit, deleteBucket, loadBoard, moveTaskToBucket, setDoneBucket, toast, updateBucket } from '@/state'
import type { Bucket, Project, Task } from '@/model'

const props = defineProps<{ project: Project; tasks: Task[]; options: ViewOptions }>()
const router = useRouter()
const shown = filtered(toRef(props, 'tasks'), toRef(props, 'options'), true)
const editable = computed(() => canEdit(props.project))
const board = ref<HTMLElement | null>(null)
const adding = ref<string | null>(null)
const newBucket = ref('')
const renaming = ref<string | null>(null)
const renameText = ref('')
const limitFor = ref<Bucket | null>(null)
const limitValue = ref(0)
const removing = ref<Bucket | null>(null)
const target = ref<{ bucket: string; index: number } | null>(null)
const loading = ref(true)
const failed = ref('')

// the board's columns, and which task is in which, are the server's: fetched when it opens
async function load() {
  loading.value = true
  try {
    await loadBoard(props.project)
    failed.value = ''
  } catch (e) {
    failed.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const columns = computed(() =>
  props.project.buckets.map((b) => ({
    bucket: b,
    tasks: shown.value.filter((t) => bucketOf(t, props.project) === b.id).sort((a, c) => a.kanbanPosition - c.kanbanPosition),
  })),
)

function open(t: Task) {
  void router.push({ name: 'task', params: { projectId: t.projectId, taskId: t.id } })
}

/** The column and place in it under the pointer. */
function spotAt(x: number, y: number): { bucket: string; index: number } | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-bucket]') as HTMLElement | null
  if (!el) return null
  const cards = [...el.querySelectorAll<HTMLElement>('[data-card]')].filter((c) => !c.classList.contains('dragging'))
  let index = cards.length
  for (const [i, c] of cards.entries()) {
    const r = c.getBoundingClientRect()
    if (y < r.top + r.height / 2) {
      index = i
      break
    }
  }
  return { bucket: el.dataset.bucket!, index }
}

function grab(e: PointerEvent, task: Task) {
  if (!editable.value) return
  const card = e.currentTarget as HTMLElement
  startDrag(
    e,
    card,
    {
      move: (x, y) => (target.value = spotAt(x, y)),
      cancel: () => (target.value = null),
      drop: (x, y) => {
        const spot = spotAt(x, y)
        target.value = null
        if (spot) void drop(task, spot.bucket, spot.index)
      },
    },
    () => (board.value ? [board.value, ...board.value.querySelectorAll<HTMLElement>('.cards')] : []),
  )
}

async function drop(task: Task, bucketId: string, index: number) {
  const column = columns.value.find((c) => c.bucket.id === bucketId)
  if (!column) return
  const others = column.tasks.filter((t) => t.id !== task.id)
  const from = bucketOf(task, props.project)
  if (from !== bucketId && bucketFull(column.bucket, column.tasks.length)) {
    toast(`“${column.bucket.title}” is full (${column.bucket.limit} at most).`, { error: true })
    return
  }
  const position = positionBetween(others[index - 1]?.kanbanPosition, others[index]?.kanbanPosition)
  await attempt(() => moveTaskToBucket(task, bucketId, position))
}

async function rename(b: Bucket) {
  const title = renameText.value.trim()
  renaming.value = null
  if (!title || title === b.title) return
  await attempt(() => updateBucket(props.project, b.id, { title }))
}

async function startRename(b: Bucket) {
  renaming.value = b.id
  renameText.value = b.title
  await nextTick()
  document.querySelector<HTMLInputElement>('.rename')?.select()
}

async function move(b: Bucket, by: number) {
  const list = [...props.project.buckets]
  const i = list.findIndex((x) => x.id === b.id)
  const j = i + by
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  // positions in steps, so the two swap (and the rest keep theirs)
  await attempt(async () => {
    for (const [k, x] of list.entries()) if (x.position !== (k + 1) * 100) await updateBucket(props.project, x.id, { position: (k + 1) * 100 })
  })
}

async function setLimit() {
  const b = limitFor.value
  limitFor.value = null
  if (!b) return
  const limit = Math.max(0, Math.round(limitValue.value || 0))
  await attempt(() => updateBucket(props.project, b.id, { limit }))
}

async function toggleDone(b: Bucket) {
  await attempt(
    () => setDoneBucket(props.project, props.project.doneBucketId === b.id ? null : b.id),
    props.project.doneBucketId === b.id ? undefined : `Tasks moved to “${b.title}” are marked done.`,
  )
}

async function create() {
  const title = newBucket.value.trim()
  if (!title) return
  newBucket.value = ''
  await attempt(() => addBucket(props.project, title))
}

async function remove() {
  const b = removing.value
  removing.value = null
  if (b) await attempt(() => deleteBucket(props.project, b.id))
}
</script>

<template>
  <p v-if="failed" class="error-text">{{ failed }}</p>
  <div v-if="loading && !project.buckets.length" class="empty">Loading the board…</div>
  <div v-if="project.buckets.length || !loading" ref="board" class="board">
    <section v-for="col in columns" :key="col.bucket.id" class="column" :data-bucket="col.bucket.id" :class="{ target: target?.bucket === col.bucket.id, full: bucketFull(col.bucket, col.tasks.length) }">
      <header class="col-head">
        <input v-if="renaming === col.bucket.id" v-model="renameText" class="input rename" @keydown.enter="rename(col.bucket)" @keydown.esc="renaming = null" @blur="rename(col.bucket)" />
        <h3 v-else class="col-title" @dblclick="editable && startRename(col.bucket)">
          <CircleCheck v-if="project.doneBucketId === col.bucket.id" :size="16" class="done-mark" />
          {{ col.bucket.title }}
        </h3>
        <span class="count" :class="{ over: col.bucket.limit && col.tasks.length >= col.bucket.limit }">
          {{ col.tasks.length }}<template v-if="col.bucket.limit">/{{ col.bucket.limit }}</template>
        </span>
        <Dropdown v-if="editable" align="right" :label="`${col.bucket.title} menu`">
          <template #icon><Ellipsis :size="18" /></template>
          <button class="item" @click="startRename(col.bucket)"><Pencil :size="16" /> Rename</button>
          <button class="item" @click="limitFor = col.bucket; limitValue = col.bucket.limit"><Gauge :size="16" /> Limit: {{ col.bucket.limit || 'none' }}</button>
          <button class="item" @click="toggleDone(col.bucket)">
            <CircleCheck :size="16" /> {{ project.doneBucketId === col.bucket.id ? 'Not the done column' : 'Make it the done column' }}
          </button>
          <button class="item" @click="move(col.bucket, -1)"><ArrowLeft :size="16" /> Move left</button>
          <button class="item" @click="move(col.bucket, 1)"><ArrowRight :size="16" /> Move right</button>
          <hr />
          <button class="item danger" @click="removing = col.bucket"><Trash2 :size="16" /> Delete column</button>
        </Dropdown>
      </header>

      <div class="cards">
        <template v-for="(t, i) in col.tasks" :key="t.id">
          <div v-if="target?.bucket === col.bucket.id && target.index === i" class="drop" />
          <article
            class="kcard"
            data-card
            :class="{ done: t.done }"
            :style="t.color ? { borderTopColor: t.color } : undefined"
            @pointerdown="grab($event, t)"
            @click="open(t)"
          >
            <div class="kline">
              <span class="id">{{ taskIdentifier(t, project) }}</span>
              <PriorityLabel :priority="t.priority" :done="t.done" />
            </div>
            <div class="ktitle">{{ t.title }}</div>
            <div v-if="t.labels.length" class="klabels"><LabelChip v-for="l in t.labels" :key="l.id" :label="l" /></div>
            <div v-if="t.percentDone" class="progress"><span :style="{ width: `${t.percentDone}%` }" /></div>
            <div v-if="t.dueDate || t.assignees.length" class="kfoot">
              <span v-if="t.dueDate" class="due" :class="{ overdue: isOverdue(t) }"><CalendarClock :size="13" /> {{ dueText(t.dueDate) }}</span>
              <span class="spacer" />
              <Avatars :ids="t.assignees" :size="22" />
            </div>
          </article>
        </template>
        <div v-if="target?.bucket === col.bucket.id && target.index >= col.tasks.length" class="drop" />
      </div>

      <footer v-if="editable" class="col-foot">
        <QuickAdd v-if="adding === col.bucket.id" :project-id="project.id" :bucket-id="col.bucket.id" placeholder="A task for this column…" autofocus />
        <button v-else class="button ghost small wide add" :disabled="bucketFull(col.bucket, col.tasks.length)" @click="adding = col.bucket.id"><Plus :size="15" /> Add a task</button>
      </footer>
    </section>

    <section v-if="editable" class="column new">
      <input v-model="newBucket" class="input" placeholder="New column…" aria-label="New column" @keydown.enter="create" />
      <button class="button secondary small" :disabled="!newBucket.trim()" @click="create"><Plus :size="15" /> Add column</button>
    </section>
  </div>

  <Modal v-if="limitFor" :title="`Limit for “${limitFor.title}”`" @close="limitFor = null">
    <label class="field"><span>The most tasks it may hold (0: no limit)</span><input v-model.number="limitValue" class="input" type="number" min="0" @keydown.enter="setLimit" /></label>
    <template #footer>
      <button class="button ghost" @click="limitFor = null">Cancel</button>
      <button class="button" @click="setLimit">Save</button>
    </template>
  </Modal>
  <Modal v-if="removing" title="Delete this column?" @close="removing = null">
    <p>Its tasks move to another column. The tasks themselves aren’t deleted.</p>
    <template #footer>
      <button class="button ghost" @click="removing = null">Cancel</button>
      <button class="button danger" @click="remove">Delete column</button>
    </template>
  </Modal>
</template>

<style scoped>
.board {
  /* columns arriving from the server don't scroll the board sideways */
  overflow-anchor: none;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin: 0 -20px;
  padding: 0 20px 20px;
  overflow-x: auto;
  min-height: calc(100vh - 220px);
  scroll-snap-type: x proximity;
}

.column {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 300px;
  max-height: calc(100vh - 210px);
  border-radius: var(--radius);
  background: var(--surface-2);
  scroll-snap-align: start;
  transition: box-shadow 0.12s;
}

.column.target {
  box-shadow: 0 0 0 2px var(--brand);
}

.col-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 6px 4px 14px;
}

.col-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.98rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done-mark {
  color: var(--success);
  flex: none;
}

.rename {
  flex: 1;
  min-height: 32px;
  padding: 4px 8px;
}

.count {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.count.over {
  color: var(--danger);
}

.cards {
  flex: 1;
  min-height: 40px;
  padding: 4px 8px;
  overflow-y: auto;
}

.kcard {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-top: 3px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.kcard:hover {
  box-shadow: var(--shadow-lg);
}

.kline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.id {
  color: var(--faint);
  font-size: 0.78rem;
}

.ktitle {
  margin: 2px 0;
  font-weight: 550;
  overflow-wrap: anywhere;
}

.done .ktitle {
  color: var(--muted);
  text-decoration: line-through;
}

.klabels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.progress {
  height: 4px;
  margin-top: 8px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: var(--brand);
}

.kfoot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.8rem;
}

.due {
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
}

.drop {
  height: 4px;
  margin: -2px 0 6px;
  border-radius: 2px;
  background: var(--brand);
}

.col-foot {
  padding: 4px 8px 8px;
}

.add {
  justify-content: flex-start;
  color: var(--muted);
}

.column.new {
  display: grid;
  gap: 8px;
  padding: 10px;
  background: transparent;
  border: 2px dashed var(--border);
}

@media (max-width: 760px) {
  .board {
    margin: 0 -12px;
    padding: 0 12px 20px;
  }

  .column {
    width: min(300px, 82vw);
  }
}
</style>
