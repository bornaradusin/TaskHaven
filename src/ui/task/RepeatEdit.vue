<script setup lang="ts">
// How a task repeats: the usual choices, or every so many hours, days, weeks, months or years.
import { computed, ref, watch } from 'vue'
import { describeRepeat, joinInterval, REPEAT_CHOICES, splitInterval } from '@/logic/repeat'
import { attempt, updateTask } from '@/state'
import type { Repeat, Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean; compact?: boolean }>()
const emit = defineEmits<{ expand: [] }>()
const amount = ref(1)
const unit = ref<'hours' | 'days' | 'weeks' | 'months' | 'years'>('days')
const fromDone = ref(false)

watch(
  () => props.task.repeat,
  (r) => {
    const s = splitInterval(r)
    amount.value = s.amount
    unit.value = s.unit
    fromDone.value = r.mode === 'done'
  },
  { immediate: true },
)

const repeating = computed(() => props.task.repeat.every > 0)

function save(repeat: Repeat) {
  void attempt(() => updateTask(props.task, { repeat }))
}

function custom() {
  save(joinInterval(amount.value, unit.value, fromDone.value && unit.value !== 'months' && unit.value !== 'years'))
}
</script>

<template>
  <div class="repeat">
    <div v-if="compact" class="summary">
      <span>{{ describeRepeat(task.repeat) }}</span>
      <button v-if="editable" class="button ghost small more" @click="emit('expand')">Change</button>
    </div>
    <template v-else-if="editable">
      <div class="presets">
        <button v-for="c in REPEAT_CHOICES" :key="c.label" class="button small" :class="JSON.stringify(c.repeat) === JSON.stringify(task.repeat) ? '' : 'secondary'" @click="save(c.repeat)">
          {{ c.label }}
        </button>
        <button v-if="repeating" class="button ghost small" @click="save({ every: 0, mode: 'due' })">Don’t repeat</button>
      </div>
      <div class="custom">
        <span>Every</span>
        <input v-model.number="amount" class="input slim num" type="number" min="1" aria-label="How often" @change="custom" />
        <select v-model="unit" class="select slim" aria-label="Unit" @change="custom">
          <option value="hours">hours</option>
          <option value="days">days</option>
          <option value="weeks">weeks</option>
          <option value="months">months</option>
          <option value="years">years</option>
        </select>
        <label v-if="unit !== 'months' && unit !== 'years'" class="check small"><input v-model="fromDone" type="checkbox" @change="custom" /> from when it’s done</label>
      </div>
    </template>
    <p v-if="!compact || (repeating && !task.dueDate && !task.startDate && !task.endDate)" class="muted small now">
      {{ describeRepeat(task.repeat) }}{{ repeating && !task.dueDate && !task.startDate && !task.endDate ? ' (give it a date for it to move on)' : '' }}
    </p>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.more {
  color: var(--primary);
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.custom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.slim {
  width: auto;
  min-height: 32px;
  padding: 4px 8px;
}

.num {
  width: 70px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.check input {
  accent-color: var(--primary);
}

.now {
  margin: 6px 0 0;
}
</style>
