<script setup lang="ts">
// Your inbox, from the server: who assigned you, commented, deleted a task, or added you to a team.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { BellOff, CheckCheck, MailOpen } from 'lucide-vue-next'
import Avatar from '@/ui/Avatar.vue'
import { formatTime, relativeDay } from '@/logic/dates'
import { attempt, findTask, markAllRead, markRead, personName, project, store } from '@/state'
import type { Notice } from '@/model'

const router = useRouter()
const unread = computed(() => store.notices.some((n) => !n.read))

function text(n: Notice): string {
  const who = n.fromId ? personName(n.fromId) : 'Someone'
  switch (n.kind) {
    case 'assigned':
      return `${who} assigned you to “${n.title}”`
    case 'comment':
      return `${who} commented on “${n.title}”`
    case 'done':
      return `${who} finished “${n.title}”`
    case 'deleted':
      return `${who} deleted “${n.title}”`
    case 'shared':
      return n.text.startsWith('team:') ? `${who} added you to the team “${n.text.slice(5) || n.title}”` : `${who} shared “${n.title}” with you`
    default:
      return n.title ? `“${n.title}”` : 'Something changed'
  }
}

function when(iso: string): string {
  const d = new Date(iso)
  const day = relativeDay(d)
  return `${day[0].toUpperCase()}${day.slice(1)} at ${formatTime(d)}`
}

async function open(n: Notice) {
  if (!n.read) void attempt(() => markRead(n))
  const task = n.taskId ? findTask(n.projectId || null, n.taskId) : undefined
  if (task) void router.push({ name: 'task', params: { projectId: task.projectId, taskId: task.id } })
  else if (project(n.projectId)) void router.push({ name: 'project', params: { id: n.projectId } })
  else if (n.text.startsWith('team:')) void router.push({ name: 'teams' })
}
</script>

<template>
  <div class="page narrow">
    <div class="page-title">
      <h1>Notifications</h1>
      <span class="spacer" />
      <button v-if="unread" class="button secondary small" @click="attempt(markAllRead)"><CheckCheck :size="16" /> Mark all as read</button>
    </div>
    <div class="card">
      <div v-for="n in store.notices" :key="n.id" class="notice" :class="{ unread: !n.read }" role="link" tabindex="0" @click="open(n)" @keydown.enter="open(n)">
        <Avatar :id="n.fromId" :size="36" />
        <div class="body">
          <div>{{ text(n) }}</div>
          <div v-if="n.kind === 'comment' && n.text" class="quote">“{{ n.text }}”</div>
          <div class="muted small">{{ when(n.created) }}<template v-if="project(n.projectId)"> · {{ project(n.projectId)?.title }}</template></div>
        </div>
        <span v-if="!n.read" class="new" aria-label="New" />
        <button v-if="!n.read" class="icon-button small" aria-label="Mark as read" @click.stop="attempt(() => markRead(n))"><MailOpen :size="15" /></button>
      </div>
      <div v-if="!store.notices.length" class="empty"><BellOff :size="36" /><p>Nothing new. When someone assigns you a task or comments on yours, it shows here.</p></div>
    </div>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.notice:last-child {
  border-bottom: 0;
}

.notice:hover {
  background: var(--hover);
}

.notice.unread .body > div:first-child {
  font-weight: 650;
}

.body {
  flex: 1;
  min-width: 0;
}

.quote {
  margin: 2px 0;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new {
  width: 9px;
  height: 9px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--brand);
  flex: none;
}
</style>
