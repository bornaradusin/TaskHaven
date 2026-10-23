<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import TaskRow from '@/ui/TaskRow.vue'
import { listOrder } from '@/logic/tasks'
import { allTasks } from '@/state'

const tasks = computed(() => listOrder(allTasks(true).filter((t) => t.favorite)))
</script>

<template>
  <div class="page">
    <div class="page-title"><h1>Favorite tasks</h1></div>
    <div class="card list">
      <TaskRow v-for="t in tasks" :key="t.id" :task="t" show-project />
      <div v-if="!tasks.length" class="empty"><Star :size="36" /><p>Star a task to find it here.</p></div>
    </div>
  </div>
</template>

<style scoped>
.list {
  padding: 6px;
}
</style>
