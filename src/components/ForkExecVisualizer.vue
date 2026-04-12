<template>
  <div class="fe-root">
    <!-- Phase bar -->
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
    <div class="fe-grid">
      <!-- 左栏：进程状态 -->
      <div class="fe-left">
        <div class="panel-title">进程状态</div>

        <!-- 父进程 -->
        <div class="proc-card parent-card">
          <div class="proc-card-title">父进程（shell）</div>
          <div class="proc-field"><span>pid</span><span>{{ step.parent.pid }}</span></div>
          <div class="proc-field"><span>state</span><span class="badge-0">RUNNING</span></div>
          <div class="proc-field"><span>EAX</span><span class="val-highlight">{{ step.parent.eax }}</span></div>
          <div class="proc-field"><span>counter</span><span>{{ step.parent.counter }}</span></div>
        </div>

        <!-- 子进程（fork后才有） -->
        <div class="proc-card child-card" :class="{ 'proc-hidden': !step.child }">
          <div class="proc-card-title">子进程（new）</div>
          <template v-if="step.child">
            <div class="proc-field"><span>pid</span><span class="val-new">{{ step.child.pid }}</span></div>
            <div
              class="proc-field"
              v-for="f in step.child.fields" :key="f.name"
              :class="{ 'field-changed': changedFields.has(f.name) }"
            >
              <span>{{ f.name }}</span>
              <span :class="f.cls">{{ f.val }}</span>
            </div>
          </template>
          <template v-else>
            <div style="font-size:11px;color:#c0c4cc;text-align:center;padding:8px">尚未创建</div>
          </template>
        </div>

        <el-divider style="margin: 8px 0" />

        <div
          v-for="v in step.vars" :key="v.name"
          class="var-row"
          :class="{ 'var-changed': changedVars.has(v.name) }"
        >
          <span class="var-name">{{ v.name }}</span>
          <span class="var-val">{{ v.val }}</span>
        </div>

        <el-divider style="margin: 8px 0" />
        <div class="explain-box">{{ step.explain }}</div>
      </div>

      <!-- 中栏：可视化 -->
      <div class="fe-center">
        <div class="panel-title">{{ sceneTitle }}</div>

        <!-- overview -->
        <div v-if="step.scene === 'overview'" class="s-overview">
          <div class="ov-title">shell 创建子进程运行新程序的完整流程</div>
          <div class="ov-flow">
            <div class="ov-box shell">shell<br><small>pid=1</small></div>
            <div class="ov-arr">↓ fork()</div>
            <div class="ov-row">
              <div class="ov-side">
                <div class="ov-box parent">shell（父）<br><small>等待子进程</small></div>
                <div class="ov-arr small">↓ wait()</div>
                <div class="ov-box parent">回收子进程<br><small>继续等待输入</small></div>
              </div>
              <div class="ov-fork-label">fork 产生两个执行流</div>
              <div class="ov-side">
                <div class="ov-box child">子进程（子）<br><small>pid=2，代码=shell</small></div>
                <div class="ov-arr small">↓ exec("ls")</div>
                <div class="ov-box child-exec">子进程<br><small>代码已替换为 ls</small></div>
                <div class="ov-arr small">↓ 执行完毕</div>
                <div class="ov-box zombie">ZOMBIE<br><small>等待父 wait()</small></div>
              </div>
            </div>
          </div>
          <div class="ov-key">
            <div class="ov-key-item">
              <span class="ov-key-tag fork">fork</span>
              <span>复制进程（写时复制），父子共享物理页直到写操作</span>
            </div>
            <div class="ov-key-item">
              <span class="ov-key-tag exec">exec</span>
              <span>替换程序，读 a.out 加载新代码/数据，修改内核栈 EIP</span>
            </div>
          </div>
        </div>

        <!-- find-empty -->
        <div v-else-if="step.scene === 'find-empty'" class="s-find-empty">
          <div class="fe-title">find_empty_process()：遍历 task[]，找空槽</div>
          <div class="fe-scan-info">
            <span>扫描位置: {{ findEmptyPos >= 0 ? `task[${findEmptyPos}]` : '完成' }}</span>
            <span v-if="findEmptyFound >= 0" class="fe-found">找到空槽 task[{{ findEmptyFound }}] → pid={{ step.child?.pid }}</span>
          </div>
          <div class="fe-task-grid">
            <div
              v-for="i in 16" :key="i"
              class="fe-slot"
              :class="{
                'fe-occupied': i <= step.parent.pid,
                'fe-scanning': i - 1 === findEmptyPos,
                'fe-found-slot': i - 1 === findEmptyFound && findEmptyPos < 0,
              }"
            >
              <span class="fe-slot-idx">{{ i - 1 }}</span>
              <span class="fe-slot-val">{{ i <= step.parent.pid ? `pid=${i}` : '·' }}</span>
            </div>
          </div>
          <div class="fe-pid-note">
            新 pid = last_pid++ （全局递增，不复用），task[] 下标 ≠ pid
          </div>
        </div>

        <!-- copy-struct -->
        <div v-else-if="step.scene === 'copy-struct'" class="s-copy-struct">
          <div class="cs-title">copy_process()：分配新页 → 复制 task_struct</div>
          <div class="cs-diagram">
            <div class="cs-box parent-box">
              <div class="cs-box-title">父进程 task_struct</div>
              <div v-for="f in parentStructFields" :key="f.name" class="cs-field">
                <span class="cs-fname">{{ f.name }}</span>
                <span class="cs-fval">{{ f.val }}</span>
              </div>
            </div>
            <div class="cs-copy-arrow">
              <div class="cs-copy-label">*p = *current</div>
              <div class="cs-copy-arr" :class="{ 'cs-arr-anim': copyAnimDone }">→→→</div>
              <div class="cs-copy-note">浅拷贝（4KB 整页）</div>
            </div>
            <div class="cs-box child-box" :class="{ 'cs-box-appear': copyAnimDone }">
              <div class="cs-box-title">子进程 task_struct</div>
              <div v-for="f in childStructFields" :key="f.name" class="cs-field"
                   :class="{ 'cs-field-changed': f.changed }">
                <span class="cs-fname">{{ f.name }}</span>
                <span class="cs-fval" :class="f.changed ? 'cs-changed-val' : ''">{{ f.val }}</span>
              </div>
            </div>
          </div>
          <div class="cs-note">新页 4KB：低地址存 task_struct，高地址是子进程的内核栈</div>
        </div>

        <!-- task-diff -->
        <div v-else-if="step.scene === 'task-diff'" class="s-task-diff">
          <div class="td-title">copy_process() 修改子进程的关键字段</div>
          <div class="td-list">
            <div v-for="d in taskDiffItems" :key="d.field" class="td-item"
                 :class="{ 'td-active': tdAnimIdx >= d.order }">
              <div class="td-field">{{ d.field }}</div>
              <div class="td-from">父: {{ d.from }}</div>
              <div class="td-to">子: <span class="td-to-val">{{ d.to }}</span></div>
              <div class="td-reason">{{ d.reason }}</div>
            </div>
          </div>
          <div class="td-key">
            <span class="td-key-label">关键：tss.eax = 0</span>
            <span class="td-key-desc">子进程 iret 后 EAX=0，即 fork() 在子进程中返回 0</span>
          </div>
        </div>

        <!-- copy-mem -->
        <div v-else-if="step.scene === 'copy-mem'" class="s-copy-mem">
          <div class="cm-title">copy_mem() + copy_page_tables()：隔离地址空间</div>
          <div class="cm-diagram">
            <div class="cm-col">
              <div class="cm-col-title">父进程线性空间</div>
              <div class="cm-ldt">LDT Base = {{ step.parent.pid - 1 }}×64MB = 0x{{ ((step.parent.pid - 1) * 64).toString(16).padStart(4,'0') }}0000</div>
              <div class="cm-pages">
                <div v-for="p in 4" :key="p" class="cm-page parent-page">
                  <span>物理帧 #{{ p + 10 }}</span>
                  <span class="cm-ro-badge">{{ cmAnimDone ? 'RO' : 'RW' }}</span>
                </div>
              </div>
            </div>
            <div class="cm-mid">
              <div class="cm-mid-title">copy_page_tables()</div>
              <div class="cm-mid-arrow" :class="{ 'cm-arr-active': cmAnimDone }">↓</div>
              <div class="cm-mid-note">复制页表项<br>两端均标记 RO</div>
            </div>
            <div class="cm-col">
              <div class="cm-col-title">子进程线性空间</div>
              <div class="cm-ldt cm-ldt-new">LDT Base = {{ step.child?.pid - 1 }}×64MB = 0x{{ ((step.child ? step.child.pid - 1 : 1) * 64).toString(16).padStart(4,'0') }}0000</div>
              <div class="cm-pages" :class="{ 'cm-pages-appear': cmAnimDone }">
                <div v-for="p in 4" :key="p" class="cm-page child-page">
                  <span>物理帧 #{{ p + 10 }}</span>
                  <span class="cm-ro-badge">{{ cmAnimDone ? 'RO（共享）' : '...' }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="cm-note">父子进程 LDT Base 不同 → 线性地址空间不同，但初始时映射到相同物理帧，均标记只读（为 COW 准备）</div>
        </div>

        <!-- fork-return -->
        <div v-else-if="step.scene === 'fork-return'" class="s-fork-return">
          <div class="fr-title">fork() 返回：父子进程走不同的路径</div>
          <div class="fr-diagram">
            <div class="fr-shared">
              <div class="fr-box entry">copy_process() 完成<br><small>子进程 state→RUNNING</small></div>
              <div class="fr-arrow">↓ iret（双方各自执行）</div>
            </div>
            <div class="fr-split">
              <div class="fr-side">
                <div class="fr-box parent-ret">父进程<br><small>EAX = child_pid = {{ step.child?.pid || 2 }}</small></div>
                <div class="fr-arrow small">↓</div>
                <div class="fr-box parent-code">if (pid &gt; 0) { /* 父进程分支 */ }</div>
                <div class="fr-arrow small">↓</div>
                <div class="fr-box parent-wait">wait(child_pid)</div>
              </div>
              <div class="fr-divider">vs</div>
              <div class="fr-side">
                <div class="fr-box child-ret">子进程<br><small>EAX = tss.eax = 0</small></div>
                <div class="fr-arrow small">↓</div>
                <div class="fr-box child-code">if (pid == 0) { /* 子进程分支 */ }</div>
                <div class="fr-arrow small">↓</div>
                <div class="fr-box child-exec">exec("ls", ...)</div>
              </div>
            </div>
          </div>
          <div class="fr-note">
            子进程 tss.eax=0 是 fork 实现的关键：copy_process() 直接修改子进程内核栈帧中的 EAX 字段，iret 弹出时自然恢复为 0
          </div>
        </div>

        <!-- cow -->
        <div v-else-if="step.scene === 'cow'" class="s-cow">
          <div class="cow-title">写时复制（COW）：第一次写操作时才真正复制页面</div>
          <div class="cow-flow">
            <div class="cow-step" :class="{ 'cow-active': cowSub >= 1 }">
              <span class="cow-num">①</span> 子进程写某个变量（如 `x = 1`）
            </div>
            <div class="cow-step" :class="{ 'cow-active': cowSub >= 2 }">
              <span class="cow-num">②</span> 该页 PTE.W=0（只读），触发写保护故障 #PF（error_code bit[1]=1）
            </div>
            <div class="cow-step" :class="{ 'cow-active': cowSub >= 3 }">
              <span class="cow-num">③</span> do_wp_page()：检查 mem_map[] 引用计数
            </div>
            <div class="cow-step" :class="{ 'cow-active': cowSub >= 4 }">
              <span class="cow-num">④</span> 若 count &gt; 1：get_free_page() 分配新帧，复制内容
            </div>
            <div class="cow-step" :class="{ 'cow-active': cowSub >= 5 }">
              <span class="cow-num">⑤</span> 更新子进程 PTE → 新帧，标记 RW；原帧引用计数 -1
            </div>
          </div>
          <div class="cow-vis" v-if="cowSub >= 2">
            <div class="cow-before">
              <div class="cow-proc">父进程页表<br>PTE → 帧#10 [RO]</div>
              <div class="cow-phys">物理帧 #10<br>mem_map={{ cowSub >= 4 ? 1 : 2 }}</div>
              <div class="cow-proc" :class="{ 'cow-proc-changed': cowSub >= 4 }">
                子进程页表<br>
                <span v-if="cowSub < 4">PTE → 帧#10 [RO]</span>
                <span v-else>PTE → 帧#{{ cowNewFrame }} [RW] ✓</span>
              </div>
            </div>
            <div class="cow-new-frame" v-if="cowSub >= 4">
              <span>新分配: 物理帧 #{{ cowNewFrame }}<br>mem_map=1 [RW]</span>
            </div>
          </div>
        </div>

        <!-- execve-overview -->
        <div v-else-if="step.scene === 'execve-overview'" class="s-exec-ov">
          <div class="eo-title">do_execve()：用新程序替换当前进程</div>
          <div class="eo-flow">
            <div v-for="(s, i) in execveSteps" :key="i" class="eo-step"
                 :class="{ 'eo-active': execOvSub >= i + 1 }">
              <span class="eo-num">{{ i + 1 }}</span>
              <span class="eo-text">{{ s.text }}</span>
              <span class="eo-file">{{ s.file }}</span>
            </div>
          </div>
        </div>

        <!-- aout-header -->
        <div v-else-if="step.scene === 'aout-header'" class="s-aout">
          <div class="ah-title">a.out 格式：Linux 0.11 的可执行文件格式</div>
          <div class="ah-struct">
            <div v-for="f in aoutFields" :key="f.name" class="ah-field" :class="f.cls">
              <div class="ah-fname">{{ f.name }}</div>
              <div class="ah-fval">{{ f.val }}</div>
              <div class="ah-fdesc">{{ f.desc }}</div>
            </div>
          </div>
          <div class="ah-memory">
            <div class="ah-mem-title">加载后内存布局</div>
            <div class="ah-mem-layout">
              <div class="ah-seg text-seg">代码段（text）<br><small>从 entry 执行</small></div>
              <div class="ah-seg data-seg">数据段（data）<br><small>已初始化全局变量</small></div>
              <div class="ah-seg bss-seg">BSS<br><small>清零</small></div>
              <div class="ah-seg heap-seg">堆（向上增长）</div>
              <div class="ah-dots">↕ 栈/堆碰撞检测</div>
              <div class="ah-seg stack-seg">栈（向下增长）</div>
            </div>
          </div>
        </div>

        <!-- mem-replace -->
        <div v-else-if="step.scene === 'mem-replace'" class="s-mem-replace">
          <div class="mr-title">exec 内存替换：释放旧内存，建立新段</div>
          <div class="mr-before-after">
            <div class="mr-col">
              <div class="mr-col-title">exec 前（shell 的内存）</div>
              <div class="mr-seg old-seg">shell 代码段</div>
              <div class="mr-seg old-seg">shell 数据段</div>
              <div class="mr-seg old-seg">shell 栈</div>
              <div class="mr-seg old-ldt">LDT: Base=1×64MB</div>
            </div>
            <div class="mr-arrow-col">
              <div class="mr-steps-list">
                <div class="mr-mstep" :class="{ 'mr-done': mrSub >= 1 }">① free_page_tables(旧内存)</div>
                <div class="mr-mstep" :class="{ 'mr-done': mrSub >= 2 }">② 设置新 Limit = a.out text+data</div>
                <div class="mr-mstep" :class="{ 'mr-done': mrSub >= 3 }">③ copy_string(argv/envp→新栈)</div>
                <div class="mr-mstep" :class="{ 'mr-done': mrSub >= 4 }">④ 按需缺页加载代码/数据</div>
              </div>
              <div class="mr-arrow">→</div>
            </div>
            <div class="mr-col" :class="{ 'mr-col-appear': mrSub >= 2 }">
              <div class="mr-col-title">exec 后（ls 的内存）</div>
              <div class="mr-seg new-seg">ls 代码段（text）</div>
              <div class="mr-seg new-seg">ls 数据段（data）</div>
              <div class="mr-seg new-seg">BSS（清零）</div>
              <div class="mr-seg new-seg new-stack">新栈（含argv/envp）</div>
              <div class="mr-seg new-ldt">LDT: Base=1×64MB（不变）</div>
            </div>
          </div>
          <div class="mr-note">pid、fd、信号处理等保持不变；代码/数据/栈完全替换</div>
        </div>

        <!-- eip-magic -->
        <div v-else-if="step.scene === 'eip-magic'" class="s-eip-magic">
          <div class="em-title">exec 的魔法：修改内核栈上的 EIP，iret 时进入新程序</div>
          <div class="em-stack">
            <div class="em-s-title">内核栈帧（exec 前 → exec 后）</div>
            <div v-for="item in eipMagicStack" :key="item.label" class="em-item"
                 :class="{ 'em-changed': item.changed && emSub >= 1 }">
              <span class="em-label">{{ item.label }}</span>
              <span class="em-before">{{ item.before }}</span>
              <span class="em-arrow">→</span>
              <span class="em-after" :class="{ 'em-after-changed': item.changed }">{{ item.changed && emSub >= 1 ? item.after : item.before }}</span>
            </div>
          </div>
          <div class="em-flow">
            <div class="em-step" :class="{ 'em-active': emSub >= 1 }">
              do_execve() 修改内核栈上的 EIP = a.out entry（如 0x0000）
            </div>
            <div class="em-step" :class="{ 'em-active': emSub >= 2 }">
              修改 ESP = 新栈顶（含 argc/argv/envp）
            </div>
            <div class="em-step" :class="{ 'em-active': emSub >= 3 }">
              do_execve() 返回 → 系统调用 iret → EIP 弹出 = entry → 开始执行新程序！
            </div>
          </div>
        </div>

        <!-- timeline -->
        <div v-else-if="step.scene === 'timeline'" class="s-timeline">
          <div class="tl-title">fork + exec 完整时序（shell 执行 ls 的全过程）</div>
          <div class="tl-diagram">
            <div class="tl-col">
              <div class="tl-proc-label">shell（父）</div>
              <div class="tl-events">
                <div v-for="(e, i) in shellTimeline" :key="i" class="tl-event"
                     :class="[e.cls, { 'tl-ev-active': tlSub >= e.order }]">
                  {{ e.text }}
                </div>
              </div>
            </div>
            <div class="tl-time-axis">
              <div class="tl-axis-line" />
              <div class="tl-axis-label">时间 →</div>
            </div>
            <div class="tl-col">
              <div class="tl-proc-label">子进程</div>
              <div class="tl-events">
                <div v-for="(e, i) in childTimeline" :key="i" class="tl-event"
                     :class="[e.cls, { 'tl-ev-active': tlSub >= e.order }]">
                  {{ e.text }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：源码 -->
      <div class="fe-right">
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

    <!-- 详情 -->
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
  { name: '总览',    file: 'fork/exec',         startStep: 0 },
  { name: 'fork()', file: 'kernel/fork.c',      startStep: 1 },
  { name: 'COW',    file: 'mm/memory.c',        startStep: 5 },
  { name: 'exec()', file: 'fs/exec.c',          startStep: 6 },
  { name: '完整流程', file: 'shell→ls',          startStep: 10 },
]

const steps = [
  // Phase 0
  {
    phaseIdx: 0, phase: '总览', tagType: 'info',
    title: 'fork + exec：Linux 创建新进程运行新程序的标准模式',
    srcRef: 'kernel/fork.c + fs/exec.c',
    scene: 'overview',
    explain: 'Unix/Linux 用两个系统调用组合完成"创建进程并运行新程序"：fork() 克隆自身，exec() 用新程序替换当前进程映像。',
    detail: 'fork+exec 是 Unix 设计哲学的精华。fork() 创建进程很廉价（写时复制），exec() 替换程序映像也很清晰（不需要"创建并加载"的原子操作）。shell 每次执行命令都是这个模式：fork() 一个子进程，在子进程中 exec() 目标程序，父进程 wait() 等待子进程结束。Linux 0.11 的 fork() 在 kernel/fork.c，exec 实现在 fs/exec.c（do_execve 函数）。',
    parent: { pid: 1, eax: 'child_pid', counter: 15 },
    child: null,
    vars: [{ name: 'NR_syscalls', val: '72' }, { name: 'sys_fork', val: 'EAX=2' }, { name: 'sys_execve', val: 'EAX=11' }],
    code: `/* shell 执行 ls 的伪代码 */
int main() {
  while (1) {
    char *cmd = read_input();
    pid_t pid = fork();
    if (pid == 0) {
      /* 子进程 */
      exec(cmd, args);
      /* exec 成功后不返回 */
      exit(1);
    } else {
      /* 父进程 */
      wait(pid);
    }
  }
}`,
  },

  // Phase 1: fork
  {
    phaseIdx: 1, phase: 'fork()', tagType: 'warning',
    title: 'find_empty_process()：遍历 task[]，找空槽，分配新 pid',
    srcRef: 'kernel/fork.c:23',
    scene: 'find-empty',
    explain: '在 task[] 中找第一个 NULL 槽（从 task[1] 开始），同时分配一个全局递增的 pid。pid 和 task[] 下标是两回事。',
    detail: 'find_empty_process() 先将 last_pid 递增作为新进程的 pid，然后再次扫描 task[] 确认没有进程已经使用这个 pid（处理极端情况）。找到空槽后返回其下标 nr，这个 nr 很重要：它决定了新进程的 LDT Base（nr×64MB）和 TSS/LDT 在 GDT 中的位置。Linux 0.11 最多64个进程，find_empty_process 如果找不到空槽就返回 -EAGAIN。',
    parent: { pid: 1, eax: '2（即将返回）', counter: 15 },
    child: { pid: 2, fields: [{ name: 'state', val: 'UNRUNNABLE', cls: '' }] },
    vars: [{ name: 'last_pid', val: '2（递增）' }, { name: 'nr', val: '2（task[]下标）' }, { name: 'NR_TASKS', val: '64' }],
    code: `/* kernel/fork.c:23 */
static int find_empty_process(void)
{
  int i;
  repeat:
    if ((++last_pid) < 0)
      last_pid = 1;
    /* 检查pid是否已被占用 */
    for (i = 0; i < NR_TASKS; i++)
      if (task[i] &&
          task[i]->pid == last_pid)
        goto repeat;
  /* 找空槽 */
  for (i = 1; i < NR_TASKS; i++)
    if (!task[i])
      return i;   /* 返回下标 */
  return -EAGAIN;
}`,
  },

  {
    phaseIdx: 1, phase: 'fork()', tagType: 'warning',
    title: 'copy_process()：分配新页，浅拷贝 task_struct',
    srcRef: 'kernel/fork.c:56',
    scene: 'copy-struct',
    explain: 'copy_process() 用 get_free_page() 分配一个 4KB 页，整页作为子进程的 task_struct（低地址）和内核栈（高地址），然后用 *p = *current 整体拷贝。',
    detail: 'get_free_page() 返回的页地址转为 task_struct 指针 p，`*p = *current` 一次性拷贝整个结构（约400字节）。拷贝后父子进程有完全相同的 task_struct 内容，然后再逐一修改子进程的特殊字段（pid、father、counter、tss.eax 等）。task[nr] = p 将子进程注册到全局进程表，这时子进程还在 UNRUNNABLE 状态，还没有进入调度队列。',
    parent: { pid: 1, eax: '2', counter: 14 },
    child: { pid: 2, fields: [
      { name: 'state', val: 'UNRUNNABLE', cls: '' },
      { name: 'tss.eax', val: '0（子fork返回0）', cls: 'val-new' },
    ]},
    vars: [{ name: 'p', val: 'get_free_page()' }, { name: '*p = *current', val: '浅拷贝整个PCB' }, { name: 'task[nr] = p', val: '注册进程表' }],
    code: `/* kernel/fork.c:56 */
int copy_process(int nr, ...,
  long eip, long cs, ...) {
  struct task_struct *p;

  /* 分配4KB页：task_struct+内核栈 */
  p = (struct task_struct *)
    get_free_page();
  if (!p) return -EAGAIN;

  task[nr] = p;
  /* 浅拷贝整个task_struct */
  *p = *current;

  /* 修改子进程特有字段 */
  p->state = TASK_UNINTERRUPTIBLE;
  p->pid = last_pid;
  p->father = current->pid;
  p->counter = p->priority;
  /* ↓ 关键：子进程fork返回0 */
  p->tss.eax = 0;
  p->tss.esp = esp;
  p->tss.eip = eip;
  ...
}`,
  },

  {
    phaseIdx: 1, phase: 'fork()', tagType: 'warning',
    title: 'copy_process() 修改的关键字段：tss.eax=0 是 fork 语义的实现',
    srcRef: 'kernel/fork.c:70',
    scene: 'task-diff',
    explain: '浅拷贝后 copy_process() 逐个覆盖子进程需要独立的字段。最关键的是 tss.eax=0——这决定了子进程 fork() 返回0，父进程返回 child_pid。',
    detail: '`p->tss.eax = 0` 是 fork 的核心技巧：子进程的内核栈帧中 EAX 被设为0，当子进程被调度运行、执行 iret 返回用户态时，EAX=0 自然出现在用户空间中作为 fork() 的返回值。父进程则通过 copy_process() 的 return 语句（返回 last_pid）经过 system_call.s 把 child_pid 存入内核栈，iret 后父进程 EAX=child_pid。counter 重置为 priority 给子进程一个完整时间片。文件引用计数 +1 防止父进程关闭文件影响子进程。',
    parent: { pid: 1, eax: '2', counter: 14 },
    child: { pid: 2, fields: [
      { name: 'state', val: 'TASK_RUNNING', cls: 'val-new' },
      { name: 'tss.eax', val: '0', cls: 'val-new' },
      { name: 'counter', val: 'priority', cls: 'val-new' },
    ]},
    vars: [{ name: 'p->tss.eax', val: '0（fork返回值）' }, { name: 'p->counter', val: '= p->priority' }, { name: 'filp引用', val: '+1（共享文件）' }],
    code: `/* 修改子进程字段（kernel/fork.c）*/
p->state = TASK_UNINTERRUPTIBLE;
p->pid = last_pid;
p->father = current->pid;
p->counter = p->priority;
p->signal = 0;
p->alarm = 0;
p->leader = 0;
p->utime = p->stime = 0;
p->cutime = p->cstime = 0;
p->start_time = jiffies;

/* TSS：CPU切换到子进程时的状态 */
p->tss.eax = 0;    /* ← fork返回0 */
p->tss.ecx = ecx;
p->tss.edx = edx;
p->tss.esp = esp;  /* 用户栈指针 */
p->tss.eip = eip;  /* 返回地址 */
p->tss.cs = cs & 0xffff;
p->tss.ss = ss & 0xffff;

/* 文件引用 +1 */
for (i = 0; i < NR_OPEN; i++)
  if (f = p->filp[i])
    f->f_count++;
/* 注意 p->ldt 后面copy_mem设置 */`,
  },

  {
    phaseIdx: 1, phase: 'fork()', tagType: 'warning',
    title: 'copy_mem() + copy_page_tables()：设置 LDT，复制页表并标 RO',
    srcRef: 'kernel/fork.c:29',
    scene: 'copy-mem',
    explain: '子进程 LDT Base = nr×64MB，与父进程线性地址不重叠。copy_page_tables() 把父进程的页表复制给子进程，但把双方的页面都标记为只读（RO），为写时复制做准备。',
    detail: 'copy_mem() 计算 new_code_base = nr × 0x4000000（64MB），设置子进程 LDT[1]（代码段）和 LDT[2]（数据段）的 Base。然后调用 copy_page_tables(old_base, new_base, limit)——它遍历父进程的页目录项和页表项，在子进程对应的线性地址范围建立相同的物理映射，但把双方的 PTE.R/W 位都清零（只读）。这样任何一方的写操作都会触发 #PF，交由 do_wp_page() 处理（真正的 COW）。',
    parent: { pid: 1, eax: '2', counter: 14 },
    child: { pid: 2, fields: [
      { name: 'LDT Base', val: '1×64MB=0x4000000', cls: 'val-new' },
      { name: 'state', val: 'TASK_RUNNING', cls: 'val-new' },
    ]},
    vars: [{ name: 'new_base', val: 'nr × 0x4000000' }, { name: 'copy_page_tables', val: '复制页表+标RO' }, { name: 'mem_map[]', val: '引用计数+1' }],
    code: `/* kernel/fork.c:29 */
int copy_mem(int nr,
    struct task_struct * p) {
  unsigned long new_data_base,
    new_code_base;
  unsigned long old_data_base,
    old_code_base;
  unsigned long data_limit,
    code_limit;

  code_limit = data_limit
    = get_limit(0x17);
  old_code_base =
    get_base(current->ldt[1]);
  old_data_base =
    get_base(current->ldt[2]);

  new_data_base = new_code_base
    = (unsigned long)nr * 0x4000000;

  /* 设置子进程LDT */
  set_base(p->ldt[1], new_code_base);
  set_base(p->ldt[2], new_data_base);

  /* 复制页表（双方标为RO）*/
  if (copy_page_tables(
      old_data_base, new_data_base,
      data_limit)) {
    free_page_tables(new_data_base,
      data_limit);
    return -ENOMEM;
  }
  return 0;
}`,
  },

  {
    phaseIdx: 1, phase: 'fork()', tagType: 'warning',
    title: '父子进程返回路径：tss.eax=0 让子进程 fork() 返回 0',
    srcRef: 'kernel/sys_call.s:60',
    scene: 'fork-return',
    explain: 'copy_process() 最后把子进程 state 改为 RUNNING，两个进程各自从 iret 返回用户态：父进程 EAX=child_pid，子进程 EAX=0。',
    detail: '子进程被创建后 state=TASK_RUNNING，进入调度队列，等待 schedule() 选中。当它第一次被选中执行时，switch_to() 从它的 tss 恢复寄存器（包括 eax=0、eip=用户态fork后的下一条指令），然后"返回"到用户态，就好像刚刚从 fork() 系统调用返回一样，只是 EAX=0。这是 Linux 利用 TSS 机制实现 fork 语义的精髓——子进程"第一次运行"实际上是从内核态 iret 返回用户态。',
    parent: { pid: 1, eax: '2（child_pid）', counter: 13 },
    child: { pid: 2, fields: [
      { name: 'EAX（iret后）', val: '0（fork返回0）', cls: 'val-new' },
      { name: 'state', val: 'RUNNING', cls: '' },
    ]},
    vars: [{ name: '父进程返回', val: 'EAX=child_pid=2' }, { name: '子进程返回', val: 'EAX=tss.eax=0' }],
    code: `/* copy_process 最后 */
p->state = TASK_RUNNING;
return last_pid; /* 返回给父进程 */

/* 子进程第一次被schedule()选中:
 * switch_to(nr) → 从tss恢复寄存器
 * tss.eax = 0 → EAX = 0
 * tss.eip = 用户态fork后下一条指令
 * iret → 用户态，EAX=0
 * 即 fork() 在子进程中返回 0
 */

/* 用户态判断 */
pid_t pid = fork();
if (pid < 0)
  perror("fork");
else if (pid == 0) {
  /* 子进程：fork返回0 */
  execve("/bin/ls", argv, envp);
} else {
  /* 父进程：fork返回child_pid */
  waitpid(pid, &status, 0);
}`,
  },

  // Phase 2: COW
  {
    phaseIdx: 2, phase: 'COW', tagType: 'success',
    title: 'do_wp_page()：写时复制，第一次写才真正分配新物理页',
    srcRef: 'mm/memory.c:196',
    scene: 'cow',
    explain: 'fork 后父子共享物理页（均标 RO）。任何一方写操作触发 #PF，do_wp_page() 检查引用计数，>1 则分配新页复制内容，否则直接改为 RW。',
    detail: 'do_wp_page() 是写时复制的核心。error_code bit[1]=1 表示这是写操作引发的故障（而不是页面不存在）。函数先找到触发故障的 PTE，读出物理帧号，查 mem_map[] 中的引用计数：若 count=1（只有这一个进程使用），直接把 PTE 改为 RW 即可（un_wp_page）；若 count>1（父子共享），get_free_page() 分配新帧，拷贝原帧内容，更新 PTE 指向新帧并标 RW，原帧引用计数减1。这样父子进程的写操作互不影响，而读操作不触发任何复制，极大减少了 fork 后 exec 的开销（exec 后立即替换内存，父进程的页从未被写过）。',
    parent: { pid: 1, eax: '2', counter: 12 },
    child: { pid: 2, fields: [
      { name: 'state', val: 'RUNNING', cls: '' },
      { name: 'mem_map引用', val: '触发COW→减1', cls: 'val-new' },
    ]},
    vars: [{ name: 'do_wp_page', val: 'mm/memory.c:196' }, { name: 'mem_map[i]', val: '引用计数' }, { name: 'un_wp_page', val: 'count=1直接改RW' }],
    code: `/* mm/memory.c:196 */
void do_wp_page(unsigned long
  error_code, unsigned long addr) {
  un_wp_page((unsigned long *)
    (((addr>>10)&0xffc) +
    (0xfffff000 &
     *((unsigned long *)
       ((addr>>20)&0xffc)))));
}

/* mm/memory.c:156 un_wp_page */
void un_wp_page(unsigned long *taddr){
  unsigned long old_page;
  old_page = 0xfffff000 & *taddr;

  /* 只有当前进程使用，直接改RW */
  if (old_page >= LOW_MEM &&
      mem_map[MAP_NR(old_page)]==1) {
    *taddr |= 2;  /* 置 R/W 位 */
    invalidate();
    return;
  }
  /* 多进程共享，复制新页 */
  unsigned long new_page =
    get_free_page();
  if (!new_page) oom();
  if (old_page >= LOW_MEM)
    mem_map[MAP_NR(old_page)]--;
  /* 复制内容到新页 */
  copy_page(old_page, new_page);
  *taddr = new_page | 7; /* P+U+W */
  invalidate();
}`,
  },

  // Phase 3: exec
  {
    phaseIdx: 3, phase: 'exec()', tagType: 'danger',
    title: 'do_execve()：7步替换进程映像，进入新程序',
    srcRef: 'fs/exec.c:182',
    scene: 'execve-overview',
    explain: 'exec() 不创建新进程，而是用新程序替换当前进程的代码段、数据段和栈，同时保留 pid、fd 等进程属性。最后通过修改内核栈 EIP 来"跳入"新程序。',
    detail: 'do_execve() 是 fs/exec.c 中的核心函数，参数是可执行文件路径、参数数组、环境变量数组。主要步骤：打开并验证可执行文件（必须是普通文件且有执行权限）→ 读取 a.out 头部验证 magic number → 复制 argv/envp 到新栈 → 释放旧内存（free_page_tables）→ 设置新 LDT Limit（text+data 大小）→ 修改内核栈帧中的 EIP/ESP → 返回（iret 进入新程序）。整个过程在当前进程上下文中执行，不涉及进程切换。',
    parent: { pid: 1, eax: '0（exec成功不返回）', counter: 10 },
    child: { pid: 2, fields: [
      { name: 'state', val: 'RUNNING', cls: '' },
      { name: 'exec状态', val: '替换内存中...', cls: 'val-new' },
    ]},
    vars: [{ name: 'do_execve', val: 'fs/exec.c:182' }, { name: 'a.out magic', val: '0x010B' }, { name: 'entry', val: '程序入口EIP' }],
    code: `/* fs/exec.c:182 do_execve() 流程 */
int do_execve(unsigned long * eip,
  long tmp, char * filename,
  char ** argv, char ** envp) {

  /* 1. 查找并打开文件 */
  struct m_inode * inode =
    namei(filename);

  /* 2. 读 a.out 头部 */
  struct exec ex;
  bh = bread(inode->i_dev,
    inode->i_zone[0]);
  ex = *((struct exec *) bh->b_data);

  /* 3. 验证 magic */
  if (N_MAGIC(ex) != ZMAGIC)
    return -ENOEXEC;

  /* 4. copy argv/envp 到新栈 */
  /* 5. free_page_tables(旧内存) */
  /* 6. 设置新 LDT Limit */
  /* 7. 修改内核栈 EIP = entry */
  eip[0] = ex.a_entry;
  eip[3] = p; /* 新栈顶 */
  return 0;   /* iret进入新程序 */
}`,
  },

  {
    phaseIdx: 3, phase: 'exec()', tagType: 'danger',
    title: 'a.out 格式：Linux 0.11 的可执行文件结构',
    srcRef: 'include/a.out.h:1',
    scene: 'aout-header',
    explain: 'Linux 0.11 使用 a.out 格式（古老的 Unix 可执行格式）。头部 32 字节包含 magic、段大小、入口地址等，exec 根据这些信息设置进程的地址空间。',
    detail: 'a.out 头部的 a_magic 必须是 ZMAGIC（0x010B）或 QMAGIC（0x0107），否则 exec 返回 ENOEXEC。a_entry 是程序入口点（_start 函数地址，C 程序中即 libc 的初始化代码），exec 将其写入内核栈的 EIP 位置，iret 后 CPU 就从这里开始执行。a_text 是代码段大小，a_data 是已初始化数据大小，a_bss 是未初始化数据大小（exec 会清零这部分）。Linux 0.11 采用按需加载（demand paging）：exec 只设置好页表和 LDT，代码/数据在第一次访问时才通过缺页中断真正加载。',
    parent: { pid: 1, eax: '...', counter: 10 },
    child: { pid: 2, fields: [{ name: 'exec', val: '读取a.out头', cls: 'val-new' }]},
    vars: [{ name: 'ZMAGIC', val: '0x010B' }, { name: 'a_entry', val: '程序入口地址' }, { name: '需求加载', val: '缺页时才载入' }],
    code: `/* include/a.out.h */
struct exec {
  unsigned long a_magic;
  /* ZMAGIC=0x010B（按需加载）
   * QMAGIC=0x0107            */
  unsigned long a_text;
  /* 代码段字节数 */
  unsigned long a_data;
  /* 已初始化数据段字节数 */
  unsigned long a_bss;
  /* 未初始化数据字节数 */
  unsigned long a_syms;
  /* 符号表字节数 */
  unsigned long a_entry;
  /* 程序入口地址（_start）*/
  unsigned long a_trsize;
  /* 代码段重定位信息大小 */
  unsigned long a_drsize;
  /* 数据段重定位信息大小 */
};
#define N_MAGIC(ex) ((ex).a_magic)
#define ZMAGIC 0410  /* 010B */
/* 文件布局:
 * [exec header 32B]
 * [text段: a_text 字节]
 * [data段: a_data 字节]
 * [符号表: a_syms 字节]
 * [重定位信息]
 */`,
  },

  {
    phaseIdx: 3, phase: 'exec()', tagType: 'danger',
    title: 'exec 内存替换：释放旧段，按 a.out 建立新段',
    srcRef: 'fs/exec.c:240',
    scene: 'mem-replace',
    explain: 'do_execve() 先把 argv/envp 复制到新栈空间，再释放旧内存，更新 LDT Limit，最后修改内核栈帧中的 EIP 和 ESP。',
    detail: 'exec 的内存替换过程：① 分配一页临时空间，把 argv/envp 字符串从上往下复制进去（新栈从高地址向低增长）；② 调用 free_page_tables() 释放旧的代码/数据/栈所有物理帧（mem_map 引用计数减至0则真正释放）；③ 用 set_limit() 更新 LDT[1]/LDT[2] 的 Limit = text+data+bss+stack（新程序的地址空间大小）；④ 修改内核栈帧：eip[0]=a_entry（新程序入口），eip[3]=新栈顶指针；⑤ 返回 system_call.s，iret 把 EIP/ESP 从内核栈弹出，进程开始执行新程序。pid、fd、signal mask 等不变。',
    parent: { pid: 1, eax: '...', counter: 9 },
    child: { pid: 2, fields: [
      { name: '旧内存', val: '已释放', cls: '' },
      { name: '新LDT Limit', val: 'text+data+bss', cls: 'val-new' },
    ]},
    vars: [{ name: 'free_page_tables', val: '释放旧代码/数据' }, { name: 'set_limit', val: '设置新段大小' }, { name: 'pid不变', val: '进程身份保留' }],
    code: `/* fs/exec.c:240 (简化) */

/* 1. 复制argv/envp到新栈 */
unsigned long p = PAGE_SIZE * MAX_ARG_PAGES - 4;
for each argv[i]:
  p = copy_strings(argc, argv, p);
for each envp[i]:
  p = copy_strings(envc, envp, p);

/* 2. 释放旧内存 */
free_page_tables(get_base(current->ldt[1]),
  get_limit(0x0f));
free_page_tables(get_base(current->ldt[2]),
  get_limit(0x17));

/* 3. 设置新LDT limit */
set_limit(current->ldt[1],
  ex.a_text + ex.a_data);
set_limit(current->ldt[2],
  ex.a_text + ex.a_data + ex.a_bss +
  MAX_ARG_PAGES * PAGE_SIZE);

/* 4. 修改内核栈EIP/ESP ← 关键 */
eip[0] = ex.a_entry; /* 新EIP */
eip[3] = p;          /* 新ESP */

/* 5. 返回system_call → iret
 *    弹出新EIP/ESP → 进入新程序 */`,
  },

  {
    phaseIdx: 3, phase: 'exec()', tagType: 'danger',
    title: 'exec 的魔法：修改内核栈 EIP，iret 时无缝进入新程序',
    srcRef: 'fs/exec.c:310',
    scene: 'eip-magic',
    explain: 'do_execve() 的最后一步：直接修改内核栈帧里的 EIP 和 ESP，函数返回后由 system_call.s 的 iret 把它们弹出，CPU 就跑进了新程序——不需要任何跳转指令。',
    detail: '`eip[0] = ex.a_entry` 这行代码看似普通，实际上在操纵即将执行的 iret 的返回地址。`eip` 参数指向内核栈上的 EIP 槽位（do_execve 调用链中通过参数传递过来的 `unsigned long *eip`）。`eip[3]` 是 ESP 槽位（在 EIP 之后3个 long，即 EFLAGS/CS/EIP/ESP/SS 中的 ESP）。当 system_call.s 的 iret 执行时，硬件从内核栈依次弹出修改后的 EIP 和 ESP，处理器就从 a.out 的入口点开始执行新程序，参数和环境变量通过新 ESP 指向的新栈访问。这是 Unix exec 实现的优雅之处：没有特殊的"加载程序"机制，就是修改返回地址。',
    parent: { pid: 1, eax: '...', counter: 8 },
    child: { pid: 2, fields: [
      { name: 'EIP（内核栈）', val: 'ex.a_entry', cls: 'val-new' },
      { name: 'ESP（内核栈）', val: '新栈顶p', cls: 'val-new' },
    ]},
    vars: [{ name: 'eip[0]', val: '= ex.a_entry（程序入口）' }, { name: 'eip[3]', val: '= p（新栈顶）' }, { name: 'iret', val: '弹出EIP→进入新程序' }],
    code: `/* fs/exec.c — 最后几行 */

/* eip 参数来自 sys_execve 的调用约定:
 * _syscall3(int,execve,
 *   const char*,file,
 *   char**,argv,char**,envp)
 * → sys_execve(unsigned long *eip,...)
 *   eip 就是内核栈上保存的用户EIP位置
 */

/* 修改内核栈上的 EIP */
eip[0] = ex.a_entry;
/* 内核栈布局（从低到高）:
 * [EIP_user] ← eip[0]  ← 改这里
 * [CS_user]  ← eip[1]
 * [EFLAGS]   ← eip[2]
 * [ESP_user] ← eip[3]  ← 改这里
 * [SS_user]  ← eip[4]
 */
eip[3] = p; /* 新用户栈顶 */

/* do_execve 返回 0
 * → system_call iret
 * → 弹出 eip[0] 作为新 EIP
 * → 弹出 eip[3] 作为新 ESP
 * → CPU 开始执行新程序！
 */`,
  },

  // Phase 4
  {
    phaseIdx: 4, phase: '完整流程', tagType: 'info',
    title: '时序图：shell 执行 ls 的完整过程（fork + exec + wait）',
    srcRef: 'kernel/fork.c + fs/exec.c',
    scene: 'timeline',
    explain: '将前面所有步骤串联成一个完整的时序图：从 shell 读取命令，到 ls 执行完毕，shell 重新等待输入。',
    detail: 'shell 的工作循环是 Linux 进程模型的最佳演示：read_input() 阻塞等待用户输入 → fork() 创建子进程（父子共享内存，标RO）→ 父进程 wait() 进入 INTERRUPTIBLE 睡眠 → 子进程 exec("ls") 替换内存映像 → 子进程执行 ls，输出结果 → ls 的 exit() 将自己设为 ZOMBIE → 内核唤醒父进程（shell） → shell 的 wait() 返回，回收子进程 → shell 继续等待下一条命令。整个循环中 fork 的 COW 使得 exec 前的内存共享几乎零开销。',
    parent: { pid: 1, eax: '2→wait→继续', counter: 10 },
    child: { pid: 2, fields: [
      { name: 'ZOMBIE', val: '→父回收', cls: '' },
    ]},
    vars: [{ name: 'fork cost', val: '极低（COW）' }, { name: 'exec后', val: '父子内存分离' }, { name: 'wait()', val: 'INTERRUPTIBLE睡眠' }],
    code: `/* 完整流程源码串联 */

/* shell main loop */
while (1) {
  /* 1. 等用户输入 → 阻塞 */
  char *cmd = read_command();

  /* 2. fork: kernel/fork.c */
  pid_t pid = fork();
    /* copy_process()
     * copy_mem() → copy_page_tables()
     * 子进程 tss.eax=0 */

  if (pid == 0) {
    /* 子进程 */
    /* 3. exec: fs/exec.c */
    execve(cmd, argv, envp);
      /* free_page_tables()
       * 修改EIP=entry
       * iret→新程序 */
    /* ls 执行... */
    /* 4. exit: kernel/exit.c */
    exit(status);
      /* state=ZOMBIE
       * wake_up(parent) */
  } else {
    /* 父进程（shell）*/
    /* 5. wait: kernel/exit.c */
    waitpid(pid, &st, 0);
      /* sleep_on() → INTERRUPTIBLE
       * 被子进程exit唤醒
       * 回收task_struct */
  }
}`,
  },
]

// ─── 状态 ─────────────────────────────────────────────────────
const currentIdx = ref(0)
const playing = ref(false)
const changedFields = ref(new Set())
const changedVars = ref(new Set())
const findEmptyPos = ref(-2)
const findEmptyFound = ref(-1)
const copyAnimDone = ref(false)
const tdAnimIdx = ref(0)
const cmAnimDone = ref(false)
const cowSub = ref(0)
const cowNewFrame = ref(20)
const execOvSub = ref(0)
const mrSub = ref(0)
const emSub = ref(0)
const tlSub = ref(0)

let playTimer = null
let subTimer = null
let scanTimer = null

// ─── Computed ──────────────────────────────────────────────────
const step = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => step.value.phaseIdx)

const sceneTitle = computed(() => ({
  'overview':         '总览：fork + exec 模式',
  'find-empty':       'find_empty_process() 扫描',
  'copy-struct':      'copy_process() 复制 task_struct',
  'task-diff':        '子进程字段差异（vs 父进程）',
  'copy-mem':         'copy_mem() 地址空间隔离',
  'fork-return':      'fork() 返回路径分叉',
  'cow':              '写时复制（COW）触发',
  'execve-overview':  'do_execve() 7步流程',
  'aout-header':      'a.out 可执行文件格式',
  'mem-replace':      '内存替换过程',
  'eip-magic':        'exec 修改内核栈 EIP',
  'timeline':         'fork + exec 完整时序',
}[step.value.scene] || ''))

// ─── 静态数据 ─────────────────────────────────────────────────
const parentStructFields = [
  { name: 'pid',      val: '1' },
  { name: 'state',    val: 'RUNNING' },
  { name: 'counter',  val: '14' },
  { name: 'priority', val: '15' },
  { name: 'tss.eax',  val: '（原值）' },
  { name: 'tss.eip',  val: '0x08049XXX' },
]
const childStructFields = [
  { name: 'pid',      val: '2',          changed: true },
  { name: 'state',    val: 'UNRUNNABLE', changed: true },
  { name: 'counter',  val: '15（=pri）', changed: true },
  { name: 'priority', val: '15' },
  { name: 'tss.eax',  val: '0 ← fork返回', changed: true },
  { name: 'tss.eip',  val: '0x08049XXX' },
]

const taskDiffItems = [
  { field: 'pid',      from: '1',        to: '2（last_pid）',       reason: '新进程唯一标识',      order: 1 },
  { field: 'father',   from: '0',        to: '1（current->pid）',   reason: '记录父进程，wait()用', order: 2 },
  { field: 'state',    from: 'RUNNING',  to: 'UNRUNNABLE→RUNNING',  reason: '初始不可运行，copy_mem后置RUNNING', order: 3 },
  { field: 'counter',  from: '14',       to: '15（= priority）',    reason: '新进程获完整时间片',  order: 4 },
  { field: 'signal',   from: '...',      to: '0',                   reason: '清空未决信号',        order: 5 },
  { field: 'alarm',    from: '...',      to: '0',                   reason: '清空定时器',          order: 6 },
  { field: 'tss.eax',  from: '（父返回值）', to: '0 ← ★关键★',    reason: 'fork()在子进程返回0', order: 7 },
  { field: 'utime/stime', from: '...', to: '0',                     reason: '子进程时间从0开始',   order: 8 },
]

const execveSteps = [
  { text: '打开并验证可执行文件（namei + 权限检查）',       file: 'fs/exec.c:195' },
  { text: '读 a.out 头部，验证 magic number = ZMAGIC',     file: 'fs/exec.c:210' },
  { text: '复制 argv/envp 字符串到新栈空间',               file: 'fs/exec.c:230' },
  { text: 'free_page_tables()：释放旧代码/数据/栈内存',    file: 'fs/exec.c:250' },
  { text: '设置新 LDT Limit = text+data+bss+stack',       file: 'fs/exec.c:265' },
  { text: '修改内核栈 eip[0] = a_entry, eip[3] = 新栈顶', file: 'fs/exec.c:310' },
  { text: '返回 → iret → 进入新程序执行',                  file: 'kernel/sys_call.s' },
]

const aoutFields = [
  { name: 'a_magic',  val: '0x010B（ZMAGIC）', desc: 'Magic number，exec 验证', cls: 'ah-magic' },
  { name: 'a_text',   val: '代码段大小',        desc: '字节数，页对齐',          cls: 'ah-text' },
  { name: 'a_data',   val: '数据段大小',        desc: '已初始化全局/静态变量',   cls: 'ah-data' },
  { name: 'a_bss',    val: 'BSS大小',          desc: '未初始化，exec 清零',      cls: 'ah-bss' },
  { name: 'a_syms',   val: '符号表大小',        desc: '调试信息',               cls: 'ah-sym' },
  { name: 'a_entry',  val: '_start 地址',      desc: '程序入口，写入内核栈 EIP', cls: 'ah-entry' },
  { name: 'a_trsize', val: '代码重定位大小',    desc: '',                       cls: 'ah-reloc' },
  { name: 'a_drsize', val: '数据重定位大小',    desc: '',                       cls: 'ah-reloc' },
]

const eipMagicStack = [
  { label: 'SS_user',   before: '0x17',         after: '0x17',          changed: false },
  { label: 'ESP_user',  before: 'old_esp',       after: 'p（新栈顶）',   changed: true  },
  { label: 'EFLAGS',    before: '0x00000246',    after: '0x00000246',    changed: false },
  { label: 'CS_user',   before: '0x0F',          after: '0x0F',          changed: false },
  { label: 'EIP_user',  before: 'exec后的指令',   after: 'ex.a_entry ★', changed: true  },
]

const shellTimeline = [
  { text: 'read_command() 阻塞', cls: 'tl-shell', order: 1 },
  { text: 'fork() → 创建子进程', cls: 'tl-fork',  order: 2 },
  { text: 'wait(child_pid)',      cls: 'tl-shell', order: 3 },
  { text: '（INTERRUPTIBLE睡眠）', cls: 'tl-sleep', order: 4 },
  { text: '被唤醒 ← 子进程exit', cls: 'tl-shell', order: 9 },
  { text: '回收子进程资源',       cls: 'tl-shell', order: 10 },
  { text: '继续等待下一条命令',   cls: 'tl-shell', order: 11 },
]
const childTimeline = [
  { text: '（创建中...）',         cls: 'tl-child', order: 2 },
  { text: 'exec("ls")',            cls: 'tl-exec',  order: 5 },
  { text: '释放旧内存',            cls: 'tl-child', order: 6 },
  { text: 'iret→进入ls程序',      cls: 'tl-child', order: 7 },
  { text: 'ls 执行，输出文件列表', cls: 'tl-child', order: 8 },
  { text: 'exit() → ZOMBIE',      cls: 'tl-zombie',order: 9 },
]

// ─── Watch ─────────────────────────────────────────────────────
watch(currentIdx, (newIdx, oldIdx) => {
  const nv = new Set((steps[newIdx].vars || []).map(v => v.name))
  const ov = new Set((steps[oldIdx]?.vars || []).map(v => v.name))
  changedVars.value = new Set([...nv].filter(n => {
    const nval = steps[newIdx].vars.find(v => v.name === n)?.val
    const oval = (steps[oldIdx]?.vars || []).find(v => v.name === n)?.val
    return nval !== oval || !ov.has(n)
  }))
  setTimeout(() => { changedVars.value = new Set() }, 900)

  // 重置
  clearTimeout(subTimer); clearInterval(scanTimer)
  findEmptyPos.value = -2; findEmptyFound.value = -1
  copyAnimDone.value = false; tdAnimIdx.value = 0
  cmAnimDone.value = false; cowSub.value = 0
  execOvSub.value = 0; mrSub.value = 0; emSub.value = 0; tlSub.value = 0

  const scene = steps[newIdx].scene
  if (scene === 'find-empty') startFindEmptyAnim()
  if (scene === 'copy-struct') subTimer = setTimeout(() => { copyAnimDone.value = true }, 800)
  if (scene === 'task-diff') ticker(tdAnimIdx, taskDiffItems.length, 400)
  if (scene === 'copy-mem') subTimer = setTimeout(() => { cmAnimDone.value = true }, 1000)
  if (scene === 'cow') ticker(cowSub, 5, 700, () => { cowNewFrame.value = 20 + Math.floor(Math.random() * 5) })
  if (scene === 'execve-overview') ticker(execOvSub, execveSteps.length, 500)
  if (scene === 'mem-replace') ticker(mrSub, 4, 700)
  if (scene === 'eip-magic') ticker(emSub, 3, 800)
  if (scene === 'timeline') ticker(tlSub, 11, 600)
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

function startFindEmptyAnim() {
  let pos = 0
  findEmptyPos.value = pos
  scanTimer = setInterval(() => {
    if (pos >= steps[currentIdx.value].parent.pid) {
      findEmptyPos.value = -1
      findEmptyFound.value = pos
      clearInterval(scanTimer)
      return
    }
    pos++
    findEmptyPos.value = pos
  }, 300)
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
  clearInterval(playTimer); clearTimeout(subTimer); clearInterval(scanTimer)
  playing.value = false; currentIdx.value = 0
  findEmptyPos.value = -2; findEmptyFound.value = -1
  copyAnimDone.value = false; tdAnimIdx.value = 0
  cmAnimDone.value = false; cowSub.value = 0
  execOvSub.value = 0; mrSub.value = 0; emSub.value = 0; tlSub.value = 0
  changedFields.value = new Set(); changedVars.value = new Set()
}
onUnmounted(() => { clearInterval(playTimer); clearTimeout(subTimer); clearInterval(scanTimer) })
</script>

<style scoped>
.fe-root { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }

/* Phase / step */
.phase-bar { display: flex; gap: 4px; }
.phase-seg { flex:1; padding:8px 8px; border-radius:6px; background:#f5f7fa; border:1px solid #e4e7ed; cursor:pointer; transition:all .2s; display:flex; flex-direction:column; gap:2px; }
.phase-seg:hover { background:#ecf5ff; border-color:#b3d8ff; }
.phase-seg.active { background:#ecf5ff; border-color:#409eff; }
.phase-seg.done { background:#f0f9eb; border-color:#b3e19d; }
.phase-label { font-size:12px; font-weight:600; color:#303133; }
.phase-seg.active .phase-label { color:#409eff; }
.phase-seg.done .phase-label { color:#67c23a; }
.phase-file { font-size:10px; color:#909399; font-family:monospace; }
.step-indicator { display:flex; gap:6px; padding:0 4px; }
.step-dot { width:8px; height:8px; border-radius:50%; background:#dcdfe6; cursor:pointer; transition:all .2s; }
.step-dot:hover { transform:scale(1.3); }
.step-dot.active { background:#409eff; transform:scale(1.4); }
.step-dot.done { background:#67c23a; }

/* Grid */
.fe-grid { display:grid; grid-template-columns:230px 1fr 260px; gap:12px; min-height:520px; }
.fe-left,.fe-center,.fe-right { background:#fff; border:1px solid #e4e7ed; border-radius:8px; padding:14px; overflow:auto; }
.fe-left,.fe-right { display:flex; flex-direction:column; gap:8px; }
.fe-center { display:flex; flex-direction:column; gap:10px; }
.panel-title { font-size:11px; font-weight:600; color:#909399; text-transform:uppercase; letter-spacing:.5px; }

/* proc cards */
.proc-card { padding:10px; border-radius:8px; border:2px solid; display:flex; flex-direction:column; gap:4px; transition:all .4s; }
.parent-card { border-color:#409eff; background:#ecf5ff; }
.child-card { border-color:#67c23a; background:#f0f9eb; }
.proc-hidden { opacity:.4; }
.proc-card-title { font-size:11px; font-weight:700; margin-bottom:2px; }
.parent-card .proc-card-title { color:#409eff; }
.child-card .proc-card-title { color:#67c23a; }
.proc-field { display:flex; justify-content:space-between; font-size:11px; font-family:monospace; }
.proc-field span:first-child { color:#909399; }
.val-highlight { color:#409eff; font-weight:700; }
.val-new { color:#67c23a; font-weight:700; }
.badge-0 { font-size:9px; padding:1px 5px; border-radius:3px; background:#67c23a; color:#fff; font-weight:700; }
.field-changed { background:rgba(64,158,255,.1); border-radius:3px; }

/* var-row */
.var-row { display:flex; justify-content:space-between; padding:3px 6px; border-radius:4px; font-size:11px; border-left:2px solid transparent; }
.var-name { color:#606266; font-family:monospace; }
.var-val { font-family:monospace; font-weight:600; font-size:10px; color:#303133; }
@keyframes var-flash { 0%{background:rgba(64,158,255,.2);border-left-color:rgba(64,158,255,.6)} 100%{background:transparent;border-left-color:transparent} }
.var-row.var-changed { animation:var-flash .85s ease forwards; }
.explain-box { font-size:12px; color:#606266; line-height:1.6; padding:8px; background:#f5f7fa; border-radius:4px; }

/* ─── overview ─── */
.s-overview { display:flex; flex-direction:column; gap:12px; }
.ov-title { font-size:12px; font-weight:700; color:#303133; }
.ov-flow { display:flex; flex-direction:column; gap:4px; align-items:center; }
.ov-box { padding:8px 16px; border-radius:6px; font-size:11px; font-weight:600; text-align:center; line-height:1.5; }
.ov-box.shell { background:#ecf5ff; border:1px solid #b3d8ff; color:#409eff; }
.ov-box.parent { background:#fdf6ec; border:1px solid #faecd8; color:#e6a23c; }
.ov-box.child { background:#f0f9eb; border:1px solid #b3e19d; color:#67c23a; }
.ov-box.child-exec { background:#f5f0fe; border:1px solid #d3aef7; color:#9b59b6; }
.ov-box.zombie { background:#fef0f0; border:1px solid #fbc4c4; color:#f56c6c; }
.ov-arr { font-size:11px; color:#909399; text-align:center; }
.ov-arr.small { font-size:10px; }
.ov-row { display:flex; gap:16px; align-items:flex-start; }
.ov-side { display:flex; flex-direction:column; align-items:center; gap:2px; flex:1; }
.ov-fork-label { font-size:10px; color:#c0c4cc; writing-mode:vertical-rl; margin:0 4px; align-self:center; }
.ov-key { display:flex; flex-direction:column; gap:6px; }
.ov-key-item { display:flex; align-items:center; gap:10px; font-size:11px; color:#606266; padding:5px 8px; background:#f5f7fa; border-radius:4px; }
.ov-key-tag { padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; }
.ov-key-tag.fork { background:#ecf5ff; color:#409eff; }
.ov-key-tag.exec { background:#f5f0fe; color:#9b59b6; }

/* ─── find-empty ─── */
.s-find-empty { display:flex; flex-direction:column; gap:8px; }
.fe-title { font-size:12px; font-weight:700; color:#303133; }
.fe-scan-info { display:flex; gap:16px; font-size:11px; color:#606266; font-family:monospace; }
.fe-found { color:#67c23a; font-weight:700; }
.fe-task-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:3px; }
.fe-slot { padding:6px 4px; border-radius:4px; border:1px solid #e4e7ed; background:#f5f7fa; display:flex; flex-direction:column; align-items:center; gap:2px; transition:all .15s; }
.fe-occupied { background:#ecf5ff; border-color:#b3d8ff; }
.fe-scanning { background:#fdf6ec; border-color:#e6a23c; transform:scale(1.1); }
.fe-found-slot { background:#f0f9eb; border-color:#67c23a; border-width:2px; }
.fe-slot-idx { font-size:9px; color:#909399; font-family:monospace; }
.fe-slot-val { font-size:9px; font-family:monospace; font-weight:600; color:#303133; }
.fe-pid-note { font-size:11px; color:#909399; padding:6px 8px; background:#f5f7fa; border-radius:4px; }

/* ─── copy-struct ─── */
.s-copy-struct { display:flex; flex-direction:column; gap:10px; }
.cs-title { font-size:12px; font-weight:700; color:#303133; }
.cs-diagram { display:flex; align-items:flex-start; gap:8px; }
.cs-box { flex:1; padding:10px; border-radius:8px; border:2px solid #e4e7ed; display:flex; flex-direction:column; gap:4px; }
.parent-box { border-color:#409eff; background:#ecf5ff; }
.child-box { border-color:#67c23a; background:#f5f7fa; opacity:0; transition:all .5s; }
.cs-box-appear { opacity:1; background:#f0f9eb; }
.cs-box-title { font-size:11px; font-weight:700; color:#606266; margin-bottom:4px; }
.parent-box .cs-box-title { color:#409eff; }
.cs-field { display:flex; justify-content:space-between; font-size:10px; font-family:monospace; padding:2px 4px; border-radius:2px; }
.cs-field-changed { background:rgba(103,194,58,.15); }
.cs-fname { color:#909399; }
.cs-fval { color:#303133; }
.cs-changed-val { color:#67c23a; font-weight:700; }
.cs-copy-arrow { display:flex; flex-direction:column; align-items:center; gap:4px; padding:20px 4px; }
.cs-copy-label { font-size:10px; color:#606266; font-family:monospace; white-space:nowrap; }
.cs-copy-arr { font-size:18px; color:#dcdfe6; transition:color .5s; }
.cs-copy-arr.cs-arr-anim { color:#409eff; }
.cs-copy-note { font-size:10px; color:#909399; text-align:center; }
.cs-note { font-size:11px; color:#606266; padding:6px 8px; background:#f5f7fa; border-radius:4px; }

/* ─── task-diff ─── */
.s-task-diff { display:flex; flex-direction:column; gap:8px; }
.td-title { font-size:12px; font-weight:700; color:#303133; }
.td-list { display:flex; flex-direction:column; gap:3px; }
.td-item { display:grid; grid-template-columns:90px 1fr 1fr 1fr; gap:6px; padding:5px 8px; border-radius:4px; font-size:10px; background:#f5f7fa; opacity:.3; transition:all .4s; }
.td-item.td-active { opacity:1; }
.td-field { font-family:monospace; font-weight:700; color:#303133; }
.td-from { color:#909399; }
.td-to { color:#303133; }
.td-to-val { color:#67c23a; font-weight:700; }
.td-reason { color:#606266; font-size:9px; }
.td-key { padding:8px 12px; background:#fdf6ec; border:1px solid #faecd8; border-radius:6px; display:flex; gap:10px; align-items:center; font-size:11px; margin-top:4px; }
.td-key-label { font-family:monospace; font-weight:700; color:#e6a23c; }
.td-key-desc { color:#606266; }

/* ─── copy-mem ─── */
.s-copy-mem { display:flex; flex-direction:column; gap:10px; }
.cm-title { font-size:12px; font-weight:700; color:#303133; }
.cm-diagram { display:flex; align-items:flex-start; gap:10px; }
.cm-col { flex:1; display:flex; flex-direction:column; gap:6px; }
.cm-col-title { font-size:11px; font-weight:700; color:#606266; text-align:center; }
.cm-ldt { font-size:10px; font-family:monospace; padding:4px 8px; background:#ecf5ff; border-radius:4px; color:#409eff; text-align:center; }
.cm-ldt-new { background:#f0f9eb; color:#67c23a; }
.cm-pages { display:flex; flex-direction:column; gap:3px; }
.cm-page { display:flex; justify-content:space-between; padding:5px 8px; border-radius:4px; font-size:10px; font-family:monospace; }
.parent-page { background:#ecf5ff; border:1px solid #b3d8ff; }
.child-page { background:#f5f7fa; border:1px solid #e4e7ed; opacity:0; transition:all .5s; }
.cm-pages-appear .child-page { opacity:1; background:#f0f9eb; border-color:#b3e19d; }
.cm-ro-badge { padding:1px 5px; border-radius:3px; font-size:9px; font-weight:700; background:#fef0f0; color:#f56c6c; }
.cm-mid { display:flex; flex-direction:column; align-items:center; gap:4px; padding:20px 4px; }
.cm-mid-title { font-size:10px; font-weight:700; color:#606266; text-align:center; }
.cm-mid-arrow { font-size:24px; color:#dcdfe6; transition:all .5s; }
.cm-arr-active { color:#409eff; }
.cm-mid-note { font-size:10px; color:#909399; text-align:center; line-height:1.5; }
.cm-note { font-size:11px; color:#606266; padding:6px 8px; background:#f5f7fa; border-radius:4px; line-height:1.6; }

/* ─── fork-return ─── */
.s-fork-return { display:flex; flex-direction:column; gap:10px; }
.fr-title { font-size:12px; font-weight:700; color:#303133; }
.fr-diagram { display:flex; flex-direction:column; gap:6px; }
.fr-shared { display:flex; flex-direction:column; align-items:center; gap:3px; }
.fr-box { padding:7px 14px; border-radius:6px; font-size:11px; font-weight:600; text-align:center; line-height:1.4; }
.fr-box.entry { background:#f5f0fe; border:1px solid #d3aef7; color:#9b59b6; }
.fr-box.parent-ret { background:#ecf5ff; border:1px solid #b3d8ff; color:#409eff; }
.fr-box.parent-code { background:#f5f7fa; border:1px solid #e4e7ed; color:#606266; font-family:monospace; font-size:10px; }
.fr-box.parent-wait { background:#fdf6ec; border:1px solid #faecd8; color:#e6a23c; }
.fr-box.child-ret { background:#f0f9eb; border:1px solid #b3e19d; color:#67c23a; }
.fr-box.child-code { background:#f5f7fa; border:1px solid #e4e7ed; color:#606266; font-family:monospace; font-size:10px; }
.fr-box.child-exec { background:#f5f0fe; border:1px solid #d3aef7; color:#9b59b6; }
.fr-split { display:flex; gap:10px; align-items:flex-start; }
.fr-side { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; }
.fr-divider { font-size:14px; font-weight:700; color:#dcdfe6; align-self:center; }
.fr-arrow { font-size:11px; color:#909399; text-align:center; }
.fr-arrow.small { font-size:10px; }
.fr-note { font-size:11px; color:#606266; padding:8px; background:#fdf6ec; border-radius:6px; border-left:3px solid #e6a23c; line-height:1.6; }

/* ─── cow ─── */
.s-cow { display:flex; flex-direction:column; gap:10px; }
.cow-title { font-size:12px; font-weight:700; color:#303133; }
.cow-flow { display:flex; flex-direction:column; gap:5px; }
.cow-step { display:flex; gap:8px; padding:5px 10px; border-radius:6px; font-size:11px; color:#c0c4cc; background:#f5f7fa; transition:all .4s; }
.cow-step.cow-active { color:#303133; background:#f0f9eb; border-left:2px solid #67c23a; }
.cow-num { font-weight:700; color:#67c23a; }
.cow-vis { display:flex; flex-direction:column; gap:8px; }
.cow-before { display:flex; align-items:center; gap:8px; padding:8px; background:#f5f7fa; border-radius:6px; }
.cow-proc { flex:1; padding:8px; border-radius:4px; border:1px solid #e4e7ed; font-size:11px; text-align:center; background:#fff; transition:all .5s; }
.cow-proc-changed { background:#f0f9eb; border-color:#b3e19d; }
.cow-phys { flex:1; padding:8px; border-radius:4px; border:1px dashed #e4e7ed; font-size:11px; text-align:center; background:#fff; }
.cow-new-frame { padding:8px; background:#f0f9eb; border:1px solid #b3e19d; border-radius:6px; font-size:11px; text-align:center; color:#67c23a; font-weight:600; font-family:monospace; }

/* ─── exec-overview ─── */
.s-exec-ov { display:flex; flex-direction:column; gap:8px; }
.eo-title { font-size:12px; font-weight:700; color:#303133; }
.eo-flow { display:flex; flex-direction:column; gap:4px; }
.eo-step { display:flex; gap:8px; align-items:baseline; padding:6px 10px; border-radius:6px; font-size:11px; color:#c0c4cc; background:#f5f7fa; transition:all .4s; }
.eo-step.eo-active { color:#303133; background:#f5f0fe; border-left:2px solid #9b59b6; }
.eo-num { font-weight:700; color:#9b59b6; min-width:14px; }
.eo-text { flex:1; }
.eo-file { font-family:monospace; font-size:9px; color:#909399; }

/* ─── aout-header ─── */
.s-aout { display:flex; flex-direction:column; gap:10px; }
.ah-title { font-size:12px; font-weight:700; color:#303133; }
.ah-struct { display:flex; flex-direction:column; gap:2px; }
.ah-field { display:grid; grid-template-columns:80px 100px 1fr; gap:8px; padding:5px 8px; border-radius:4px; font-size:11px; }
.ah-fname { font-family:monospace; font-weight:700; color:#303133; }
.ah-fval { font-family:monospace; color:#409eff; }
.ah-fdesc { color:#909399; font-size:10px; }
.ah-magic { background:#fef0f0; }
.ah-text { background:#ecf5ff; }
.ah-data { background:#fdf6ec; }
.ah-bss { background:#f0f9eb; }
.ah-entry { background:#f5f0fe; }
.ah-sym,.ah-reloc { background:#f5f7fa; }
.ah-memory { display:flex; flex-direction:column; gap:4px; }
.ah-mem-title { font-size:11px; font-weight:700; color:#606266; }
.ah-mem-layout { display:flex; flex-direction:column; gap:2px; }
.ah-seg { padding:5px 10px; border-radius:3px; font-size:11px; text-align:center; }
.text-seg { background:#ecf5ff; color:#409eff; border:1px solid #b3d8ff; }
.data-seg { background:#fdf6ec; color:#e6a23c; border:1px solid #faecd8; }
.bss-seg { background:#f0f9eb; color:#67c23a; border:1px solid #b3e19d; }
.heap-seg { background:#f5f7fa; color:#909399; border:1px dashed #e4e7ed; }
.stack-seg { background:#fef0f0; color:#f56c6c; border:1px solid #fbc4c4; }
.ah-dots { text-align:center; color:#dcdfe6; font-size:12px; }

/* ─── mem-replace ─── */
.s-mem-replace { display:flex; flex-direction:column; gap:10px; }
.mr-title { font-size:12px; font-weight:700; color:#303133; }
.mr-before-after { display:flex; align-items:flex-start; gap:8px; }
.mr-col { flex:1; display:flex; flex-direction:column; gap:3px; }
.mr-col-title { font-size:11px; font-weight:700; color:#606266; margin-bottom:4px; text-align:center; }
.mr-seg { padding:5px 8px; border-radius:4px; font-size:11px; text-align:center; }
.old-seg { background:#fef0f0; border:1px solid #fbc4c4; color:#f56c6c; }
.old-ldt { background:#f5f7fa; border:1px solid #e4e7ed; color:#909399; font-size:10px; font-family:monospace; text-align:center; padding:4px; border-radius:4px; }
.new-seg { background:#f0f9eb; border:1px solid #b3e19d; color:#67c23a; }
.new-stack { background:#ecf5ff; border-color:#b3d8ff; color:#409eff; }
.new-ldt { background:#f5f7fa; border:1px solid #b3d8ff; color:#409eff; font-size:10px; font-family:monospace; text-align:center; padding:4px; border-radius:4px; }
.mr-arrow-col { display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 4px; }
.mr-steps-list { display:flex; flex-direction:column; gap:3px; }
.mr-mstep { font-size:10px; color:#c0c4cc; transition:color .4s; white-space:nowrap; }
.mr-mstep.mr-done { color:#303133; }
.mr-arrow { font-size:20px; color:#409eff; font-weight:700; }
.mr-col-appear { opacity:0; transition:opacity .6s; }
.mr-col.mr-col-appear { opacity:1; }
.mr-note { font-size:11px; color:#606266; padding:6px 8px; background:#f5f7fa; border-radius:4px; }

/* ─── eip-magic ─── */
.s-eip-magic { display:flex; flex-direction:column; gap:10px; }
.em-title { font-size:12px; font-weight:700; color:#303133; }
.em-stack { display:flex; flex-direction:column; gap:4px; }
.em-s-title { font-size:11px; font-weight:600; color:#606266; margin-bottom:4px; }
.em-item { display:grid; grid-template-columns:80px 120px 20px 1fr; gap:8px; padding:5px 10px; border-radius:4px; font-size:11px; font-family:monospace; background:#f5f7fa; transition:all .4s; }
.em-item.em-changed { background:#fdf6ec; border-left:2px solid #e6a23c; }
.em-label { color:#909399; }
.em-before { color:#303133; }
.em-arrow { color:#909399; text-align:center; }
.em-after { color:#303133; }
.em-after-changed { color:#e6a23c; font-weight:700; }
.em-flow { display:flex; flex-direction:column; gap:5px; }
.em-step { padding:6px 10px; border-radius:6px; font-size:11px; color:#c0c4cc; background:#f5f7fa; transition:all .4s; }
.em-step.em-active { color:#303133; background:#fdf6ec; border-left:2px solid #e6a23c; }

/* ─── timeline ─── */
.s-timeline { display:flex; flex-direction:column; gap:8px; }
.tl-title { font-size:12px; font-weight:700; color:#303133; }
.tl-diagram { display:flex; gap:0; }
.tl-col { flex:1; display:flex; flex-direction:column; gap:4px; }
.tl-proc-label { font-size:11px; font-weight:700; text-align:center; padding:4px; }
.tl-col:first-child .tl-proc-label { color:#409eff; }
.tl-col:last-child .tl-proc-label { color:#67c23a; }
.tl-events { display:flex; flex-direction:column; gap:4px; }
.tl-event { padding:5px 8px; border-radius:4px; font-size:10px; text-align:center; opacity:.3; transition:all .4s; }
.tl-event.tl-ev-active { opacity:1; }
.tl-shell { background:#ecf5ff; color:#409eff; border:1px solid #b3d8ff; }
.tl-fork { background:#f5f0fe; color:#9b59b6; border:1px solid #d3aef7; }
.tl-sleep { background:#f5f7fa; color:#909399; border:1px dashed #dcdfe6; }
.tl-child { background:#f0f9eb; color:#67c23a; border:1px solid #b3e19d; }
.tl-exec { background:#f5f0fe; color:#9b59b6; border:1px solid #d3aef7; }
.tl-zombie { background:#fef0f0; color:#f56c6c; border:1px solid #fbc4c4; }
.tl-time-axis { display:flex; flex-direction:column; align-items:center; gap:4px; padding:30px 8px; }
.tl-axis-line { width:2px; flex:1; background:#e4e7ed; }
.tl-axis-label { font-size:9px; color:#909399; writing-mode:vertical-rl; }

/* ─── 右栏 ─── */
.rp-code-title { font-size:11px; font-weight:700; color:#303133; }
.rp-code-block { background:#1e1e1e; color:#d4d4d4; padding:10px 12px; border-radius:6px; font-family:'Consolas',monospace; font-size:10px; line-height:1.55; overflow:auto; margin:0; flex:1; }

/* Controls + Detail */
.controls { display:flex; align-items:center; gap:8px; padding:8px 0; }
.detail-card { background:#fff; border:1px solid #e4e7ed; border-radius:8px; padding:14px; }
.dc-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.dc-title { font-size:14px; font-weight:600; color:#303133; flex:1; }
.dc-detail { font-size:13px; color:#606266; line-height:1.7; }
</style>
