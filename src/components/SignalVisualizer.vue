<template>
  <div class="signal-vis">
    <!-- Phase 进度条 -->
    <div class="phase-bar">
      <div
        v-for="(ph, pi) in phases"
        :key="pi"
        class="phase-seg"
        :class="{ active: currentPhase === pi, done: currentPhase > pi }"
        @click="jumpToPhase(pi)"
      >
        <span class="phase-label">{{ ph }}</span>
      </div>
    </div>

    <!-- 步骤点 -->
    <div class="step-row">
      <div
        v-for="(s, i) in steps"
        :key="i"
        class="step-dot"
        :class="{ active: currentIdx === i, done: currentIdx > i }"
        @click="currentIdx = i"
        :title="s.title"
      />
    </div>

    <!-- 三栏主区域 -->
    <div class="main-grid">
      <!-- 左：信号状态面板 -->
      <div class="left-panel">
        <div class="panel-title">进程信号状态</div>

        <!-- signal bitmap 可视化 -->
        <div class="sig-bitmap-section">
          <div class="bitmap-label">task_struct.signal (位图)</div>
          <div class="bitmap-grid">
            <div
              v-for="bit in 17"
              :key="bit"
              class="bitmap-bit"
              :class="{
                'bit-set': isBitSet(bit),
                'bit-highlighted': highlightBit === bit,
              }"
              :title="`信号 ${bit}`"
            >
              <span class="bit-num">{{ bit }}</span>
            </div>
          </div>
          <div v-if="pendingSigName" class="pending-sig">
            待处理: <strong>{{ pendingSigName }}</strong>
          </div>
        </div>

        <!-- sigaction 表 -->
        <div class="sigaction-section">
          <div class="bitmap-label">sigaction[] 处理函数表</div>
          <div v-for="entry in sigactionTable" :key="entry.num" class="sa-row" :class="{ 'sa-active': entry.active }">
            <span class="sa-num">{{ entry.num }}</span>
            <span class="sa-name">{{ entry.name }}</span>
            <span class="sa-handler" :class="'sa-' + entry.type">{{ entry.handlerLabel }}</span>
          </div>
        </div>

        <!-- 当前步骤说明 -->
        <div class="left-explain">
          <div class="explain-label">{{ currentStep.explain }}</div>
        </div>
      </div>

      <!-- 中：主可视化区 -->
      <div class="center-panel">
        <!-- overview: 17个信号网格 -->
        <template v-if="currentStep.scene === 'overview'">
          <div class="scene-title">Linux 0.11 信号机制总览</div>
          <div class="overview-flow">
            <div class="ov-node ov-src">信号源<br/><small>进程/内核/键盘</small></div>
            <div class="ov-arrow">→</div>
            <div class="ov-node ov-bitmap">signal 位图<br/><small>task_struct.signal</small></div>
            <div class="ov-arrow">→</div>
            <div class="ov-node ov-check">do_signal()<br/><small>iret 前检测</small></div>
            <div class="ov-arrow">→</div>
            <div class="ov-node ov-handler">执行处理函数<br/><small>用户态 handler</small></div>
          </div>
          <div class="sig-grid">
            <div
              v-for="sig in allSignals"
              :key="sig.num"
              class="sig-cell"
              :class="'sig-action-' + sig.action"
            >
              <div class="sig-cell-num">{{ sig.num }}</div>
              <div class="sig-cell-name">{{ sig.name }}</div>
              <div class="sig-cell-desc">{{ sig.desc }}</div>
            </div>
          </div>
          <div class="sig-legend">
            <span class="legend-item"><i class="dot dot-term"></i>终止</span>
            <span class="legend-item"><i class="dot dot-ign"></i>忽略</span>
            <span class="legend-item"><i class="dot dot-stop"></i>停止</span>
            <span class="legend-item"><i class="dot dot-cont"></i>继续</span>
          </div>
        </template>

        <!-- sig-register: sys_signal() 流程 -->
        <template v-else-if="currentStep.scene === 'sig-register'">
          <div class="scene-title">sys_signal() — 注册信号处理函数</div>
          <div class="code-flow">
            <div v-for="(node, ni) in regFlowNodes" :key="ni"
              class="cf-node"
              :class="{ 'cf-active': regAnimIdx >= ni, 'cf-current': regAnimIdx === ni }"
            >
              <div class="cf-label">{{ node.label }}</div>
              <div class="cf-sub" v-if="node.sub">{{ node.sub }}</div>
            </div>
          </div>
          <div class="reg-result" v-if="regAnimIdx >= regFlowNodes.length - 1">
            <div class="reg-box">
              <div class="reg-title">task_struct.sigaction[SIGINT]</div>
              <div class="reg-field"><span class="rf-key">sa_handler</span><span class="rf-val rf-custom">0x08049A10 (my_handler)</span></div>
              <div class="reg-field"><span class="rf-key">sa_mask</span><span class="rf-val">0x00000000</span></div>
              <div class="reg-field"><span class="rf-key">sa_flags</span><span class="rf-val">SA_ONESHOT</span></div>
              <div class="reg-field"><span class="rf-key">sa_restorer</span><span class="rf-val">libc.__restore</span></div>
            </div>
          </div>
        </template>

        <!-- sigaction-struct: 结构布局 -->
        <template v-else-if="currentStep.scene === 'sigaction-struct'">
          <div class="scene-title">struct sigaction — 信号处理描述符</div>
          <div class="struct-diagram">
            <div class="struct-title">include/signal.h</div>
            <div v-for="field in sigactionFields" :key="field.name"
              class="struct-row"
              :class="{ 'sr-highlight': field.highlight }"
            >
              <span class="sr-type">{{ field.type }}</span>
              <span class="sr-name">{{ field.name }}</span>
              <span class="sr-size">{{ field.size }}</span>
              <span class="sr-desc">{{ field.desc }}</span>
            </div>
          </div>
          <div class="handler-vals">
            <div class="hv-title">sa_handler 特殊值</div>
            <div class="hv-row"><span class="hv-val hv-dfl">SIG_DFL (0x0)</span><span class="hv-desc">执行默认动作（终止/忽略/停止）</span></div>
            <div class="hv-row"><span class="hv-val hv-ign">SIG_IGN (0x1)</span><span class="hv-desc">忽略此信号，直接返回</span></div>
            <div class="hv-row"><span class="hv-val hv-custom">用户地址</span><span class="hv-desc">跳转到用户空间处理函数</span></div>
          </div>
        </template>

        <!-- sys-kill: 发送信号流程 -->
        <template v-else-if="currentStep.scene === 'sys-kill'">
          <div class="scene-title">sys_kill() — 发送信号</div>
          <div class="kill-flow">
            <div v-for="(node, ni) in killFlowNodes" :key="ni"
              class="kf-node"
              :class="{ 'kf-active': killAnimIdx >= ni, 'kf-current': killAnimIdx === ni }"
            >
              <div class="kf-label">{{ node.label }}</div>
              <div class="kf-code" v-if="node.code">{{ node.code }}</div>
            </div>
          </div>
          <!-- bitmap 动画 -->
          <div class="bitmap-demo" v-if="killAnimIdx >= 3">
            <div class="bd-label">send_sig() → 置位 signal[SIGINT=2]</div>
            <div class="bd-bits">
              <div v-for="b in 8" :key="b"
                class="bd-bit"
                :class="{ 'bd-set': b === 2 && killAnimIdx >= 4 }"
              >
                <div class="bd-num">{{ b }}</div>
                <div class="bd-val">{{ b === 2 && killAnimIdx >= 4 ? '1' : '0' }}</div>
              </div>
            </div>
            <div class="bd-code" v-if="killAnimIdx >= 4">
              task->signal |= (1 &lt;&lt; (sig-1));  // 1 &lt;&lt; 1 = 0x02
            </div>
          </div>
        </template>

        <!-- sig-source: 信号来源 -->
        <template v-else-if="currentStep.scene === 'sig-source'">
          <div class="scene-title">信号来源三条路径</div>
          <div class="source-diagram">
            <div class="src-col">
              <div class="src-node src-keyboard">⌨️ 键盘中断<br/><small>Ctrl+C → SIGINT</small><br/><small>Ctrl+Z → SIGTSTP</small></div>
              <div class="src-path">↓ IRQ1 → keyboard_interrupt<br/>→ tty_signal → kill_pg</div>
            </div>
            <div class="src-col">
              <div class="src-node src-kernel">🔧 内核检测<br/><small>SIGSEGV（非法内存）</small><br/><small>SIGFPE（除零）</small><br/><small>SIGALRM（定时器）</small></div>
              <div class="src-path">↓ 异常/中断处理<br/>→ send_sig()</div>
            </div>
            <div class="src-col">
              <div class="src-node src-process">📦 进程调用<br/><small>kill(pid, sig)</small><br/><small>raise(sig)</small><br/><small>abort()</small></div>
              <div class="src-path">↓ int 0x80<br/>→ sys_kill()</div>
            </div>
          </div>
          <div class="src-merge">
            <div class="src-arrow">↓ ↓ ↓</div>
            <div class="src-target">send_sig(sig, task, priv)<br/><small>kernel/signal.c</small></div>
            <div class="src-action">task-&gt;signal |= (1 &lt;&lt; (sig-1))</div>
          </div>
        </template>

        <!-- ret-check: 检测时机 -->
        <template v-else-if="currentStep.scene === 'ret-check'">
          <div class="scene-title">do_signal() 检测时机</div>
          <div class="ret-timeline">
            <div v-for="(node, ni) in retCheckNodes" :key="ni"
              class="rt-node"
              :class="{ 'rt-active': retCheckSub >= ni, 'rt-signal': node.isSignal, 'rt-current': retCheckSub === ni }"
            >
              <div class="rt-label">{{ node.label }}</div>
              <div class="rt-detail" v-if="node.detail">{{ node.detail }}</div>
            </div>
          </div>
          <div class="ret-note">
            <strong>关键：</strong>do_signal() 在 <code>ret_from_sys_call</code> 处被调用，
            每次系统调用/中断返回用户态前都会检查 signal 位图。
            这保证了信号在进程重新获得 CPU 时被"尽快"处理。
          </div>
        </template>

        <!-- do-signal: 扫描位图 -->
        <template v-else-if="currentStep.scene === 'do-signal'">
          <div class="scene-title">do_signal() — 扫描 signal 位图</div>
          <div class="scan-bitmap">
            <div class="scan-label">signal = 0x00000002（SIGINT 待处理）</div>
            <div class="scan-bits">
              <div v-for="bit in 17" :key="bit"
                class="scan-bit"
                :class="{
                  'scan-current': doSigPos === bit,
                  'scan-set': bit === 2,
                  'scan-checked': doSigPos > bit,
                  'scan-found': doSigFound && bit === 2,
                }"
              >
                <div class="sb-num">{{ bit }}</div>
                <div class="sb-val">{{ bit === 2 ? '1' : '0' }}</div>
                <div class="sb-name" v-if="bit <= 5">{{ ['','HUP','INT','QUIT','ILL','TRAP'][bit] }}</div>
              </div>
            </div>
            <div class="scan-code">
              <div v-for="(line, li) in doSigCode" :key="li"
                class="sc-line"
                :class="{ 'sc-active': doSigCodeLine === li }"
              >{{ line }}</div>
            </div>
          </div>
          <div class="scan-found-msg" v-if="doSigFound">
            找到 SIGINT (信号2) → 调用 handle_signal()
          </div>
        </template>

        <!-- handler-dispatch: 分发决策 -->
        <template v-else-if="currentStep.scene === 'handler-dispatch'">
          <div class="scene-title">handle_signal() — 处理函数分发</div>
          <div class="dispatch-tree">
            <div class="dt-root dt-node">检查 sa_handler</div>
            <div class="dt-branches">
              <div class="dt-branch">
                <div class="dt-connector"></div>
                <div class="dt-node dt-dfl" :class="{ 'dt-active': hdAnimIdx >= 1 }">
                  SIG_DFL (0x0)<br/>默认动作
                </div>
                <div v-if="hdAnimIdx >= 1" class="dt-sub-actions">
                  <div class="dsa-item dsa-term">SIGINT → do_exit()</div>
                  <div class="dsa-item dsa-stop">SIGSTOP → 置 STOPPED</div>
                  <div class="dsa-item dsa-ign">SIGCHLD → 忽略</div>
                </div>
              </div>
              <div class="dt-branch">
                <div class="dt-connector"></div>
                <div class="dt-node dt-ign" :class="{ 'dt-active': hdAnimIdx >= 2 }">
                  SIG_IGN (0x1)<br/>忽略信号
                </div>
                <div v-if="hdAnimIdx >= 2" class="dt-ign-note">
                  清除 signal 位，直接返回用户态
                </div>
              </div>
              <div class="dt-branch">
                <div class="dt-connector"></div>
                <div class="dt-node dt-user" :class="{ 'dt-active': hdAnimIdx >= 3 }">
                  用户地址<br/>自定义 handler
                </div>
                <div v-if="hdAnimIdx >= 3" class="dt-user-note">
                  修改内核栈上的用户 EIP<br/>→ iret 后跳入 handler
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- user-stack: 修改用户栈 -->
        <template v-else-if="currentStep.scene === 'user-stack'">
          <div class="scene-title">信号处理：修改用户栈与 EIP</div>
          <div class="stack-compare">
            <div class="sc-before">
              <div class="sc-title">修改前（iret 前的内核栈）</div>
              <div v-for="(item, ii) in stackBefore" :key="ii" class="sc-item">
                <span class="sci-addr">{{ item.addr }}</span>
                <span class="sci-val">{{ item.val }}</span>
                <span class="sci-label">{{ item.label }}</span>
              </div>
            </div>
            <div class="sc-arrow" v-if="stackSub >= 1">
              <div>handle_signal()</div>
              <div>↓</div>
              <div>修改用户 ESP</div>
              <div>改写 EIP</div>
            </div>
            <div class="sc-after" v-if="stackSub >= 2">
              <div class="sc-title">修改后</div>
              <div v-for="(item, ii) in stackAfter" :key="ii"
                class="sc-item"
                :class="{ 'sci-changed': item.changed }"
              >
                <span class="sci-addr">{{ item.addr }}</span>
                <span class="sci-val">{{ item.val }}</span>
                <span class="sci-label">{{ item.label }}</span>
              </div>
            </div>
          </div>
          <div class="stack-note" v-if="stackSub >= 3">
            <code>iret</code> 执行后，CPU 弹出已修改的 EIP(=handler地址) 和 CS，
            直接进入用户空间的信号处理函数执行。
          </div>
        </template>

        <!-- sig-return: sigreturn -->
        <template v-else-if="currentStep.scene === 'sig-return'">
          <div class="scene-title">信号处理函数返回 — sigreturn()</div>
          <div class="sigret-flow">
            <div v-for="(node, ni) in sigretNodes" :key="ni"
              class="srf-node"
              :class="{ 'srf-active': sigretSub >= ni, 'srf-current': sigretSub === ni }"
            >
              <div class="srf-label">{{ node.label }}</div>
              <div class="srf-code" v-if="node.code">{{ node.code }}</div>
              <div class="srf-note" v-if="node.note && sigretSub >= ni">{{ node.note }}</div>
            </div>
          </div>
          <div class="sigret-summary" v-if="sigretSub >= sigretNodes.length - 1">
            <div class="ss-title">完整信号处理流程闭环</div>
            <div class="ss-flow">
              用户运行 → 系统调用/中断 → ret_from_sys_call
              → do_signal() → handle_signal() 修改 EIP
              → iret → 用户 handler 执行 → sigreturn()
              → 恢复原 EIP → 继续原用户代码
            </div>
          </div>
        </template>
      </div>

      <!-- 右：数据结构详图 -->
      <div class="right-panel">
        <div class="panel-title">{{ currentStep.srcRef }}</div>

        <!-- overview -->
        <template v-if="currentStep.scene === 'overview'">
          <div class="right-note">
            <div class="rn-title">Linux 0.11 信号机制</div>
            <div class="rn-item">• NSIG = 17，用 32 位整数存位图</div>
            <div class="rn-item">• 每个进程有独立的 signal + sigaction[]</div>
            <div class="rn-item">• 信号是<strong>异步</strong>通知机制</div>
            <div class="rn-item">• 只有在进程<strong>重新调度</strong>时才检测</div>
          </div>
          <div class="src-snippet">
            <div class="ss-file">include/signal.h</div>
            <pre>{{ overviewCode }}</pre>
          </div>
        </template>

        <!-- sig-register -->
        <template v-else-if="currentStep.scene === 'sig-register'">
          <div class="src-snippet">
            <div class="ss-file">kernel/signal.c</div>
            <pre>{{ registerCode }}</pre>
          </div>
        </template>

        <!-- sigaction-struct -->
        <template v-else-if="currentStep.scene === 'sigaction-struct'">
          <div class="src-snippet">
            <div class="ss-file">include/signal.h</div>
            <pre>{{ sigactionCode }}</pre>
          </div>
          <div class="right-note" style="margin-top:8px">
            <div class="rn-item">• sa_restorer：libc 提供的恢复函数地址，handler 返回后跳到此处调用 sigreturn()</div>
          </div>
        </template>

        <!-- sys-kill -->
        <template v-else-if="currentStep.scene === 'sys-kill'">
          <div class="src-snippet">
            <div class="ss-file">kernel/signal.c</div>
            <pre>{{ sendSigCode }}</pre>
          </div>
        </template>

        <!-- sig-source -->
        <template v-else-if="currentStep.scene === 'sig-source'">
          <div class="right-note">
            <div class="rn-title">信号与中断的区别</div>
            <div class="rn-item">• 中断：<strong>同步</strong>，硬件触发，立即处理</div>
            <div class="rn-item">• 信号：<strong>异步</strong>，仅设置位图，延迟到进程重调度时处理</div>
            <div class="rn-item">• SIGKILL/SIGSTOP 不可被捕获或忽略</div>
          </div>
          <div class="src-snippet">
            <div class="ss-file">kernel/sched.c (do_timer)</div>
            <pre>{{ doTimerSigCode }}</pre>
          </div>
        </template>

        <!-- ret-check -->
        <template v-else-if="currentStep.scene === 'ret-check'">
          <div class="src-snippet">
            <div class="ss-file">kernel/system_call.s</div>
            <pre>{{ retFromSysCode }}</pre>
          </div>
        </template>

        <!-- do-signal -->
        <template v-else-if="currentStep.scene === 'do-signal'">
          <div class="src-snippet">
            <div class="ss-file">kernel/signal.c</div>
            <pre>{{ doSignalCode }}</pre>
          </div>
        </template>

        <!-- handler-dispatch -->
        <template v-else-if="currentStep.scene === 'handler-dispatch'">
          <div class="src-snippet">
            <div class="ss-file">kernel/signal.c</div>
            <pre>{{ handleSigCode }}</pre>
          </div>
        </template>

        <!-- user-stack -->
        <template v-else-if="currentStep.scene === 'user-stack'">
          <div class="src-snippet">
            <div class="ss-file">kernel/signal.c:handle_signal()</div>
            <pre>{{ userStackCode }}</pre>
          </div>
        </template>

        <!-- sig-return -->
        <template v-else-if="currentStep.scene === 'sig-return'">
          <div class="src-snippet">
            <div class="ss-file">kernel/signal.c</div>
            <pre>{{ sigreturnCode }}</pre>
          </div>
          <div class="right-note" style="margin-top:8px">
            <div class="rn-item">• SA_ONESHOT: 执行一次后恢复 SIG_DFL</div>
            <div class="rn-item">• SA_NOMASK: 执行期间不屏蔽自身信号</div>
          </div>
        </template>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <el-button size="small" @click="prev" :disabled="currentIdx === 0">上一步</el-button>
      <el-button size="small" type="primary" @click="togglePlay">
        {{ isPlaying ? '暂停' : '自动播放' }}
      </el-button>
      <el-button size="small" @click="next" :disabled="currentIdx === steps.length - 1">下一步</el-button>
      <el-button size="small" @click="reset">重置</el-button>
      <span class="step-counter">{{ currentIdx + 1 }} / {{ steps.length }}</span>
    </div>

    <!-- 详情卡片 -->
    <el-card class="detail-card" shadow="never">
      <div class="dc-header">
        <el-tag :type="currentStep.tagType" size="small">{{ currentStep.phase }}</el-tag>
        <span class="dc-title">{{ currentStep.title }}</span>
        <span class="dc-src">{{ currentStep.srcFile }}</span>
      </div>
      <el-divider style="margin: 8px 0" />
      <div class="dc-detail">{{ currentStep.detail }}</div>
      <div class="dc-code" v-if="currentStep.code">
        <pre>{{ currentStep.code }}</pre>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

// ─── 信号列表 ────────────────────────────────────────────────
const allSignals = [
  { num: 1,  name: 'SIGHUP',   desc: '终端挂起',     action: 'term' },
  { num: 2,  name: 'SIGINT',   desc: 'Ctrl+C 中断',  action: 'term' },
  { num: 3,  name: 'SIGQUIT',  desc: 'Ctrl+\\ 退出', action: 'term' },
  { num: 4,  name: 'SIGILL',   desc: '非法指令',     action: 'term' },
  { num: 5,  name: 'SIGTRAP',  desc: '调试断点',     action: 'term' },
  { num: 6,  name: 'SIGABRT',  desc: 'abort()',      action: 'term' },
  { num: 7,  name: 'SIGFPE',   desc: '浮点异常',     action: 'term' },
  { num: 8,  name: 'SIGKILL',  desc: '强制终止',     action: 'term' },
  { num: 9,  name: 'SIGUSR1',  desc: '用户自定义1',  action: 'term' },
  { num: 10, name: 'SIGSEGV',  desc: '段错误',       action: 'term' },
  { num: 11, name: 'SIGUSR2',  desc: '用户自定义2',  action: 'term' },
  { num: 12, name: 'SIGPIPE',  desc: '管道断裂',     action: 'term' },
  { num: 13, name: 'SIGALRM',  desc: 'alarm 超时',   action: 'term' },
  { num: 14, name: 'SIGTERM',  desc: '软件终止',     action: 'term' },
  { num: 15, name: 'SIGCHLD',  desc: '子进程变化',   action: 'ign'  },
  { num: 16, name: 'SIGCONT',  desc: '继续运行',     action: 'cont' },
  { num: 17, name: 'SIGSTOP',  desc: '停止进程',     action: 'stop' },
]

// ─── 步骤数据 ─────────────────────────────────────────────────
const steps = [
  {
    phaseIdx: 0, phase: '总览', title: '信号机制总览：异步通知的实现',
    scene: 'overview',
    srcFile: 'include/signal.h', srcRef: 'signal.h:1',
    tagType: 'info',
    explain: 'Linux 0.11 共 17 种信号，用 32 位位图存储待处理状态',
    detail: '信号（Signal）是 UNIX 进程间通信的核心机制。Linux 0.11 实现了 17 个标准信号（NSIG=17）。每个进程的 task_struct 包含两个关键字段：signal（待处理信号位图）和 sigaction[](处理函数表)。信号的设计是异步的：发送方只设置接收方的 signal 位图，接收方在重新被调度时（ret_from_sys_call）才真正处理。',
    code: 'task_struct { unsigned long signal; /* 位图 */\n              struct sigaction sigaction[32]; }',
  },
  {
    phaseIdx: 1, phase: '注册', title: 'sys_signal() — 注册信号处理函数',
    scene: 'sig-register',
    srcFile: 'kernel/signal.c', srcRef: 'signal.c:20',
    tagType: 'success',
    explain: 'sys_signal 是 signal() 库函数对应的系统调用，填写 sigaction[] 表项',
    detail: 'sys_signal(int signum, long handler) 将用户提供的 handler 地址写入当前进程 task_struct 的 sigaction[signum-1] 中。sa_flags 被置为 SA_ONESHOT|SA_NOMASK（执行一次后恢复默认，期间不屏蔽自身）。返回值是旧的 handler 地址，供调用方保存。',
    code: 'signal(SIGINT, my_handler);\n// 即: sys_signal(2, my_handler)',
  },
  {
    phaseIdx: 1, phase: '注册', title: 'struct sigaction — 信号处理描述符结构',
    scene: 'sigaction-struct',
    srcFile: 'include/signal.h', srcRef: 'signal.h:70',
    tagType: 'success',
    explain: 'sigaction 结构描述一个信号的完整处理方式，包括函数、掩码、标志',
    detail: 'sigaction 结构中 sa_handler 是处理函数指针（SIG_DFL=0 默认/SIG_IGN=1 忽略/用户地址自定义）；sa_mask 是执行 handler 时额外屏蔽的信号集；sa_flags 控制行为（SA_ONESHOT 执行后恢复默认，SA_NOMASK 不自动屏蔽自身）；sa_restorer 是 libc 提供的信号恢复桩，handler 返回后跳到此处调用 sigreturn()。',
    code: 'struct sigaction {\n  void (*sa_handler)(int);\n  sigset_t sa_mask;\n  int sa_flags;\n  void (*sa_restorer)(void);\n};',
  },
  {
    phaseIdx: 2, phase: '发送', title: 'sys_kill() + send_sig() — 置位 signal 位图',
    scene: 'sys-kill',
    srcFile: 'kernel/signal.c', srcRef: 'signal.c:55',
    tagType: 'warning',
    explain: 'sys_kill 找到目标进程后调用 send_sig，后者设置 signal 位图中对应的位',
    detail: 'kill(pid, sig) 系统调用进入 sys_kill()。sys_kill 遍历 task[] 找到目标进程（或进程组），对每个目标调用 send_sig(sig, task, priv)。send_sig 做权限检查后执行：task->signal |= (1 << (sig-1))，将目标进程 task_struct.signal 的第 sig-1 位置 1。这就是"发送信号"的全部操作——设一个 bit，不强制中断目标进程。',
    code: 'send_sig(int sig, struct task_struct *p, int priv) {\n  p->signal |= (1 << (sig-1));\n}',
  },
  {
    phaseIdx: 2, phase: '发送', title: '信号来源：键盘、内核异常、进程间',
    scene: 'sig-source',
    srcFile: 'kernel/sched.c', srcRef: 'sched.c:150',
    tagType: 'warning',
    explain: '信号有三种来源，最终都汇聚到 send_sig() 设置位图',
    detail: '键盘路径：IRQ1 触发 keyboard_interrupt → tty_signal → 对前台进程组调用 kill_pg(pg, SIGINT)。内核路径：异常（SIGSEGV/SIGFPE 等）和定时器（SIGALRM）由内核直接调用 send_sig()；do_timer() 每个时钟中断检查 current->alarm 是否到期，到期则 send_sig(SIGALRM, current, 1)。进程路径：kill()/raise() 系统调用 → sys_kill() → send_sig()。',
    code: '// do_timer 中检查 alarm\nif (current->alarm && current->alarm < jiffies) {\n  send_sig(SIGALRM, current, 1);\n  current->alarm = 0;\n}',
  },
  {
    phaseIdx: 3, phase: '检测', title: 'ret_from_sys_call — 信号检测时机',
    scene: 'ret-check',
    srcFile: 'kernel/system_call.s', srcRef: 'system_call.s:90',
    tagType: 'danger',
    explain: '每次系统调用或中断返回用户态前，都经过 ret_from_sys_call 检查信号',
    detail: 'ret_from_sys_call 是 Linux 0.11 中所有系统调用和外部中断返回用户态的统一出口（kernel/system_call.s）。返回前先检查当前进程是否有待处理信号：若 task_struct.signal & ~task_struct.blocked != 0，则调用 do_signal()。这是信号处理的触发点，也是信号"异步"特性的根源——信号不立即处理，等进程被重新调度才响应。',
    code: 'ret_from_sys_call:\n  movl current,%eax\n  cmpl $0,signal(%eax)    # 有信号?\n  jne  do_signal\n  ...\n  iret',
  },
  {
    phaseIdx: 3, phase: '检测', title: 'do_signal() — 扫描位图找待处理信号',
    scene: 'do-signal',
    srcFile: 'kernel/signal.c', srcRef: 'signal.c:100',
    tagType: 'danger',
    explain: 'do_signal 从信号1开始逐位扫描，找到第一个未屏蔽的待处理信号',
    detail: 'do_signal(long signr, long eax, ...) 接收来自 ret_from_sys_call 传入的寄存器参数。函数遍历信号 1~32：用 (signal >> (signr-1)) & 1 检测是否有该信号，同时检查 blocked 位图是否屏蔽了它。找到第一个有效信号后，清除 signal 位图中该位（task->signal &= ~(1<<(signr-1))），然后调用 handle_signal() 处理。',
    code: 'for (signr=1; signr<=32; signr++) {\n  if (!((signal >> (signr-1)) & 1))\n    continue;\n  // 找到了！清除该位\n  current->signal &= ~(1<<(signr-1));\n  handle_signal(signr, sa, ...);\n  return;\n}',
  },
  {
    phaseIdx: 3, phase: '检测', title: 'handle_signal() — SIG_DFL / SIG_IGN / 用户处理函数',
    scene: 'handler-dispatch',
    srcFile: 'kernel/signal.c', srcRef: 'signal.c:120',
    tagType: 'danger',
    explain: '根据 sa_handler 的值决定执行默认动作、忽略，还是跳入用户函数',
    detail: 'handle_signal(signr, sa, ...) 先检查 sa_handler：若为 SIG_IGN(1) 则直接返回，若为 SIG_DFL(0) 则执行默认动作（SIGTERM/SIGINT → do_exit()，SIGSTOP → 进入 STOPPED 状态，SIGCHLD → 默认忽略）。若为用户地址，则修改 eip（让 iret 后跳入 handler）并在用户栈上伪造返回地址（指向 sa_restorer），以便 handler 返回后能触发 sigreturn。',
    code: 'if (sa->sa_handler == SIG_IGN) return;\nif (sa->sa_handler == SIG_DFL) {\n  if (signr == SIGCHLD) return;\n  do_exit(1<<(signr-1));\n}\n// 否则执行用户 handler',
  },
  {
    phaseIdx: 4, phase: '执行', title: '修改用户栈与 EIP — 让 iret 直接进入 handler',
    scene: 'user-stack',
    srcFile: 'kernel/signal.c', srcRef: 'signal.c:138',
    tagType: '',
    explain: '在用户栈上伪造返回帧，把内核栈里保存的 EIP 改成 handler 地址',
    detail: 'handle_signal 通过操作保存在内核栈上的 pt_regs 结构完成"跳转"：① 读出当前用户 ESP（来自 pt_regs.esp）；② 在用户栈上依次压入 eax（系统调用返回值）、signal 编号；③ 把 sa_restorer 地址写入用户栈作为 handler 的"返回地址"；④ 最关键：把 pt_regs.eip 改为 sa_handler 地址。当 iret 执行时，CPU 从内核栈弹出已修改的 CS:EIP，直接进入用户态的信号处理函数。',
    code: '// 修改用户栈 (*(--esp) = ... )\n*(--esp) = eax;       // 保存 eax\n*(--esp) = signr;     // 信号编号（handler 的参数）\n*(--esp) = restorer;  // handler 的返回地址\n// 修改内核栈上保存的 eip\n*(&eip) = (unsigned long) sa->sa_handler;',
  },
  {
    phaseIdx: 4, phase: '执行', title: 'sigreturn() — 信号处理完成，恢复原上下文',
    scene: 'sig-return',
    srcFile: 'kernel/signal.c', srcRef: 'signal.c:10',
    tagType: '',
    explain: '用户 handler 返回后 → restorer → sigreturn() 恢复原始 EIP 继续执行',
    detail: 'handler 函数通过 ret 返回后，CPU 弹出用户栈上的 sa_restorer 地址并跳过去。restorer 是 libc 提供的短小函数，调用 sigreturn() 系统调用（Linux 0.11 中为 sys_sigreturn，或直接用 int 0x80 调用 signal 号）。sys_sigreturn 从用户栈恢复原始寄存器（esp、eip 等），让进程回到被信号打断的位置继续执行。整个流程闭环：信号触发 → 异步通知 → iret 偷梁换柱 → handler 执行 → sigreturn → 回到原点。',
    code: '// sa_restorer (libc 提供)\nvoid __restore(void) {\n  __asm__("int $0x80" : : "a"(__NR_sigreturn));\n}',
  },
]

// ─── 当前状态 ─────────────────────────────────────────────────
const currentIdx = ref(0)
const isPlaying = ref(false)
let playTimer = null

const currentStep = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => steps[currentIdx.value].phaseIdx)

const phases = ['总览', '注册', '发送', '检测', '执行']

// 左侧 signal 状态（随步骤变化）
const signalBitmap = ref(0)       // 当前进程 signal 位图
const highlightBit = ref(0)
const pendingSigName = computed(() => {
  if (signalBitmap.value & (1 << 1)) return 'SIGINT (2)'
  if (signalBitmap.value & (1 << 13)) return 'SIGALRM (14)'
  return null
})

const sigactionTable = ref([
  { num: 1,  name: 'SIGHUP',  type: 'dfl', handlerLabel: 'SIG_DFL', active: false },
  { num: 2,  name: 'SIGINT',  type: 'dfl', handlerLabel: 'SIG_DFL', active: false },
  { num: 9,  name: 'SIGKILL', type: 'dfl', handlerLabel: 'SIG_DFL', active: false },
  { num: 14, name: 'SIGTERM', type: 'dfl', handlerLabel: 'SIG_DFL', active: false },
  { num: 15, name: 'SIGCHLD', type: 'ign', handlerLabel: 'SIG_IGN',  active: false },
])

function isBitSet(bit) {
  return !!(signalBitmap.value & (1 << (bit - 1)))
}

// ─── 动画状态 ─────────────────────────────────────────────────
const regAnimIdx  = ref(-1)
const killAnimIdx = ref(-1)
const retCheckSub = ref(-1)
const doSigPos    = ref(0)
const doSigFound  = ref(false)
const doSigCodeLine = ref(-1)
const hdAnimIdx   = ref(0)
const stackSub    = ref(0)
const sigretSub   = ref(-1)

let subTimer = null
let scanTimer = null

function clearTimers() {
  clearTimeout(subTimer)
  clearInterval(scanTimer)
  subTimer = null
  scanTimer = null
}

function ticker(animRef, max, interval, onDone) {
  animRef.value = 0
  scanTimer = setInterval(() => {
    animRef.value++
    if (animRef.value >= max) {
      clearInterval(scanTimer)
      if (onDone) onDone()
    }
  }, interval)
}

// ─── 注册流程节点 ─────────────────────────────────────────────
const regFlowNodes = [
  { label: 'signal(SIGINT, my_handler)', sub: '用户程序调用' },
  { label: 'int 0x80  (eax=48)', sub: 'sys_signal 号' },
  { label: 'sys_signal(signum=2, handler)', sub: 'kernel/signal.c:20' },
  { label: '权限校验 (SIGKILL/SIGSTOP 不可捕获)', sub: '' },
  { label: 'sa->sa_handler = handler', sub: '写入 sigaction[]' },
  { label: 'sa->sa_flags = SA_ONESHOT|SA_NOMASK', sub: '' },
  { label: '返回旧 handler 地址', sub: '' },
]

// ─── sys_kill 流程节点 ────────────────────────────────────────
const killFlowNodes = [
  { label: 'kill(pid, SIGINT)', code: '用户调用 sys_kill(2, 2)' },
  { label: 'sys_kill(pid, sig)', code: 'kernel/signal.c:55' },
  { label: '遍历 task[] 找目标进程', code: 'for(i=0; i<NR_TASKS; i++)' },
  { label: 'send_sig(SIGINT, target, priv)', code: 'kernel/signal.c:43' },
  { label: 'target->signal |= (1 << 1)', code: '置位 signal 位图第 2 位' },
]

// ─── ret_from_sys_call 时间线节点 ─────────────────────────────
const retCheckNodes = [
  { label: '用户程序执行中', detail: 'CPL=3，用户态' },
  { label: 'int 0x80 / 外部中断', detail: '进入内核，CPL→0' },
  { label: '内核处理完成', detail: '系统调用或中断服务结束' },
  { label: 'ret_from_sys_call', detail: 'system_call.s 的统一返回出口', isSignal: true },
  { label: 'current->signal & ~blocked ≠ 0?', detail: '检查是否有未屏蔽的待处理信号', isSignal: true },
  { label: '调用 do_signal()', detail: '信号分发处理', isSignal: true },
  { label: 'iret → 用户态', detail: 'EIP 可能已被修改为 handler 地址' },
]

// ─── do_signal 扫描代码行 ─────────────────────────────────────
const doSigCode = [
  'int do_signal(long signr, long eax, ...) {',
  '  unsigned long sa_handler;',
  '  unsigned long signal = current->signal;',
  '  for (signr = 1; signr <= 32; signr++) {',
  '    if (!((signal >> (signr-1)) & 1)) continue;',
  '    // 找到信号 signr!',
  '    current->signal &= ~(1 << (signr-1));',
  '    handle_signal(signr, sa, eax, ...);',
  '    return 1;',
  '  }',
  '  return 0;',
  '}',
]

// ─── 用户栈 before/after ──────────────────────────────────────
const stackBefore = [
  { addr: 'esp+16', val: 'SS_user',    label: '用户 SS (硬件压入)' },
  { addr: 'esp+12', val: 'ESP_user',   label: '用户 ESP (硬件压入)' },
  { addr: 'esp+8',  val: 'EFLAGS',     label: '标志寄存器 (硬件压入)' },
  { addr: 'esp+4',  val: 'CS_user',    label: '用户 CS (硬件压入)' },
  { addr: 'esp+0',  val: 'EIP_orig',   label: '用户 EIP ← 返回地址' },
]
const stackAfter = [
  { addr: 'esp+16', val: 'SS_user',    label: '用户 SS (不变)' },
  { addr: 'esp+12', val: 'ESP_user-8', label: '用户 ESP (handle_signal 已修改)', changed: true },
  { addr: 'esp+8',  val: 'EFLAGS',     label: '标志寄存器 (不变)' },
  { addr: 'esp+4',  val: 'CS_user',    label: '用户 CS (不变)' },
  { addr: 'esp+0',  val: 'handler地址',label: 'EIP ← handler 地址', changed: true },
]

// ─── sigreturn 流程节点 ───────────────────────────────────────
const sigretNodes = [
  { label: '用户 handler() 执行完毕', code: 'ret  ; x86 ret 指令' },
  { label: '弹出 sa_restorer 地址', code: '从用户栈弹出返回地址', note: '即 libc.__restore' },
  { label: '跳入 sa_restorer', code: '__restore: int $0x80 (sigreturn)' },
  { label: 'sys_sigreturn()', code: 'kernel/signal.c:10', note: '恢复 pt_regs 中的寄存器' },
  { label: '恢复原始 EIP = EIP_orig', code: '*(&eip) = orig_eip;', note: '指向被打断的那条指令' },
  { label: 'iret → 继续原用户代码', code: '', note: '信号处理闭环完成' },
]

// ─── 源码片段 ─────────────────────────────────────────────────
const overviewCode = `/* include/signal.h */
#define NSIG    17

/* include/linux/sched.h: task_struct */
struct task_struct {
  ...
  unsigned long signal;      /* 信号位图 */
  unsigned long blocked;     /* 屏蔽位图 */
  struct sigaction sigaction[32]; /* 处理函数表 */
  ...
};`

const registerCode = `/* kernel/signal.c */
int sys_signal(int signum, long handler)
{
  struct sigaction tmp;
  if (signum < 1 || signum > 32 ||
      signum == SIGKILL)
    return -EINVAL;
  tmp.sa_handler = (void (*)(int)) handler;
  tmp.sa_mask    = 0;
  tmp.sa_flags   = SA_ONESHOT | SA_NOMASK;
  tmp.sa_restorer = NULL;
  /* 返回旧 handler */
  handler = (long) current->sigaction[signum-1].sa_handler;
  current->sigaction[signum-1] = tmp;
  return handler;
}`

const sigactionCode = `/* include/signal.h */
struct sigaction {
  void     (*sa_handler)(int);  /* 处理函数 */
  sigset_t   sa_mask;           /* 屏蔽集合 */
  int        sa_flags;          /* 行为标志 */
  void     (*sa_restorer)(void);/* 恢复函数 */
};
#define SIG_DFL  ((void(*)(int))0)  /* 默认 */
#define SIG_IGN  ((void(*)(int))1)  /* 忽略 */
#define SA_ONESHOT   1  /* 执行后恢复默认 */
#define SA_NOMASK    2  /* 不自动屏蔽自身 */`

const sendSigCode = `/* kernel/signal.c */
int send_sig(long sig,
             struct task_struct * p,
             int priv)
{
  if (!p) return -EINVAL;
  if (!priv && ...) return -EPERM;
  /* 核心：置位 signal 位图 */
  p->signal |= (1 << (sig-1));
  return 0;
}`

const doTimerSigCode = `/* kernel/sched.c: do_timer() */
void do_timer(long cpl)
{
  ...
  /* 检查 alarm 是否到期 */
  if (current->alarm &&
      current->alarm < jiffies) {
    send_sig(SIGALRM, current, 1);
    current->alarm = 0;
  }
  ...
  schedule();
}`

const retFromSysCode = `; kernel/system_call.s
ret_from_sys_call:
  movl current,%eax
  ; 检查 signal 位图（排除屏蔽）
  movl signal(%eax),%ebx
  movl blocked(%eax),%ecx
  notl %ecx
  andl %ebx,%ecx
  jne  do_signal       ; 有待处理信号
  ; 无信号，直接返回
  popl %eax
  ...
  iret`

const doSignalCode = `/* kernel/signal.c */
int do_signal(long signr, long eax,
              long ebx, ..., long eip,
              long cs, long eflags,
              unsigned long * esp, long ss)
{
  struct sigaction * sa;
  unsigned long signal = current->signal;
  while (signr = 1..32) {
    if (!((signal >> (signr-1)) & 1))
      continue;
    sa = &current->sigaction[signr-1];
    current->signal &= ~(1<<(signr-1));
    handle_signal(signr, sa, eax, ...);
    return 1;
  }
  return 0;
}`

const handleSigCode = `/* kernel/signal.c */
static void handle_signal(unsigned long signr,
  struct sigaction * sa, unsigned long eax, ...)
{
  long *esp = (long *) esp_ptr;
  if (sa->sa_handler == SIG_IGN) return;
  if (!sa->sa_handler) {  /* SIG_DFL */
    if (signr == SIGCHLD) return;
    do_exit(1 << (signr-1));
  }
  /* 自定义 handler：修改用户栈和 EIP */
  *(--esp) = eax;         /* 保存 eax */
  *(--esp) = signr;       /* 信号编号 → handler 参数 */
  *(--esp) = (long)sa->sa_restorer; /* 返回地址 */
  *(&eip) = (unsigned long) sa->sa_handler;
  *esp_ptr = (unsigned long) esp;
}`

const userStackCode = `/* handle_signal() 关键部分 */
/* esp 是用户栈指针 */
*(--esp) = eax;
*(--esp) = signr;             /* handler 的参数 sig */
*(--esp) = (long) sa->sa_restorer; /* ret addr */

/* 把内核栈上保存的 EIP 改为 handler */
*(&eip) = (unsigned long) sa->sa_handler;

/* SA_ONESHOT: 执行一次后恢复 SIG_DFL */
if (sa->sa_flags & SA_ONESHOT)
  sa->sa_handler = NULL;`

const sigreturnCode = `/* kernel/signal.c: sys_sigreturn */
int sys_sigreturn(unsigned long __unused)
{
  struct pt_regs *regs =
    (struct pt_regs *) &__unused;
  /* 从用户栈恢复 eax（syscall 返回值）*/
  regs->eax = *(unsigned long *)(regs->esp + 4);
  /* 恢复用户 ESP */
  regs->esp += 4 * 2;
  return regs->eax;
}
/* libc restorer stub */
void __restore(void) {
  __asm__("int $0x80"::"a"(__NR_sigreturn));
}`

// ─── watch 驱动动画 ───────────────────────────────────────────
watch(currentIdx, (idx) => {
  clearTimers()
  regAnimIdx.value  = -1
  killAnimIdx.value = -1
  retCheckSub.value = -1
  doSigPos.value    = 0
  doSigFound.value  = false
  doSigCodeLine.value = -1
  hdAnimIdx.value   = 0
  stackSub.value    = 0
  sigretSub.value   = -1
  highlightBit.value = 0

  const scene = steps[idx].scene

  // 更新左侧信号状态
  if (idx <= 2) {
    signalBitmap.value = 0
    sigactionTable.value[1].type = 'dfl'
    sigactionTable.value[1].handlerLabel = 'SIG_DFL'
    sigactionTable.value[1].active = false
  } else if (idx === 1) {
    // sig-register 结束后 SIGINT 有 handler
  } else if (idx >= 3) {
    // sys-kill 之后 signal bitmap 有 SIGINT
    if (idx >= 3) signalBitmap.value = (1 << 1)
    if (idx >= 1) {
      sigactionTable.value[1].type = 'custom'
      sigactionTable.value[1].handlerLabel = '0x08049A10'
      sigactionTable.value[1].active = true
    }
  }

  if (scene === 'sig-register') {
    ticker(regAnimIdx, regFlowNodes.length - 1, 600)
  } else if (scene === 'sys-kill') {
    signalBitmap.value = 0
    ticker(killAnimIdx, killFlowNodes.length - 1, 700, () => {
      signalBitmap.value = (1 << 1)
      highlightBit.value = 2
    })
  } else if (scene === 'ret-check') {
    ticker(retCheckSub, retCheckNodes.length - 1, 700)
  } else if (scene === 'do-signal') {
    signalBitmap.value = (1 << 1)
    let bit = 0
    scanTimer = setInterval(() => {
      bit++
      doSigPos.value = bit
      doSigCodeLine.value = bit < 2 ? 3 : (bit === 2 ? 5 : 6)
      if (bit === 2) {
        doSigFound.value = true
        highlightBit.value = 2
        clearInterval(scanTimer)
      }
    }, 500)
  } else if (scene === 'handler-dispatch') {
    ticker(hdAnimIdx, 3, 700)
  } else if (scene === 'user-stack') {
    ticker(stackSub, 3, 800)
  } else if (scene === 'sig-return') {
    ticker(sigretSub, sigretNodes.length - 1, 700)
  }
}, { immediate: true })

// ─── 导航 ──────────────────────────────────────────────────────
function next()  { if (currentIdx.value < steps.length - 1) currentIdx.value++ }
function prev()  { if (currentIdx.value > 0) currentIdx.value-- }
function reset() { currentIdx.value = 0; isPlaying.value = false; clearInterval(playTimer) }
function jumpToPhase(pi) { currentIdx.value = steps.findIndex(s => s.phaseIdx === pi) }
function togglePlay() {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    playTimer = setInterval(() => {
      if (currentIdx.value < steps.length - 1) currentIdx.value++
      else { isPlaying.value = false; clearInterval(playTimer) }
    }, 4000)
  } else {
    clearInterval(playTimer)
  }
}
onUnmounted(() => { clearTimers(); clearInterval(playTimer) })
</script>

<style scoped>
.signal-vis { max-width: 1100px; margin: 0 auto; }

/* ─── Phase bar ─── */
.phase-bar { display: flex; gap: 4px; margin-bottom: 12px; }
.phase-seg {
  flex: 1; padding: 6px 10px; border-radius: 6px; cursor: pointer;
  background: #f0f2f5; text-align: center; font-size: 12px; color: #909399;
  transition: all .2s;
}
.phase-seg.active  { background: #409EFF; color: #fff; }
.phase-seg.done    { background: #67C23A; color: #fff; }
.phase-label { white-space: nowrap; }

/* ─── Step dots ─── */
.step-row { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.step-dot {
  width: 10px; height: 10px; border-radius: 50%; background: #dcdfe6;
  cursor: pointer; transition: all .2s;
}
.step-dot.active { background: #409EFF; transform: scale(1.4); }
.step-dot.done   { background: #67C23A; }

/* ─── Main grid ─── */
.main-grid {
  display: grid;
  grid-template-columns: 230px 1fr 240px;
  gap: 12px;
  margin-bottom: 12px;
  align-items: start;
}

/* ─── Panel shared ─── */
.left-panel, .right-panel {
  background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; padding: 12px;
}
.center-panel {
  background: #fff; border: 1px solid #e4e7ed; border-radius: 8px;
  padding: 16px; min-height: 420px;
}
.panel-title { font-size: 11px; font-weight: 600; color: #909399; margin-bottom: 8px; text-transform: uppercase; }
.scene-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 14px; text-align: center; }

/* ─── 左侧：信号位图 ─── */
.sig-bitmap-section { margin-bottom: 12px; }
.bitmap-label { font-size: 10px; color: #909399; margin-bottom: 4px; }
.bitmap-grid { display: flex; flex-wrap: wrap; gap: 2px; }
.bitmap-bit {
  width: 24px; height: 24px; border-radius: 3px;
  background: #f5f7fa; border: 1px solid #e4e7ed;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: default; transition: all .3s;
}
.bitmap-bit.bit-set { background: #fef0f0; border-color: #F56C6C; }
.bitmap-bit.bit-highlighted { background: #F56C6C; border-color: #F56C6C; animation: flash .5s 3; }
.bit-num { font-size: 8px; color: #909399; line-height: 1; }
.pending-sig { font-size: 11px; color: #F56C6C; margin-top: 4px; font-weight: 600; }

/* ─── 左侧：sigaction 表 ─── */
.sigaction-section { margin-bottom: 8px; }
.sa-row {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 4px; border-radius: 3px; font-size: 10px;
  transition: background .3s;
}
.sa-row.sa-active { background: #ecf5ff; }
.sa-num  { width: 16px; color: #909399; font-weight: 600; flex-shrink: 0; }
.sa-name { width: 56px; color: #606266; flex-shrink: 0; }
.sa-handler { font-size: 9px; border-radius: 3px; padding: 1px 3px; }
.sa-dfl    { background: #f0f2f5; color: #909399; }
.sa-ign    { background: #f0f9eb; color: #67C23A; }
.sa-custom { background: #ecf5ff; color: #409EFF; font-size: 8px; }

.left-explain { margin-top: 8px; font-size: 11px; color: #606266; line-height: 1.5; padding: 6px; background: #f5f7fa; border-radius: 4px; }
.explain-label { font-size: 11px; color: #606266; }

/* ─── 总览 ─── */
.overview-flow {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.ov-node {
  padding: 8px 10px; border-radius: 6px; text-align: center;
  font-size: 11px; font-weight: 600; line-height: 1.4;
}
.ov-src     { background: #fff3e0; color: #e6a23c; border: 1px solid #f0d9a8; }
.ov-bitmap  { background: #fef0f0; color: #F56C6C; border: 1px solid #f9c0c0; }
.ov-check   { background: #ecf5ff; color: #409EFF; border: 1px solid #c6dbff; }
.ov-handler { background: #f0f9eb; color: #67C23A; border: 1px solid #b3e19d; }
.ov-arrow   { color: #909399; font-size: 16px; }

.sig-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 8px;
}
.sig-cell {
  padding: 4px 6px; border-radius: 4px; font-size: 10px; border: 1px solid transparent;
}
.sig-action-term { background: #fef0f0; border-color: #f9c0c0; }
.sig-action-ign  { background: #f0f9eb; border-color: #b3e19d; }
.sig-action-stop { background: #fff3e0; border-color: #f0d9a8; }
.sig-action-cont { background: #ecf5ff; border-color: #c6dbff; }
.sig-cell-num  { font-weight: 700; color: #606266; font-size: 9px; }
.sig-cell-name { font-weight: 600; color: #303133; }
.sig-cell-desc { color: #909399; font-size: 9px; }

.sig-legend { display: flex; gap: 10px; font-size: 10px; color: #909399; }
.legend-item { display: flex; align-items: center; gap: 3px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.dot-term { background: #F56C6C; }
.dot-ign  { background: #67C23A; }
.dot-stop { background: #e6a23c; }
.dot-cont { background: #409EFF; }

/* ─── 注册流程 ─── */
.code-flow { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.cf-node {
  padding: 8px 12px; border-radius: 6px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.cf-node.cf-active  { opacity: 1; border-left-color: #409EFF; }
.cf-node.cf-current { background: #ecf5ff; }
.cf-label { font-size: 12px; font-weight: 600; color: #303133; }
.cf-sub   { font-size: 10px; color: #909399; margin-top: 2px; }

.reg-result { margin-top: 12px; }
.reg-box { border: 1px solid #c6dbff; border-radius: 6px; padding: 10px; background: #ecf5ff; }
.reg-title { font-size: 11px; font-weight: 700; color: #409EFF; margin-bottom: 6px; }
.reg-field { display: flex; gap: 8px; font-size: 11px; padding: 2px 0; }
.rf-key { color: #909399; width: 80px; flex-shrink: 0; }
.rf-val { color: #303133; }
.rf-custom { color: #409EFF; font-weight: 600; }

/* ─── sigaction struct ─── */
.struct-diagram { margin-bottom: 12px; }
.struct-title { font-size: 10px; color: #909399; margin-bottom: 4px; }
.struct-row {
  display: grid; grid-template-columns: 80px 100px 40px 1fr;
  gap: 4px; padding: 4px 6px; font-size: 10px; border-radius: 3px;
}
.struct-row.sr-highlight { background: #ecf5ff; }
.sr-type { color: #9B59B6; font-family: monospace; }
.sr-name { color: #303133; font-weight: 600; font-family: monospace; }
.sr-size { color: #909399; }
.sr-desc { color: #606266; }
.sigaction-fields {
  /* defined inline */
}
.handler-vals { margin-top: 8px; }
.hv-title { font-size: 10px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.hv-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 10px; }
.hv-val { padding: 1px 5px; border-radius: 3px; font-weight: 600; font-family: monospace; flex-shrink: 0; }
.hv-dfl    { background: #f0f2f5; color: #909399; }
.hv-ign    { background: #f0f9eb; color: #67C23A; }
.hv-custom { background: #ecf5ff; color: #409EFF; }
.hv-desc { color: #606266; }

/* ─── sys-kill ─── */
.kill-flow { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.kf-node {
  padding: 7px 12px; border-radius: 6px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.kf-node.kf-active  { opacity: 1; border-left-color: #e6a23c; }
.kf-node.kf-current { background: #fff3e0; }
.kf-label { font-size: 12px; font-weight: 600; color: #303133; }
.kf-code  { font-size: 10px; color: #909399; margin-top: 2px; font-family: monospace; }

.bitmap-demo { margin-top: 12px; padding: 10px; border-radius: 6px; background: #fef0f0; border: 1px solid #f9c0c0; }
.bd-label { font-size: 11px; color: #F56C6C; font-weight: 600; margin-bottom: 6px; }
.bd-bits { display: flex; gap: 4px; flex-wrap: wrap; }
.bd-bit {
  width: 36px; height: 44px; border-radius: 4px; background: #fff;
  border: 1px solid #e4e7ed; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-size: 10px;
  transition: all .4s;
}
.bd-bit.bd-set { background: #F56C6C; border-color: #F56C6C; color: #fff; }
.bd-num { font-size: 9px; color: #909399; }
.bd-val { font-weight: 700; font-size: 14px; }
.bd-code { margin-top: 6px; font-size: 10px; font-family: monospace; color: #606266; }

/* ─── sig-source ─── */
.source-diagram { display: flex; gap: 12px; justify-content: space-around; margin-bottom: 16px; }
.src-col { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.src-node {
  padding: 10px; border-radius: 8px; text-align: center;
  font-size: 11px; font-weight: 600; line-height: 1.6; width: 100%;
}
.src-keyboard { background: #fff3e0; border: 1px solid #f0d9a8; color: #e6a23c; }
.src-kernel   { background: #fef0f0; border: 1px solid #f9c0c0; color: #F56C6C; }
.src-process  { background: #ecf5ff; border: 1px solid #c6dbff; color: #409EFF; }
.src-path { font-size: 10px; color: #909399; text-align: center; }

.src-merge { text-align: center; margin-top: 8px; }
.src-arrow { font-size: 18px; color: #909399; letter-spacing: 16px; }
.src-target {
  display: inline-block; padding: 8px 16px; background: #f0f2f5;
  border-radius: 6px; font-size: 12px; font-weight: 600;
  color: #303133; margin: 4px 0; font-family: monospace;
}
.src-action { font-size: 11px; color: #606266; font-family: monospace; }

/* ─── ret-check ─── */
.ret-timeline { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.rt-node {
  padding: 7px 12px; border-radius: 6px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.rt-node.rt-active  { opacity: 1; border-left-color: #409EFF; }
.rt-node.rt-signal.rt-active { border-left-color: #F56C6C; background: #fef0f0; }
.rt-node.rt-current { box-shadow: 0 0 0 2px #409EFF40; }
.rt-label  { font-size: 12px; font-weight: 600; color: #303133; }
.rt-detail { font-size: 10px; color: #909399; margin-top: 2px; }
.ret-note {
  padding: 10px; border-radius: 6px; background: #f0f9eb;
  border: 1px solid #b3e19d; font-size: 11px; color: #606266; line-height: 1.6;
}

/* ─── do-signal 扫描 ─── */
.scan-bitmap { }
.scan-label { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.scan-bits { display: flex; gap: 3px; flex-wrap: wrap; margin-bottom: 12px; }
.scan-bit {
  width: 38px; height: 52px; border-radius: 4px; background: #f5f7fa;
  border: 1px solid #e4e7ed; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-size: 9px; transition: all .3s;
}
.scan-bit.scan-current { border-color: #409EFF; background: #ecf5ff; box-shadow: 0 0 0 2px #409EFF40; }
.scan-bit.scan-set     { border-color: #F56C6C; background: #fef0f0; }
.scan-bit.scan-found   { background: #F56C6C; border-color: #F56C6C; color: #fff; animation: flash .5s 3; }
.scan-bit.scan-checked { opacity: .5; }
.sb-num  { font-size: 8px; color: #909399; }
.sb-val  { font-size: 14px; font-weight: 700; color: #303133; }
.sb-name { font-size: 8px; color: #909399; }
.scan-bit.scan-found .sb-val,
.scan-bit.scan-found .sb-num,
.scan-bit.scan-found .sb-name { color: #fff; }
.scan-code {
  background: #1a1a2e; border-radius: 6px; padding: 10px;
  font-family: monospace; font-size: 10px; color: #a0aec0;
}
.sc-line { padding: 1px 4px; border-radius: 2px; transition: all .3s; }
.sc-line.sc-active { background: #409EFF40; color: #fff; }
.scan-found-msg {
  margin-top: 8px; padding: 8px 12px; background: #fef0f0;
  border-radius: 6px; color: #F56C6C; font-weight: 600; font-size: 12px;
  border: 1px solid #f9c0c0; animation: flash .3s;
}

/* ─── handler dispatch ─── */
.dispatch-tree { }
.dt-root {
  text-align: center; padding: 10px 16px; border-radius: 8px;
  background: #f5f7fa; border: 1px solid #dcdfe6; font-weight: 600;
  font-size: 12px; margin-bottom: 16px;
}
.dt-branches { display: flex; gap: 12px; }
.dt-branch { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.dt-connector { width: 1px; height: 16px; background: #dcdfe6; }
.dt-node {
  width: 100%; padding: 8px 10px; border-radius: 6px; text-align: center;
  font-size: 11px; font-weight: 600; opacity: .35; transition: all .4s;
  border: 1px solid transparent;
}
.dt-node.dt-active { opacity: 1; }
.dt-dfl  { background: #fff3e0; border-color: #f0d9a8; color: #e6a23c; }
.dt-ign  { background: #f0f9eb; border-color: #b3e19d; color: #67C23A; }
.dt-user { background: #ecf5ff; border-color: #c6dbff; color: #409EFF; }
.dt-sub-actions { width: 100%; display: flex; flex-direction: column; gap: 3px; }
.dsa-item { padding: 3px 6px; border-radius: 3px; font-size: 10px; }
.dsa-term { background: #fef0f0; color: #F56C6C; }
.dsa-stop { background: #fff3e0; color: #e6a23c; }
.dsa-ign  { background: #f0f9eb; color: #67C23A; }
.dt-ign-note, .dt-user-note {
  font-size: 10px; color: #909399; text-align: center; padding: 4px;
}

/* ─── user-stack ─── */
.stack-compare { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.sc-before, .sc-after { flex: 1; min-width: 140px; }
.sc-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.sc-item {
  display: flex; align-items: center; gap: 4px; padding: 3px 6px;
  border-radius: 3px; font-size: 10px; font-family: monospace;
  border-left: 3px solid #e4e7ed; margin-bottom: 2px; background: #f5f7fa;
}
.sc-item.sci-changed { background: #fef0f0; border-left-color: #F56C6C; color: #F56C6C; font-weight: 600; animation: flash .5s; }
.sci-addr { color: #909399; width: 45px; flex-shrink: 0; }
.sci-val  { color: #303133; width: 85px; flex-shrink: 0; }
.sci-label{ color: #909399; font-size: 9px; }
.sc-arrow {
  padding: 10px; background: #f0f9eb; border-radius: 6px;
  text-align: center; font-size: 10px; color: #67C23A; font-weight: 600; flex-shrink: 0;
}
.stack-note {
  margin-top: 12px; padding: 10px; background: #ecf5ff;
  border-radius: 6px; font-size: 11px; color: #606266; line-height: 1.6;
}

/* ─── sig-return ─── */
.sigret-flow { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.srf-node {
  padding: 8px 12px; border-radius: 6px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.srf-node.srf-active  { opacity: 1; border-left-color: #9B59B6; }
.srf-node.srf-current { background: #f3e8ff; }
.srf-label { font-size: 12px; font-weight: 600; color: #303133; }
.srf-code  { font-size: 10px; color: #9B59B6; font-family: monospace; margin-top: 2px; }
.srf-note  { font-size: 10px; color: #67C23A; margin-top: 2px; }
.sigret-summary { padding: 12px; background: #f0f9eb; border-radius: 8px; border: 1px solid #b3e19d; }
.ss-title { font-size: 12px; font-weight: 600; color: #67C23A; margin-bottom: 6px; }
.ss-flow  { font-size: 11px; color: #606266; line-height: 1.8; font-family: monospace; }

/* ─── 右侧 ─── */
.right-note { margin-bottom: 8px; }
.rn-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.rn-item { font-size: 11px; color: #606266; padding: 2px 0; line-height: 1.5; }
.src-snippet { background: #1a1a2e; border-radius: 6px; padding: 10px; overflow: auto; }
.ss-file { font-size: 10px; color: #67C23A; margin-bottom: 6px; font-family: monospace; }
.src-snippet pre { margin: 0; font-size: 10px; color: #a0aec0; font-family: monospace; line-height: 1.6; white-space: pre-wrap; }

/* ─── controls ─── */
.controls {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px; flex-wrap: wrap;
}
.step-counter { font-size: 12px; color: #909399; margin-left: 8px; }

/* ─── detail card ─── */
.detail-card { background: #fff; }
.dc-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dc-title  { font-size: 14px; font-weight: 600; color: #303133; }
.dc-src    { font-size: 11px; color: #909399; margin-left: auto; }
.dc-detail { font-size: 13px; color: #606266; line-height: 1.7; margin-bottom: 8px; }
.dc-code pre {
  background: #f5f7fa; padding: 10px; border-radius: 6px;
  font-size: 11px; font-family: monospace; white-space: pre-wrap; margin: 0;
}

/* ─── 通用动画 ─── */
@keyframes flash {
  0%, 100% { opacity: 1; }
  50%       { opacity: .3; }
}
</style>
