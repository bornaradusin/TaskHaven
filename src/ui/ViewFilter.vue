<script setup lang="ts">
// A view's filters: done tasks shown or not, words to look for, and a filter query.
import { computed } from 'vue'
import { ListFilter } from 'lucide-vue-next'
import Dropdown from './Dropdown.vue'
import { checkFilter } from '@/logic/filter'
import { store } from '@/state'

export interface ViewOptions {
  showDone: boolean
  search: string
  query: string
}

const options = defineModel<ViewOptions>({ required: true })
const error = computed(() => (options.value.query ? checkFilter(options.value.query, { projects: store.projects, people: Object.values(store.people), now: new Date() }) : ''))
const active = computed(() => options.value.showDone || !!options.value.search || !!options.value.query)
</script>

<template>
  <Dropdown align="right" label="Filters">
    <template #trigger="{ toggle }">
      <button class="button secondary small" :class="{ on: active }" @click.stop="toggle"><ListFilter :size="16" /> Filters</button>
    </template>
    <div class="filters" @click.stop>
      <label class="check"><input v-model="options.showDone" type="checkbox" /> Show done tasks</label>
      <label class="field"><span>Words</span><input v-model="options.search" class="input" placeholder="Look for…" /></label>
      <label class="field">
        <span>Filter</span>
        <input v-model.lazy="options.query" class="input mono" placeholder="priority >= 3 && dueDate < now+7d" spellcheck="false" />
      </label>
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-else class="help">
        Fields: done, priority, dueDate, startDate, endDate, labels, assignees, percentDone. Join with <code>&&</code> and <code>||</code>.
      </p>
      <button v-if="active" class="button ghost small" @click="options = { showDone: false, search: '', query: '' }">Clear all</button>
    </div>
  </Dropdown>
</template>

<style scoped>
.filters {
  width: 300px;
  padding: 6px 6px 2px;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  cursor: pointer;
}

.check input {
  accent-color: var(--primary);
  width: 16px;
  height: 16px;
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}

.on {
  border-color: var(--brand) !important;
  color: var(--primary) !important;
}

code {
  font-size: 0.85em;
}
</style>
