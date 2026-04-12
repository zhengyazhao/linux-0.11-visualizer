<template>
  <div style="max-width: 1100px; margin: 0 auto">
    <div style="margin-bottom: 16px">
      <h2 style="font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 4px">task_struct：进程控制块全解</h2>
      <p style="color: #909399; font-size: 13px">include/linux/sched.h — 一个 4KB 页面存储了进程的全部身份、状态、资源</p>
    </div>

    <div class="phase-bar">
      <div v-for="(ph, i) in phases" :key="i" class="phase-seg"
        :class="{ active: currentPhase === i }" @click="jumpToPhase(i)">{{ ph }}</div>
    </div>
    <div class="step-dots">
      <div v-for="(s, i) in steps" :key="i" class="step-dot"
        :class="{ active: currentIdx === i, done: currentIdx > i }" @click="goTo(i)"></div>
    </div>

    <div class="main-grid">
      <!-- 左：字段高亮面板 -->
      <div class="panel-left">
        <div class="panel-title">task_struct 字段组</div>
        <div v-for="grp in fieldGroups" :key="grp.name"
          class="fg-group"
          :class="{ 'fg-active': currentStep.groupId === grp.id }"
          :style="currentStep.groupId === grp.id ? `border-color:${grp.color}; background:${grp.color}10` : ''">
          <div class="fg-header" :style="`color:${grp.color}`">{{ grp.name }}</div>
          <div class="fg-fields">
            <span v-for="f in grp.fields" :key="f"
              class="fg-field"
              :class="{ 'ff-highlight': currentStep.highlightFields?.includes(f) }"
              :style="currentStep.highlightFields?.includes(f) ? `background:${grp.color}30; color:${grp.color}` : ''">
              {{ f }}
            </span>
          </div>
        </div>

        <div style="margin-top: 12px">
          <div class="panel-title">内存布局</div>
          <div class="mem-page">
            <div class="mp-top">内核栈（向下增长）</div>
            <div class="mp-mid">↕ 4KB 一页</div>
            <div class="mp-bot">task_struct（从页底开始）</div>
          </div>
        </div>
      </div>

      <!-- 中：主可视化 -->
      <div class="panel-center">
        <div class="step-title">{{ currentStep.title }}</div>

        <!-- 总览：task_struct 全景图 -->
        <template v-if="currentStep.scene === 'overview'">
          <div class="overview-map">
            <div class="om-center">
              <div class="om-core">task_struct<br><span style="font-size:10px;color:#909399">4KB / 页</span></div>
            </div>
            <div class="om-spokes">
              <div v-for="spoke in overviewSpokes" :key="spoke.label" class="om-spoke" :style="`--color:${spoke.color}`">
                <div class="oms-box" :style="`border-color:${spoke.color}; background:${spoke.color}12`">
                  <div class="oms-title" :style="`color:${spoke.color}`">{{ spoke.label }}</div>
                  <div class="oms-fields">{{ spoke.fields }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="ov-note">task_struct 是进程的"宇宙中心"。所有内核子系统（调度/内存/文件/信号）通过这一个结构体了解进程的全部状态。</div>
        </template>

        <!-- 身份字段 -->
        <template v-else-if="currentStep.scene === 'identity'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">身份 & 调度基础字段</div>
              <div v-for="f in identityFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">pid 分配（find_empty_process）</div>
              <div class="fdd-pool">
                <div v-for="i in 8" :key="i" class="fddp-slot"
                  :class="{ 'fddp-used': i <= 3, 'fddp-new': i === 4 }">
                  task[{{ i-1 }}]<br>
                  <span class="fddp-pid">{{ i <= 3 ? `pid=${i}` : i === 4 ? 'NEW' : 'NULL' }}</span>
                </div>
              </div>
              <div class="fdd-note">pid 从 last_pid+1 开始递增查找空槽，task[0]=init 永不消失</div>
            </div>
          </div>
        </template>

        <!-- 内存字段 -->
        <template v-else-if="currentStep.scene === 'memory'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">内存管理字段</div>
              <div v-for="f in memoryFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">进程虚拟地址空间（LDT Base = nr×64MB）</div>
              <div class="addr-space">
                <div class="as-seg seg-code">代码段<br><span style="font-size:9px">start_code ~ end_code</span></div>
                <div class="as-seg seg-data">数据段<br><span style="font-size:9px">end_code ~ end_data</span></div>
                <div class="as-seg seg-bss">BSS<br><span style="font-size:9px">end_data ~ brk</span></div>
                <div class="as-gap">（未用）</div>
                <div class="as-seg seg-stack">栈<br><span style="font-size:9px">start_stack 向下</span></div>
              </div>
            </div>
          </div>
        </template>

        <!-- 文件字段 -->
        <template v-else-if="currentStep.scene === 'files'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">文件系统字段</div>
              <div v-for="f in fileFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">filp[20]：进程 fd 表（最多20个打开文件）</div>
              <div class="filp-table">
                <div v-for="row in filpRows" :key="row.fd" class="ft-row"
                  :class="{ 'ft-used': row.used }">
                  <span class="ft-fd">fd[{{ row.fd }}]</span>
                  <span class="ft-arrow">→</span>
                  <span class="ft-target">{{ row.target }}</span>
                </div>
              </div>
              <div class="fdd-note">filp[] 存 struct file* 指针；close_on_exec 是位图，标记 exec 时哪些 fd 要关闭</div>
            </div>
          </div>
        </template>

        <!-- 信号字段 -->
        <template v-else-if="currentStep.scene === 'signal'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">信号字段</div>
              <div v-for="f in signalFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">signal 位图（32位，每位对应一个信号）</div>
              <div class="sig-bitmap">
                <div v-for="i in 16" :key="i" class="sb-bit"
                  :class="{ 'sb-set': [2,9,15].includes(i) }">
                  <span class="sb-num">{{ i }}</span>
                  <span class="sb-name">{{ sigNames[i-1] || '' }}</span>
                </div>
              </div>
              <div class="fdd-note">signal & ~blocked = 当前待处理信号；sys_kill 设置 signal 位；ret_from_sys_call 检测并处理</div>
            </div>
          </div>
        </template>

        <!-- 调度字段 -->
        <template v-else-if="currentStep.scene === 'schedule'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">调度相关字段</div>
              <div v-for="f in schedFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">counter 与 priority 关系</div>
              <div class="sched-bars">
                <div v-for="p in schedProcs" :key="p.name" class="sb-proc">
                  <div class="sbp-name">{{ p.name }}</div>
                  <div class="sbp-bar-wrap">
                    <div class="sbp-priority" :style="`width:${p.priority*6}px`">priority={{ p.priority }}</div>
                  </div>
                  <div class="sbp-bar-wrap">
                    <div class="sbp-counter" :style="`width:${p.counter*8}px`">counter={{ p.counter }}</div>
                  </div>
                </div>
              </div>
              <div class="fdd-note">schedule() 选 counter 最大的 RUNNING 进程；所有 counter=0 时重算：counter = counter/2 + priority</div>
            </div>
          </div>
        </template>

        <!-- 进程家族字段 -->
        <template v-else-if="currentStep.scene === 'family'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">进程家族指针</div>
              <div v-for="f in familyFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">进程树（fork 后家族关系）</div>
              <div class="proc-tree">
                <div class="pt-node pt-init">init(1)<br><span style="font-size:9px">p_pptr=自身</span></div>
                <div class="pt-children">
                  <div class="pt-branch">
                    <div class="pt-node">shell(2)<br><span style="font-size:9px">p_pptr→init</span></div>
                    <div class="pt-sub">
                      <div class="pt-node pt-leaf">ls(4)</div>
                      <div class="pt-node pt-leaf">grep(5)</div>
                    </div>
                  </div>
                  <div class="pt-branch">
                    <div class="pt-node">daemon(3)</div>
                  </div>
                </div>
              </div>
              <div class="fdd-note">p_cptr=最年轻的子进程；p_ysptr/p_osptr=兄弟链表；wait()通过这些指针收割子进程</div>
            </div>
          </div>
        </template>

        <!-- TSS 字段 -->
        <template v-else-if="currentStep.scene === 'tss'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">TSS（Task State Segment）字段</div>
              <div v-for="f in tssFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">switch_to() 的本质：ljmp 到目标 TSS 描述符</div>
              <div class="tss-switch">
                <div class="ts-from">
                  <div class="ts-label">当前进程 TSS</div>
                  <div class="ts-saved">CPU 快照 → 保存到这里</div>
                  <div class="ts-fields">eip/esp/eflags/CS..</div>
                </div>
                <div class="ts-arrow">ljmp →</div>
                <div class="ts-to">
                  <div class="ts-label">目标进程 TSS</div>
                  <div class="ts-restore">从这里 → 恢复 CPU</div>
                  <div class="ts-fields">eip/esp/eflags/CS..</div>
                </div>
              </div>
              <div class="fdd-note">esp0/ss0：从用户态进入内核态时，CPU 自动切换到这个内核栈地址（来自 TSS）</div>
            </div>
          </div>
        </template>

        <!-- 连接图 -->
        <template v-else-if="currentStep.scene === 'connections'">
          <div class="conn-map">
            <div class="cm-title">task_struct 是所有内核子系统的交汇点</div>
            <div class="cm-center">
              <div class="cm-core">task_struct</div>
            </div>
            <div class="cm-links">
              <div v-for="link in connLinks" :key="link.subsystem" class="cm-link">
                <div class="cml-subsystem" :style="`border-color:${link.color}; background:${link.color}10`">
                  <div class="cmls-name" :style="`color:${link.color}`">{{ link.subsystem }}</div>
                  <div class="cmls-field">via: {{ link.field }}</div>
                  <div class="cmls-desc">{{ link.desc }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 右：源码 + 说明 -->
      <div class="panel-right">
        <div class="panel-title">{{ currentStep.rightTitle || '源码定位' }}</div>
        <div class="pr-src">{{ currentStep.srcRef }}</div>
        <div v-if="currentStep.rightContent" class="pr-items">
          <div v-for="item in currentStep.rightContent" :key="item.label" class="pri-row">
            <span class="pri-label">{{ item.label }}</span>
            <span class="pri-text">{{ item.text }}</span>
          </div>
        </div>
        <div v-if="currentStep.code" class="pr-code"><pre>{{ currentStep.code }}</pre></div>
      </div>
    </div>

    <div class="controls">
      <el-button size="small" @click="prev" :disabled="currentIdx === 0">上一步</el-button>
      <el-button size="small" type="primary" @click="togglePlay">{{ playing ? '暂停' : '自动播放' }}</el-button>
      <el-button size="small" @click="next" :disabled="currentIdx === steps.length - 1">下一步</el-button>
      <el-button size="small" @click="goTo(0)">重置</el-button>
    </div>

    <div class="detail-card">
      <div class="dc-header">
        <span class="dc-src">{{ currentStep.srcRef }}</span>
        <span class="dc-tag" :class="`tag-${currentStep.tagType}`">{{ currentStep.tagType }}</span>
      </div>
      <div class="dc-explain">{{ currentStep.explain }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'

const phases = ['总览', '身份/调度', '内存', '文件', '信号', '调度算法', '家族', 'TSS', '连接图']

const fieldGroups = [
  { id: 'identity', name: '身份 & 基础', color: '#409eff',
    fields: ['state','counter','priority','signal','blocked','flags','pid','father','pgrp','session','leader'] },
  { id: 'memory',   name: '内存管理',   color: '#67c23a',
    fields: ['ldt[2]','tss','brk','start_code','end_code','end_data','start_stack','start_time'] },
  { id: 'files',    name: '文件系统',   color: '#e6a23c',
    fields: ['umask','pwd','root','executable','filp[20]','close_on_exec'] },
  { id: 'signal',   name: '信号',       color: '#f56c6c',
    fields: ['signal','blocked','sigaction[32]'] },
  { id: 'schedule', name: '调度',       color: '#9c27b0',
    fields: ['state','counter','priority','alarm','utime','stime','cutime','cstime'] },
  { id: 'family',   name: '进程家族',   color: '#1abc9c',
    fields: ['p_pptr','p_cptr','p_ysptr','p_osptr','exit_code','wait_queue'] },
  { id: 'tss',      name: 'TSS（上下文）', color: '#e040fb',
    fields: ['tss.esp0','tss.ss0','tss.eip','tss.esp','tss.eflags','tss.ldt'] },
]

const overviewSpokes = [
  { label: '调度器', color: '#9c27b0', fields: 'state / counter / priority' },
  { label: '内存管理', color: '#67c23a', fields: 'ldt[2] / brk / start_code' },
  { label: '文件系统', color: '#e6a23c', fields: 'filp[20] / pwd / root' },
  { label: '信号机制', color: '#f56c6c', fields: 'signal / blocked / sigaction' },
  { label: '进程家族', color: '#1abc9c', fields: 'p_pptr / p_cptr / p_ysptr' },
  { label: 'CPU 上下文', color: '#e040fb', fields: 'tss（eip/esp/cs/ss…）' },
]

const identityFields = [
  { type: 'long',  name: 'state',   comment: '0=RUNNING, 1=INTERRUPTIBLE, 2=UNINTERRUPTIBLE, 4=ZOMBIE, 8=STOPPED' },
  { type: 'long',  name: 'counter', comment: '剩余时间片（ticks），schedule() 选最大的' },
  { type: 'long',  name: 'priority',comment: '静态优先级，counter 耗尽后重置基准' },
  { type: 'int',   name: 'pid',     comment: '进程 ID，fork() 中由 find_empty_process 分配' },
  { type: 'int',   name: 'father',  comment: '父进程 pid（简化版，Linux 0.11）' },
  { type: 'long',  name: 'start_time', comment: '进程创建时的 jiffies（系统运行滴答数）' },
  { type: 'long',  name: 'utime',   comment: '用户态运行时间（ticks）' },
  { type: 'long',  name: 'stime',   comment: '内核态运行时间（ticks）' },
]

const memoryFields = [
  { type: 'struct desc_struct', name: 'ldt[2]',     comment: 'LDT：进程私有段描述符（代码段+数据段），Base=nr×64MB' },
  { type: 'unsigned long',      name: 'start_code', comment: '代码段起始线性地址（= LDT Base）' },
  { type: 'unsigned long',      name: 'end_code',   comment: '代码段结束地址（= start_code + exec 代码大小）' },
  { type: 'unsigned long',      name: 'end_data',   comment: '数据段结束地址（含 BSS）' },
  { type: 'unsigned long',      name: 'brk',        comment: '堆顶：sbrk()/brk() 系统调用调整此值' },
  { type: 'unsigned long',      name: 'start_stack',comment: '栈底线性地址（用户栈从高地址向下增长）' },
]

const fileFields = [
  { type: 'unsigned short', name: 'umask',        comment: 'umask：创建文件时屏蔽的权限位' },
  { type: 'struct m_inode*',name: 'pwd',          comment: '当前工作目录 inode（cd 命令修改此指针）' },
  { type: 'struct m_inode*',name: 'root',         comment: '进程根目录 inode（chroot 修改此指针）' },
  { type: 'struct m_inode*',name: 'executable',   comment: '当前执行文件的 inode' },
  { type: 'struct file*',   name: 'filp[20]',     comment: '进程打开文件表（最多20个fd，0=stdin,1=stdout,2=stderr）' },
  { type: 'unsigned long',  name: 'close_on_exec',comment: '位图：哪些 fd 在 exec 后自动关闭（O_CLOEXEC）' },
]

const signalFields = [
  { type: 'unsigned long', name: 'signal',        comment: '待处理信号位图（第i位=有信号i待处理）' },
  { type: 'unsigned long', name: 'blocked',       comment: '屏蔽信号位图（sigprocmask 设置）' },
  { type: 'struct sigaction', name: 'sigaction[32]', comment: '每个信号的处理动作（sa_handler / sa_flags / sa_mask）' },
]

const schedFields = [
  { type: 'long', name: 'state',    comment: '进程状态（仅 RUNNING=0 参与调度竞争）' },
  { type: 'long', name: 'counter',  comment: '时间片剩余（ticks），每次时钟中断 -1' },
  { type: 'long', name: 'priority', comment: '基础优先级（counter=0 时重设为 priority）' },
  { type: 'long', name: 'alarm',    comment: '定时器到期 jiffies（到期后发 SIGALRM）' },
]

const familyFields = [
  { type: 'struct task_struct *', name: 'p_pptr',  comment: '父进程指针（parent process pointer）' },
  { type: 'struct task_struct *', name: 'p_cptr',  comment: '最年轻子进程指针（child pointer）' },
  { type: 'struct task_struct *', name: 'p_ysptr', comment: '更年轻兄弟进程（younger sibling）' },
  { type: 'struct task_struct *', name: 'p_osptr', comment: '更年长兄弟进程（older sibling）' },
  { type: 'int',                  name: 'exit_code',comment: '进程退出码，wait() 读取' },
]

const tssFields = [
  { type: 'unsigned long', name: 'tss.esp0', comment: '内核栈栈顶（int 0x80 时 CPU 自动切到此）' },
  { type: 'unsigned long', name: 'tss.ss0',  comment: '内核栈段选择子（= 0x10 内核数据段）' },
  { type: 'unsigned long', name: 'tss.eip',  comment: '保存的用户态 EIP（下次恢复执行位置）' },
  { type: 'unsigned long', name: 'tss.esp',  comment: '保存的用户态 ESP' },
  { type: 'unsigned long', name: 'tss.eflags',comment: '保存的 EFLAGS 寄存器' },
  { type: 'unsigned short', name: 'tss.ldt', comment: 'LDT 选择子（指向进程的 ldt[2]）' },
]

const schedProcs = [
  { name: 'shell(2)',   priority: 15, counter: 3 },
  { name: 'editor(3)',  priority: 10, counter: 8 },
  { name: 'daemon(4)',  priority: 5,  counter: 1 },
]

const sigNames = ['HUP','INT','QUIT','ILL','TRAP','ABRT','BUS','FPE','KILL','USR1','SEGV','USR2','PIPE','ALRM','TERM']

const filpRows = [
  { fd: 0, target: 'file* → tty（stdin）',  used: true },
  { fd: 1, target: 'file* → tty（stdout）', used: true },
  { fd: 2, target: 'file* → tty（stderr）', used: true },
  { fd: 3, target: 'file* → /tmp/log',      used: true },
  { fd: 4, target: 'NULL',                  used: false },
]

const connLinks = [
  { subsystem: '进程调度器',   color: '#9c27b0', field: 'state / counter', desc: 'schedule() 遍历 task[] 找 state=0 且 counter 最大的进程' },
  { subsystem: '内存管理',     color: '#67c23a', field: 'ldt[2] / tss',    desc: 'copy_mem() 设 LDT Base；缺页时查 start_code..brk 范围' },
  { subsystem: '文件系统',     color: '#e6a23c', field: 'filp[20] / pwd',  desc: 'sys_open 填 filp[]；namei() 相对路径从 pwd 开始解析' },
  { subsystem: '信号机制',     color: '#f56c6c', field: 'signal / sigaction', desc: 'sys_kill 设 signal 位；ret_from_sys_call 在返回前检测处理' },
  { subsystem: '系统调用',     color: '#409eff', field: 'tss.esp0',        desc: 'int 0x80 时 CPU 从 tss.esp0 取内核栈地址切换特权级' },
  { subsystem: 'fork/exec',    color: '#1abc9c', field: 'p_pptr/pid',      desc: 'copy_process 填充子进程 task_struct；do_execve 替换内存映射' },
]

const steps = [
  {
    phaseIdx: 0, tagType: 'info', groupId: null,
    title: 'task_struct：进程的全部信息聚在一个 4KB 页里',
    srcRef: 'include/linux/sched.h:50',
    scene: 'overview',
    explain: 'Linux 0.11 每个进程有唯一一个 task_struct，存储身份（pid/state）、内存（ldt/brk）、文件（filp[]）、信号（signal/sigaction）、CPU 快照（tss）等全部信息。它占用进程页的低端，内核栈从同一页的高端向下增长。系统中最多 64 个进程（NR_TASKS=64），全部指针存在 task[64] 数组里。',
    rightTitle: '核心定位',
    rightContent: [
      { label: '定义',  text: 'include/linux/sched.h:50 struct task_struct' },
      { label: '大小',  text: '< 4KB（与内核栈共用一页）' },
      { label: '分配',  text: 'fork() → copy_process() → get_free_page()' },
      { label: '访问',  text: 'current 宏：esp & 0xFFFFF000 = 页基址 = task_struct*' },
    ],
  },
  {
    phaseIdx: 1, tagType: 'warning', groupId: 'identity',
    title: '身份字段：pid、state、counter、priority',
    srcRef: 'include/linux/sched.h:50-80',
    scene: 'identity',
    highlightFields: ['state','counter','priority','pid','father','start_time'],
    explain: 'state 是调度的"门票"——只有 state=0（RUNNING）才会被 schedule() 考虑。counter 是剩余时间片，每个时钟滴答减1，归0时触发重新调度。priority 是重置基准，counter 耗尽时重置为 priority。pid 由 find_empty_process() 分配，从 last_pid+1 扫描 task[] 找空槽。',
    rightTitle: '调度关键路径',
    code: `// kernel/sched.c:68
void schedule(void) {
    int c, next, i;
    // 找 counter 最大的 RUNNING 进程
    while (1) {
        c = -1; next = 0;
        for (i=1; i<NR_TASKS; i++)
            if (task[i]->state==TASK_RUNNING
                && task[i]->counter > c)
                c = task[i]->counter, next = i;
        if (c) break;
        // 所有 counter=0：重算
        for (i=0; i<NR_TASKS; i++)
            task[i]->counter = task[i]->counter/2
                              + task[i]->priority;
    }
    switch_to(next);
}`,
  },
  {
    phaseIdx: 2, tagType: 'success', groupId: 'memory',
    title: '内存字段：ldt[2] 决定进程的虚拟地址空间',
    srcRef: 'include/linux/sched.h:70 / kernel/sched.c:copy_mem()',
    scene: 'memory',
    highlightFields: ['ldt[2]','brk','start_code','end_code','end_data','start_stack'],
    explain: 'ldt[2] 是进程私有的局部描述符表（代码段+数据段）。fork 时 copy_mem() 根据进程号设 LDT Base = nr × 64MB，每个进程拥有独立的 64MB 线性地址空间。start_code/end_code/end_data/brk 记录各段边界，缺页处理时用于判断访问合法性。brk 是堆顶，sbrk() 系统调用修改它来动态扩展堆。',
    rightTitle: '地址空间公式',
    code: `// kernel/fork.c:copy_mem()
int copy_mem(int nr, struct task_struct *p) {
    // 每进程线性基址 = nr × 64MB
    unsigned long new_data_base = nr * 0x4000000;
    // 设置 LDT 代码段/数据段 Base
    set_base(p->ldt[1], new_data_base);  // 代码段
    set_base(p->ldt[2], new_data_base);  // 数据段
    p->start_code = new_data_base;
    // ...复制页表...
}`,
  },
  {
    phaseIdx: 3, tagType: 'warning', groupId: 'files',
    title: '文件字段：filp[20] 是进程的 fd 表',
    srcRef: 'include/linux/sched.h:85 / fs/open.c:sys_open()',
    scene: 'files',
    highlightFields: ['umask','pwd','root','executable','filp[20]','close_on_exec'],
    explain: 'filp[20] 是进程级文件描述符表，存 struct file* 指针，最多同时打开 20 个文件（fd 0-19）。fd 0/1/2 默认是 stdin/stdout/stderr（继承自父进程）。pwd 和 root 是 inode 指针，决定相对路径解析的起点和根目录。close_on_exec 是位图，exec 时关闭标记位上的 fd（O_CLOEXEC flag）。',
    rightTitle: '文件描述符路径',
    code: `// fs/open.c
int sys_open(const char* filename, int flag, int mode) {
    // 在 filp[] 找空槽 → 返回下标 = fd
    for (fd=0; fd<NR_OPEN; fd++)
        if (!current->filp[fd]) break;
    // 打开文件，填充 struct file
    current->filp[fd] = get_empty_filp();
    // 通过 namei 解析路径，从 current->pwd 开始
    inode = namei(filename);
    ...
}`,
  },
  {
    phaseIdx: 4, tagType: 'danger', groupId: 'signal',
    title: '信号字段：signal 位图 + sigaction[32] 处理表',
    srcRef: 'include/linux/sched.h:58 / kernel/signal.c',
    scene: 'signal',
    highlightFields: ['signal','blocked','sigaction[32]'],
    explain: 'signal 是一个 32 位整数，每一位对应一个信号（bit i=1 表示信号 i 待处理）。sys_kill() 通过 task 指针直接设置目标进程的 signal 位。sigaction[32] 存储每个信号的处理动作（SIG_DFL/SIG_IGN/用户函数）。blocked 是屏蔽掩码，被屏蔽的信号不会被处理。检测时机在 ret_from_sys_call：系统调用返回用户态前扫描 signal & ~blocked。',
    rightTitle: '信号检测时机',
    code: `// kernel/system_call.s:ret_from_sys_call
ret_from_sys_call:
    # 检查是否有待处理信号
    movl current,%eax
    cmpl $0,signal(%eax)
    je  3f           # 无信号，直接返回
    # 有信号：call do_signal
    call do_signal
3:  popl %eax
    iret             # 返回用户态`,
  },
  {
    phaseIdx: 5, tagType: 'success', groupId: 'schedule',
    title: '调度字段：counter 的生命周期',
    srcRef: 'kernel/sched.c:do_timer() / schedule()',
    scene: 'schedule',
    highlightFields: ['state','counter','priority','alarm','utime','stime'],
    explain: 'counter 是当前时间片剩余滴答数，由时钟中断（100Hz）中的 do_timer() 每次减1。当 counter=0 时调用 schedule()。如果所有 RUNNING 进程的 counter 都是0，则全部重算：counter = counter/2 + priority，这使得长期睡眠的进程（counter 累积了一半旧值）在重算后获得更高优先级——一种简单的 aging 机制。alarm 字段存定时器到期时间，到期后发 SIGALRM。',
    rightTitle: '时钟中断路径',
    code: `// kernel/sched.c:122
void do_timer(long cpl) {
    if (cpl)          // 用户态运行时 utime++
        current->utime++;
    else              // 内核态运行时 stime++
        current->stime++;
    if (--current->counter > 0) return;
    current->counter = 0;
    if (!cpl) return; // 内核态不抢占
    schedule();       // 触发重新调度
}`,
  },
  {
    phaseIdx: 6, tagType: 'info', groupId: 'family',
    title: '进程家族：四根指针构成进程树',
    srcRef: 'include/linux/sched.h:90 / kernel/fork.c:copy_process()',
    scene: 'family',
    highlightFields: ['p_pptr','p_cptr','p_ysptr','p_osptr','exit_code'],
    explain: 'Linux 0.11 用四个指针维护进程树结构：p_pptr 指向父进程，p_cptr 指向最年轻的子进程，p_ysptr/p_osptr 构成兄弟链表。fork() 时在 copy_process() 中设置这些关系。父进程调用 wait() 时通过 p_cptr 遍历所有子进程，找到 ZOMBIE 状态的子进程收割（读取 exit_code）。exit_code 是进程退出时通过 _exit() 系统调用设置的返回值。',
    rightTitle: '孤儿进程处理',
    code: `// kernel/exit.c:do_exit()
int do_exit(long code) {
    current->state = TASK_ZOMBIE;
    current->exit_code = code;
    // 子进程的父进程 = init(1)（收养孤儿）
    for (i=0; i<NR_TASKS; i++)
        if (task[i]->p_pptr == current)
            task[i]->p_pptr = task[1]; // init
    // 唤醒父进程（可能在 wait() 中阻塞）
    tell_father(current->p_pptr);
    schedule();
}`,
  },
  {
    phaseIdx: 7, tagType: 'warning', groupId: 'tss',
    title: 'TSS：CPU 上下文快照，上下文切换的硬件支撑',
    srcRef: 'include/linux/sched.h:108 tss_struct / kernel/sched.h switch_to()',
    scene: 'tss',
    highlightFields: ['tss.esp0','tss.ss0','tss.eip','tss.esp','tss.eflags','tss.ldt'],
    explain: 'tss_struct 是 x86 硬件定义的任务状态段，嵌在 task_struct 末尾。switch_to(n) 用一条 ljmp 指令切换到目标进程的 TSS：CPU 自动把当前所有寄存器（EIP/ESP/EFLAGS/段寄存器等）保存到当前 TSS，然后从目标 TSS 恢复所有寄存器，完成上下文切换。tss.esp0/ss0 是内核栈信息：当用户态程序触发 int 0x80 时，CPU 从当前进程的 TSS.esp0 取内核栈地址，自动切换特权级。',
    rightTitle: '切换的本质',
    code: `// include/linux/sched.h:196
#define switch_to(n) {\\
    struct {long a,b;} __tmp; \\
    __asm__("cmpl %%ecx,_current\\n\\t" \\
    "je 1f\\n\\t" \\
    "movw %%dx,%1\\n\\t" \\
    "xchgl %%ecx,_current\\n\\t" \\
    "ljmp %0\\n\\t"   /* 一条指令完成全部 */ \\
    "cmpl %%ecx,%2\\n\\t" \\
    "jne 1f\\n\\t" \\
    ...)}`,
  },
  {
    phaseIdx: 8, tagType: 'info', groupId: null,
    title: 'task_struct 是六大子系统的交汇点',
    srcRef: 'include/linux/sched.h（全局）',
    scene: 'connections',
    explain: 'task_struct 不只是一个数据结构，它是所有内核子系统协作的"合同"。调度器通过 state/counter 决定下一个运行谁；内存管理通过 ldt/brk 维护地址空间；文件系统通过 filp[]/pwd 维护文件状态；信号机制通过 signal/sigaction 投递和处理信号；系统调用通过 tss.esp0 切换栈；fork/exec 在 task_struct 里刻下亲子关系。读懂一个 task_struct 的全部字段，等于同时理解了六个内核子系统的状态机。',
    rightTitle: '访问 current 的宏',
    code: `// include/linux/sched.h
// 通过内核栈指针倒推 task_struct 地址
// 每个进程占一页（4KB），task_struct 在页底
#define current (\\
  (struct task_struct *)((unsigned long) \\
  &__tmp & 0xFFFFF000) \\
)
// ESP 的高20位 = 页基址 = task_struct*`,
    rightContent: [],
  },
]

const currentIdx = ref(0)
const playing = ref(false)
let timer = null

const currentStep = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => steps[currentIdx.value].phaseIdx)

function goTo(i) { currentIdx.value = i }
function prev() { if (currentIdx.value > 0) currentIdx.value-- }
function next() { if (currentIdx.value < steps.length - 1) currentIdx.value++ }
function jumpToPhase(i) {
  const idx = steps.findIndex(s => s.phaseIdx === i)
  if (idx >= 0) currentIdx.value = idx
}
function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    timer = setInterval(() => {
      if (currentIdx.value < steps.length - 1) currentIdx.value++
      else { playing.value = false; clearInterval(timer) }
    }, 2800)
  } else clearInterval(timer)
}
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.phase-bar { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
.phase-seg { flex: 1; min-width: 60px; text-align: center; font-size: 11px; padding: 5px 0; border-radius: 4px; cursor: pointer; background: #f5f7fa; color: #909399; border: 1px solid #e4e7ed; transition: all .2s; }
.phase-seg.active { background: #e6a23c; color: #fff; border-color: #e6a23c; }
.step-dots { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.step-dot { width: 10px; height: 10px; border-radius: 50%; background: #dcdfe6; cursor: pointer; transition: background .2s; }
.step-dot.active { background: #e6a23c; }
.step-dot.done { background: #67c23a; }
.main-grid { display: grid; grid-template-columns: 230px 1fr 230px; gap: 12px; margin-bottom: 12px; }
.panel-left, .panel-right { background: #fafafa; border: 1px solid #e4e7ed; border-radius: 6px; padding: 12px; min-height: 400px; }
.panel-center { background: #fff; border: 1px solid #e4e7ed; border-radius: 6px; padding: 14px; }
.panel-title { font-size: 11px; font-weight: 600; color: #909399; text-transform: uppercase; margin-bottom: 8px; letter-spacing: .5px; }
.step-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 14px; }

/* 字段组 */
.fg-group { border: 1px solid #e4e7ed; border-radius: 4px; padding: 6px; margin-bottom: 6px; transition: all .2s; }
.fg-active { border-width: 2px; }
.fg-header { font-size: 11px; font-weight: 600; margin-bottom: 4px; }
.fg-fields { display: flex; flex-wrap: wrap; gap: 3px; }
.fg-field { font-size: 9px; background: #f0f2f5; border-radius: 2px; padding: 1px 4px; color: #606266; font-family: monospace; transition: all .2s; }
.ff-highlight { font-weight: 600; }

/* 内存布局 */
.mem-page { border: 2px solid #409eff; border-radius: 4px; overflow: hidden; margin-top: 6px; }
.mp-top { background: #e8f4fd; color: #409eff; font-size: 10px; padding: 4px 6px; text-align: center; border-bottom: 1px dashed #409eff; }
.mp-mid { color: #909399; font-size: 10px; padding: 8px; text-align: center; }
.mp-bot { background: #e6a23c15; color: #e6a23c; font-size: 10px; padding: 4px 6px; text-align: center; border-top: 1px dashed #e6a23c; }

/* overview */
.overview-map { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.om-center { }
.om-core { background: #e6a23c; color: #fff; border-radius: 50%; width: 80px; height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; text-align: center; }
.om-spokes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
.oms-box { border: 1px solid; border-radius: 6px; padding: 8px; }
.oms-title { font-size: 11px; font-weight: 600; margin-bottom: 3px; }
.oms-fields { font-size: 10px; color: #606266; font-family: monospace; }
.ov-note { font-size: 12px; color: #606266; line-height: 1.7; background: #f5f7fa; border-radius: 4px; padding: 8px; margin-top: 4px; }

/* field detail */
.field-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fd-struct { background: #1e1e1e; border-radius: 6px; padding: 10px; }
.fds-title { font-size: 11px; color: #6a9955; margin-bottom: 8px; font-family: monospace; }
.fds-row { display: flex; gap: 6px; padding: 3px 0; border-bottom: 1px solid #2a2a2a; font-family: monospace; font-size: 10px; transition: background .2s; border-radius: 2px; }
.fds-row.fds-highlight { background: #2a2a1a; padding: 3px 4px; }
.fds-type { color: #569cd6; min-width: 80px; flex-shrink: 0; }
.fds-name { color: #9cdcfe; min-width: 80px; }
.fds-comment { color: #6a9955; font-size: 9px; line-height: 1.5; }
.fd-diagram { }
.fdd-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.fdd-note { font-size: 10px; color: #909399; line-height: 1.6; margin-top: 8px; background: #f5f7fa; border-radius: 4px; padding: 6px; }
.fdd-pool { display: flex; flex-wrap: wrap; gap: 4px; }
.fddp-slot { border: 1px solid #e4e7ed; border-radius: 4px; padding: 4px 6px; text-align: center; font-size: 9px; color: #909399; }
.fddp-used { background: #f0f7ff; border-color: #409eff44; color: #409eff; }
.fddp-new { background: #fff4e5; border-color: #e6a23c; color: #e6a23c; font-weight: 600; }
.fddp-pid { display: block; font-size: 9px; }

/* address space */
.addr-space { display: flex; flex-direction: column; border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.as-seg { padding: 6px 8px; font-size: 10px; text-align: center; }
.seg-code  { background: #e8f4fd; color: #409eff; }
.seg-data  { background: #fdf6ec; color: #e6a23c; }
.seg-bss   { background: #f0fff4; color: #67c23a; }
.as-gap    { background: #f5f5f5; color: #c0c4cc; font-size: 10px; text-align: center; padding: 4px; flex: 1; }
.seg-stack { background: #f5f0ff; color: #9c27b0; }

/* filp table */
.filp-table { border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.ft-row { display: flex; gap: 6px; padding: 4px 6px; border-bottom: 1px solid #f0f2f5; font-size: 10px; }
.ft-used { background: #f0f7ff; }
.ft-fd { color: #409eff; min-width: 40px; font-family: monospace; }
.ft-arrow { color: #909399; }
.ft-target { color: #606266; }

/* signal bitmap */
.sig-bitmap { display: flex; flex-wrap: wrap; gap: 3px; }
.sb-bit { border: 1px solid #e4e7ed; border-radius: 3px; padding: 3px 4px; text-align: center; min-width: 30px; }
.sb-set { background: #fff0f0; border-color: #f56c6c; }
.sb-num { display: block; font-size: 10px; font-weight: 600; color: #303133; }
.sb-name { display: block; font-size: 8px; color: #909399; }
.sb-set .sb-num { color: #f56c6c; }

/* sched bars */
.sched-bars { display: flex; flex-direction: column; gap: 6px; }
.sb-proc { display: flex; flex-direction: column; gap: 3px; }
.sbp-name { font-size: 11px; color: #606266; }
.sbp-bar-wrap { height: 14px; }
.sbp-priority { height: 14px; background: #409eff44; border: 1px solid #409eff; border-radius: 2px; font-size: 9px; color: #409eff; display: flex; align-items: center; padding: 0 4px; min-width: 60px; }
.sbp-counter { height: 14px; background: #67c23a44; border: 1px solid #67c23a; border-radius: 2px; font-size: 9px; color: #67c23a; display: flex; align-items: center; padding: 0 4px; min-width: 30px; }

/* proc tree */
.proc-tree { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.pt-node { background: #f0f7ff; border: 1px solid #409eff44; border-radius: 4px; padding: 6px 10px; font-size: 11px; text-align: center; color: #409eff; }
.pt-init { background: #fff4e5; border-color: #e6a23c; color: #e6a23c; }
.pt-leaf { background: #f0fff4; border-color: #67c23a44; color: #67c23a; }
.pt-children { display: flex; gap: 16px; }
.pt-branch { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pt-sub { display: flex; gap: 6px; }

/* TSS switch */
.tss-switch { display: flex; align-items: center; gap: 8px; }
.ts-from, .ts-to { flex: 1; background: #1e1e1e; border-radius: 4px; padding: 8px; }
.ts-label { font-size: 10px; color: #6a9955; margin-bottom: 4px; }
.ts-saved { font-size: 10px; color: #e6a23c; margin-bottom: 3px; }
.ts-restore { font-size: 10px; color: #67c23a; margin-bottom: 3px; }
.ts-fields { font-size: 9px; color: #9cdcfe; font-family: monospace; }
.ts-arrow { font-size: 14px; color: #e040fb; font-weight: 700; }

/* connections */
.conn-map { padding: 4px; }
.cm-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.cm-center { display: flex; justify-content: center; margin-bottom: 10px; }
.cm-core { background: #e6a23c; color: #fff; border-radius: 50%; width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; text-align: center; }
.cm-links { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cml-subsystem { border: 1px solid; border-radius: 6px; padding: 8px; }
.cmls-name { font-size: 12px; font-weight: 600; margin-bottom: 3px; }
.cmls-field { font-size: 9px; color: #909399; font-family: monospace; margin-bottom: 3px; }
.cmls-desc { font-size: 10px; color: #606266; line-height: 1.5; }

/* right panel */
.pr-src { font-family: monospace; font-size: 10px; color: #909399; margin-bottom: 8px; }
.pr-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.pri-row { display: flex; gap: 6px; }
.pri-label { font-size: 10px; font-weight: 600; color: #e6a23c; min-width: 40px; flex-shrink: 0; }
.pri-text { font-size: 10px; color: #606266; line-height: 1.5; }
.pr-code pre { background: #1e1e1e; color: #d4d4d4; border-radius: 4px; padding: 8px; font-size: 10px; overflow-x: auto; margin: 0; line-height: 1.6; white-space: pre; }

/* controls */
.controls { display: flex; gap: 8px; margin-bottom: 12px; }

/* detail card */
.detail-card { background: #f8f9fb; border: 1px solid #e4e7ed; border-radius: 6px; padding: 14px; }
.dc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dc-src { font-family: monospace; font-size: 11px; color: #909399; }
.dc-tag { font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
.tag-info { background: #e8f4fd; color: #409eff; }
.tag-warning { background: #fff4e5; color: #e6a23c; }
.tag-success { background: #f0fff4; color: #67c23a; }
.tag-danger { background: #fff0f0; color: #f56c6c; }
.dc-explain { font-size: 13px; color: #303133; line-height: 1.7; }
</style>
