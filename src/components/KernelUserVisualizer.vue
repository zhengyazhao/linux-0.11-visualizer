<template>
  <div style="max-width: 1100px; margin: 0 auto">
    <div style="margin-bottom: 16px">
      <h2 style="font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 4px">内核态 / 用户态：为什么要有两种特权级</h2>
      <p style="color: #909399; font-size: 13px">x86 保护环 · CPL 3↔0 切换 · 内核何时必须回到用户态 · 完整切换生命周期</p>
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
      <!-- 左：当前特权级状态 -->
      <div class="panel-left">
        <div class="panel-title">当前特权级</div>
        <div class="cpl-badge" :class="currentStep.cpl === 0 ? 'cpl-kernel' : 'cpl-user'">
          <div class="cpl-num">Ring {{ currentStep.cpl }}</div>
          <div class="cpl-name">{{ currentStep.cpl === 0 ? '内核态' : '用户态' }}</div>
        </div>

        <div style="margin-top: 14px">
          <div class="panel-title">x86 保护环</div>
          <div class="rings-diagram">
            <div v-for="ring in rings" :key="ring.n" class="rd-ring"
              :class="{ 'rd-active': currentStep.cpl === ring.n, 'rd-linux': ring.linux }">
              <span class="rd-num">Ring {{ ring.n }}</span>
              <span class="rd-label">{{ ring.label }}</span>
              <span v-if="ring.linux" class="rd-used">Linux 使用</span>
            </div>
          </div>
        </div>

        <div style="margin-top: 14px">
          <div class="panel-title">CS 寄存器 CPL 字段</div>
          <div class="cs-vis">
            <div class="csv-bits">
              <div class="csv-field" style="flex:6">选择子[15:2]</div>
              <div class="csv-field" style="flex:1">TI</div>
              <div class="csv-field cpl-field" :class="currentStep.cpl === 0 ? 'cpl0' : 'cpl3'" style="flex:1">
                CPL={{ currentStep.cpl }}
              </div>
            </div>
            <div style="font-size:9px;color:#909399;margin-top:4px">CPU 执行每条指令前检查 CS[1:0] = CPL</div>
          </div>
        </div>
      </div>

      <!-- 中：主可视化 -->
      <div class="panel-center">
        <div class="step-title">{{ currentStep.title }}</div>

        <!-- 为什么需要两种特权级 -->
        <template v-if="currentStep.scene === 'why'">
          <div class="why-layout">
            <div class="wl-scenario">
              <div class="wls-title" style="color:#f56c6c">❌ 假设没有保护环（单一特权级）</div>
              <div class="wl-code">
                <div class="wlc-line">// 任意用户程序可以执行：</div>
                <div class="wlc-line wlc-danger">outb(0x60, 0xFF);  // 直接控制键盘控制器</div>
                <div class="wlc-line wlc-danger">movl $0, %cr3;     // 销毁所有页表</div>
                <div class="wlc-line wlc-danger">hlt;               // 停机</div>
                <div class="wlc-line wlc-danger">*(0) = 0xDEADBEEF; // 写内核内存</div>
              </div>
              <div class="wl-result wl-bad">任何进程都可以崩溃整个系统 ☠️</div>
            </div>
            <div class="wl-vs">VS</div>
            <div class="wl-scenario">
              <div class="wls-title" style="color:#67c23a">✅ 有保护环（Ring 0 / Ring 3）</div>
              <div class="wl-rings-desc">
                <div class="wlrd-item" style="border-color:#f56c6c">
                  <div class="wlrd-name" style="color:#f56c6c">Ring 0（内核态）</div>
                  <div class="wlrd-can">in/out 指令（I/O 端口）</div>
                  <div class="wlrd-can">修改 CR0/CR3（分页控制）</div>
                  <div class="wlrd-can">LGDT/LIDT（全局描述符表）</div>
                  <div class="wlrd-can">HLT（停机）</div>
                </div>
                <div class="wlrd-item" style="border-color:#67c23a">
                  <div class="wlrd-name" style="color:#67c23a">Ring 3（用户态）</div>
                  <div class="wlrd-cant">执行上述指令 → #GP（通用保护故障）</div>
                  <div class="wlrd-cant">只能通过系统调用间接请求内核</div>
                  <div class="wlrd-ok">崩溃 = 进程被杀，不影响其他进程</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- x86 保护环详解 -->
        <template v-else-if="currentStep.scene === 'rings'">
          <div class="rings-layout">
            <div class="rl-visual">
              <div v-for="ring in ringsDetail" :key="ring.n" class="rlv-ring"
                :style="`border-color:${ring.color}`">
                <div class="rlvr-title" :style="`color:${ring.color}`">Ring {{ ring.n }} — {{ ring.name }}</div>
                <div class="rlvr-items">
                  <div v-for="item in ring.items" :key="item" class="rlvr-item">{{ item }}</div>
                </div>
              </div>
            </div>
            <div class="rl-note">
              <div class="rln-item">Linux 只使用 Ring 0（内核）和 Ring 3（用户进程），Ring 1/2 未使用</div>
              <div class="rln-item">CS 段寄存器的低2位 = CPL（Current Privilege Level）</div>
              <div class="rln-item">每次指令执行前 CPU 硬件自动检查 CPL ≤ DPL（描述符特权级）</div>
            </div>
          </div>
        </template>

        <!-- 用户态→内核态：int 0x80 -->
        <template v-else-if="currentStep.scene === 'user-to-kernel'">
          <div class="switch-layout">
            <div class="sl-title">用户态 → 内核态：int 0x80 的5步硬件操作</div>
            <div class="sl-timeline">
              <div v-for="(step, i) in u2kSteps" :key="i" class="slt-step"
                :class="{ 'slt-active': currentStep.animStep > i }">
                <div class="slts-num">{{ i + 1 }}</div>
                <div class="slts-body">
                  <div class="slts-title">{{ step.title }}</div>
                  <div class="slts-detail">{{ step.detail }}</div>
                </div>
              </div>
            </div>
            <div class="sl-note">全部由 CPU 硬件完成，无需任何软件指令。完成后 CS.CPL=0，栈切换到 tss.esp0</div>
          </div>
        </template>

        <!-- 内核态→用户态：iret -->
        <template v-else-if="currentStep.scene === 'kernel-to-user'">
          <div class="switch-layout">
            <div class="sl-title">内核态 → 用户态：iret 弹出硬件帧</div>
            <div class="sl-stacks">
              <div class="ss-stack">
                <div class="sss-title">执行 iret 前（内核栈）</div>
                <div class="sss-items">
                  <div v-for="frame in kernelStackFrame" :key="frame.name" class="sssi-item">
                    <span class="sssi-name">{{ frame.name }}</span>
                    <span class="sssi-val">{{ frame.val }}</span>
                  </div>
                </div>
                <div class="sss-arrow">↑ ESP</div>
              </div>
              <div class="ss-arrow">iret<br>→</div>
              <div class="ss-stack">
                <div class="sss-title">执行 iret 后（CPU 状态）</div>
                <div class="sss-restored">
                  <div v-for="r in restoredRegs" :key="r.name" class="sssr-item">
                    <span class="sssr-reg">{{ r.name }}</span>
                    <span class="sssr-val">{{ r.val }}</span>
                  </div>
                </div>
                <div class="sss-cpl">CPL 恢复为 3（Ring 3）</div>
              </div>
            </div>
            <div class="sl-note">CS 弹出时 CPL 自动变为 3；同时切回用户栈（SS:ESP 也被弹出）</div>
          </div>
        </template>

        <!-- 内核为什么必须回到用户态 -->
        <template v-else-if="currentStep.scene === 'why-return'">
          <div class="why-return-layout">
            <div class="wrl-title">三个理由：内核态不能永久运行用户代码</div>
            <div class="wrl-reasons">
              <div v-for="(r, i) in returnReasons" :key="i" class="wrlr-item">
                <div class="wrlri-num" :style="`background:${r.color}`">{{ i + 1 }}</div>
                <div class="wrlri-body">
                  <div class="wrlri-title" :style="`color:${r.color}`">{{ r.title }}</div>
                  <div class="wrlri-desc">{{ r.desc }}</div>
                  <div class="wrlri-example">{{ r.example }}</div>
                </div>
              </div>
            </div>
            <div class="wrl-conclusion">
              内核态运行用户代码 = 用户代码具有 ring0 权限 = 可以直接访问/破坏任何内存和硬件。<br>
              所以系统调用完成后，内核<b>必须</b>通过 iret 回到用户态，把 CPL 从 0 降回 3。
            </div>
          </div>
        </template>

        <!-- move_to_user_mode：第一次进入用户态 -->
        <template v-else-if="currentStep.scene === 'first-enter'">
          <div class="first-enter-layout">
            <div class="fel-title">Linux 0.11 第一次进入用户态：move_to_user_mode()</div>
            <div class="fel-steps">
              <div v-for="(s, i) in firstEnterSteps" :key="i" class="fels-step"
                :class="{ 'fels-key': s.key }">
                <div class="felss-num">{{ i + 1 }}</div>
                <div class="felss-body">
                  <div class="felss-title">{{ s.title }}</div>
                  <div class="felss-code">{{ s.code }}</div>
                </div>
              </div>
            </div>
            <div class="fel-note">
              内核通过"伪造一个 iret 场景"进入用户态：手动把用户态 CS/EIP/SS/ESP 压栈，然后 iret 弹出——CPU 以为是从中断返回，其实是第一次进入用户空间。
            </div>
          </div>
        </template>

        <!-- 完整生命周期 -->
        <template v-else-if="currentStep.scene === 'lifecycle'">
          <div class="lifecycle-layout">
            <div class="lcl-title">特权级切换的完整生命周期</div>
            <div class="lcl-cycle">
              <div v-for="(node, i) in lifecycleNodes" :key="i" class="lclc-node"
                :style="`border-color:${node.color}; background:${node.color}10`">
                <div class="lclcn-cpl" :style="`color:${node.color}`">{{ node.cpl }}</div>
                <div class="lclcn-name">{{ node.name }}</div>
                <div class="lclcn-desc">{{ node.desc }}</div>
                <div v-if="i < lifecycleNodes.length - 1" class="lclcn-arrow">
                  ↓ {{ node.transition }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 两态对比总结 -->
        <template v-else-if="currentStep.scene === 'compare'">
          <div class="compare-layout">
            <div class="cpl-cols">
              <div class="cplc-col">
                <div class="cplcc-header" style="background:#f56c6c">内核态（Ring 0）</div>
                <div class="cplcc-body">
                  <div v-for="item in kernelModeItems" :key="item" class="cplcc-item">{{ item }}</div>
                </div>
              </div>
              <div class="cplc-col">
                <div class="cplcc-header" style="background:#67c23a">用户态（Ring 3）</div>
                <div class="cplcc-body">
                  <div v-for="item in userModeItems" :key="item" class="cplcc-item">{{ item }}</div>
                </div>
              </div>
            </div>
            <div class="cpl-transitions">
              <div class="cplt-item">
                <span class="cplt-from user-badge">Ring 3</span>
                <span class="cplt-arrow">→ int 0x80 / 硬件中断 / 异常 →</span>
                <span class="cplt-to kernel-badge">Ring 0</span>
              </div>
              <div class="cplt-item">
                <span class="cplt-from kernel-badge">Ring 0</span>
                <span class="cplt-arrow">→ iret / move_to_user_mode →</span>
                <span class="cplt-to user-badge">Ring 3</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 右：机制说明 -->
      <div class="panel-right">
        <div class="panel-title">{{ currentStep.rightTitle || '机制说明' }}</div>
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

const phases = ['为什么', '保护环', '用户→内核', '内核→用户', '为什么回来', '第一次进入', '生命周期', '对比']

const rings = [
  { n: 0, label: '内核（OS）',        linux: true },
  { n: 1, label: '设备驱动（可选）',  linux: false },
  { n: 2, label: '设备驱动（可选）',  linux: false },
  { n: 3, label: '用户应用程序',      linux: true },
]

const ringsDetail = [
  { n: 0, name: '内核',     color: '#f56c6c',
    items: ['执行 in/out（I/O端口操作）', '修改 CR0/CR3/CR4（控制寄存器）', 'LGDT/LIDT（全局/中断描述符表）', 'HLT（停机指令）', '访问任意物理内存', '设置 IDT/GDT 表项'] },
  { n: 1, name: '设备驱动', color: '#e6a23c', items: ['Linux 未使用'] },
  { n: 2, name: '设备驱动', color: '#e6a23c', items: ['Linux 未使用'] },
  { n: 3, name: '用户程序', color: '#67c23a',
    items: ['普通计算指令', '访问自己地址空间', '调用 libc 库函数', '通过 int 0x80 请求内核服务', '不能访问其他进程内存', '不能操作硬件（会 #GP）'] },
]

const u2kSteps = [
  { title: 'CPU 查 IDT[0x80]', detail: '取出陷阱门描述符，验证 DPL=3（允许用户态触发）' },
  { title: '验证 CPL ≤ DPL', detail: 'ring3 进程可以触发 int 0x80（DPL=3），ring3 可以直接 HLT 会 #GP' },
  { title: '切换到内核栈', detail: '从当前进程 TSS.esp0/ss0 取内核栈地址，切换 SS:ESP' },
  { title: '压栈保存用户态上下文', detail: '自动 push: SS, ESP（用户栈）, EFLAGS, CS, EIP（返回地址）' },
  { title: '跳转到 system_call', detail: '从陷阱门取 selector:offset，CS.CPL 变为 0，jmp 到 system_call' },
]

const kernelStackFrame = [
  { name: 'SS（用户栈段）',  val: '0x17' },
  { name: 'ESP（用户栈顶）', val: '0xBFFFF000' },
  { name: 'EFLAGS',          val: '0x202' },
  { name: 'CS（ring3）',     val: '0x0F' },
  { name: 'EIP（返回地址）', val: '0x08048060' },
]

const restoredRegs = [
  { name: 'EIP', val: '0x08048060（用户代码继续执行）' },
  { name: 'CS',  val: '0x0F → CPL=3（Ring 3）' },
  { name: 'EFLAGS', val: '0x202（IF=1，开中断）' },
  { name: 'ESP', val: '0xBFFFF000（用户栈）' },
  { name: 'SS',  val: '0x17（用户数据段）' },
]

const returnReasons = [
  {
    color: '#f56c6c',
    title: '隔离保护：不能让用户代码拥有 ring0 权限',
    desc: '内核运行在 ring0，可以访问任意内存和硬件。如果不切回用户态，用户代码将继续在 ring0 中执行——可以破坏任何内存、控制任何硬件。',
    example: '即使系统调用完成了，也必须 iret 降回 ring3，否则接下来的用户代码等同于内核代码。',
  },
  {
    color: '#e6a23c',
    title: '资源记账：需要区分用户时间 vs 内核时间',
    desc: '内核通过 CS 的 CPL 字段判断时钟中断时进程在用户态还是内核态，分别累加 utime（用户时间）和 stime（内核时间）。',
    example: 'do_timer: if(cpl) utime++ else stime++ — 这是 /proc/stat 中 usr/sys 时间的来源。',
  },
  {
    color: '#67c23a',
    title: '并发性：内核态返回后可能触发调度',
    desc: 'ret_from_sys_call 返回用户态前会检查信号和是否需要重新调度（preempt）。只有在特权级切换点（内核→用户的边界）才是安全的调度时机。',
    example: 'Linux 0.11 的抢占：do_timer 中只有 cpl!=0（来自用户态时钟中断）才调用 schedule()。',
  },
]

const firstEnterSteps = [
  { title: 'main() 初始化完成，准备进入用户态', code: '// init/main.c:134\nmove_to_user_mode(); // 唯一调用', key: false },
  { title: '手动构造伪 iret 帧压栈', code: 'pushl $0x17   // SS（用户数据段）\npushl %esp    // 用户 ESP\npushfl        // EFLAGS\npushl $0x0f   // CS（用户代码段，CPL=3）\npushl $1f     // EIP（返回地址）', key: true },
  { title: '执行 iret，CPU 弹出帧', code: 'iret\n// CPU 弹出 EIP/CS/EFLAGS/ESP/SS\n// CS.CPL = 3 → 切换到用户态', key: true },
  { title: '进入用户态第一条指令', code: '1: movl $0x17,%eax\n   mov %ax,%ds   // 切换数据段\n   mov %ax,%es\n   // 现在正式在 ring3 运行', key: false },
]

const lifecycleNodes = [
  { cpl: 'Ring 3', color: '#67c23a', name: '用户态运行', desc: '执行用户程序代码（ls / grep / nginx...）', transition: 'int 0x80 / 硬件中断 / 异常（缺页）' },
  { cpl: 'Ring 0', color: '#f56c6c', name: '内核态处理', desc: 'system_call → sys_xxx → do_xxx（内核代码）', transition: 'iret（system_call 末尾 ret_from_sys_call）' },
  { cpl: 'Ring 3', color: '#67c23a', name: '返回用户态', desc: 'iret 弹出硬件帧，CPL 恢复为 3，继续执行下一条用户指令', transition: '（下一次系统调用/中断）' },
  { cpl: 'Ring 0', color: '#f56c6c', name: '可能发生调度', desc: 'ret_from_sys_call 处理信号、do_timer 处检查 schedule()', transition: '' },
]

const kernelModeItems = [
  '直接访问所有物理内存',
  '执行特权指令（in/out/hlt/lgdt）',
  '修改页表（CR3）',
  '处理中断/异常',
  '进程切换（switch_to）',
  '设备驱动代码',
]

const userModeItems = [
  '只能访问自己的地址空间',
  '不能执行特权指令（→#GP）',
  '通过 int 0x80 请求内核服务',
  '进程崩溃不影响其他进程',
  '受页表保护，无法访问内核内存',
  '所有系统调用都需要切换特权级',
]

const steps = [
  {
    phaseIdx: 0, tagType: 'info', cpl: 3,
    title: '为什么需要两种特权级？没有保护会怎样？',
    srcRef: 'Intel SDM Vol.3A Ch3 — Protection',
    scene: 'why',
    explain: 'x86 的保护环（Protection Ring）是 CPU 硬件提供的隔离机制。如果没有保护环，用户程序可以直接执行 in/out 操作硬件、修改 CR3 破坏所有进程的页表、甚至停机。有了 ring0/ring3 的区分，用户代码在 ring3 执行，特权指令会触发 #GP（General Protection Fault），内核捕获并处理，保护了系统稳定性。',
    rightTitle: '关键保护机制',
    rightContent: [
      { label: 'CPL',   text: 'Current Privilege Level：CS 寄存器低2位，0=内核，3=用户' },
      { label: 'DPL',   text: 'Descriptor Privilege Level：段描述符中的特权要求' },
      { label: '#GP',   text: 'CPL > DPL 时触发通用保护故障，内核处理或终止进程' },
      { label: '效果',  text: '用户程序崩溃 → 进程被杀；内核代码崩溃 → kernel panic' },
    ],
  },
  {
    phaseIdx: 1, tagType: 'warning', cpl: 3,
    title: 'x86 保护环：Ring 0 能做什么，Ring 3 不能做什么',
    srcRef: 'Intel SDM Vol.3A Ch2.5 — Privilege Levels',
    scene: 'rings',
    explain: 'x86 设计了4个保护环（0-3），数字越小权限越大。Linux 只使用 Ring 0（内核）和 Ring 3（用户），Ring 1/2 为历史遗留（OS/2 等老系统用过）。Ring 0 可以执行所有指令，包括访问 I/O 端口、修改控制寄存器、管理内存映射。Ring 3 只能执行"无害"指令，访问受限的内存区域，其他操作必须通过系统调用委托给内核。',
    rightTitle: '检查时机',
    rightContent: [
      { label: '每条指令', text: 'CPU 执行前自动检查 CPL 与目标的 DPL' },
      { label: '内存访问', text: '页表项 U/S 位：S=1 要求 CPL=0，用户态访问→缺页' },
      { label: 'I/O 端口', text: 'IOPL 字段（EFLAGS[13:12]）控制 in/out 权限' },
      { label: '系统调用', text: '陷阱门 DPL=3，允许用户态触发，跳入 ring0 执行' },
    ],
  },
  {
    phaseIdx: 2, tagType: 'danger', cpl: 0,
    title: '用户态 → 内核态：int 0x80 的5步硬件操作',
    srcRef: 'kernel/system_call.s + Intel SDM — int 指令',
    scene: 'user-to-kernel',
    animStep: 5,
    explain: 'int 0x80 是 Linux 0.11 进入内核的唯一软件路径（硬件中断除外）。CPU 执行 int 0x80 时，自动完成5步操作：查陷阱门→验证权限→切换内核栈→压用户态上下文→跳入 system_call。全程无需软件干预，保证了切换的原子性。内核栈地址来自当前进程 TSS.esp0，这就是为什么每个进程有独立的内核栈。',
    rightTitle: '触发方式对比',
    rightContent: [
      { label: 'int 0x80', text: '软件主动触发，用户程序请求内核服务' },
      { label: '硬件中断', text: 'IRQ0(时钟)/IRQ1(键盘)等，异步触发，也会进入ring0' },
      { label: '异常',     text: '#PF(缺页)/#GP(保护)等，指令执行出错触发' },
      { label: '共同点',   text: '都通过 IDT 陷阱门/中断门，都会切换到内核栈' },
    ],
    code: `// 用户态调用 write(1,"hi",2):
movl $4, %eax    // 系统调用号4=write
movl $1, %ebx    // fd=1(stdout)
movl $msg, %ecx  // buf地址
movl $2, %edx    // len=2
int  $0x80       // → CPL 3→0`,
  },
  {
    phaseIdx: 3, tagType: 'success', cpl: 3,
    title: '内核态 → 用户态：iret 弹出硬件帧，CPL 0→3',
    srcRef: 'kernel/system_call.s:ret_from_sys_call + iret 指令',
    scene: 'kernel-to-user',
    explain: 'iret（Interrupt Return）是 int/硬件中断的逆操作。跨特权级 iret 依次弹出：EIP（返回到用户代码的位置）、CS（含 CPL=3）、EFLAGS、ESP（用户栈顶）、SS（用户栈段）。弹出 CS 的瞬间，CPU CPL 从 0 变为 3，特权级降低，后续指令在用户态执行。ret_from_sys_call 在执行 iret 前会先检查信号（do_signal）。',
    rightTitle: 'ret_from_sys_call 路径',
    code: `// kernel/system_call.s
ret_from_sys_call:
    movl current,%eax
    # 检查信号
    cmpl $0,signal(%eax)
    je  3f
    call do_signal
3:  popl %eax        # 恢复 EAX（系统调用返回值）
    popl %ebx
    popl %ecx
    popl %edx
    addl $4,%esp     # 跳过 EAX 占位
    iret             # 弹出 EIP/CS/EFLAGS/ESP/SS
                     # CS.CPL=3 → 回到用户态`,
  },
  {
    phaseIdx: 4, tagType: 'warning', cpl: 0,
    title: '内核为什么必须回到用户态？三个理由',
    srcRef: 'OS 保护模型 / kernel/sched.c:do_timer()',
    scene: 'why-return',
    explain: '有人会问：系统调用完成后内核能不能继续在 ring0 执行用户代码？不能，有三个强制性原因：①安全隔离（用户代码不应有 ring0 权限）；②时间记账需要区分 utime/stime；③信号处理和调度只在内核→用户的边界发生。iret 不仅是"返回"，更是内核安全边界的强制执行点。',
    rightTitle: '边界的重要性',
    rightContent: [
      { label: '边界点', text: 'ret_from_sys_call 是内核最重要的"出口检查站"' },
      { label: '信号',   text: '只有在这里才能安全地把信号递送给用户空间' },
      { label: '调度',   text: 'do_timer 标记 need_resched，在此处 schedule()' },
      { label: '安全',   text: 'iret 切换 CPL 是硬件强制的，软件无法绕过' },
    ],
  },
  {
    phaseIdx: 5, tagType: 'success', cpl: 3,
    title: 'move_to_user_mode()：第一次进入用户态的特殊方式',
    srcRef: 'init/main.c:134 / include/asm/system.h:move_to_user_mode',
    scene: 'first-enter',
    explain: '操作系统刚启动时，CPU 在 ring0 执行内核代码。但 Linux 的设计原则是：进程（包括 init 进程）都必须在用户态运行。main() 初始化完成后，调用 move_to_user_mode() 第一次进入用户态。因为此时没有"来时的 int"，无法直接 iret，内核采用了一个技巧：手动构造一个假的硬件帧（压栈用户态 SS/ESP/EFLAGS/CS/EIP），然后 iret，CPU 以为在从中断返回，实际完成了 ring0→ring3 的转换。',
    rightTitle: '为什么需要这个技巧',
    rightContent: [
      { label: '背景',   text: '内核启动时在 ring0，从未执行过用户代码' },
      { label: '问题',   text: '没有"来时的 int"，无法正常 iret' },
      { label: '解法',   text: '手动压栈伪造硬件帧，然后 iret，CPU 照单全收' },
      { label: '结果',   text: 'init 进程以 ring3 身份运行，成为所有用户进程的始祖' },
    ],
    code: `// include/asm/system.h
#define move_to_user_mode() \\
__asm__ ("movl %%esp,%%eax\\n\\t" \\
    "pushl $0x17\\n\\t"    // SS=用户数据段(ring3) \\
    "pushl %%eax\\n\\t"    // 用户ESP \\
    "pushfl\\n\\t"         // EFLAGS \\
    "pushl $0x0f\\n\\t"    // CS=用户代码段(ring3) \\
    "pushl $1f\\n\\t"      // EIP = 标签1 \\
    "iret\\n"              // 弹出 → ring3 \\
    "1:\\tmovl $0x17,%%eax\\n\\t" \\
    ...)`,
  },
  {
    phaseIdx: 6, tagType: 'info', cpl: 3,
    title: '特权级切换的完整生命周期',
    srcRef: '综合 — 进程运行全过程',
    scene: 'lifecycle',
    explain: '进程的特权级始终在 ring0 和 ring3 之间循环：用户代码运行（ring3）→ 触发系统调用/中断/异常（进入 ring0）→ 内核处理→ ret_from_sys_call 检查信号/调度 → iret 返回 ring3 → 继续用户代码。这个循环每秒发生数百次（100Hz 时钟中断）。从 CPU 的视角，进程就是这个 ring0↔ring3 交替的状态机。',
    rightTitle: '切换频率',
    rightContent: [
      { label: '时钟中断', text: '100Hz = 每10ms一次，最频繁的切换触发' },
      { label: '系统调用', text: '用户程序每次 I/O、内存分配、进程创建都触发' },
      { label: '缺页异常', text: '#PF 触发 do_no_page()，也在 ring0 处理' },
      { label: '切换代价', text: '每次切换需要压/弹5个寄存器 + 栈切换，约几十 ns' },
    ],
  },
  {
    phaseIdx: 7, tagType: 'info', cpl: 3,
    title: '内核态 vs 用户态：能力对比与切换路径',
    srcRef: '综合',
    scene: 'compare',
    explain: '内核态和用户态不是"两种程序"，而是同一个 CPU 的两种运行模式，由 CS 段寄存器的 CPL 字段区分。同一段代码，在 ring0 执行和 ring3 执行，对硬件的访问能力完全不同。切换的本质是修改 CS.CPL，但这只能通过特定的硬件机制（int/iret/call gate）进行，用户代码无法自行修改 CPL——这是整个保护体系的基础。',
    rightTitle: '设计哲学',
    rightContent: [
      { label: '最小特权', text: '用户代码以最低权限运行，需要更高权限时请求内核' },
      { label: '强制边界', text: 'CPL 由硬件强制，软件无法绕过' },
      { label: '代理模式', text: '用户程序通过系统调用"委托"内核操作硬件' },
      { label: '性能代价', text: '每次切换约需几十ns，高频系统调用（如 redis）用 vDSO 优化' },
    ],
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
.phase-seg.active { background: #9b59b6; color: #fff; border-color: #9b59b6; }
.step-dots { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.step-dot { width: 10px; height: 10px; border-radius: 50%; background: #dcdfe6; cursor: pointer; transition: background .2s; }
.step-dot.active { background: #9b59b6; }
.step-dot.done { background: #67c23a; }
.main-grid { display: grid; grid-template-columns: 200px 1fr 220px; gap: 12px; margin-bottom: 12px; }
.panel-left, .panel-right { background: #fafafa; border: 1px solid #e4e7ed; border-radius: 6px; padding: 12px; min-height: 400px; }
.panel-center { background: #fff; border: 1px solid #e4e7ed; border-radius: 6px; padding: 14px; }
.panel-title { font-size: 11px; font-weight: 600; color: #909399; text-transform: uppercase; margin-bottom: 8px; letter-spacing: .5px; }
.step-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 14px; }

/* CPL badge */
.cpl-badge { border-radius: 8px; padding: 12px; text-align: center; border: 2px solid; margin-bottom: 4px; }
.cpl-kernel { border-color: #f56c6c; background: #fff0f0; }
.cpl-user   { border-color: #67c23a; background: #f0fff4; }
.cpl-num { font-size: 20px; font-weight: 700; }
.cpl-kernel .cpl-num { color: #f56c6c; }
.cpl-user .cpl-num   { color: #67c23a; }
.cpl-name { font-size: 12px; font-weight: 600; }
.cpl-kernel .cpl-name { color: #f56c6c; }
.cpl-user .cpl-name   { color: #67c23a; }

/* rings diagram */
.rings-diagram { display: flex; flex-direction: column; gap: 3px; }
.rd-ring { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; font-size: 10px; background: #f5f7fa; opacity: 0.5; }
.rd-linux { opacity: 1; background: #f0f2f5; }
.rd-active { background: #9b59b615; border: 1px solid #9b59b6; opacity: 1; }
.rd-num { font-weight: 700; color: #303133; min-width: 40px; }
.rd-label { color: #606266; flex: 1; }
.rd-used { font-size: 9px; color: #9b59b6; background: #9b59b615; padding: 1px 4px; border-radius: 3px; }

/* CS vis */
.csv-bits { display: flex; border: 1px solid #e4e7ed; border-radius: 3px; overflow: hidden; }
.csv-field { text-align: center; font-size: 9px; padding: 3px; background: #f5f7fa; border-right: 1px solid #e4e7ed; color: #606266; }
.cpl-field { font-weight: 700; }
.cpl0 { background: #fff0f0; color: #f56c6c; }
.cpl3 { background: #f0fff4; color: #67c23a; }

/* why layout */
.why-layout { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: flex-start; }
.wl-vs { font-size: 16px; font-weight: 700; color: #909399; align-self: center; }
.wls-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.wl-code { background: #1e1e1e; border-radius: 4px; padding: 8px; margin-bottom: 8px; font-family: monospace; }
.wlc-line { font-size: 10px; color: #d4d4d4; line-height: 1.7; }
.wlc-danger { color: #f56c6c; }
.wl-result { font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 4px; text-align: center; }
.wl-bad { background: #fff0f0; color: #f56c6c; }
.wl-rings-desc { display: flex; flex-direction: column; gap: 6px; }
.wlrd-item { border: 1px solid; border-radius: 4px; padding: 8px; }
.wlrd-name { font-size: 11px; font-weight: 600; margin-bottom: 4px; }
.wlrd-can, .wlrd-cant, .wlrd-ok { font-size: 10px; color: #606266; line-height: 1.6; }
.wlrd-cant { color: #f56c6c; }
.wlrd-ok { color: #67c23a; }

/* rings layout */
.rings-layout { display: flex; flex-direction: column; gap: 12px; }
.rl-visual { display: flex; flex-direction: column; gap: 4px; }
.rlv-ring { border: 1px solid; border-radius: 4px; padding: 8px; }
.rlvr-title { font-size: 11px; font-weight: 600; margin-bottom: 5px; }
.rlvr-items { display: flex; flex-wrap: wrap; gap: 4px; }
.rlvr-item { font-size: 10px; background: #f5f7fa; border-radius: 3px; padding: 2px 6px; color: #606266; }
.rl-note { background: #f5f7fa; border-radius: 4px; padding: 8px; }
.rln-item { font-size: 11px; color: #606266; padding: 3px 0; border-bottom: 1px solid #e4e7ed; line-height: 1.5; }

/* switch layout */
.switch-layout { }
.sl-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.sl-timeline { display: flex; flex-direction: column; gap: 6px; }
.slt-step { display: flex; gap: 10px; align-items: flex-start; background: #f5f7fa; border-radius: 4px; padding: 8px; opacity: 0.5; transition: opacity .3s; }
.slt-active { opacity: 1; background: #fff4e5; border: 1px solid #e6a23c44; }
.slts-num { width: 22px; height: 22px; border-radius: 50%; background: #e6a23c; color: #fff; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.slts-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 2px; }
.slts-detail { font-size: 10px; color: #606266; line-height: 1.5; }
.sl-note { font-size: 11px; color: #909399; background: #f5f7fa; border-radius: 4px; padding: 6px 8px; margin-top: 8px; }

/* stack comparison */
.sl-stacks { display: flex; gap: 12px; align-items: flex-start; }
.ss-stack { flex: 1; }
.sss-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.sss-items { background: #1e1e1e; border-radius: 4px; overflow: hidden; }
.sssi-item { display: flex; justify-content: space-between; padding: 5px 8px; border-bottom: 1px solid #2a2a2a; font-size: 10px; font-family: monospace; }
.sssi-name { color: #9cdcfe; }
.sssi-val  { color: #ce9178; }
.sss-arrow { font-size: 11px; color: #67c23a; padding: 4px 8px; text-align: right; }
.ss-arrow { font-size: 16px; font-weight: 700; color: #9b59b6; align-self: center; text-align: center; }
.sss-restored { background: #1e3a1e; border-radius: 4px; overflow: hidden; }
.sssr-item { display: flex; justify-content: space-between; padding: 5px 8px; border-bottom: 1px solid #1a2a1a; font-size: 10px; font-family: monospace; }
.sssr-reg { color: #9cdcfe; }
.sssr-val { color: #67c23a; }
.sss-cpl { font-size: 11px; color: #67c23a; padding: 6px 8px; font-weight: 600; text-align: center; background: #f0fff4; border-radius: 4px; margin-top: 4px; }

/* why return */
.why-return-layout { }
.wrl-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.wrl-reasons { display: flex; flex-direction: column; gap: 8px; }
.wrlr-item { display: flex; gap: 10px; align-items: flex-start; }
.wrlri-num { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wrlri-title { font-size: 12px; font-weight: 600; margin-bottom: 3px; }
.wrlri-desc { font-size: 11px; color: #606266; line-height: 1.5; margin-bottom: 3px; }
.wrlri-example { font-size: 10px; color: #909399; font-family: monospace; line-height: 1.5; }
.wrl-conclusion { background: #fff4e5; border: 1px solid #e6a23c44; border-radius: 6px; padding: 10px; font-size: 12px; color: #606266; line-height: 1.7; margin-top: 10px; }

/* first enter */
.first-enter-layout { }
.fel-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.fel-steps { display: flex; flex-direction: column; gap: 6px; }
.fels-step { display: flex; gap: 10px; align-items: flex-start; background: #f5f7fa; border-radius: 4px; padding: 8px; }
.fels-key { background: #f0fff4; border: 1px solid #67c23a44; }
.felss-num { width: 20px; height: 20px; border-radius: 50%; background: #9b59b6; color: #fff; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fels-key .felss-num { background: #67c23a; }
.felss-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 3px; }
.felss-code { font-size: 10px; color: #606266; font-family: monospace; line-height: 1.5; }
.fel-note { background: #f0f7ff; border: 1px solid #409eff33; border-radius: 4px; padding: 8px; font-size: 11px; color: #606266; line-height: 1.6; margin-top: 8px; }

/* lifecycle */
.lifecycle-layout { }
.lcl-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.lcl-cycle { display: flex; flex-direction: column; align-items: center; gap: 0; }
.lclc-node { border: 2px solid; border-radius: 6px; padding: 10px 14px; width: 100%; }
.lclcn-cpl { font-size: 10px; font-weight: 600; margin-bottom: 2px; }
.lclcn-name { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 3px; }
.lclcn-desc { font-size: 10px; color: #606266; line-height: 1.5; }
.lclcn-arrow { font-size: 10px; color: #909399; text-align: center; padding: 4px; }

/* compare */
.compare-layout { }
.cpl-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.cplc-col { border-radius: 6px; overflow: hidden; border: 1px solid #e4e7ed; }
.cplcc-header { color: #fff; font-size: 12px; font-weight: 600; padding: 6px 10px; text-align: center; }
.cplcc-body { padding: 8px; }
.cplcc-item { font-size: 10px; color: #606266; padding: 3px 0; border-bottom: 1px solid #f0f2f5; line-height: 1.5; }
.cpl-transitions { display: flex; flex-direction: column; gap: 6px; background: #f5f7fa; border-radius: 4px; padding: 10px; }
.cplt-item { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.cplt-arrow { color: #909399; flex: 1; text-align: center; }
.user-badge { background: #f0fff4; color: #67c23a; border: 1px solid #67c23a44; border-radius: 4px; padding: 2px 8px; font-weight: 600; font-size: 11px; }
.kernel-badge { background: #fff0f0; color: #f56c6c; border: 1px solid #f56c6c44; border-radius: 4px; padding: 2px 8px; font-weight: 600; font-size: 11px; }

/* right panel */
.pr-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.pri-row { display: flex; gap: 6px; }
.pri-label { font-size: 10px; font-weight: 600; color: #9b59b6; min-width: 40px; flex-shrink: 0; }
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
