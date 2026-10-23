<script setup lang="ts">
// A task's reminders: at a time, or some time before (or after) one of its dates.
import { ref } from 'vue'
import { BellPlus, X } from 'lucide-vue-next'
import { describeReminder } from '@/logic/tasks'
import { formatDateTime, fromLocalInput, toLocalInput } from '@/logic/dates'
import { attempt, updateTask } from '@/state'
import type { Reminder, Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean; compact?: boolean }>()
const emit = defineEmits<{ expand: [] }>()
const kind = ref<'relative' | 'at'>(props.task.dueDate ? 'relative' : 'at')
const amount = ref(1)
const unit = ref<'minutes' | 'hours' | 'days'>('hours')
const direction = ref<'before' | 'after'>('before')
const relativeTo = ref<'due' | 'start' | 'end'>('due')
const at = ref(toLocalInput(props.task.dueDate ?? new Date(Date.now() + 3600_000).toISOString()))

function save(reminders: Reminder[]) {
  void attempt(() => updateTask(props.task, { reminders }))
}

function add() {
  if (kind.value === 'at') {
    const iso = fromLocalInput(at.value)
    if (iso) save([...props.task.reminders, { at: iso, relativeTo: null, offset: 0 }])
    return
  }
  const minutes = amount.value * { minutes: 1, hours: 60, days: 1440 }[unit.value]
  save([...props.task.reminders, { at: null, relativeTo: relativeTo.value, offset: direction.value === 'before' ? -minutes : minutes }])
}

function remove(i: number) {
  save(props.task.reminders.filter((_, j) => j !== i))
}

function text(r: Reminder): string {
  return r.at ? formatDateTime(new Date(r.at)) : describeReminder(r)
}
</script>

<template>
  <div class="reminders">
    <div v-for="(r, i) in task.reminders" :key="i" class="reminder">
      <span>{{ text(r) }}</span>
      <span v-if="!r.at && r.relativeTo && !task[r.relativeTo === 'due' ? 'dueDate' : r.relativeTo === 'start' ? 'startDate' : 'endDate']" class="muted small">(that date isn’t set)</span>
      <button v-if="editable" class="icon-button small" aria-label="Remove reminder" @click="remove(i)"><X :size="14" /></button>
    </div>
    <button v-if="editable && compact" class="button ghost small more" @click="emit('expand')">Add a reminder</button>
    <div v-else-if="editable" class="add">
      <select v-model="kind" class="select slim" aria-label="Kind of reminder">
        <option value="relative">Before or after a date</option>
        <option value="at">At a time</option>
      </select>
      <template v-if="kind === 'relative'">
        <input v-model.number="amount" class="input slim num" type="number" min="0" aria-label="How long" />
        <select v-model="unit" class="select slim" aria-label="Unit">
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
        <select v-model="direction" class="select slim" aria-label="Before or after">
          <option value="before">before</option>
          <option value="after">after</option>
        </select>
        <select v-model="relativeTo" class="select slim" aria-label="Which date">
          <option value="due">the due date</option>
          <option value="start">the start</option>
          <option value="end">the end</option>
        </select>
      </template>
      <input v-else v-model="at" class="input slim" type="datetime-local" aria-label="When" />
      <button class="button secondary small" @click="add"><BellPlus :size="15" /> Add</button>
    </div>
  </div>
</template>

<style scoped>
.reminder {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.more {
  margin-left: -10px;
  color: var(--primary);
}

.add {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.slim {
  width: auto;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 0.9rem;
}

.num {
  width: 70px;
}
</style>
