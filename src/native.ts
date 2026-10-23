// On the phone: the status bar, the back button, and reminders as notifications.
import { Capacitor } from '@capacitor/core'
import { watch } from 'vue'
import type { Router } from 'vue-router'
import { allTasks, store } from '@/state'
import { reminderTimes, taskIdentifier } from '@/logic/tasks'
import { project } from '@/state'
import type { Task } from '@/model'

export const native = Capacitor.isNativePlatform()

export async function startNative(router: Router): Promise<void> {
  if (!native) return
  const [{ App }, { StatusBar, Style }] = await Promise.all([import('@capacitor/app'), import('@capacitor/status-bar')])

  const paint = async () => {
    const dark = document.documentElement.dataset.theme === 'dark'
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined)
    await StatusBar.setBackgroundColor({ color: dark ? '#121315' : '#f4f4f2' }).catch(() => undefined)
  }
  void paint()
  new MutationObserver(() => void paint()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  void App.addListener('backButton', ({ canGoBack }) => {
    // a dialog or the menu closes first
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      return
    }
    if (store.menuOpen) {
      store.menuOpen = false
      return
    }
    if (canGoBack && router.currentRoute.value.name !== 'home') router.back()
    else void App.exitApp()
  })

  // tapping a reminder opens its task
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const extra = action.notification.extra as { projectId?: string; taskId?: string } | undefined
    if (extra?.projectId && extra.taskId) void router.push({ name: 'task', params: { projectId: extra.projectId, taskId: extra.taskId } })
  })

  let timer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => [store.user?.id, store.settings.notifyReminders, store.settings.notifyDue, JSON.stringify(allTasks().map((t) => [t.id, t.done, t.dueDate, t.reminders, t.assignees, t.title]))],
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void schedule(), 1500)
    },
    { immediate: true },
  )
}

/** Notification ids from task ids (stable, so a change replaces the old one). */
function notificationId(key: string): number {
  let h = 0
  for (const c of key) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return Math.abs(h) % 2_000_000_000
}

/** Whether a task's reminders are for me: I'm assigned, or nobody is and I made it. */
function mine(task: Task, me: string): boolean {
  return task.assignees.includes(me) || (!task.assignees.length && task.createdBy === me)
}

let scheduled: number[] = []

async function schedule(): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const me = store.user?.id
  // whatever was set before (by this run or an earlier one) is set again from the tasks as they are
  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] as { id: number }[] }))
  const old = [...new Set([...scheduled, ...pending.notifications.map((n) => n.id)])]
  if (old.length) await LocalNotifications.cancel({ notifications: old.map((id) => ({ id })) }).catch(() => undefined)
  scheduled = []
  if (!me) return
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    if (!store.settings.notifyReminders && !store.settings.notifyDue) return
    const asked = await LocalNotifications.requestPermissions()
    if (asked.display !== 'granted') return
  }
  const now = Date.now()
  const soon = now + 30 * 24 * 3600 * 1000
  const list: { id: number; title: string; body: string; at: Date; projectId: string; taskId: string }[] = []
  for (const task of allTasks()) {
    if (task.done || !mine(task, me)) continue
    const p = project(task.projectId)
    const name = `${taskIdentifier(task, p)} ${task.title}`.trim()
    if (store.settings.notifyReminders) {
      for (const [i, at] of reminderTimes(task).entries()) {
        if (at.getTime() > now && at.getTime() < soon) list.push({ id: notificationId(`${task.id}:r${i}`), title: name, body: `Reminder · ${p?.title ?? ''}`, at, projectId: task.projectId, taskId: task.id })
      }
    }
    if (store.settings.notifyDue && task.dueDate) {
      const at = new Date(task.dueDate)
      if (at.getTime() > now && at.getTime() < soon) list.push({ id: notificationId(`${task.id}:due`), title: name, body: `Due now · ${p?.title ?? ''}`, at, projectId: task.projectId, taskId: task.id })
    }
  }
  // Android keeps a limited number; the soonest ones
  list.sort((a, b) => a.at.getTime() - b.at.getTime())
  const notifications = list.slice(0, 60).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    schedule: { at: n.at, allowWhileIdle: true },
    extra: { projectId: n.projectId, taskId: n.taskId },
    smallIcon: 'ic_stat_taskhaven',
  }))
  if (notifications.length) await LocalNotifications.schedule({ notifications }).catch(() => undefined)
  scheduled = notifications.map((n) => n.id)
}
