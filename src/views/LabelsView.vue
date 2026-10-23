<script setup lang="ts">
// Labels: one's own (made, renamed, recoloured, deleted) and those others put on tasks one sees.
import { ref } from 'vue'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-vue-next'
import LabelChip from '@/ui/LabelChip.vue'
import Modal from '@/ui/Modal.vue'
import { allTasks, attempt, createLabel, deleteLabel, ownsLabel, personName, saveLabel, store } from '@/state'
import { COLORS, type Label } from '@/model'

const title = ref('')
const color = ref(COLORS[0])
const editing = ref<Label | null>(null)
const removing = ref<Label | null>(null)

async function add() {
  if (!title.value.trim()) return
  if (store.labels.some((l) => l.title.toLowerCase() === title.value.trim().toLowerCase())) {
    title.value = ''
    return
  }
  await attempt(() => createLabel(title.value, color.value))
  title.value = ''
  color.value = COLORS[(COLORS.indexOf(color.value) + 1) % COLORS.length]
}

async function save() {
  const l = editing.value
  editing.value = null
  if (l && l.title.trim()) await attempt(() => saveLabel({ ...l, title: l.title.trim() }), 'Label saved.')
}

async function remove() {
  const l = removing.value
  removing.value = null
  if (l) await attempt(() => deleteLabel(l.id), 'Label deleted.')
}

const uses = (id: string) => allTasks(true).filter((t) => t.labels.some((l) => l.id === id)).length
</script>

<template>
  <div class="page narrow">
    <div class="page-title"><h1>Labels</h1></div>
    <form class="card card-body add" @submit.prevent="add">
      <input v-model="title" class="input" placeholder="New label…" aria-label="New label" />
      <div class="swatches">
        <button v-for="c in COLORS" :key="c" type="button" class="swatch" :class="{ on: color === c }" :style="{ background: c }" :aria-label="`Colour ${c}`" @click="color = c" />
      </div>
      <button class="button" :disabled="!title.trim()"><Plus :size="16" /> Add</button>
    </form>

    <div class="card">
      <div v-for="l in store.labels" :key="l.id" class="label-row">
        <LabelChip :label="l" />
        <span class="muted small">{{ uses(l.id) }} {{ uses(l.id) === 1 ? 'task' : 'tasks' }}<template v-if="!ownsLabel(l)"> · {{ personName(l.createdBy) }}’s</template></span>
        <span class="spacer" />
        <template v-if="ownsLabel(l)">
          <button class="icon-button small" :aria-label="`Edit ${l.title}`" @click="editing = { ...l }"><Pencil :size="15" /></button>
          <button class="icon-button small" :aria-label="`Delete ${l.title}`" @click="removing = l"><Trash2 :size="15" /></button>
        </template>
      </div>
      <div v-if="!store.labels.length" class="empty"><Tag :size="36" /><p>No labels yet. Add one above, or type <code>*chores</code> when adding a task.</p></div>
    </div>
    <p class="help">Your labels are yours; on a shared task, everyone sees the labels on it.</p>

    <Modal v-if="editing" title="Edit label" @close="editing = null">
      <label class="field"><span>Name</span><input v-model="editing.title" class="input" @keydown.enter="save" /></label>
      <div class="swatches">
        <button v-for="c in COLORS" :key="c" type="button" class="swatch" :class="{ on: editing.color === c }" :style="{ background: c }" :aria-label="`Colour ${c}`" @click="editing.color = c" />
      </div>
      <template #footer>
        <button class="button ghost" @click="editing = null">Cancel</button>
        <button class="button" @click="save">Save</button>
      </template>
    </Modal>
    <Modal v-if="removing" title="Delete this label?" @close="removing = null">
      <p>“{{ removing.title }}” comes off the tasks you can change.</p>
      <template #footer>
        <button class="button ghost" @click="removing = null">Cancel</button>
        <button class="button danger" @click="remove">Delete</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}

.add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.add .input {
  flex: 1;
  min-width: 180px;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.swatch {
  width: 24px;
  height: 24px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}

.swatch.on {
  box-shadow: 0 0 0 2px var(--text);
}

.label-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid var(--border);
}

.label-row:last-child {
  border-bottom: 0;
}

.help {
  margin-top: 10px;
}
</style>
