import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const routes = [
  { path: '/', component: Home },
  {
    path: '/bios',
    component: () => import('../components/BiosBootVisualizer.vue'),
  },
  {
    path: '/main-init',
    component: () => import('../components/MainInitVisualizer.vue'),
  },
  {
    path: '/mem-layout',
    component: () => import('../components/MemLayoutVisualizer.vue'),
  },
  {
    path: '/process-schedule',
    component: () => import('../components/ProcessScheduleVisualizer.vue'),
  },
  {
    path: '/syscall',
    component: () => import('../components/SyscallVisualizer.vue'),
  },
  {
    path: '/fork-exec',
    component: () => import('../components/ForkExecVisualizer.vue'),
  },
  {
    path: '/signal',
    component: () => import('../components/SignalVisualizer.vue'),
  },
  {
    path: '/pipe',
    component: () => import('../components/PipeVisualizer.vue'),
  },
  {
    path: '/fs',
    component: () => import('../components/FSVisualizer.vue'),
  },
  {
    path: '/task-struct',
    component: () => import('../components/TaskStructVisualizer.vue'),
  },
  {
    path: '/kernel-user',
    component: () => import('../components/KernelUserVisualizer.vue'),
  },
  {
    path: '/disk-io',
    component: () => import('../components/DiskIOVisualizer.vue'),
  },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
