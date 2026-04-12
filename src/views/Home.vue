<template>
  <div style="max-width: 900px; margin: 0 auto">
    <div style="margin-bottom: 28px">
      <h2 style="font-size: 22px; font-weight: 700; color: #303133; margin-bottom: 8px">Linux 0.11 可视化学习</h2>
      <p style="color: #606266; font-size: 15px; margin-bottom: 14px">
        写了多年代码，却不知道 <code style="background:#f5f7fa;padding:2px 6px;border-radius:3px;font-size:13px">printf</code> 怎么把字符显示出来、
        <code style="background:#f5f7fa;padding:2px 6px;border-radius:3px;font-size:13px">fork()</code> 为什么快、断电为什么会丢数据？
        这里用动画帮你看清楚操作系统底层每一步在做什么。
      </p>
      <el-alert type="info" :closable="false" style="margin-bottom:4px">
        <template #title>
          <span style="font-weight:600">建议阅读顺序：</span>
          BIOS启动 → main()初始化 → 内核态/用户态 → 内存布局 → 系统调用 → 进程调度 → fork/exec → 信号 → 管道 → 文件系统 → 磁盘I/O
        </template>
      </el-alert>
    </div>

    <el-row :gutter="16">
      <el-col :span="8" v-for="topic in topics" :key="topic.path">
        <el-card
          shadow="hover"
          style="cursor: pointer; transition: transform 0.2s"
          @click="$router.push(topic.path)"
        >
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px">
            <div
              :style="`
                width: 36px; height: 36px; border-radius: 8px;
                background: ${topic.color}18;
                display: flex; align-items: center; justify-content: center;
                font-size: 18px;
              `"
            >
              {{ topic.icon }}
            </div>
            <div>
              <div style="font-weight: 600; font-size: 14px; color: #303133">{{ topic.title }}</div>
              <el-tag :type="topic.status === '已完成' ? 'success' : 'info'" size="small" style="margin-top: 2px">
                {{ topic.status }}
              </el-tag>
            </div>
          </div>
          <p style="font-size: 13px; color: #606266; line-height: 1.6">{{ topic.desc }}</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
const topics = [
  {
    path: '/bios',
    icon: '⚡',
    title: 'BIOS 启动流程',
    desc: '从系统上电到 BIOS 将 bootsect 加载至内存 0x7C00，完成控制权交接的完整过程',
    color: '#409EFF',
    status: '已完成',
  },
  {
    path: '/main-init',
    icon: '🚀',
    title: 'main() 初始化',
    desc: 'Linux 0.11 从 head.s 跳入 main() 后的完整初始化流程：内存划分、子系统初始化、进入用户态',
    color: '#F56C6C',
    status: '已完成',
  },
  {
    path: '/mem-layout',
    icon: '📦',
    title: '内存布局',
    desc: 'Linux 0.11 地址翻译机制：逻辑地址→线性地址→物理地址，分段、分页、缺页处理全流程',
    color: '#67C23A',
    status: '已完成',
  },
  {
    path: '/process-schedule',
    icon: '🔄',
    title: '进程调度',
    desc: 'task_struct 完整结构、5种状态机、schedule() 算法、switch_to() 上下文切换、sleep_on/wake_up 阻塞唤醒',
    color: '#E6A23C',
    status: '已完成',
  },
  {
    path: '/syscall',
    icon: '📞',
    title: '系统调用',
    desc: 'int 0x80 陷阱门、CPL 3→0 特权级切换、sys_call_table 分发、write/fork 完整调用链、iret 返回用户态',
    color: '#9B59B6',
    status: '已完成',
  },
  {
    path: '/fork-exec',
    icon: '🌿',
    title: 'fork / exec',
    desc: 'find_empty_process、copy_process、写时复制(COW)、do_execve、a.out格式、EIP偷梁换柱完整流程',
    color: '#1ABC9C',
    status: '已完成',
  },
  {
    path: '/signal',
    icon: '📡',
    title: '信号机制',
    desc: 'signal位图、sys_signal注册、sys_kill发送、ret_from_sys_call检测时机、do_signal扫描、用户栈EIP偷换、sigreturn恢复',
    color: '#8E44AD',
    status: '已完成',
  },
  {
    path: '/pipe',
    icon: '🔗',
    title: '管道（pipe）',
    desc: 'sys_pipe创建、inode环形缓冲区、pipe_write/read动画、满/空阻塞唤醒、EOF机制、ls|grep完整实现',
    color: '#16A085',
    status: '已完成',
  },
  {
    path: '/fs',
    icon: '🗂️',
    title: '文件系统',
    desc: 'Minix磁盘布局、inode三级寻址、namei路径解析、open/read/write调用链、缓冲区缓存、file_operations多态',
    color: '#2980B9',
    status: '已完成',
  },
  {
    path: '/task-struct',
    icon: '🧬',
    title: 'task_struct 全解',
    desc: '进程控制块的全部字段：身份/内存/文件/信号/调度/家族/TSS，连接六大内核子系统',
    color: '#E67E22',
    status: '已完成',
  },
  {
    path: '/kernel-user',
    icon: '🔐',
    title: '内核态 / 用户态',
    desc: '为什么需要两种特权级、x86保护环、int 0x80切换机制、iret返回、move_to_user_mode完整生命周期',
    color: '#C0392B',
    status: '已完成',
  },
  {
    path: '/disk-io',
    icon: '💾',
    title: '磁盘 I/O 与缓冲缓存',
    desc: 'bread()/getblk() 双索引机制、struct buffer_head 全字段、命中/未命中路径、ll_rw_block 请求队列、磁盘中断唤醒、脏缓冲回写',
    color: '#16A085',
    status: '已完成',
  },
]
</script>
