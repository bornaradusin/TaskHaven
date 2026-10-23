<script setup lang="ts">
// A project's title, identifier, colour, parent and description.
import { computed, watch } from 'vue'
import { suggestIdentifier } from '@/logic/tasks'
import { store } from '@/state'
import { COLORS } from '@/model'

export interface ProjectFields {
  title: string
  identifier: string
  color: string
  parentId: string | null
  description: string
}

const props = defineProps<{ selfId?: string }>()
const fields = defineModel<ProjectFields>({ required: true })
let auto = !fields.value.identifier
watch(
  () => fields.value.title,
  (t) => {
    if (auto) fields.value.identifier = suggestIdentifier(t)
  },
)

// a project can go under one that isn't itself, nor under one of its own
const parents = computed(() => store.projects.filter((p) => p.id !== props.selfId && p.parentId !== props.selfId && !p.parentId && !p.archived && p.right === 'admin'))
</script>

<template>
  <div>
    <label class="field"><span>Title</span><input v-model="fields.title" class="input" required maxlength="250" placeholder="Home, Groceries, Garden…" autofocus /></label>
    <div class="two">
      <label class="field">
        <span>Identifier</span>
        <input v-model="fields.identifier" class="input" maxlength="10" placeholder="HOME" @input="auto = false; fields.identifier = fields.identifier.toUpperCase().replace(/[^A-Z0-9]/g, '')" />
        <span class="help">Tasks are numbered {{ fields.identifier || '#' }}{{ fields.identifier ? '-' : '' }}1, 2, 3…</span>
      </label>
      <label class="field">
        <span>Inside</span>
        <select v-model="fields.parentId" class="select">
          <option :value="null">Nothing (a top project)</option>
          <option v-for="p in parents" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
      </label>
    </div>
    <div class="field">
      <span>Colour</span>
      <div class="swatches">
        <button v-for="c in COLORS" :key="c" type="button" class="swatch" :class="{ on: fields.color === c }" :style="{ background: c }" :aria-label="`Colour ${c}`" @click="fields.color = c" />
      </div>
    </div>
    <label class="field"><span>Description</span><textarea v-model="fields.description" class="textarea" placeholder="What it's for (optional)" /></label>
  </div>
</template>

<style scoped>
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 30px;
  height: 30px;
  border: 3px solid var(--surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}

.swatch.on {
  box-shadow: 0 0 0 2px var(--text);
}

@media (max-width: 560px) {
  .two {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
