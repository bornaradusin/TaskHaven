<script setup lang="ts">
// A task's labels: pick from those one knows, or type a new one.
import { computed, ref } from 'vue'
import LabelChip from '../LabelChip.vue'
import { attempt, createLabel, knownLabels, updateTask } from '@/state'
import { COLORS, type LabelRef, type Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean }>()
const text = ref('')
const focused = ref(false)
const suggestions = computed(() => {
  const q = text.value.trim().toLowerCase()
  const on = new Set(props.task.labels.map((l) => l.id))
  return knownLabels()
    .filter((l) => !on.has(l.id) && (!q || l.title.toLowerCase().includes(q)))
    .slice(0, 8)
})
const exact = computed(() => knownLabels().some((l) => l.title.toLowerCase() === text.value.trim().toLowerCase()))

function add(label: LabelRef) {
  text.value = ''
  void attempt(() => updateTask(props.task, { labels: [...props.task.labels, { id: label.id, title: label.title, color: label.color }] }))
}

async function create() {
  const title = text.value.trim()
  if (!title) return
  const match = knownLabels().find((l) => l.title.toLowerCase() === title.toLowerCase())
  if (match) return add(match)
  const label = await attempt(() => createLabel(title, COLORS[Math.floor(Math.random() * COLORS.length)]))
  if (label) add(label)
}

function blurred() {
  setTimeout(() => (focused.value = false), 150)
}

function remove(id: string) {
  void attempt(() => updateTask(props.task, { labels: props.task.labels.filter((l) => l.id !== id) }))
}
</script>

<template>
  <div class="labels">
    <LabelChip v-for="l in task.labels" :key="l.id" :label="l" :removable="editable" @remove="remove(l.id)" />
    <div v-if="editable" class="picker">
      <input v-model="text" class="input slim" placeholder="Add a label…" aria-label="Add a label" @focus="focused = true" @blur="blurred" @keydown.enter.prevent="create" />
      <div v-if="focused && (suggestions.length || (text.trim() && !exact))" class="suggest card">
        <button v-for="l in suggestions" :key="l.id" class="item" @mousedown.prevent="add(l)"><LabelChip :label="l" /></button>
        <button v-if="text.trim() && !exact" class="item" @mousedown.prevent="create">Make a label “{{ text.trim() }}”</button>
      </div>
    </div>
    <span v-else-if="!task.labels.length" class="muted">None</span>
  </div>
</template>

<style scoped>
.labels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.picker {
  position: relative;
}

.slim {
  min-height: 30px;
  width: 160px;
  padding: 4px 8px;
}

.suggest {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
  min-width: 200px;
  padding: 4px;
  box-shadow: var(--shadow-lg);
}

.item {
  display: flex;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
}

.item:hover {
  background: var(--hover);
}
</style>
