<script setup lang="ts">
// "Add a task": one line, with *labels +project @people !priority and dates understood.
import { computed, ref } from 'vue'
import { CalendarClock, CircleHelp, Folder, Plus, Repeat, Tag, User } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { parseQuickAdd } from '@/logic/quickadd'
import { dueText } from '@/logic/dates'
import { describeRepeat } from '@/logic/repeat'
import { PRIORITIES } from '@/model'
import { attempt, moveTaskToBucket, quickAdd, store } from '@/state'
import type { TaskFields } from '@/data/backend'
import type { Task } from '@/model'

const props = withDefaults(defineProps<{ projectId?: string | null; placeholder?: string; extra?: Partial<TaskFields>; bucketId?: string | null; autofocus?: boolean }>(), {
  projectId: null,
  bucketId: null,
  placeholder: 'Add a task…',
  extra: () => ({}),
  autofocus: false,
})
const emit = defineEmits<{ added: [task: Task] }>()

const text = ref('')
const busy = ref(false)
const help = ref(false)
const input = ref<HTMLTextAreaElement | null>(null)

const parsed = computed(() => (text.value.trim() ? parseQuickAdd(text.value.split('\n')[0], new Date(), store.settings.weekStart) : null))

async function add() {
  const lines = text.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length || busy.value) return
  busy.value = true
  // pasted lines: a task each
  for (const line of lines) {
    const task = await attempt(() => quickAdd(line, props.projectId, props.extra))
    if (!task) break
    // added from a kanban column: into that column (at its end)
    if (props.bucketId && task.projectId === props.projectId) await attempt(() => moveTaskToBucket(task, props.bucketId!, Date.now()))
    emit('added', task)
    lines.shift()
  }
  text.value = lines.join('\n')
  busy.value = false
  input.value?.focus()
}

function key(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void add()
  }
}

function grow() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}
</script>

<template>
  <div class="quick-add">
    <div class="box">
      <Plus :size="20" class="plus" />
      <textarea
        ref="input"
        v-model="text"
        class="field"
        rows="1"
        :placeholder="placeholder"
        :autofocus="autofocus"
        aria-label="New task"
        @keydown="key"
        @input="grow"
      />
      <button class="icon-button small" aria-label="How quick add works" title="How quick add works" @click="help = true"><CircleHelp :size="18" /></button>
      <button class="button small" :disabled="!text.trim() || busy" @click="add">Add</button>
    </div>
    <div v-if="parsed && (parsed.dueDate || parsed.labels.length || parsed.project || parsed.assignees.length || parsed.priority || parsed.repeat)" class="hints">
      <span v-if="parsed.project" class="hint"><Folder :size="13" /> {{ parsed.project }}</span>
      <span v-if="parsed.dueDate" class="hint"><CalendarClock :size="13" /> {{ dueText(parsed.dueDate) }}</span>
      <span v-if="parsed.repeat" class="hint"><Repeat :size="13" /> {{ describeRepeat(parsed.repeat) }}</span>
      <span v-for="l in parsed.labels" :key="l" class="hint"><Tag :size="13" /> {{ l }}</span>
      <span v-for="a in parsed.assignees" :key="a" class="hint"><User :size="13" /> {{ a }}</span>
      <span v-if="parsed.priority" class="hint">! {{ PRIORITIES[parsed.priority] }}</span>
    </div>

    <Modal v-if="help" title="Quick add magic" @close="help = false">
      <p>Type a task the way you'd say it. These words and marks are taken out of the title:</p>
      <table class="magic">
        <tr><td><code>*chores</code> <code>*"day out"</code></td><td>a label (made if it's new)</td></tr>
        <tr><td><code>+Home</code></td><td>the project it goes in</td></tr>
        <tr><td><code>@sam</code></td><td>who it's for (a name or email in the project)</td></tr>
        <tr><td><code>!1</code> … <code>!5</code></td><td>priority: low, medium, high, urgent, do now</td></tr>
        <tr><td><code>tomorrow</code> <code>next friday</code> <code>in 3 days</code> <code>17/11</code> <code>dec 24</code></td><td>the due date, with <code>at 18:00</code> or <code>at 6pm</code></td></tr>
        <tr><td><code>every day</code> <code>every 2 weeks</code> <code>monthly</code> <code>every tuesday</code></td><td>repeats</td></tr>
      </table>
      <p class="muted small">Example: <code>Take out the bins every tuesday at 7pm *chores @sam</code>. Paste several lines to add several tasks.</p>
    </Modal>
  </div>
</template>

<style scoped>
.box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
  transition: border-color 0.12s, box-shadow 0.12s;
}

.box:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent);
}

.plus {
  color: var(--faint);
  flex: none;
}

.field {
  flex: 1;
  min-width: 0;
  height: 38px;
  min-height: 38px;
  padding: 8px 4px;
  field-sizing: content;
  max-height: 160px;
  border: 0;
  background: transparent;
  outline: none;
  resize: none;
  line-height: 1.4;
}

.hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 2px 0;
}

.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 0.8rem;
  font-weight: 600;
}

.magic {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

.magic td {
  padding: 7px 4px;
  border-top: 1px solid var(--border);
  vertical-align: top;
}

.magic td:first-child {
  width: 52%;
}

code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 0.85em;
  white-space: nowrap;
}
</style>
