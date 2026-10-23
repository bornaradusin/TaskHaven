import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

// Every screen. The app is one page; the part after # says which screen (so it reloads in place).
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
  { path: '/upcoming', name: 'upcoming', component: () => import('@/views/UpcomingView.vue') },
  { path: '/projects', name: 'projects', component: () => import('@/views/ProjectsView.vue') },
  { path: '/projects/new', name: 'new-project', component: () => import('@/views/NewProjectView.vue') },
  { path: '/projects/:id/settings', name: 'project-settings', component: () => import('@/views/ProjectSettingsView.vue') },
  { path: '/projects/:id/share', name: 'project-share', component: () => import('@/views/ProjectShareView.vue') },
  { path: '/projects/:id/:view(list|table|kanban|gantt)?', name: 'project', component: () => import('@/views/ProjectView.vue') },
  { path: '/tasks/:projectId/:taskId', name: 'task', component: () => import('@/views/TaskView.vue') },
  { path: '/favorites', name: 'favorites', component: () => import('@/views/FavoritesView.vue') },
  { path: '/filters/:id', name: 'filter', component: () => import('@/views/FilterView.vue') },
  { path: '/labels', name: 'labels', component: () => import('@/views/LabelsView.vue') },
  { path: '/teams', name: 'teams', component: () => import('@/views/TeamsView.vue') },
  { path: '/teams/:id', name: 'team', component: () => import('@/views/TeamView.vue') },
  { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
  { path: '/notifications', name: 'notifications', component: () => import('@/views/NotificationsView.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  // signing in is shown by App.vue whenever nobody is; these just pick its tab
  { path: '/register', name: 'register', component: () => import('@/views/HomeView.vue') },
  { path: '/login', name: 'login', component: () => import('@/views/HomeView.vue') },
  { path: '/:rest(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})
