<script setup lang="ts">
// A date and time, with the usual choices a tap away (today, tomorrow, next week …).
import { computed, ref } from 'vue'
import { CalendarClock, X } from 'lucide-vue-next'
import Dropdown from './Dropdown.vue'
import { addDays, atHour, DEFAULT_HOUR, formatDateTime, fromLocalInput, nextWeekday, startOfDay, toLocalInput } from '@/logic/dates'

const props = withDefaults(defineProps<{ modelValue: string | null; placeholder?: string; disabled?: boolean }>(), { placeholder: 'Set a date', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const menu = ref<InstanceType<typeof Dropdown> | null>(null)

const choices = computed(() => {
  const now = new Date()
  const today = startOfDay(now)
  const hour = props.modelValue ? new Date(props.modelValue) : atHour(today, DEFAULT_HOUR)
  const at = (d: Date) => atHour(d, hour.getHours(), hour.getMinutes())
  const weekday = now.getDay()
  return [
    { label: 'Today', date: at(today) },
    { label: 'Tomorrow', date: at(addDays(today, 1)) },
    { label: 'Next Monday', date: at(nextWeekday(now, 1)) },
    { label: 'This weekend', date: at(weekday === 6 || weekday === 0 ? today : nextWeekday(now, 6)) },
    { label: 'Later this week', date: at(addDays(today, Math.max(1, Math.min(2, 5 - weekday)))) },
    { label: 'Next week', date: at(addDays(today, 7)) },
  ]
})

function set(value: string | null) {
  emit('update:modelValue', value)
}
</script>

<template>
  <Dropdown ref="menu" align="left">
    <template #trigger="{ toggle }">
      <button class="date-button" :class="{ empty: !modelValue }" :disabled="disabled" @click.stop="toggle">
        <CalendarClock :size="16" />
        {{ modelValue ? formatDateTime(new Date(modelValue)) : placeholder }}
      </button>
    </template>
    <div class="picker" @click.stop>
      <button v-for="c in choices" :key="c.label" class="item" @click="set(c.date.toISOString()); menu?.close()">
        <span class="spacer">{{ c.label }}</span>
        <span class="muted small">{{ c.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }}</span>
      </button>
      <hr />
      <input
        class="input"
        type="datetime-local"
        :value="toLocalInput(modelValue)"
        aria-label="Date and time"
        @change="set(fromLocalInput(($event.target as HTMLInputElement).value))"
      />
      <div class="row end">
        <button v-if="modelValue" class="button ghost small" @click="set(null); menu?.close()"><X :size="14" /> Clear</button>
        <span class="spacer" />
        <button class="button small" @click="menu?.close()">Done</button>
      </div>
    </div>
  </Dropdown>
</template>

<style scoped>
.date-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: left;
}

.date-button:hover:not(:disabled) {
  background: var(--hover);
}

.date-button.empty {
  color: var(--muted);
}

.date-button:disabled {
  cursor: default;
}

.picker {
  width: 270px;
}

.picker .input {
  margin: 4px 0 8px;
}

.end {
  padding: 0 2px 2px;
}
</style>
