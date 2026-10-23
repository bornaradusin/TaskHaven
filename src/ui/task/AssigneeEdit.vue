<script setup lang="ts">
// Who a task is for: the people who can see its project.
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import Avatar from '../Avatar.vue'
import Dropdown from '../Dropdown.vue'
import { attempt, getShares, personName, project, projectPeople, store, updateTask } from '@/state'
import type { Shares, Task } from '@/model'

const props = defineProps<{ task: Task; editable: boolean }>()
const shares = ref<Shares | null>(null)
const p = computed(() => project(props.task.projectId))
async function load() {
  shares.value = p.value ? await getShares(p.value).catch(() => null) : null
}
onMounted(load)
watch(() => props.task.projectId, load)
const members = computed(() => (p.value ? projectPeople(p.value, shares.value) : []))
const free = computed(() => members.value.filter((m) => !props.task.assignees.includes(m)))

function add(id: string) {
  void attempt(() => updateTask(props.task, { assignees: [...props.task.assignees, id] }))
}

function remove(id: string) {
  void attempt(() => updateTask(props.task, { assignees: props.task.assignees.filter((a) => a !== id) }))
}
</script>

<template>
  <div class="assignees">
    <span v-for="id in task.assignees" :key="id" class="who">
      <Avatar :id="id" :size="26" />
      <span class="name">{{ personName(id) }}{{ id === store.user?.id ? ' (you)' : '' }}</span>
      <button v-if="editable" class="icon-button small x" :aria-label="`Unassign ${personName(id)}`" @click="remove(id)"><X :size="14" /></button>
    </span>
    <Dropdown v-if="editable && free.length" align="left" label="Assign">
      <template #trigger="{ toggle }">
        <button class="button ghost small" @click.stop="toggle"><Plus :size="15" /> Assign</button>
      </template>
      <button v-for="id in free" :key="id" class="item" @click="add(id)">
        <Avatar :id="id" :size="22" :title="false" /> {{ personName(id) }}{{ id === store.user?.id ? ' (you)' : '' }}
      </button>
    </Dropdown>
    <span v-if="!task.assignees.length && !(editable && free.length)" class="muted">Nobody</span>
  </div>
</template>

<style scoped>
.assignees {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 2px 3px;
  border-radius: 999px;
  background: var(--surface-2);
}

.name {
  font-size: 0.9rem;
  padding-right: 4px;
}

.x {
  width: 24px;
  height: 24px;
}
</style>
