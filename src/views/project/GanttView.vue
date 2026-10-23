<script setup lang="ts">
// The Gantt chart: tasks with a start and an end as bars over the days (drag them to move them,
// or their end to make them longer); tasks with only a due date as a dot.
import { computed, onMounted, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { filtered } from '@/ui/useTasks'
import { remembered } from '@/ui/remember'
import type { ViewOptions } from '@/ui/ViewFilter.vue'
import TaskRow from '@/ui/TaskRow.vue'
import { addDays, daysBetween, dayKey, startOfDay } from '@/logic/dates'
import { attempt, canEdit, updateTask } from '@/state'
import type { Project, Task } from '@/model'

const props = defineProps<{ project: Project; tasks: Task[]; options: ViewOptions }>()
const router = useRouter()
const shown = filtered(toRef(props, 'tasks'), toRef(props, 'options'))
const editable = computed(() => canEdit(props.project))
const scroller = ref<HTMLElement | null>(null)
const DAY_W = 38

const settings = remembered('gantt', { before: 7, after: 35, undated: false })
const from = computed(() => addDays(startOfDay(new Date()), -settings.value.before))
const days = computed(() => Array.from({ length: settings.value.before + settings.value.after + 1 }, (_, i) => addDays(from.value, i)))
const today = dayKey(new Date())

/** A drag in progress: how many days it has moved (and whether it's the end being pulled). */
const dragging = ref<{ id: string; days: number; end: boolean } | null>(null)

interface Bar {
  task: Task
  left: number
  width: number
  milestone: boolean
}

const bars = computed<Bar[]>(() => {
  const out: Bar[] = []
  for (const t of shown.value) {
    const startIso = t.startDate ?? (t.endDate ? null : t.dueDate)
    const endIso = t.endDate ?? t.dueDate ?? t.startDate
    if (!startIso || !endIso) continue
    let start = daysBetween(from.value, new Date(startIso))
    let end = daysBetween(from.value, new Date(endIso))
    const d = dragging.value?.id === t.id ? dragging.value : null
    if (d && !d.end) {
      start += d.days
      end += d.days
    }
    if (d?.end) end = Math.max(start, end + d.days)
    if (end < 0 || start >= days.value.length) continue
    out.push({ task: t, left: start * DAY_W, width: (end - start + 1) * DAY_W, milestone: !t.startDate && !t.endDate })
  }
  return out.sort((a, b) => a.left - b.left || a.task.position - b.task.position)
})

const undated = computed(() => shown.value.filter((t) => !t.startDate && !t.endDate && !t.dueDate))

function open(t: Task) {
  void router.push({ name: 'task', params: { projectId: t.projectId, taskId: t.id } })
}

function shift(iso: string | null, n: number): string | null {
  return iso ? addDays(new Date(iso), n).toISOString() : null
}

function grab(e: PointerEvent, bar: Bar, end: boolean) {
  if (!editable.value || e.button !== 0) return
  e.stopPropagation()
  const startX = e.clientX
  let moved = false
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => {
    const n = Math.round((ev.clientX - startX) / DAY_W)
    if (Math.abs(ev.clientX - startX) > 4) moved = true
    dragging.value = { id: bar.task.id, days: n, end }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const d = dragging.value
    dragging.value = null
    if (!moved) return open(bar.task)
    if (!d || !d.days) return
    const t = bar.task
    if (d.end) {
      const endIso = t.endDate ?? t.dueDate
      void attempt(() => updateTask(t, t.endDate ? { endDate: shift(endIso, d.days) } : { dueDate: shift(endIso, d.days) }))
    } else {
      void attempt(() => updateTask(t, { startDate: shift(t.startDate, d.days), endDate: shift(t.endDate, d.days), dueDate: shift(t.dueDate, d.days) }))
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

onMounted(() => {
  // start with today in view
  if (scroller.value) scroller.value.scrollLeft = Math.max(0, (settings.value.before - 2) * DAY_W)
})
</script>

<template>
  <div class="gantt-view">
    <div class="row tools">
      <label class="small muted">Show
        <select v-model.number="settings.after" class="select inline">
          <option :value="14">2 weeks</option>
          <option :value="35">5 weeks</option>
          <option :value="90">3 months</option>
          <option :value="180">6 months</option>
        </select>
        ahead
      </label>
      <span class="spacer" />
      <label class="check small"><input v-model="settings.undated" type="checkbox" /> Tasks without dates</label>
    </div>

    <div ref="scroller" class="card chart">
      <div class="grid" :style="{ width: `${days.length * DAY_W}px` }">
        <div class="days">
          <div v-for="d in days" :key="d.getTime()" class="day" :class="{ today: dayKey(d) === today, weekend: d.getDay() === 0 || d.getDay() === 6, first: d.getDate() === 1 }" :style="{ width: `${DAY_W}px` }">
            <span v-if="d.getDate() === 1 || d.getTime() === days[0].getTime()" class="month">{{ d.toLocaleDateString(undefined, { month: 'short' }) }}</span>
            <span class="wd">{{ d.toLocaleDateString(undefined, { weekday: 'narrow' }) }}</span>
            <span class="dn">{{ d.getDate() }}</span>
          </div>
        </div>
        <div class="rows">
          <div class="stripes">
            <div v-for="d in days" :key="d.getTime()" class="stripe" :class="{ today: dayKey(d) === today, weekend: d.getDay() === 0 || d.getDay() === 6 }" :style="{ width: `${DAY_W}px` }" />
          </div>
          <div v-for="b in bars" :key="b.task.id" class="bar-row">
            <div
              v-if="!b.milestone"
              class="bar"
              :class="{ done: b.task.done, editable }"
              :style="{ left: `${b.left}px`, width: `${b.width}px`, background: b.task.color || project.color || 'var(--brand)' }"
              :title="b.task.title"
              @pointerdown="grab($event, b, false)"
            >
              <span class="fill" :style="{ width: `${b.task.percentDone}%` }" />
              <span class="text">{{ b.task.title }}</span>
              <span v-if="editable" class="handle" @pointerdown="grab($event, b, true)" />
            </div>
            <div v-else class="milestone-wrap" :style="{ left: `${b.left}px` }" @pointerdown="grab($event, b, false)">
              <span class="milestone" :style="{ background: b.task.color || project.color || 'var(--brand)' }" />
              <span class="mtext">{{ b.task.title }}</span>
            </div>
          </div>
          <div v-if="!bars.length" class="empty">No tasks with dates in this time. Give tasks a start and end date to see them here.</div>
        </div>
      </div>
    </div>

    <div v-if="settings.undated && undated.length" class="card undated">
      <div class="card-header">Without dates</div>
      <div class="list"><TaskRow v-for="t in undated" :key="t.id" :task="t" compact /></div>
    </div>
  </div>
</template>

<style scoped>
.tools {
  margin-bottom: 10px;
}

.select.inline {
  display: inline-block;
  width: auto;
  min-height: 32px;
  padding: 4px 8px;
  margin: 0 4px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.check input {
  accent-color: var(--primary);
}

.chart {
  overflow-x: auto;
  overflow-y: hidden;
}

.grid {
  position: relative;
}

.days {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.day {
  position: relative;
  display: grid;
  justify-items: center;
  flex: none;
  padding: 18px 0 6px;
  font-size: 0.75rem;
  color: var(--muted);
}

.day.weekend {
  background: var(--surface-2);
}

.day.today .dn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
}

.month {
  position: absolute;
  top: 3px;
  left: 4px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.wd {
  font-size: 0.68rem;
  opacity: 0.8;
}

.dn {
  font-weight: 600;
  line-height: 24px;
}

.rows {
  position: relative;
  min-height: 160px;
  padding: 8px 0 12px;
}

.stripes {
  position: absolute;
  inset: 0;
  display: flex;
  pointer-events: none;
}

.stripe {
  flex: none;
  border-right: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.stripe.weekend {
  background: var(--surface-2);
}

.stripe.today {
  background: color-mix(in srgb, var(--brand) 9%, transparent);
}

.bar-row {
  position: relative;
  height: 38px;
}

.bar {
  position: absolute;
  top: 5px;
  height: 28px;
  border-radius: 6px;
  color: #fff;
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow);
  touch-action: pan-y;
}

.bar.editable {
  cursor: grab;
}

.bar.done {
  opacity: 0.5;
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(0, 0, 0, 0.18);
}

.text {
  position: relative;
  display: block;
  padding: 0 10px;
  line-height: 28px;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}

.handle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.18));
}

.milestone-wrap {
  position: absolute;
  top: 7px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.milestone {
  width: 16px;
  height: 16px;
  transform: rotate(45deg);
  border-radius: 3px;
}

.mtext {
  font-size: 0.85rem;
  font-weight: 550;
}

.empty {
  position: sticky;
  left: 0;
  max-width: 100vw;
}

.undated {
  margin-top: 16px;
}

.undated .list {
  padding: 6px;
}
</style>
