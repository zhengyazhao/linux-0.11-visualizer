<template>
  <div class="sc-root">
    <!-- Phase 进度条 -->
    <div class="phase-bar">
      <div
        v-for="(ph, pi) in phases" :key="pi"
        class="phase-seg"
        :class="{ active: currentPhase === pi, done: currentPhase > pi }"
        @click="jumpToPhase(pi)"
      >
        <span class="phase-label">{{ ph.name }}</span>
        <span class="phase-file">{{ ph.file }}</span>
      </div>
    </div>

    <!-- 步骤点 -->
    <div class="step-indicator">
      <span
        v-for="i in steps.length" :key="i"
        class="step-dot"
        :class="{ active: currentIdx === i-1, done: currentIdx > i-1 }"
        @click="goStep(i-1)"
      />
    </div>

    <!-- 三栏 -->
    <div class="sc-grid">
      <!-- 左栏：CPU 状态 -->
      <div class="sc-left">
        <div class="panel-title">CPU 状态</div>

        <!-- CPL 特权级 -->
        <div class="cpl-box" :class="step.cpl === 0 ? 'cpl-kernel' : 'cpl-user'">
          <span class="cpl-label">CPL</span>
          <span class="cpl-val">{{ step.cpl }}</span>
          <span class="cpl-desc">{{ step.cpl === 0 ? 'ring0 内核态' : 'ring3 用户态' }}</span>
        </div>

        <!-- 寄存器 -->
        <div class="reg-section">
          <div class="reg-section-title">关键寄存器</div>
          <div
            v-for="r in step.regs" :key="r.name"
            class="reg-row"
            :class="{ 'reg-changed': changedRegs.has(r.name) }"
          >
            <span class="reg-name">{{ r.name }}</span>
            <span class="reg-val" :class="r.cls">{{ r.val }}</span>
          </div>
        </div>

        <el-divider style="margin: 10px 0" />

        <!-- 当前栈 -->
        <div class="stack-section">
          <div class="reg-section-title">{{ step.cpl === 0 ? '内核栈' : '用户栈' }}</div>
          <div class="stack-items">
            <div
              v-for="item in step.stack"
              :key="item.label"
              class="stack-item"
              :class="{ 'stack-item-new': item.isNew }"
            >
              <span class="stack-item-label">{{ item.label }}</span>
              <span class="stack-item-val">{{ item.val }}</span>
            </div>
            <div class="stack-esp">← ESP</div>
          </div>
        </div>

        <el-divider style="margin: 10px 0" />
        <div class="explain-box">{{ step.explain }}</div>
      </div>

      <!-- 中栏：可视化 -->
      <div class="sc-center">
        <div class="panel-title">{{ sceneTitle }}</div>

        <!-- overview -->
        <div v-if="step.scene === 'overview'" class="s-overview">
          <div class="ov-pipeline">
            <div class="ov-stage user-stage">
              <div class="ov-stage-title">用户态（ring3）</div>
              <div class="ov-boxes">
                <div class="ov-box">libc<br><small>write(fd,buf,n)</small></div>
                <div class="ov-arrow-v">↓</div>
                <div class="ov-box">int 0x80<br><small>EAX=4</small></div>
              </div>
            </div>
            <div class="ov-boundary">
              <div class="ov-b-line" />
              <div class="ov-b-label">特权级切换<br>CPL 3→0</div>
              <div class="ov-b-line" />
            </div>
            <div class="ov-stage kernel-stage">
              <div class="ov-stage-title">内核态（ring0）</div>
              <div class="ov-boxes">
                <div class="ov-box kern">system_call<br><small>sys_call.s</small></div>
                <div class="ov-arrow-v">↓ EAX×4</div>
                <div class="ov-box kern">sys_call_table<br><small>函数指针数组</small></div>
                <div class="ov-arrow-v">↓</div>
                <div class="ov-box kern">sys_write()<br><small>kernel/sys.c</small></div>
                <div class="ov-arrow-v">↓ iret</div>
              </div>
            </div>
            <div class="ov-boundary">
              <div class="ov-b-line" />
              <div class="ov-b-label">恢复现场<br>CPL 0→3</div>
              <div class="ov-b-line" />
            </div>
            <div class="ov-stage user-stage">
              <div class="ov-stage-title">返回用户态</div>
              <div class="ov-boxes">
                <div class="ov-box">EAX = 返回值<br><small>（写入字节数）</small></div>
              </div>
            </div>
          </div>
          <div class="ov-convention">
            <div class="ov-conv-title">系统调用约定（Linux 0.11）</div>
            <div class="ov-conv-table">
              <div v-for="c in callConvention" :key="c.reg" class="ov-conv-row">
                <span class="ov-conv-reg">{{ c.reg }}</span>
                <span class="ov-conv-desc">{{ c.desc }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- trap-gate: IDT陷阱门 -->
        <div v-else-if="step.scene === 'trap-gate'" class="s-trap-gate">
          <div class="tg-title">IDT[0x80]：系统调用陷阱门</div>
          <div class="tg-gate">
            <div class="tg-field wide">
              <div class="tg-f-label">Offset[31:16]</div>
              <div class="tg-f-val">system_call 高16位</div>
            </div>
            <div class="tg-field narrow">
              <div class="tg-f-label">P</div>
              <div class="tg-f-val">1</div>
            </div>
            <div class="tg-field narrow highlight-dpl">
              <div class="tg-f-label">DPL</div>
              <div class="tg-f-val dpl-3">3</div>
            </div>
            <div class="tg-field narrow">
              <div class="tg-f-label">Type</div>
              <div class="tg-f-val">0xF</div>
            </div>
            <div class="tg-field narrow">
              <div class="tg-f-label">Sel</div>
              <div class="tg-f-val">0x08</div>
            </div>
            <div class="tg-field wide">
              <div class="tg-f-label">Offset[15:0]</div>
              <div class="tg-f-val">system_call 低16位</div>
            </div>
          </div>
          <div class="tg-key-points">
            <div class="tg-point">
              <span class="tg-point-key">DPL = 3</span>
              <span class="tg-point-val">允许用户态（CPL=3）触发 int 0x80，若 DPL=0 则会触发 #GP 异常</span>
            </div>
            <div class="tg-point">
              <span class="tg-point-key">Type = 0xF</span>
              <span class="tg-point-val">Trap Gate（陷阱门），与 Interrupt Gate 的区别：不自动清 IF 标志</span>
            </div>
            <div class="tg-point">
              <span class="tg-point-key">Sel = 0x08</span>
              <span class="tg-point-val">跳转目标在内核代码段（GDT[1]），CS 切换为 0x08</span>
            </div>
          </div>
          <div class="tg-init-code">
            <div class="tg-init-title">初始化位置：trap_init()</div>
            <pre class="tg-code">/* kernel/traps.c */
set_system_gate(0x80,
  &system_call);

/* include/asm/system.h */
#define set_system_gate(n,addr) \
  _set_gate(&idt[n], 15, 3, addr)
/* Type=15=0xF，DPL=3 */</pre>
          </div>
        </div>

        <!-- privilege-switch: 特权级切换 -->
        <div v-else-if="step.scene === 'privilege-switch'" class="s-priv-switch">
          <div class="ps-title">int 0x80 触发：CPL 3→0，栈自动切换</div>
          <div class="ps-diagram">
            <div class="ps-side user-side" :class="{ 'ps-dim': privSwitchDone }">
              <div class="ps-side-title">用户态</div>
              <div class="ps-reg-list">
                <div class="ps-reg">CS = 0x0F <span class="ps-cpl-badge u">CPL=3</span></div>
                <div class="ps-reg">SS = 0x17</div>
                <div class="ps-reg ps-esp-reg">ESP = 0xBFFFF000</div>
              </div>
              <div class="ps-stack-mini">
                <div class="ps-sm-title">用户栈（SS:ESP）</div>
                <div class="ps-sm-item">...</div>
              </div>
            </div>

            <div class="ps-arrow-col">
              <div class="ps-int-label">int 0x80</div>
              <div class="ps-arrow" :class="{ 'ps-arrow-active': privSwitchSub >= 1 }">→</div>
              <div class="ps-steps-list">
                <div class="ps-step-item" :class="{ 'ps-s-done': privSwitchSub >= 1 }">① 查 IDT[0x80]</div>
                <div class="ps-step-item" :class="{ 'ps-s-done': privSwitchSub >= 2 }">② 从 TSS 取 esp0/ss0</div>
                <div class="ps-step-item" :class="{ 'ps-s-done': privSwitchSub >= 3 }">③ 切换到内核栈</div>
                <div class="ps-step-item" :class="{ 'ps-s-done': privSwitchSub >= 4 }">④ CS → 0x08 CPL=0</div>
                <div class="ps-step-item" :class="{ 'ps-s-done': privSwitchSub >= 5 }">⑤ 跳转 system_call</div>
              </div>
            </div>

            <div class="ps-side kernel-side" :class="{ 'ps-highlight': privSwitchDone }">
              <div class="ps-side-title">内核态</div>
              <div class="ps-reg-list">
                <div class="ps-reg">CS = 0x08 <span class="ps-cpl-badge k">CPL=0</span></div>
                <div class="ps-reg">SS = TSS.ss0 = 0x10</div>
                <div class="ps-reg ps-esp-reg">ESP = TSS.esp0</div>
              </div>
              <div class="ps-stack-mini">
                <div class="ps-sm-title">内核栈（esp0）</div>
                <div v-for="item in privKernStack" :key="item" class="ps-sm-item" :class="{ 'ps-sm-new': privSwitchSub >= 4 }">{{ item }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- kernel-stack: 内核栈布局 -->
        <div v-else-if="step.scene === 'kernel-stack'" class="s-kernel-stack">
          <div class="ks-title">系统调用入口时内核栈完整布局</div>
          <div class="ks-stack">
            <div class="ks-section-label">↑ 高地址（内核栈底）</div>
            <div
              v-for="(item, i) in kernelStackItems"
              :key="item.label"
              class="ks-item"
              :class="[item.cls, { 'ks-item-appear': ksAnimIdx > i }]"
            >
              <div class="ks-item-label">{{ item.label }}</div>
              <div class="ks-item-val">{{ item.val }}</div>
              <div class="ks-item-who">{{ item.who }}</div>
            </div>
            <div class="ks-esp-line">← ESP（system_call入口时）</div>
            <div class="ks-section-label">↓ 低地址（栈顶）</div>
          </div>
          <div class="ks-note">
            硬件自动压入5项（切换特权级时），system_call 汇编再压入其余寄存器，构成完整的"中断帧"
          </div>
        </div>

        <!-- syscall-dispatch: system_call 汇编流程 -->
        <div v-else-if="step.scene === 'syscall-dispatch'" class="s-dispatch">
          <div class="disp-title">system_call：汇编入口，保存现场 → 分发</div>
          <div class="disp-flow">
            <div
              v-for="(s, i) in dispatchSteps"
              :key="i"
              class="disp-step"
              :class="{ 'disp-active': dispAnimIdx === i, 'disp-done': dispAnimIdx > i }"
            >
              <span class="disp-num">{{ i+1 }}</span>
              <span class="disp-asm" :class="s.cls">{{ s.asm }}</span>
              <span class="disp-desc">{{ s.desc }}</span>
            </div>
          </div>
        </div>

        <!-- syscall-table: sys_call_table 可视化 -->
        <div v-else-if="step.scene === 'syscall-table'" class="s-syscall-table">
          <div class="sct-title">sys_call_table[EAX × 4] → 函数指针</div>
          <div class="sct-eax">
            当前 EAX = <strong class="sct-eax-val">{{ step.regs.find(r=>r.name==='EAX')?.val }}</strong>
            → 调用 <strong class="sct-fn">{{ sctHighlight.fn }}</strong>
          </div>
          <div class="sct-grid">
            <div
              v-for="e in syscallEntries" :key="e.nr"
              class="sct-entry"
              :class="{ 'sct-active': e.nr === sctActiveNr, 'sct-dim': e.nr !== sctActiveNr }"
            >
              <span class="sct-nr">{{ e.nr }}</span>
              <span class="sct-name">{{ e.name }}</span>
            </div>
          </div>
        </div>

        <!-- params: 参数传递 -->
        <div v-else-if="step.scene === 'params'" class="s-params">
          <div class="par-title">参数传递约定：寄存器传参，EAX 返回</div>
          <div class="par-example">
            <div class="par-ex-title">示例：write(1, "hello", 5)</div>
            <div class="par-regs">
              <div v-for="r in writeParamRegs" :key="r.reg" class="par-reg-row"
                   :class="{ 'par-reg-active': parAnimIdx >= r.order }">
                <div class="par-reg-badge">{{ r.reg }}</div>
                <div class="par-reg-val">{{ r.val }}</div>
                <div class="par-reg-desc">{{ r.desc }}</div>
              </div>
            </div>
          </div>
          <div class="par-libc">
            <div class="par-libc-title">libc 的包装（glibc/newlib 类似）</div>
            <pre class="par-code">/* 用户态调用 write(1,"hello",5) */
_syscall3(int, write,
  int,  fd,    /* EBX=1     */
  const char*, buf, /* ECX="hello" */
  int,  count) /* EDX=5     */
/* 展开后：
 * movl $4, %eax  (NR_write=4)
 * movl fd,  %ebx
 * movl buf, %ecx
 * movl count,%edx
 * int  $0x80
 * ret (eax=返回值)
 */</pre>
          </div>
        </div>

        <!-- sys-write: write 调用链 -->
        <div v-else-if="step.scene === 'sys-write'" class="s-syswrite">
          <div class="sw-title">write() 完整调用链</div>
          <div class="sw-chain">
            <div
              v-for="(node, i) in writeChain"
              :key="i"
              class="sw-node"
              :class="[node.cls, { 'sw-node-active': writeAnimIdx >= i }]"
            >
              <div class="sw-node-name">{{ node.name }}</div>
              <div class="sw-node-file">{{ node.file }}</div>
              <div v-if="node.note" class="sw-node-note">{{ node.note }}</div>
            </div>
          </div>
        </div>

        <!-- sys-fork: fork 调用链 -->
        <div v-else-if="step.scene === 'sys-fork'" class="s-sysfork">
          <div class="sf-title">fork() 系统调用：创建子进程</div>
          <div class="sf-flow">
            <div
              v-for="(node, i) in forkChain"
              :key="i"
              class="sf-node"
              :class="[node.cls, { 'sf-active': forkAnimIdx >= i }]"
            >
              <div class="sf-node-main">{{ node.name }}</div>
              <div class="sf-node-sub">{{ node.file }}</div>
              <div v-if="node.detail" class="sf-node-detail">{{ node.detail }}</div>
            </div>
          </div>
          <div class="sf-result" v-if="forkAnimIdx >= forkChain.length">
            父进程返回子进程 pid，子进程返回 0（通过修改内核栈上的 EAX）
          </div>
        </div>

        <!-- iret: 返回用户态 -->
        <div v-else-if="step.scene === 'iret'" class="s-iret">
          <div class="ir-title">iret：从内核态返回用户态</div>
          <div class="ir-flow">
            <div class="ir-step" :class="{ 'ir-done': iretSub >= 1 }">
              <span class="ir-num">①</span> sys_xxx() 执行完，返回值存入 EAX
            </div>
            <div class="ir-step" :class="{ 'ir-done': iretSub >= 2 }">
              <span class="ir-num">②</span> system_call 将 EAX 压栈（作为返回值）
            </div>
            <div class="ir-step" :class="{ 'ir-done': iretSub >= 3 }">
              <span class="ir-num">③</span> 恢复 EBX/ECX/EDX/FS/ES/DS
            </div>
            <div class="ir-step" :class="{ 'ir-done': iretSub >= 4 }">
              <span class="ir-num">④</span> iret：弹出 EIP/CS/EFLAGS/ESP/SS → 回到用户态
            </div>
            <div class="ir-step" :class="{ 'ir-done': iretSub >= 5 }">
              <span class="ir-num">⑤</span> CPL 恢复 3，用户程序从 int 0x80 后的指令继续执行
            </div>
          </div>
          <div class="ir-before-after">
            <div class="ir-col">
              <div class="ir-col-title">内核态（ring0）</div>
              <div class="ir-reg-list">
                <div class="ir-reg">CS = 0x08（CPL=0）</div>
                <div class="ir-reg">SS = 0x10</div>
                <div class="ir-reg">EAX = 返回值</div>
              </div>
            </div>
            <div class="ir-arrow" :class="{ 'ir-arrow-go': iretSub >= 4 }">iret →</div>
            <div class="ir-col">
              <div class="ir-col-title">用户态（ring3）</div>
              <div class="ir-reg-list">
                <div class="ir-reg">CS = 0x0F（CPL=3）</div>
                <div class="ir-reg">SS = 0x17</div>
                <div class="ir-reg" style="color:#67c23a">EAX = 写入字节数</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：源码 -->
      <div class="sc-right">
        <div class="panel-title">源码参考</div>
        <div class="rp-code-title">{{ step.srcRef }}</div>
        <pre class="rp-code-block">{{ step.code }}</pre>
      </div>
    </div>

    <!-- 控制 -->
    <div class="controls">
      <el-button @click="goStep(currentIdx-1)" :disabled="currentIdx===0" size="small">← 上一步</el-button>
      <el-button @click="togglePlay" :type="playing?'warning':'primary'" size="small">
        {{ playing ? '⏸ 暂停' : '▶ 自动播放' }}
      </el-button>
      <el-button @click="goStep(currentIdx+1)" :disabled="currentIdx===steps.length-1" size="small">下一步 →</el-button>
      <el-button @click="reset" size="small">重置</el-button>
      <span style="margin-left:12px;font-size:13px;color:#909399">{{ currentIdx+1 }} / {{ steps.length }}</span>
    </div>

    <!-- 详情卡片 -->
    <div class="detail-card">
      <div class="dc-header">
        <el-tag type="info" size="small" style="font-family:monospace">{{ step.srcRef }}</el-tag>
        <span class="dc-title">{{ step.title }}</span>
        <el-tag :type="step.tagType||'primary'" size="small">{{ step.phase }}</el-tag>
      </div>
      <div class="dc-detail">{{ step.detail }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

const phases = [
  { name: '总览',     file: 'int 0x80',        startStep: 0 },
  { name: '陷阱门',   file: 'kernel/traps.c',  startStep: 1 },
  { name: '内核分发', file: 'kernel/sys_call.s',startStep: 3 },
  { name: '典型调用', file: 'kernel/sys.c',     startStep: 6 },
  { name: '返回',    file: 'iret',             startStep: 8 },
]

// ─── 步骤 ─────────────────────────────────────────────────────
const steps = [
  // Phase 0
  {
    phaseIdx: 0, phase: '总览', tagType: 'info',
    title: 'int 0x80：用户态与内核态之间的唯一通道',
    srcRef: 'kernel/sys_call.s:1',
    scene: 'overview', cpl: 3,
    explain: 'Linux 0.11 全部 72 个系统调用共用一个入口 int 0x80。EAX=调用号，EBX/ECX/EDX 传参，EAX 返回结果。',
    detail: '系统调用是用户态程序请求内核服务的唯一合法途径。int 0x80 是一条软中断指令，触发 CPU 查 IDT[0x80]，发现陷阱门，完成特权级从 ring3 切换到 ring0，同时切换到进程的内核栈（来自 TSS.esp0）。整个切换过程完全由硬件完成，软件只需设置好寄存器再执行一条 int 指令。Linux 0.11 共有 72 个系统调用，从 sys_exit(1) 到 sys_sysinfo(116)，全部通过 sys_call_table 分发。',
    regs: [
      { name: 'CPL',  val: '3',            cls: 'reg-user' },
      { name: 'EAX',  val: 'syscall nr',   cls: '' },
      { name: 'EBX',  val: 'arg1',         cls: '' },
      { name: 'ECX',  val: 'arg2',         cls: '' },
      { name: 'EDX',  val: 'arg3',         cls: '' },
    ],
    stack: [{ label: 'local vars', val: '...' }, { label: 'args', val: '...' }],
    code: `/* include/linux/sys.h */
fn_ptr sys_call_table[] = {
  sys_setup,    /* 0 */
  sys_exit,     /* 1 */
  sys_fork,     /* 2 */
  sys_read,     /* 3 */
  sys_write,    /* 4 */
  sys_open,     /* 5 */
  sys_close,    /* 6 */
  sys_waitpid,  /* 7 */
  ...
  /* 共 72 个 */
};
#define NR_syscalls 72`,
  },

  // Phase 1: 陷阱门
  {
    phaseIdx: 1, phase: '陷阱门', tagType: 'warning',
    title: 'IDT[0x80]：DPL=3 的陷阱门，允许用户态触发',
    srcRef: 'kernel/traps.c:181',
    scene: 'trap-gate', cpl: 3,
    explain: '陷阱门与中断门的区别：陷阱门不清除 EFLAGS.IF（中断标志），即进入系统调用后 CPU 仍响应硬件中断。DPL=3 是关键——允许 ring3 程序触发，否则会 #GP。',
    detail: 'IDT（Interrupt Descriptor Table）有 256 个门描述符。int 0x80 对应 IDT[128]。trap_init() 用 set_system_gate() 设置它，DPL=3 意味着用户态程序可以触发这个中断。如果 DPL=0，用户程序执行 int 0x80 时 CPU 会产生 #GP（通用保护异常）。陷阱门（Type=0xF=15）与中断门（Type=0xE=14）的区别是：陷阱门保留 EFLAGS.IF 不变，系统调用执行期间仍可被中断打断（这是有意设计的，保证实时性）。',
    regs: [
      { name: 'CPL',  val: '3', cls: 'reg-user' },
      { name: 'EAX',  val: '4 (NR_write)', cls: 'reg-highlight' },
      { name: 'EBX',  val: '1 (fd)',       cls: '' },
      { name: 'ECX',  val: '0xBFFFF100',   cls: '' },
      { name: 'EDX',  val: '5 (count)',    cls: '' },
    ],
    stack: [{ label: 'return addr', val: '0x08049XXX' }],
    code: `/* kernel/traps.c:181 */
void trap_init(void) {
  ...
  set_system_gate(0x80,
    &system_call);
}

/* include/asm/system.h */
#define set_system_gate(n,addr) \
  _set_gate(&idt[n],15,3,addr)
/*              ↑  ↑
 *       Type=15   DPL=3
 *       (Trap)    (user ok)
 */
#define _set_gate(gate,type,dpl,addr) \
 __asm__("movw %%dx,%%ax\n\t" \
  "movw %0,%%dx\n\t"          \
  "movl %%eax,%1\n\t"         \
  "movl %%edx,%2"             \
  ::"i"((short)(0x8000+(dpl<<13)\
    +(type<<8))),              \
  "o"(*((char*)(gate))),      \
  "o"(*(4+(char*)(gate))),    \
  "d"((char*)(addr)),         \
  "a"(0x00080000))`,
  },

  {
    phaseIdx: 1, phase: '陷阱门', tagType: 'warning',
    title: 'int 0x80 触发：CPL 3→0，自动切换到内核栈',
    srcRef: 'kernel/sys_call.s:20',
    scene: 'privilege-switch', cpl: 0,
    explain: '执行 int 0x80 的瞬间，CPU 完成5步硬件操作，无需任何软件干预。内核栈地址来自当前进程 TSS 的 esp0/ss0 字段。',
    detail: '特权级切换时 CPU 自动做5件事：① 查 IDT[0x80] 取得目标 CS:EIP 和 DPL；② 检查 CPL ≤ DPL（3≤3 通过）；③ 从当前进程的 TSS 中取出 esp0/ss0 作为新的内核栈；④ 将用户态的 SS/ESP/EFLAGS/CS/EIP 依次压入内核栈（发生了跨特权级，所以还要保存 SS/ESP）；⑤ 跳转到 system_call。这5步是原子的，不可被中断。切换后 CPL=0，所有内核代码和数据都可访问。',
    regs: [
      { name: 'CPL',  val: '0',          cls: 'reg-kernel' },
      { name: 'CS',   val: '0x08',       cls: 'reg-kernel' },
      { name: 'SS',   val: '0x10 (TSS.ss0)', cls: 'reg-kernel' },
      { name: 'ESP',  val: 'TSS.esp0',   cls: 'reg-kernel' },
      { name: 'EAX',  val: '4 (NR_write)', cls: 'reg-highlight' },
    ],
    stack: [
      { label: 'SS_user',  val: '0x17',         isNew: true },
      { label: 'ESP_user', val: '0xBFFFF0FC',   isNew: true },
      { label: 'EFLAGS',   val: '0x00000246',   isNew: true },
      { label: 'CS_user',  val: '0x0F',         isNew: true },
      { label: 'EIP_user', val: '0x08049ABC',   isNew: true },
    ],
    code: `/* CPU 硬件自动执行（无软件干预）:
 *
 * 1. 查 IDT[0x80] → Trap Gate
 * 2. 检查 CPL(3) <= DPL(3) ✓
 * 3. 从 TSS 取内核栈:
 *      new_SS  = TSS.ss0  = 0x10
 *      new_ESP = TSS.esp0
 * 4. 切换到内核栈，依次压入:
 *      push SS_user   (0x17)
 *      push ESP_user
 *      push EFLAGS
 *      push CS_user   (0x0F)
 *      push EIP_user  (下条指令)
 * 5. CS = 0x08 (CPL→0)
 *    EIP = system_call 地址
 *    跳转执行
 */`,
  },

  // Phase 2: 内核分发
  {
    phaseIdx: 2, phase: '内核分发', tagType: 'success',
    title: '内核栈完整布局：硬件压5项 + system_call 再压6项',
    srcRef: 'kernel/sys_call.s:22',
    scene: 'kernel-stack', cpl: 0,
    explain: '进入 system_call 后，汇编代码保存剩余寄存器，形成完整的"中断帧"。这些数据是返回用户态时恢复现场的依据，也是 fork() 实现子进程的关键（复制这个帧）。',
    detail: '内核栈上的布局从高地址到低地址：硬件压入的5项（SS/ESP/EFLAGS/CS/EIP）+ system_call 压入的 DS/ES/FS/EDX/ECX/EBX/返回值(EAX)。整个结构称为"pt_regs"（processor registers），fork() 时 copy_process() 复制整个内核栈，并把子进程帧中的 EAX 改为0，这样子进程 iret 后 EAX=0，父进程 EAX=child_pid，实现了 fork 的语义。',
    regs: [
      { name: 'CPL',  val: '0', cls: 'reg-kernel' },
      { name: 'ESP',  val: 'esp0-44',  cls: 'reg-kernel' },
      { name: 'EAX',  val: '4',        cls: 'reg-highlight' },
      { name: 'EBX',  val: '1',        cls: '' },
      { name: 'ECX',  val: '0xBFFFF100', cls: '' },
    ],
    stack: [
      { label: 'SS_user',  val: '0x17',       isNew: false },
      { label: 'ESP_user', val: '0xBFFFF0FC', isNew: false },
      { label: 'EFLAGS',   val: '0x00000246', isNew: false },
      { label: 'CS_user',  val: '0x0F',       isNew: false },
      { label: 'EIP_user', val: '0x08049ABC', isNew: false },
      { label: 'DS',       val: '0x10',       isNew: true  },
      { label: 'ES',       val: '0x10',       isNew: true  },
      { label: 'FS',       val: '0x17',       isNew: true  },
      { label: 'EDX',      val: '5',          isNew: true  },
      { label: 'ECX',      val: '0xBFFFF100', isNew: true  },
      { label: 'EBX',      val: '1',          isNew: true  },
    ],
    code: `/* kernel/sys_call.s:22 */
system_call:
  cmpl $nr_system_calls-1,%eax
  ja bad_sys_call
  push %ds        /* 保存段寄存器 */
  push %es
  push %fs
  pushl %edx      /* 保存参数寄存器 */
  pushl %ecx
  pushl %ebx
  movl $0x10,%edx /* kernel DS */
  mov %dx,%ds
  mov %dx,%es
  movl $0x17,%edx /* fs→用户数据段 */
  mov %dx,%fs
  /* 调用具体系统调用 */
  call sys_call_table(,%eax,4)
  pushl %eax      /* 保存返回值 */`,
  },

  {
    phaseIdx: 2, phase: '内核分发', tagType: 'success',
    title: 'system_call：call sys_call_table(,%eax,4) 分发',
    srcRef: 'kernel/sys_call.s:35',
    scene: 'syscall-dispatch', cpl: 0,
    explain: 'system_call 汇编核心：一条 call 指令，以 EAX 为下标在 sys_call_table 中找到对应函数指针调用。×4 是因为函数指针占4字节。',
    detail: '`call sys_call_table(,%eax,4)` 等价于 `call *(sys_call_table + eax*4)`，这是 x86 的比例变址寻址。EAX=4 就调用 sys_call_table[4] = sys_write。调用完成后，EAX 保存着系统调用的返回值，system_call 将其压栈留给 iret 前恢复。中间还有信号检查（ret_from_sys_call）和调度检查（need_resched）的逻辑。',
    regs: [
      { name: 'CPL',  val: '0',   cls: 'reg-kernel' },
      { name: 'EAX',  val: '4 → sys_write', cls: 'reg-highlight' },
      { name: 'DS',   val: '0x10 (kernel)', cls: 'reg-kernel' },
      { name: 'FS',   val: '0x17 (user)',   cls: '' },
    ],
    stack: [
      { label: '...（硬件压入）', val: '' },
      { label: 'EBX/ECX/EDX', val: '1/buf/5' },
    ],
    code: `/* kernel/sys_call.s 完整流程 */
system_call:
  /* 1. 校验调用号 */
  cmpl $nr_system_calls-1,%eax
  ja bad_sys_call

  /* 2. 保存现场 */
  push %ds; push %es; push %fs
  pushl %edx; pushl %ecx; pushl %ebx

  /* 3. 切换内核段 */
  movl $0x10,%edx; mov %dx,%ds
  mov %dx,%es
  movl $0x17,%edx; mov %dx,%fs

  /* 4. 分发！ */
  call sys_call_table(,%eax,4)
  pushl %eax  /* 保存返回值 */

  /* 5. ret_from_sys_call: */
  /* 检查信号、need_resched */
  movl current,%eax
  cmpl $0,state(%eax)
  jne reschedule
  cmpl $0,counter(%eax)
  je reschedule`,
  },

  {
    phaseIdx: 2, phase: '内核分发', tagType: 'success',
    title: 'sys_call_table：函数指针数组，EAX 直接索引',
    srcRef: 'include/linux/sys.h:1',
    scene: 'syscall-table', cpl: 0,
    explain: 'sys_call_table 是一个 fn_ptr 数组（函数指针），下标就是系统调用号。EAX=4 直接取第4项 = sys_write 的地址。这是 Linux 最简洁的分发机制。',
    detail: '`fn_ptr sys_call_table[]` 在 kernel/sys_call.s 中被引用，函数指针数组在链接时由 include/linux/sys.h 定义。Linux 0.11 共有72个系统调用，编号1-72（0是sys_setup，通常不被用户直接调用）。系统调用号是 ABI（应用二进制接口）的一部分，一旦发布就不能改变——改变编号会破坏所有已编译的程序。这就是为什么 Linux 系统调用号一直保持向后兼容。',
    regs: [
      { name: 'CPL',  val: '0',          cls: 'reg-kernel' },
      { name: 'EAX',  val: '4',          cls: 'reg-highlight' },
      { name: '目标', val: 'sys_write()', cls: 'reg-highlight' },
    ],
    stack: [{ label: 'kernel stack', val: '...' }],
    code: `/* include/linux/sys.h */
typedef int (*fn_ptr)();

fn_ptr sys_call_table[] = {
  sys_setup,    /* EAX=0  */
  sys_exit,     /* EAX=1  */
  sys_fork,     /* EAX=2  */
  sys_read,     /* EAX=3  */
  sys_write,    /* EAX=4 ← */
  sys_open,     /* EAX=5  */
  sys_close,    /* EAX=6  */
  sys_waitpid,  /* EAX=7  */
  sys_creat,    /* EAX=8  */
  sys_link,     /* EAX=9  */
  sys_unlink,   /* EAX=10 */
  sys_execve,   /* EAX=11 */
  sys_chdir,    /* EAX=12 */
  ...
};`,
  },

  // Phase 3: 典型调用
  {
    phaseIdx: 3, phase: '典型调用', tagType: 'danger',
    title: '参数传递：EBX/ECX/EDX 传参，EAX 返回值',
    srcRef: 'include/unistd.h:30',
    scene: 'params', cpl: 0,
    explain: 'Linux 0.11 系统调用最多3个参数（EBX/ECX/EDX），返回值存 EAX。超过3个参数的系统调用（如 mmap）用指针传结构体。FS 段寄存器指向用户数据段，内核用它访问用户传来的指针。',
    detail: '`_syscall3` 宏展开为内联汇编，把参数分别放入 EBX/ECX/EDX，调用号放 EAX，然后 int 0x80。内核中 sys_write() 直接读这些寄存器（已被 system_call 压栈，通过 pt_regs 访问）。FS 指向用户数据段（0x17）是关键：内核不能直接用 DS 访问用户指针（DS=0x10 内核段），必须用 FS（用户段）。get_fs_byte() / put_fs_byte() 就是利用 FS 段来读写用户内存的辅助函数。',
    regs: [
      { name: 'EAX', val: '4 (NR_write)',    cls: 'reg-highlight' },
      { name: 'EBX', val: '1 (fd=stdout)',   cls: '' },
      { name: 'ECX', val: '0xBFFFF100 (buf)',cls: '' },
      { name: 'EDX', val: '5 (count)',       cls: '' },
      { name: 'FS',  val: '0x17 (用户段)',   cls: '' },
    ],
    stack: [{ label: 'kernel frame', val: '...' }],
    code: `/* include/unistd.h:30 */
#define _syscall3(type,name,  \
  atype,a,btype,b,ctype,c)    \
type name(atype a,btype b,    \
          ctype c) {           \
  long __res;                 \
  __asm__ volatile (          \
    "int $0x80"               \
    : "=a" (__res)            \
    : "0" (__NR_##name),      \
      "b" ((long)(a)),        \
      "c" ((long)(b)),        \
      "d" ((long)(c)));       \
  if (__res>=0) return __res; \
  errno=-__res;               \
  return -1;                  \
}
/* 用法：
 * _syscall3(int,write,
 *   int,fd,
 *   const char*,buf,
 *   int,count)
 */`,
  },

  {
    phaseIdx: 3, phase: '典型调用', tagType: 'danger',
    title: 'sys_write()：从内核栈取参数，调用文件系统写入',
    srcRef: 'kernel/sys.c:8',
    scene: 'sys-write', cpl: 0,
    explain: 'sys_write() 根据文件描述符 fd 找到 filp[]，再根据文件类型（字符设备/块设备/普通文件）分派到对应的写入函数。终端输出最终调用 tty_write()。',
    detail: 'sys_write(fd, buf, count) 的执行路径：① 用 fd 在 current->filp[] 找到 file 结构体；② 检查 f_mode 是否可写；③ 根据 f_inode->i_mode 判断文件类型（S_ISCHR/S_ISBLK/S_ISREG）；④ 字符设备走 rw_char()，fd=1(stdout)最终调用 tty_write() → 写入终端缓冲区 → 屏幕输出；⑤ 普通文件走 file_write() → 找 inode 对应的数据块 → bmap() → bread() → 写入缓冲区。返回实际写入字节数存入 EAX。',
    regs: [
      { name: 'CPL',  val: '0', cls: 'reg-kernel' },
      { name: 'EAX',  val: '5 (返回值)', cls: 'reg-highlight' },
      { name: 'EBX',  val: '1 (fd)',     cls: '' },
      { name: 'ECX',  val: 'buf ptr',    cls: '' },
      { name: 'EDX',  val: '5 (count)',  cls: '' },
    ],
    stack: [{ label: 'kernel frame', val: '...' }],
    code: `/* kernel/sys.c:8 */
int sys_write(unsigned int fd,
  char * buf, int count) {
  struct file * file;
  struct m_inode * inode;

  if (fd >= NR_OPEN ||
      !(file=current->filp[fd]))
    return -EBADF;
  if (!count) return 0;
  inode = file->f_inode;

  if (inode->i_pipe)
    return (file->f_mode&2)
      ? write_pipe(inode,buf,count)
      : -EBADF;
  if (S_ISCHR(inode->i_mode))
    return rw_char(WRITE,
      inode->i_zone[0],buf,count,
      &file->f_pos);
  if (S_ISBLK(inode->i_mode))
    return block_write(
      inode->i_zone[0],
      &file->f_pos,buf,count);
  if (S_ISREG(inode->i_mode))
    return file_write(
      inode,file,buf,count);
  return -EINVAL;
}`,
  },

  // Phase 4: 返回
  {
    phaseIdx: 4, phase: '返回', tagType: 'info',
    title: 'iret：弹出硬件帧，CPL 0→3，恢复用户态执行',
    srcRef: 'kernel/sys_call.s:60',
    scene: 'iret', cpl: 3,
    explain: 'iret（Interrupt Return）是 int 的逆操作：依次弹出 EIP/CS/EFLAGS（同特权级）或 EIP/CS/EFLAGS/ESP/SS（跨特权级）。弹出 CS 时 CPL 自动恢复为 ring3。',
    detail: 'system_call 在调用完 sys_xxx 后，先检查当前进程是否需要调度（counter=0 或 need_resched 标志），若需要先调用 schedule()（可能切换到其他进程）。之后检查待处理的信号（do_signal）。最后才执行 iret 返回用户态。整个 sys_call.s 只有约100行汇编，却是 Linux 内核中最被频繁执行的代码路径，其性能直接影响整个系统的系统调用开销。',
    regs: [
      { name: 'CPL',  val: '3（已恢复）', cls: 'reg-user' },
      { name: 'CS',   val: '0x0F',       cls: 'reg-user' },
      { name: 'EAX',  val: '5（返回值）', cls: 'reg-highlight' },
      { name: 'ESP',  val: 'ESP_user（已恢复）', cls: 'reg-user' },
      { name: 'SS',   val: '0x17',       cls: 'reg-user' },
    ],
    stack: [{ label: 'user stack', val: '（已恢复）' }],
    code: `/* kernel/sys_call.s:60 */
ret_from_sys_call:
  movl current,%eax
  /* 检查是否需要调度 */
  cmpl $0,state(%eax)
  jne reschedule
  cmpl $0,counter(%eax)
  je reschedule
  /* 检查并处理信号 */
  movl signal(%eax),%ebx
  movl blocked(%eax),%ecx
  notl %ecx
  andl %ebx,%ecx
  bsfl %ecx,%ecx
  je 3f
  btrl %ecx,%ebx
  movl %ebx,signal(%eax)
  incl %ecx
  pushl %ecx
  call do_signal    /* 信号处理 */
  popl %ecx
3:
  popl %eax    /* 系统调用返回值 */
  popl %ebx; popl %ecx; popl %edx
  pop %fs; pop %es; pop %ds
  iret         /* 返回用户态 ← */`,
  },
]

// ─── 状态 ──────────────────────────────────────────────────────
const currentIdx = ref(0)
const playing = ref(false)
const changedRegs = ref(new Set())
const privSwitchSub = ref(0)
const privSwitchDone = ref(false)
const ksAnimIdx = ref(0)
const dispAnimIdx = ref(0)
const parAnimIdx = ref(0)
const writeAnimIdx = ref(0)
const forkAnimIdx = ref(0)
const iretSub = ref(0)

let playTimer = null
let subTimer = null

// ─── Computed ──────────────────────────────────────────────────
const step = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => step.value.phaseIdx)

const sceneTitle = computed(() => ({
  'overview':          '系统调用整体流程',
  'trap-gate':         'IDT[0x80] 陷阱门结构',
  'privilege-switch':  'int 0x80 触发：特权级切换',
  'kernel-stack':      '内核栈完整布局',
  'syscall-dispatch':  'system_call 汇编分发流程',
  'syscall-table':     'sys_call_table 可视化',
  'params':            '参数传递约定',
  'sys-write':         'write() 完整调用链',
  'sys-fork':          'fork() 系统调用',
  'iret':              'iret 返回用户态',
}[step.value.scene] || ''))

// 系统调用表高亮
const sctActiveNr = computed(() => {
  const r = step.value.regs.find(r => r.name === 'EAX')
  const n = r ? parseInt(r.val) : -1
  return isNaN(n) ? -1 : n
})
const sctHighlight = computed(() => {
  const m = { 1:'sys_exit', 2:'sys_fork', 3:'sys_read', 4:'sys_write', 5:'sys_open' }
  return { fn: m[sctActiveNr.value] || `sys_call_table[${sctActiveNr.value}]` }
})

// ─── 静态数据 ──────────────────────────────────────────────────
const callConvention = [
  { reg: 'EAX', desc: '系统调用号（NR_xxx），返回值也在 EAX' },
  { reg: 'EBX', desc: '第1个参数 arg1' },
  { reg: 'ECX', desc: '第2个参数 arg2' },
  { reg: 'EDX', desc: '第3个参数 arg3（最多3个）' },
  { reg: 'FS',  desc: '指向用户数据段（0x17），内核用它访问用户指针' },
]

const syscallEntries = [
  { nr:1,  name:'sys_exit'    },{ nr:2,  name:'sys_fork'    },
  { nr:3,  name:'sys_read'    },{ nr:4,  name:'sys_write'   },
  { nr:5,  name:'sys_open'    },{ nr:6,  name:'sys_close'   },
  { nr:7,  name:'sys_waitpid' },{ nr:8,  name:'sys_creat'   },
  { nr:9,  name:'sys_link'    },{ nr:10, name:'sys_unlink'  },
  { nr:11, name:'sys_execve'  },{ nr:12, name:'sys_chdir'   },
  { nr:13, name:'sys_time'    },{ nr:14, name:'sys_mknod'   },
  { nr:15, name:'sys_chmod'   },{ nr:16, name:'sys_chown'   },
]

const privKernStack = ['EIP_user', 'CS_user(0x0F)', 'EFLAGS', 'ESP_user', 'SS_user(0x17)']

const kernelStackItems = [
  { label: 'SS_user',   val: '0x17',       who: '硬件（跨特权级）', cls: 'ks-hw' },
  { label: 'ESP_user',  val: '0xBFFFF0FC', who: '硬件',           cls: 'ks-hw' },
  { label: 'EFLAGS',    val: '0x00000246', who: '硬件',           cls: 'ks-hw' },
  { label: 'CS_user',   val: '0x0F',       who: '硬件',           cls: 'ks-hw' },
  { label: 'EIP_user',  val: '0x08049ABC', who: '硬件',           cls: 'ks-hw' },
  { label: 'DS',        val: '0x17',       who: 'system_call',    cls: 'ks-sw' },
  { label: 'ES',        val: '0x17',       who: 'system_call',    cls: 'ks-sw' },
  { label: 'FS',        val: '0x17',       who: 'system_call',    cls: 'ks-sw' },
  { label: 'EDX',       val: '5',          who: 'system_call',    cls: 'ks-sw' },
  { label: 'ECX',       val: '0xBFFFF100', who: 'system_call',    cls: 'ks-sw' },
  { label: 'EBX',       val: '1',          who: 'system_call',    cls: 'ks-sw' },
]

const dispatchSteps = [
  { asm: 'cmpl $NR_syscalls-1,%eax', desc: '校验调用号合法性', cls: '' },
  { asm: 'push %ds / %es / %fs',     desc: '保存段寄存器',    cls: '' },
  { asm: 'pushl %edx/%ecx/%ebx',     desc: '保存参数寄存器',  cls: '' },
  { asm: 'movl $0x10,%edx; mov ds/es', desc: '切换 DS/ES 到内核段', cls: '' },
  { asm: 'movl $0x17,%edx; mov %dx,%fs', desc: 'FS 指向用户数据段', cls: '' },
  { asm: 'call sys_call_table(,%eax,4)', desc: '分发！以 EAX 为下标调用', cls: 'disp-key' },
  { asm: 'pushl %eax',               desc: '保存返回值',      cls: '' },
  { asm: '→ ret_from_sys_call',      desc: '信号检查 + 调度检查', cls: '' },
  { asm: 'iret',                     desc: '返回用户态',      cls: 'disp-key' },
]

const writeParamRegs = [
  { reg: 'EAX', val: '4 = NR_write',      desc: '系统调用号',    order: 1 },
  { reg: 'EBX', val: '1',                  desc: 'fd = stdout',  order: 2 },
  { reg: 'ECX', val: '0xBFFFF100 (buf)',   desc: '用户态缓冲区地址', order: 3 },
  { reg: 'EDX', val: '5',                  desc: 'count = 5字节', order: 4 },
  { reg: 'EAX', val: '← 5 (返回值)',       desc: '实际写入字节数', order: 5 },
]

const writeChain = [
  { name: 'write(1,"hello",5)',   file: 'libc 包装',           cls: 'wn-user',   note: 'int 0x80 → 陷入内核' },
  { name: 'system_call',          file: 'kernel/sys_call.s',   cls: 'wn-kern',   note: '保存现场 → call sys_write' },
  { name: 'sys_write(fd,buf,n)',  file: 'kernel/sys.c:8',      cls: 'wn-kern',   note: 'filp[fd] → inode → 判断类型' },
  { name: 'rw_char(WRITE,...)',   file: 'fs/char_dev.c',       cls: 'wn-kern',   note: 'fd=1 是字符设备(tty)' },
  { name: 'tty_write(tty,...)',   file: 'kernel/tty_io.c',     cls: 'wn-kern',   note: '写入 tty 输出缓冲区' },
  { name: '→ 屏幕输出',          file: 'drivers/chr_drv/',    cls: 'wn-hw',     note: '' },
]

const forkChain = [
  { name: 'fork()',             file: 'libc → int 0x80, EAX=2',   cls: 'fn-user', detail: '' },
  { name: 'sys_fork()',        file: 'kernel/sys_call.s',          cls: 'fn-kern', detail: '保存 current→EBX' },
  { name: 'copy_process(nr, …)', file: 'kernel/fork.c:56',        cls: 'fn-kern', detail: '分配新 task_struct + 内核栈' },
  { name: '复制 task_struct',   file: '*p = *current',             cls: 'fn-kern', detail: '浅拷贝父进程 PCB' },
  { name: '修改子进程字段',     file: 'pid/state/tss.eax=0',       cls: 'fn-kern', detail: 'tss.eax=0 → 子进程返回0' },
  { name: 'copy_mem()',         file: 'kernel/fork.c:29',          cls: 'fn-kern', detail: '设置子进程 LDT Base=nr×64MB' },
  { name: 'set_tss_desc() + set_ldt_desc()', file: '写入GDT', cls: 'fn-kern', detail: '在 GDT 注册新进程的 TSS/LDT' },
  { name: 'state=RUNNING',     file: '子进程就绪',                 cls: 'fn-done', detail: '父进程返回子进程pid，子进程返回0' },
]

// ─── Watch ─────────────────────────────────────────────────────
watch(currentIdx, (newIdx, oldIdx) => {
  // 寄存器闪烁
  const nr = steps[newIdx].regs.map(r => r.name)
  const or = (steps[oldIdx]?.regs || []).map(r => r.name)
  changedRegs.value = new Set(nr.filter((n, i) => {
    const nv = steps[newIdx].regs[i]?.val
    const ov = (steps[oldIdx]?.regs || []).find(r => r.name === n)?.val
    return nv !== ov
  }))
  setTimeout(() => { changedRegs.value = new Set() }, 900)

  // 重置动画
  clearTimeout(subTimer)
  privSwitchSub.value = 0; privSwitchDone.value = false
  ksAnimIdx.value = 0; dispAnimIdx.value = 0; parAnimIdx.value = 0
  writeAnimIdx.value = 0; forkAnimIdx.value = 0; iretSub.value = 0

  const scene = steps[newIdx].scene
  if (scene === 'privilege-switch') startPrivAnim()
  if (scene === 'kernel-stack') startKsAnim()
  if (scene === 'syscall-dispatch') startDispAnim()
  if (scene === 'params') startParAnim()
  if (scene === 'sys-write') startWriteAnim()
  if (scene === 'sys-fork') startForkAnim()
  if (scene === 'iret') startIretAnim()
})

function ticker(ref, max, delay, onDone) {
  let i = 0
  const tick = () => {
    i++; ref.value = i
    if (i < max) subTimer = setTimeout(tick, delay)
    else if (onDone) onDone()
  }
  subTimer = setTimeout(tick, 500)
}

function startPrivAnim() {
  ticker(privSwitchSub, 5, 600, () => { privSwitchDone.value = true })
}
function startKsAnim() {
  ticker(ksAnimIdx, kernelStackItems.length, 300)
}
function startDispAnim() {
  ticker(dispAnimIdx, dispatchSteps.length, 600)
}
function startParAnim() {
  ticker(parAnimIdx, writeParamRegs.length, 500)
}
function startWriteAnim() {
  ticker(writeAnimIdx, writeChain.length, 600)
}
function startForkAnim() {
  ticker(forkAnimIdx, forkChain.length + 1, 600)
}
function startIretAnim() {
  ticker(iretSub, 5, 700)
}

// ─── 导航 ─────────────────────────────────────────────────────
function goStep(idx) {
  if (idx < 0 || idx >= steps.length) return
  currentIdx.value = idx
}
function jumpToPhase(pi) { goStep(phases[pi].startStep) }
function togglePlay() {
  if (playing.value) { clearInterval(playTimer); playing.value = false }
  else {
    playing.value = true
    playTimer = setInterval(() => {
      if (currentIdx.value < steps.length - 1) goStep(currentIdx.value + 1)
      else { clearInterval(playTimer); playing.value = false }
    }, 4500)
  }
}
function reset() {
  clearInterval(playTimer); clearTimeout(subTimer); playing.value = false
  currentIdx.value = 0
  privSwitchSub.value = 0; privSwitchDone.value = false
  ksAnimIdx.value = 0; dispAnimIdx.value = 0; parAnimIdx.value = 0
  writeAnimIdx.value = 0; forkAnimIdx.value = 0; iretSub.value = 0
  changedRegs.value = new Set()
}
onUnmounted(() => { clearInterval(playTimer); clearTimeout(subTimer) })
</script>

<style scoped>
.sc-root { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }

/* Phase bar */
.phase-bar { display: flex; gap: 4px; }
.phase-seg { flex:1; padding:8px 10px; border-radius:6px; background:#f5f7fa; border:1px solid #e4e7ed; cursor:pointer; transition:all .2s; display:flex; flex-direction:column; gap:2px; }
.phase-seg:hover { background:#ecf5ff; border-color:#b3d8ff; }
.phase-seg.active { background:#ecf5ff; border-color:#409eff; }
.phase-seg.done { background:#f0f9eb; border-color:#b3e19d; }
.phase-label { font-size:12px; font-weight:600; color:#303133; }
.phase-seg.active .phase-label { color:#409eff; }
.phase-seg.done .phase-label { color:#67c23a; }
.phase-file { font-size:10px; color:#909399; font-family:monospace; }

/* Step dots */
.step-indicator { display:flex; gap:6px; padding:0 4px; }
.step-dot { width:8px; height:8px; border-radius:50%; background:#dcdfe6; cursor:pointer; transition:all .2s; }
.step-dot:hover { transform:scale(1.3); }
.step-dot.active { background:#409eff; transform:scale(1.4); }
.step-dot.done { background:#67c23a; }

/* Grid */
.sc-grid { display:grid; grid-template-columns:240px 1fr 260px; gap:12px; min-height:520px; }
.sc-left,.sc-center,.sc-right { background:#fff; border:1px solid #e4e7ed; border-radius:8px; padding:14px; overflow:auto; }
.sc-left,.sc-right { display:flex; flex-direction:column; gap:8px; }
.sc-center { display:flex; flex-direction:column; gap:12px; }
.panel-title { font-size:11px; font-weight:600; color:#909399; text-transform:uppercase; letter-spacing:.5px; }

/* CPL box */
.cpl-box { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; border:2px solid; transition:all .4s; }
.cpl-user { border-color:#e6a23c; background:#fdf6ec; }
.cpl-kernel { border-color:#409eff; background:#ecf5ff; }
.cpl-label { font-size:11px; font-weight:700; color:#909399; }
.cpl-val { font-size:20px; font-weight:700; font-family:monospace; }
.cpl-user .cpl-val { color:#e6a23c; }
.cpl-kernel .cpl-val { color:#409eff; }
.cpl-desc { font-size:11px; }
.cpl-user .cpl-desc { color:#e6a23c; }
.cpl-kernel .cpl-desc { color:#409eff; }

/* reg section */
.reg-section { display:flex; flex-direction:column; gap:4px; }
.reg-section-title { font-size:10px; font-weight:600; color:#909399; margin-bottom:2px; }
.reg-row { display:flex; justify-content:space-between; padding:3px 6px; border-radius:4px; font-size:11px; border-left:2px solid transparent; transition:background .3s; }
.reg-name { color:#606266; font-family:monospace; }
.reg-val { font-family:monospace; font-weight:600; font-size:10px; }
.reg-user { color:#e6a23c; }
.reg-kernel { color:#409eff; }
.reg-highlight { color:#67c23a; }
@keyframes reg-flash { 0%{background:rgba(64,158,255,.2);border-left-color:rgba(64,158,255,.6)} 100%{background:transparent;border-left-color:transparent} }
.reg-row.reg-changed { animation:reg-flash .85s ease forwards; }

/* stack section */
.stack-section { display:flex; flex-direction:column; gap:4px; }
.stack-items { display:flex; flex-direction:column; gap:2px; }
.stack-item { display:flex; justify-content:space-between; padding:3px 8px; border-radius:3px; background:#f5f7fa; font-size:10px; font-family:monospace; }
.stack-item-new { background:#ecf5ff; border-left:2px solid #409eff; }
.stack-item-label { color:#909399; }
.stack-item-val { color:#303133; font-weight:600; }
.stack-esp { font-size:10px; color:#409eff; padding-left:8px; font-weight:700; }
.explain-box { font-size:12px; color:#606266; line-height:1.6; padding:8px; background:#f5f7fa; border-radius:4px; }

/* ─── overview ─── */
.s-overview { display:flex; flex-direction:column; gap:12px; }
.ov-pipeline { display:flex; align-items:stretch; gap:0; }
.ov-stage { display:flex; flex-direction:column; gap:6px; padding:10px; flex:1; }
.user-stage { background:#fdf6ec; border-radius:8px; }
.kernel-stage { background:#ecf5ff; border-radius:8px; }
.ov-stage-title { font-size:11px; font-weight:700; text-align:center; margin-bottom:4px; }
.user-stage .ov-stage-title { color:#e6a23c; }
.kernel-stage .ov-stage-title { color:#409eff; }
.ov-boxes { display:flex; flex-direction:column; align-items:center; gap:0; }
.ov-box { padding:6px 10px; border-radius:6px; font-size:11px; font-weight:600; text-align:center; line-height:1.4; background:#fff; border:1px solid #e4e7ed; width:100%; box-sizing:border-box; }
.ov-box.kern { background:#fff; border-color:#b3d8ff; }
.ov-arrow-v { font-size:11px; color:#909399; text-align:center; padding:2px 0; }
.ov-boundary { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:0 8px; }
.ov-b-line { width:2px; flex:1; background:#e4e7ed; }
.ov-b-label { font-size:10px; color:#f56c6c; font-weight:700; text-align:center; padding:4px; background:#fef0f0; border-radius:4px; white-space:nowrap; }
.ov-convention { padding:10px; background:#f5f7fa; border-radius:6px; }
.ov-conv-title { font-size:11px; font-weight:700; color:#303133; margin-bottom:6px; }
.ov-conv-table { display:flex; flex-direction:column; gap:3px; }
.ov-conv-row { display:flex; gap:10px; font-size:11px; padding:3px 6px; background:#fff; border-radius:3px; }
.ov-conv-reg { font-family:monospace; font-weight:700; color:#409eff; min-width:36px; }
.ov-conv-desc { color:#606266; }

/* ─── trap-gate ─── */
.s-trap-gate { display:flex; flex-direction:column; gap:10px; }
.tg-title { font-size:12px; font-weight:700; color:#303133; }
.tg-gate { display:flex; gap:2px; }
.tg-field { display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 4px; border-radius:4px; background:#f5f7fa; border:1px solid #e4e7ed; min-width:0; }
.tg-field.wide { flex:3; }
.tg-field.narrow { flex:1; }
.tg-field.highlight-dpl { background:#fef0f0; border-color:#fbc4c4; }
.tg-f-label { font-size:9px; color:#909399; text-align:center; }
.tg-f-val { font-size:11px; font-family:monospace; font-weight:700; color:#303133; text-align:center; }
.dpl-3 { color:#f56c6c; font-size:14px; }
.tg-key-points { display:flex; flex-direction:column; gap:6px; }
.tg-point { display:flex; gap:8px; padding:6px 10px; background:#f5f7fa; border-radius:6px; font-size:11px; }
.tg-point-key { font-family:monospace; font-weight:700; color:#409eff; min-width:80px; }
.tg-point-val { color:#606266; }
.tg-init-code { display:flex; flex-direction:column; gap:4px; }
.tg-init-title { font-size:11px; font-weight:700; color:#303133; }
.tg-code { background:#1e1e1e; color:#d4d4d4; padding:8px; border-radius:4px; font-size:10px; font-family:monospace; line-height:1.5; margin:0; }

/* ─── privilege-switch ─── */
.s-priv-switch { display:flex; flex-direction:column; gap:10px; }
.ps-title { font-size:12px; font-weight:700; color:#303133; }
.ps-diagram { display:flex; align-items:flex-start; gap:10px; }
.ps-side { flex:1; padding:10px; border-radius:8px; border:2px solid; transition:all .4s; display:flex; flex-direction:column; gap:6px; }
.user-side { border-color:#e6a23c; background:#fdf6ec; }
.kernel-side { border-color:#e4e7ed; background:#f5f7fa; }
.ps-side.ps-dim { opacity:.5; }
.ps-side.ps-highlight { border-color:#409eff; background:#ecf5ff; }
.ps-side-title { font-size:11px; font-weight:700; text-align:center; }
.user-side .ps-side-title { color:#e6a23c; }
.kernel-side .ps-side-title { color:#409eff; }
.ps-reg-list { display:flex; flex-direction:column; gap:3px; }
.ps-reg { font-size:10px; font-family:monospace; color:#303133; display:flex; align-items:center; gap:4px; }
.ps-esp-reg { font-weight:700; }
.ps-cpl-badge { font-size:9px; padding:1px 4px; border-radius:3px; font-weight:700; }
.ps-cpl-badge.u { background:#e6a23c; color:#fff; }
.ps-cpl-badge.k { background:#409eff; color:#fff; }
.ps-stack-mini { background:rgba(255,255,255,.6); border-radius:4px; padding:6px; display:flex; flex-direction:column; gap:2px; }
.ps-sm-title { font-size:9px; color:#909399; margin-bottom:2px; }
.ps-sm-item { font-size:9px; font-family:monospace; padding:2px 4px; background:#fff; border-radius:2px; }
.ps-sm-new { background:#ecf5ff; color:#409eff; font-weight:700; }
.ps-arrow-col { display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 4px; }
.ps-int-label { font-size:11px; font-weight:700; color:#f56c6c; font-family:monospace; }
.ps-arrow { font-size:24px; color:#dcdfe6; transition:color .4s; }
.ps-arrow.ps-arrow-active { color:#409eff; }
.ps-steps-list { display:flex; flex-direction:column; gap:3px; }
.ps-step-item { font-size:10px; color:#c0c4cc; padding:2px 4px; border-radius:3px; transition:all .4s; white-space:nowrap; }
.ps-step-item.ps-s-done { color:#303133; background:#ecf5ff; }

/* ─── kernel-stack ─── */
.s-kernel-stack { display:flex; flex-direction:column; gap:8px; }
.ks-title { font-size:12px; font-weight:700; color:#303133; }
.ks-stack { display:flex; flex-direction:column; gap:2px; }
.ks-section-label { font-size:10px; color:#909399; text-align:center; }
.ks-item { display:flex; gap:8px; padding:5px 10px; border-radius:4px; font-size:11px; opacity:0; transition:opacity .3s; }
.ks-item-appear { opacity:1; }
.ks-hw { background:#fef0f0; border-left:3px solid #f56c6c; }
.ks-sw { background:#ecf5ff; border-left:3px solid #409eff; }
.ks-item-label { font-family:monospace; font-weight:700; color:#303133; min-width:80px; }
.ks-item-val { font-family:monospace; color:#606266; flex:1; }
.ks-item-who { font-size:9px; color:#909399; }
.ks-esp-line { font-size:11px; font-weight:700; color:#409eff; padding:2px 10px; }
.ks-note { font-size:11px; color:#606266; padding:8px; background:#f5f7fa; border-radius:4px; line-height:1.6; }

/* ─── syscall-dispatch ─── */
.s-dispatch { display:flex; flex-direction:column; gap:8px; }
.disp-title { font-size:12px; font-weight:700; color:#303133; }
.disp-flow { display:flex; flex-direction:column; gap:4px; }
.disp-step { display:flex; gap:8px; align-items:baseline; padding:5px 10px; border-radius:6px; font-size:11px; color:#c0c4cc; background:#f5f7fa; transition:all .3s; }
.disp-step.disp-done { color:#606266; background:#f5f7fa; }
.disp-step.disp-active { color:#303133; background:#ecf5ff; border-left:2px solid #409eff; }
.disp-num { font-weight:700; color:#409eff; min-width:14px; }
.disp-asm { font-family:monospace; font-size:10px; min-width:200px; }
.disp-key { color:#67c23a !important; font-weight:700; }
.disp-desc { color:#909399; font-size:10px; }

/* ─── syscall-table ─── */
.s-syscall-table { display:flex; flex-direction:column; gap:8px; }
.sct-title { font-size:12px; font-weight:700; color:#303133; }
.sct-eax { font-size:12px; color:#606266; padding:6px 10px; background:#f5f7fa; border-radius:4px; }
.sct-eax-val { color:#f56c6c; }
.sct-fn { color:#67c23a; }
.sct-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:3px; }
.sct-entry { display:flex; gap:6px; padding:5px 8px; border-radius:4px; font-size:11px; transition:all .2s; }
.sct-active { background:#f0f9eb; border:1px solid #b3e19d; }
.sct-dim { background:#f5f7fa; border:1px solid transparent; opacity:.6; }
.sct-nr { font-family:monospace; color:#909399; min-width:20px; font-weight:700; }
.sct-name { font-family:monospace; color:#303133; }
.sct-active .sct-nr,.sct-active .sct-name { color:#67c23a; font-weight:700; }

/* ─── params ─── */
.s-params { display:flex; flex-direction:column; gap:10px; }
.par-title { font-size:12px; font-weight:700; color:#303133; }
.par-example { padding:10px; background:#f5f7fa; border-radius:6px; }
.par-ex-title { font-size:11px; font-weight:700; color:#303133; margin-bottom:8px; font-family:monospace; }
.par-regs { display:flex; flex-direction:column; gap:4px; }
.par-reg-row { display:flex; gap:8px; align-items:center; padding:5px 8px; border-radius:4px; font-size:11px; opacity:.3; transition:all .5s; background:#fff; }
.par-reg-row.par-reg-active { opacity:1; border-left:2px solid #409eff; }
.par-reg-badge { font-family:monospace; font-weight:700; color:#fff; background:#409eff; padding:1px 6px; border-radius:3px; min-width:30px; text-align:center; }
.par-reg-val { font-family:monospace; color:#303133; font-weight:600; flex:1; }
.par-reg-desc { font-size:10px; color:#909399; }
.par-libc { display:flex; flex-direction:column; gap:4px; }
.par-libc-title { font-size:11px; font-weight:700; color:#303133; }
.par-code { background:#1e1e1e; color:#d4d4d4; padding:8px 10px; border-radius:6px; font-size:10px; font-family:monospace; line-height:1.55; margin:0; overflow:auto; }

/* ─── sys-write ─── */
.s-syswrite { display:flex; flex-direction:column; gap:8px; }
.sw-title { font-size:12px; font-weight:700; color:#303133; }
.sw-chain { display:flex; flex-direction:column; gap:4px; }
.sw-node { padding:8px 12px; border-radius:6px; border:1px solid #e4e7ed; opacity:.3; transition:all .4s; display:flex; flex-direction:column; gap:2px; }
.sw-node.sw-node-active { opacity:1; }
.wn-user { background:#fdf6ec; border-color:#faecd8; }
.wn-user.sw-node-active { border-color:#e6a23c; }
.wn-kern { background:#ecf5ff; border-color:#b3d8ff; }
.wn-kern.sw-node-active { border-color:#409eff; }
.wn-hw { background:#f0f9eb; border-color:#b3e19d; }
.wn-hw.sw-node-active { border-color:#67c23a; }
.sw-node-name { font-family:monospace; font-size:12px; font-weight:700; color:#303133; }
.sw-node-file { font-size:10px; color:#909399; font-family:monospace; }
.sw-node-note { font-size:10px; color:#606266; margin-top:2px; }

/* ─── sys-fork ─── */
.s-sysfork { display:flex; flex-direction:column; gap:8px; }
.sf-title { font-size:12px; font-weight:700; color:#303133; }
.sf-flow { display:flex; flex-direction:column; gap:3px; }
.sf-node { padding:6px 10px; border-radius:6px; border:1px solid #e4e7ed; opacity:.3; transition:all .4s; }
.sf-node.sf-active { opacity:1; }
.fn-user { background:#fdf6ec; }
.fn-user.sf-active { border-color:#e6a23c; }
.fn-kern { background:#ecf5ff; }
.fn-kern.sf-active { border-color:#409eff; }
.fn-done { background:#f0f9eb; }
.fn-done.sf-active { border-color:#67c23a; }
.sf-node-main { font-family:monospace; font-size:11px; font-weight:700; color:#303133; }
.sf-node-sub { font-size:10px; color:#909399; font-family:monospace; }
.sf-node-detail { font-size:10px; color:#606266; margin-top:2px; }
.sf-result { padding:8px 12px; background:#f0f9eb; border:1px solid #b3e19d; border-radius:6px; font-size:11px; color:#67c23a; font-weight:600; }

/* ─── iret ─── */
.s-iret { display:flex; flex-direction:column; gap:10px; }
.ir-title { font-size:12px; font-weight:700; color:#303133; }
.ir-flow { display:flex; flex-direction:column; gap:5px; }
.ir-step { display:flex; gap:8px; padding:6px 10px; border-radius:6px; font-size:11px; color:#c0c4cc; background:#f5f7fa; transition:all .4s; }
.ir-step.ir-done { color:#303133; background:#f0f9eb; border-left:2px solid #67c23a; }
.ir-num { font-weight:700; color:#67c23a; }
.ir-before-after { display:flex; align-items:center; gap:10px; }
.ir-col { flex:1; padding:10px; border-radius:6px; background:#f5f7fa; display:flex; flex-direction:column; gap:4px; }
.ir-col-title { font-size:11px; font-weight:700; color:#606266; margin-bottom:4px; }
.ir-reg { font-size:11px; font-family:monospace; color:#303133; }
.ir-arrow { font-size:16px; font-weight:700; color:#dcdfe6; transition:all .5s; white-space:nowrap; }
.ir-arrow.ir-arrow-go { color:#67c23a; }

/* ─── 右栏 ─── */
.rp-code-title { font-size:11px; font-weight:700; color:#303133; }
.rp-code-block { background:#1e1e1e; color:#d4d4d4; padding:10px 12px; border-radius:6px; font-family:'Consolas',monospace; font-size:10px; line-height:1.55; overflow:auto; margin:0; flex:1; }

/* ─── Controls + Detail ─── */
.controls { display:flex; align-items:center; gap:8px; padding:8px 0; }
.detail-card { background:#fff; border:1px solid #e4e7ed; border-radius:8px; padding:14px; }
.dc-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.dc-title { font-size:14px; font-weight:600; color:#303133; flex:1; }
.dc-detail { font-size:13px; color:#606266; line-height:1.7; }
</style>
