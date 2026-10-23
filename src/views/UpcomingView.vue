<script setup lang="ts">
// Upcoming: what's due (or happening) in the next days, by day, overdue ones first.
import { computed } from 'vue'
import { CalendarCheck } from 'lucide-vue-next'
import TaskRow from '@/ui/TaskRow.vue'
import { remembered } from '@/ui/remember'
import { addDays, dayKey, formatDay, relativeDay, startOfDay } from '@/logic/dates'
import { upcomingTasks } from '@/logic/tasks'
import { allTasks } from '@/state'

const options = remembered('upcoming', { days: 7, overdue: true })
const now = new Date()
const to = computed(() => addDays(startOfDay(now), options.value.days))
const tasks = computed(() => upcomingTasks(allTasks(), now, to.value, options.value.overdue, now))

const groups = computed(() => {
  const out: { key: string; title: string; tasks: typeof tasks.value }[] = []
  const today = startOfDay(now).getTime()
  for (const t of tasks.value) {
    const when = new Date(t.dueDate ?? t.startDate ?? t.endDate ?? now)
    const overdue = when.getTime() < today
    const key = overdue ? 'overdue' : dayKey(when)
    let g = out.find((x) => x.key === key)
    if (!g) {
      const rel = relativeDay(when, now)
      const title = overdue ? 'Overdue' : rel === 'today' || rel === 'tomorrow' ? `${rel[0].toUpperCase()}${rel.slice(1)} · ${formatDay(when, now)}` : formatDay(when, now)
      g = { key, title, tasks: [] }
      out.push(g)
    }
    g.tasks.push(t)
  }
  return out
})

const RANGES = [
  { days: 0, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
]
</script>

<template>
  <div class="page">
    <div class="page-title"><h1>Upcoming</h1></div>
    <div class="row bar">
      <div class="tabs ranges">
        <button v-for="r in RANGES" :key="r.days" class="tab" :class="{ active: options.days === r.days }" @click="options.days = r.days">{{ r.label }}</button>
      </div>
      <span class="spacer" />
      <label class="check small"><input v-model="options.overdue" type="checkbox" /> Show overdue</label>
    </div>

    <section v-for="g in groups" :key="g.key" class="group">
      <h3 :class="{ overdue: g.key === 'overdue' }">{{ g.title }}</h3>
      <div class="card list"><TaskRow v-for="t in g.tasks" :key="t.id" :task="t" show-project /></div>
    </section>
    <div v-if="!groups.length" class="card empty">
      <CalendarCheck :size="38" />
      <p>Nothing coming up{{ options.days === 0 ? ' today' : ` in the next ${options.days} days` }}.</p>
    </div>
  </div>
</template>

<style scoped>
.bar {
  margin-bottom: 18px;
}

.ranges {
  padding: 3px;
  border-radius: var(--radius);
  background: var(--surface-2);
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

.group {
  margin-bottom: 18px;
}

.group h3 {
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 0.95rem;
}

.group h3.overdue {
  color: var(--danger);
}

.list {
  padding: 6px;
}
</style>
