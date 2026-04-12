<template>
  <div class="ps-root">
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
    <div class="ps-grid">
      <!-- 左栏：task[] 实时状态 -->
      <div class="ps-left">
        <div class="panel-title">task[] 进程状态</div>
        <div
          v-for="t in step.tasks" :key="t.pid"
          class="task-row"
          :class="[`state-${t.state}`, { 'task-current': t.current, 'task-next': t.next, 'task-changed': changedTasks.has(t.pid) }]"
        >
          <div class="task-pid">
            <span>{{ t.current ? '▶' : t.next ? '→' : '·' }}</span>
            <span>pid={{ t.pid }}</span>
          </div>
          <div class="task-state-badge" :class="`badge-${t.state}`">{{ stateLabel(t.state) }}</div>
          <div class="task-meta">
            <span class="task-counter">ctr={{ t.counter }}</span>
            <span class="task-pri">pri={{ t.priority }}</span>
          </div>
        </div>

        <el-divider style="margin: 10px 0" />

        <!-- 关键变量 -->
        <div
          v-for="v in step.vars" :key="v.name"
          class="var-row"
          :class="{ 'var-changed': changedVars.has(v.name) }"
        >
          <span class="var-name">{{ v.name }}</span>
          <span class="var-val">{{ v.val }}</span>
        </div>

        <el-divider style="margin: 10px 0" />
        <div class="explain-box">{{ step.explain }}</div>
      </div>

      <!-- 中栏：核心可视化 -->
      <div class="ps-center">
        <div class="panel-title">{{ sceneTitle }}</div>

        <!-- overview: 全局架构 -->
        <div v-if="step.scene === 'overview'" class="sc-overview">
          <div class="ov-arch">
            <div class="ov-task-pool">
              <div class="ov-pool-title">task[64] 进程池</div>
              <div class="ov-tasks">
                <div v-for="t in step.tasks" :key="t.pid" class="ov-task-box" :class="`badge-${t.state}`">
                  <span>pid={{ t.pid }}</span>
                  <span class="ov-state">{{ stateLabel(t.state) }}</span>
                </div>
              </div>
            </div>
            <div class="ov-flow-col">
              <div class="ov-arrow-box">
                <div class="ov-trigger">
                  <div class="ov-trig-item">🕐 时钟中断（IRQ0）</div>
                  <div class="ov-trig-item">💤 sleep_on()</div>
                  <div class="ov-trig-item">📞 系统调用返回</div>
                </div>
                <div class="ov-arrow-right">→</div>
              </div>
              <div class="ov-sched-box">
                schedule()
                <div style="font-size:10px;color:#909399">kernel/sched.c:68</div>
              </div>
              <div class="ov-arrow-right2">→</div>
              <div class="ov-switch-box">
                switch_to(n)
                <div style="font-size:10px;color:#909399">sched.h:196</div>
              </div>
              <div class="ov-arrow-right2">→</div>
              <div class="ov-cpu-box">
                CPU
                <div style="font-size:10px;color:#ccc">执行 task[n]</div>
              </div>
            </div>
          </div>
          <div class="ov-note">
            Linux 0.11 使用<strong>非抢占式时间片轮转</strong>：每个时钟中断 counter--，归零时调用 schedule() 选下一个进程，通过 ljmp 到新进程的 TSS 完成切换。
          </div>
        </div>

        <!-- task-struct: 字段分组 -->
        <div v-else-if="step.scene === 'task-struct'" class="sc-task-struct">
          <div v-for="grp in taskStructGroups" :key="grp.name" class="ts-group">
            <div class="ts-grp-title" :style="`color: ${grp.color}`">{{ grp.name }}</div>
            <div class="ts-fields">
              <el-tooltip v-for="f in grp.fields" :key="f.name" :content="f.tip" placement="top">
                <div class="ts-field" :style="`border-left-color: ${grp.color}`">
                  <span class="ts-type">{{ f.type }}</span>
                  <span class="ts-fname">{{ f.name }}</span>
                  <span class="ts-fval">{{ f.val }}</span>
                </div>
              </el-tooltip>
            </div>
          </div>
        </div>

        <!-- states: 5种状态 -->
        <div v-else-if="step.scene === 'states'" class="sc-states">
          <div v-for="s in stateDefinitions" :key="s.val" class="state-def-row">
            <div class="state-def-badge" :class="`badge-${s.val}`">{{ s.label }}</div>
            <div class="state-def-val">= {{ s.val }}</div>
            <div class="state-def-name">{{ s.cname }}</div>
            <div class="state-def-desc">{{ s.desc }}</div>
          </div>
        </div>

        <!-- state-trans: 状态机图 -->
        <div v-else-if="step.scene === 'state-trans'" class="sc-state-trans">
          <div class="st-diagram">
            <!-- RUNNING 在中央 -->
            <div class="st-center-row">
              <div class="st-state badge-0 st-big">RUNNING<br><small>执行中</small></div>
            </div>
            <div class="st-edges">
              <div class="st-edge-group">
                <div class="st-state badge-1">INTERRUPTIBLE<br><small>可中断睡眠</small></div>
                <div class="st-edge-arrows">
                  <div class="st-arrow to-sleep">→ sleep_on() / interruptible_sleep_on()</div>
                  <div class="st-arrow to-run">← wake_up() / 信号 / alarm</div>
                </div>
              </div>
              <div class="st-edge-group">
                <div class="st-state badge-2">UNINTERRUPTIBLE<br><small>不可中断睡眠</small></div>
                <div class="st-edge-arrows">
                  <div class="st-arrow to-sleep">→ sleep_on()</div>
                  <div class="st-arrow to-run">← wake_up() 只有显式唤醒</div>
                </div>
              </div>
              <div class="st-edge-group">
                <div class="st-state badge-3">ZOMBIE<br><small>僵尸</small></div>
                <div class="st-edge-arrows">
                  <div class="st-arrow to-sleep">→ exit() 后等待父进程 wait()</div>
                </div>
              </div>
              <div class="st-edge-group">
                <div class="st-state badge-4">STOPPED<br><small>暂停</small></div>
                <div class="st-edge-arrows">
                  <div class="st-arrow to-sleep">→ SIGSTOP 信号</div>
                  <div class="st-arrow to-run">← SIGCONT 信号</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- task-array: task[64] 网格 -->
        <div v-else-if="step.scene === 'task-array'" class="sc-task-array">
          <div class="ta-info">task[NR_TASKS]，NR_TASKS=64，task[0]=init_task（静态分配）</div>
          <div class="ta-grid">
            <el-tooltip
              v-for="i in 64" :key="i"
              :content="taskArrayCell(i-1)"
              placement="top"
            >
              <div class="ta-cell" :class="taskArrayCellClass(i-1)">
                <span v-if="i <= step.tasks.length" style="font-size:8px">{{ i-1 }}</span>
              </div>
            </el-tooltip>
          </div>
          <div class="ta-legend">
            <span class="ta-leg badge-0">RUNNING</span>
            <span class="ta-leg badge-1">INTERRUPTIBLE</span>
            <span class="ta-leg badge-2">UNINTERRUPTIBLE</span>
            <span class="ta-leg ta-empty">空槽</span>
          </div>
        </div>

        <!-- schedule-wake: schedule()第一阶段 -->
        <div v-else-if="step.scene === 'schedule-wake'" class="sc-sched-wake">
          <div class="sw-title">schedule() 第一阶段：alarm 检查 + 信号唤醒</div>
          <div class="sw-code-flow">
            <div class="sw-step" :class="{ 'sw-active': schedWakeSub >= 1 }">
              <span class="sw-num">①</span>
              <span>遍历所有进程（从 LAST_TASK 到 FIRST_TASK）</span>
            </div>
            <div class="sw-step" :class="{ 'sw-active': schedWakeSub >= 2 }">
              <span class="sw-num">②</span>
              <span>检查 alarm：若 alarm &lt; jiffies → 设置 SIGALRM 信号</span>
            </div>
            <div class="sw-step" :class="{ 'sw-active': schedWakeSub >= 3 }">
              <span class="sw-num">③</span>
              <span>检查 signal：若有未屏蔽信号且 state=INTERRUPTIBLE → 改为 RUNNING</span>
            </div>
          </div>
          <div class="sw-task-vis">
            <div v-for="t in step.tasks" :key="t.pid" class="sw-task"
                 :class="{ 'sw-woken': t.state === 0 && t.pid !== 0 && schedWakeSub >= 3 }">
              <div class="sw-t-pid">pid={{ t.pid }}</div>
              <div class="sw-t-state" :class="`badge-${t.state}`">{{ stateLabel(t.state) }}</div>
              <div v-if="t.signal" class="sw-t-signal">signal={{ t.signal }}</div>
            </div>
          </div>
        </div>

        <!-- schedule-pick: 第二阶段，counter比较 -->
        <div v-else-if="step.scene === 'schedule-pick'" class="sc-sched-pick">
          <div class="sp-title">schedule() 第二阶段：选 counter 最大的 RUNNING 进程</div>
          <div class="sp-bars">
            <div v-for="(t, i) in step.tasks" :key="t.pid" class="sp-bar-row"
                 :class="{
                   'sp-scanning': schedPickPos === i,
                   'sp-winner': schedPickWinner === i && schedPickPos === -1,
                   'sp-skip': t.state !== 0
                 }">
              <div class="sp-bar-label">pid={{ t.pid }}</div>
              <div class="sp-bar-wrap">
                <div class="sp-bar-inner" :style="`width: ${Math.max(t.counter / 15 * 100, 2)}%`" :class="`badge-${t.state}`" />
              </div>
              <div class="sp-bar-val">{{ t.state === 0 ? `counter=${t.counter}` : stateLabel(t.state) }}</div>
              <div v-if="schedPickWinner === i && schedPickPos === -1" class="sp-winner-label">← 选中！</div>
            </div>
          </div>
          <div class="sp-result" v-if="schedPickPos === -1 && schedPickWinner >= 0">
            switch_to({{ step.tasks[schedPickWinner]?.pid }}) → 切换到 pid={{ step.tasks[schedPickWinner]?.pid }}
          </div>
        </div>

        <!-- counter-recalc: counter重计算 -->
        <div v-else-if="step.scene === 'counter-recalc'" class="sc-counter-recalc">
          <div class="cr-title">所有 RUNNING 进程 counter = 0 → 重新计算</div>
          <div class="cr-formula">
            <div class="cr-f-box">counter = (counter &gt;&gt; 1) + priority</div>
            <div class="cr-f-note">即使 SLEEPING 进程也参与计算（但不会被选中）</div>
            <div class="cr-f-note">SLEEPING 进程的 counter 会积累，唤醒后立刻获得更长时间片</div>
          </div>
          <div class="cr-before-after">
            <div class="cr-col">
              <div class="cr-col-title">重计算前</div>
              <div v-for="t in crBefore" :key="t.pid" class="cr-row">
                <span>pid={{ t.pid }}</span>
                <span class="cr-val-before">counter={{ t.before }}</span>
              </div>
            </div>
            <div class="cr-arrow">→</div>
            <div class="cr-col">
              <div class="cr-col-title">重计算后</div>
              <div v-for="t in crBefore" :key="t.pid" class="cr-row">
                <span>pid={{ t.pid }}</span>
                <span class="cr-val-after">counter={{ t.after }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- do-timer: 时钟中断 -->
        <div v-else-if="step.scene === 'do-timer'" class="sc-do-timer">
          <div class="dt-title">do_timer()：时钟中断（IRQ0，100Hz）触发调度</div>
          <div class="dt-flow">
            <div class="dt-node irq">IRQ0 时钟中断<br><small>每 10ms 一次</small></div>
            <div class="dt-arrow">↓</div>
            <div class="dt-node timer">do_timer(cpl)<br><small>sched.c:122</small></div>
            <div class="dt-arrow">↓ counter--</div>
            <div class="dt-node check">counter &gt; 0 ?</div>
            <div class="dt-branch">
              <div class="dt-branch-yes">
                <div class="dt-arrow small">是 →</div>
                <div class="dt-node ok">继续执行当前进程<br><small>直接返回</small></div>
              </div>
              <div class="dt-branch-no">
                <div class="dt-arrow small">否 ↓</div>
                <div class="dt-node sched">schedule()<br><small>选下一个进程</small></div>
              </div>
            </div>
          </div>
          <div class="dt-counter-anim">
            <div class="dt-c-title">当前进程 counter 变化</div>
            <div class="dt-c-bars">
              <div v-for="n in dtCounterDisplay" :key="n" class="dt-c-tick"
                   :class="{ 'dt-c-active': n <= dtTick, 'dt-c-zero': dtTick >= 10 && n === 10 }" />
            </div>
            <div class="dt-c-val">{{ dtTick >= 10 ? '→ schedule()' : `counter = ${10 - dtTick}` }}</div>
          </div>
        </div>

        <!-- tss: TSS结构 -->
        <div v-else-if="step.scene === 'tss'" class="sc-tss">
          <div class="tss-title">TSS（Task State Segment）—— CPU 状态快照</div>
          <div class="tss-groups">
            <div v-for="grp in tssGroups" :key="grp.name" class="tss-group">
              <div class="tss-grp-title">{{ grp.name }}</div>
              <div class="tss-fields">
                <div v-for="f in grp.fields" :key="f.name" class="tss-field">
                  <span class="tss-fname">{{ f.name }}</span>
                  <span class="tss-fval">{{ f.val }}</span>
                  <span class="tss-fdesc">{{ f.desc }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- switch-to: ljmp切换动画 -->
        <div v-else-if="step.scene === 'switch-to'" class="sc-switch-to">
          <div class="swt-title">switch_to(n)：一条 ljmp 指令完成上下文切换</div>
          <div class="swt-flow">
            <div class="swt-box cpu-box" :class="{ 'swt-active': switchSub >= 1 }">
              <div class="swt-box-title">CPU 寄存器</div>
              <div v-for="r in cpuRegs" :key="r" class="swt-reg">{{ r }}</div>
            </div>
            <div class="swt-arrows">
              <div class="swt-arrow-save" :class="{ 'swt-anim': switchSub === 1 }">
                ← 保存到 old TSS
              </div>
              <div class="swt-arrow-load" :class="{ 'swt-anim': switchSub === 2 }">
                从 new TSS 加载 →
              </div>
            </div>
            <div class="swt-tsses">
              <div class="swt-box tss-box old-tss" :class="{ 'swt-active': switchSub >= 1 }">
                <div class="swt-box-title">task[current].tss</div>
                <div class="swt-tss-note">{{ switchSub >= 1 ? '已保存 ✓' : '待保存' }}</div>
              </div>
              <div class="swt-box tss-box new-tss" :class="{ 'swt-active': switchSub >= 2 }">
                <div class="swt-box-title">task[next].tss</div>
                <div class="swt-tss-note">{{ switchSub >= 2 ? '已加载 ✓' : '待加载' }}</div>
              </div>
            </div>
          </div>
          <div class="swt-ljmp" :class="{ 'swt-highlight': switchSub >= 1 }">
            ljmp %0  <span style="color:#909399">/* far jump → CPU硬件自动保存/恢复所有寄存器 */</span>
          </div>
          <div class="swt-result" v-if="switchSub >= 3">
            current = task[next]，继续从上次 ljmp 之后的指令执行 ✓
          </div>
        </div>

        <!-- sleep-on: 等待队列 -->
        <div v-else-if="step.scene === 'sleep-on'" class="sc-sleep-on">
          <div class="so-title">sleep_on()：进程链入等待队列</div>
          <div class="so-steps">
            <div class="so-step" :class="{ 'so-done': sleepSub >= 1 }">
              <span class="so-num">①</span> tmp = *p（保存队列头）
            </div>
            <div class="so-step" :class="{ 'so-done': sleepSub >= 2 }">
              <span class="so-num">②</span> *p = current（自己成为新队列头）
            </div>
            <div class="so-step" :class="{ 'so-done': sleepSub >= 3 }">
              <span class="so-num">③</span> current-&gt;state = UNINTERRUPTIBLE
            </div>
            <div class="so-step" :class="{ 'so-done': sleepSub >= 4 }">
              <span class="so-num">④</span> schedule()（让出 CPU）
            </div>
            <div class="so-step" :class="{ 'so-done': sleepSub >= 5 }">
              <span class="so-num">⑤</span> 被唤醒后：if (tmp) tmp-&gt;state = RUNNING（唤醒前一个等待者）
            </div>
          </div>
          <div class="so-queue" v-if="sleepSub >= 2">
            <div class="so-q-title">等待队列链（栈式）</div>
            <div class="so-q-chain">
              <div class="so-q-node head">*p → pid=2<br><small>最新等待者</small></div>
              <div class="so-q-arrow">tmp →</div>
              <div class="so-q-node">pid=1<br><small>上一个等待者</small></div>
              <div class="so-q-arrow">→</div>
              <div class="so-q-node">NULL</div>
            </div>
          </div>
        </div>

        <!-- wake-up -->
        <div v-else-if="step.scene === 'wake-up'" class="sc-wake-up">
          <div class="wu-title">wake_up() vs interruptible_sleep_on() 对比</div>
          <div class="wu-compare">
            <div class="wu-col">
              <div class="wu-col-title">sleep_on（不可中断）</div>
              <div class="wu-col-note">必须显式 wake_up() 才能唤醒</div>
              <div class="wu-col-code">
                <pre>wake_up(p):
  (**p).state = 0
  *p = NULL</pre>
              </div>
              <div class="wu-col-usage">
                用于等待硬件 I/O<br>（磁盘、键盘缓冲）
              </div>
            </div>
            <div class="wu-col">
              <div class="wu-col-title">interruptible_sleep_on（可中断）</div>
              <div class="wu-col-note">信号 / alarm 也可唤醒</div>
              <div class="wu-col-code">
                <pre>state = INTERRUPTIBLE
schedule() 第一阶段会
检查 signal 并唤醒</pre>
              </div>
              <div class="wu-col-usage">
                用于等待用户输入<br>（终端、管道读取）
              </div>
            </div>
          </div>
          <div class="wu-wake-anim">
            <div v-for="t in step.tasks" :key="t.pid" class="wu-task"
                 :class="{ 'wu-woken': wakeUpDone && t.state === 0 }">
              <span>pid={{ t.pid }}</span>
              <span class="task-state-badge" :class="`badge-${t.state}`">{{ stateLabel(t.state) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：源码 / 数据结构 -->
      <div class="ps-right">
        <div class="panel-title">{{ rightTitle }}</div>

        <div v-if="step.scene === 'overview'" class="rp-overview">
          <div class="rp-key-title">核心函数</div>
          <div v-for="fn in overviewFns" :key="fn.name" class="rp-fn-row">
            <span class="rp-fn-name">{{ fn.name }}</span>
            <span class="rp-fn-file">{{ fn.file }}</span>
            <span class="rp-fn-desc">{{ fn.desc }}</span>
          </div>
        </div>

        <div v-else-if="step.scene === 'task-struct'" class="rp-code">
          <div class="rp-code-title">include/linux/sched.h</div>
          <pre class="rp-code-block">struct task_struct {
/* 调度控制 */
  long state;
  long counter;
  long priority;
  long signal;
  long blocked;
  long alarm;
/* 标识 */
  long pid, father;
  long pgrp, session;
  unsigned short uid,euid;
  unsigned short gid,egid;
/* 时间统计 */
  long utime, stime;
  long start_time;
/* 内存 */
  unsigned long start_code;
  unsigned long end_code;
  unsigned long brk;
  struct desc_struct ldt[3];
  struct tss_struct tss;
/* 文件 */
  struct m_inode *pwd;
  struct m_inode *root;
  struct file *filp[20];
};</pre>
        </div>

        <div v-else-if="step.scene === 'states'" class="rp-code">
          <div class="rp-code-title">include/linux/sched.h</div>
          <pre class="rp-code-block">#define TASK_RUNNING        0
#define TASK_INTERRUPTIBLE  1
#define TASK_UNINTERRUPTIBLE 2
#define TASK_ZOMBIE         3
#define TASK_STOPPED        4

/* state 字段语义：
 * 0 = 可运行（在运行或就绪）
 * >0 = 不可运行
 * -1 = 未初始化（不常用）
 */</pre>
        </div>

        <div v-else-if="step.scene === 'state-trans'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c 关键转换</div>
          <pre class="rp-code-block">/* RUNNING → INTERRUPTIBLE */
current->state =
  TASK_INTERRUPTIBLE;
schedule();

/* RUNNING → UNINTERRUPTIBLE */
current->state =
  TASK_UNINTERRUPTIBLE;
schedule();

/* INTERRUPTIBLE → RUNNING */
// wake_up() 或 信号检测
task->state = TASK_RUNNING;

/* RUNNING → ZOMBIE */
current->state = TASK_ZOMBIE;
// do_exit() 中</pre>
        </div>

        <div v-else-if="step.scene === 'task-array'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c</div>
          <pre class="rp-code-block">/* task[] 全局进程表 */
struct task_struct
  *task[NR_TASKS] = {
    &(init_task.task),
    /* 其余初始为 NULL */
  };

/* 宏定义 */
#define FIRST_TASK task[0]
#define LAST_TASK  task[NR_TASKS-1]

/* fork时分配 */
// find_empty_process()
// 从 task[1] 开始找NULL槽</pre>
        </div>

        <div v-else-if="step.scene === 'schedule-wake' || step.scene === 'schedule-pick' || step.scene === 'counter-recalc'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c:68 schedule()</div>
          <pre class="rp-code-block">void schedule(void) {
  int i, next, c;
  struct task_struct **p;

  /* 第一阶段：alarm+信号 */
  for (p = &LAST_TASK;
       p > &FIRST_TASK; --p)
    if (*p) {
      if ((*p)->alarm &&
          (*p)->alarm < jiffies){
        (*p)->signal |=
          (1<<(SIGALRM-1));
        (*p)->alarm = 0;
      }
      if (((*p)->signal &
        ~((*p)->blocked)) &&
        (*p)->state==TASK_INTERRUPTIBLE)
        (*p)->state = TASK_RUNNING;
    }

  /* 第二阶段：选next */
  while (1) {
    c = -1; next = 0;
    i = NR_TASKS;
    p = &task[NR_TASKS];
    while (--i) {
      if (!*--p) continue;
      if ((*p)->state==TASK_RUNNING
          && (*p)->counter > c)
        c=(*p)->counter, next=i;
    }
    if (c) break;
    /* 全0：重计算 */
    for(p=&LAST_TASK;
        p>&FIRST_TASK;--p)
      if (*p)
        (*p)->counter =
          ((*p)->counter>>1)
          + (*p)->priority;
  }
  switch_to(next);
}</pre>
        </div>

        <div v-else-if="step.scene === 'do-timer'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c:122 do_timer()</div>
          <pre class="rp-code-block">void do_timer(long cpl) {
  /* 统计用户/内核时间 */
  if (cpl) current->utime++;
  else current->stime++;

  /* 处理软件定时器链 */
  if (next_timer) {
    next_timer->jiffies--;
    while (next_timer &&
           next_timer->jiffies <= 0){
      void (*fn)(void) =
        next_timer->fn;
      next_timer->fn = NULL;
      next_timer = next_timer->next;
      (fn)();
    }
  }

  /* 时间片递减 */
  if ((--current->counter)>0)
    return;  /* 还有时间片 */
  current->counter=0;
  if (!cpl) return; /* 内核态不抢占 */
  schedule();
}</pre>
        </div>

        <div v-else-if="step.scene === 'tss'" class="rp-code">
          <div class="rp-code-title">include/linux/sched.h tss_struct</div>
          <pre class="rp-code-block">struct tss_struct {
  long back_link;
  long esp0; /* 内核栈指针 */
  long ss0;  /* 内核栈段 */
  long esp1, ss1;
  long esp2, ss2;
  long cr3;  /* 页目录基址 */
  long eip;  /* 下次执行位置 */
  long eflags;
  long eax,ecx,edx,ebx;
  long esp, ebp, esi, edi;
  long es, cs, ss;
  long ds, fs, gs;
  long ldt;  /* LDT 选择子 */
  long trace_bitmap;
  /* FPU状态（如果used_math）*/
  struct i387_struct i387;
};</pre>
        </div>

        <div v-else-if="step.scene === 'switch-to'" class="rp-code">
          <div class="rp-code-title">include/linux/sched.h:196</div>
          <pre class="rp-code-block">#define switch_to(n) { \
 struct {long a,b;} __tmp;\
 __asm__(              \
  "cmpl %%ecx,current\n\t"\
  "je 1f\n\t"          \
  "movw %%dx,%1\n\t"   \
  "xchgl %%ecx,current\n\t"\
  "ljmp %0\n\t"        \
  /* ↑ 一条指令完成：
   * 1. 保存所有寄存器到
   *    current->tss
   * 2. 从task[n]->tss
   *    加载所有寄存器
   * 3. 跳转到新进程执行 */
  "cmpl %%ecx,        \
    last_task_used_math\n\t"\
  "jne 1f\n\t"         \
  "clts\n"             \
  "1:"::"m"(*&__tmp.a),\
  "m"(*&__tmp.b),      \
  "d"(_TSS(n)),        \
  "c"((long)task[n])); \
}</pre>
        </div>

        <div v-else-if="step.scene === 'sleep-on'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c:218 sleep_on()</div>
          <pre class="rp-code-block">void sleep_on(
    struct task_struct **p) {
  struct task_struct *tmp;
  if (!p) return;
  if (current == &(init_task))
    panic("task[0] sleep");

  tmp = *p;      /* 保存旧头 */
  *p = current;  /* 自己成为头 */
  current->state =
    TASK_UNINTERRUPTIBLE;
  schedule();    /* 让出CPU */

  /* 被唤醒后执行这里 */
  if (tmp)       /* 唤醒前一个 */
    tmp->state=0;/* RUNNING */
}</pre>
        </div>

        <div v-else-if="step.scene === 'wake-up'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c wake_up()</div>
          <pre class="rp-code-block">void wake_up(
    struct task_struct **p) {
  if (p && *p) {
    (**p).state = 0; /* RUNNING */
    *p = NULL;
  }
}

/* interruptible版 */
void interruptible_sleep_on(
    struct task_struct **p) {
  struct task_struct *tmp;
  /* ... 同sleep_on但state= */
  current->state =
    TASK_INTERRUPTIBLE;
  schedule();
  if (*p && *p != current) {
    (**p).state=0;
    schedule();
  }
  if (tmp) tmp->state=0;
}</pre>
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->
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
      <div class="dc-body">
        <div class="dc-detail">{{ step.detail }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

const phases = [
  { name: '总览', file: 'sched.c', startStep: 0 },
  { name: '数据结构', file: 'sched.h', startStep: 1 },
  { name: '调度算法', file: 'sched.c:68', startStep: 4 },
  { name: '上下文切换', file: 'sched.c:122', startStep: 7 },
  { name: '阻塞与唤醒', file: 'sched.c:218', startStep: 10 },
]

// ─── 步骤数据 ───────────────────────────────────────────────
const steps = [
  // Phase 0
  {
    phaseIdx: 0, phase: '总览', tagType: 'info',
    title: '进程调度全局架构：task[] → schedule() → switch_to → CPU',
    srcRef: 'kernel/sched.c:68', scene: 'overview',
    explain: '进程调度是内核核心机制：时钟中断 → do_timer() → schedule() 选进程 → switch_to() 切换。',
    detail: 'Linux 0.11 采用非抢占式优先级时间片调度。每个时钟中断（100Hz）触发 do_timer()，将当前进程 counter 减1；counter 归零时调用 schedule() 重新选进程。schedule() 找 counter 最大的 RUNNING 进程，通过 switch_to() 的一条 ljmp 指令完成上下文切换。整个调度器代码不到100行，但设计精巧。',
    vars: [{ name: 'HZ', val: '100（时钟频率）' }, { name: 'jiffies', val: '系统运行tick数' }, { name: 'current', val: '指向当前进程' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10 },
      { pid: 2, state: 1, counter: 5,  priority: 8  },
    ],
  },
  // Phase 1
  {
    phaseIdx: 1, phase: '数据结构', tagType: 'warning',
    title: 'task_struct：进程控制块，Linux 0.11 进程的全部信息',
    srcRef: 'include/linux/sched.h:50', scene: 'task-struct',
    explain: 'task_struct 是进程的完整描述，包含调度、内存、文件、信号等所有状态。每个进程占用一页内存（4KB），内核栈从该页底部向上增长。',
    detail: 'task_struct 开头是调度关键字段：state（状态）、counter（剩余时间片）、priority（静态优先级）。内存字段指向代码/数据/栈的边界。ldt[3] 保存进程的 LDT 描述符。tss_struct 保存 CPU 全部寄存器，switch_to 时被硬件自动填充。文件字段 filp[20] 最多打开20个文件，pwd/root 是当前/根目录 inode。',
    vars: [{ name: 'sizeof(task_struct)', val: '约400字节' }, { name: '页大小', val: '4096字节' }, { name: '内核栈', val: '页顶部向下' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10 },
    ],
  },
  {
    phaseIdx: 1, phase: '数据结构', tagType: 'warning',
    title: '5种进程状态：RUNNING / INTERRUPTIBLE / UNINTERRUPTIBLE / ZOMBIE / STOPPED',
    srcRef: 'include/linux/sched.h:15', scene: 'states',
    explain: 'state 字段控制进程能否被 schedule() 选中：只有 RUNNING（=0）才会参与调度竞争，其他值均不会被选为 next。',
    detail: 'RUNNING（0）并不意味着正在 CPU 上执行，而是"就绪可运行"。真正在 CPU 上运行的进程是 current 指针所指的那一个。INTERRUPTIBLE 可被信号唤醒，UNINTERRUPTIBLE 必须等待特定事件（如 I/O 完成）。ZOMBIE 进程已退出但父进程还未调用 wait()。Linux 0.11 没有实现 STOPPED 的完整语义。',
    vars: [{ name: 'TASK_RUNNING', val: '0' }, { name: 'TASK_INTERRUPTIBLE', val: '1' }, { name: 'TASK_UNINTERRUPTIBLE', val: '2' }, { name: 'TASK_ZOMBIE', val: '3' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10 },
      { pid: 2, state: 2, counter: 5,  priority: 8  },
      { pid: 3, state: 3, counter: 0,  priority: 5  },
    ],
  },
  {
    phaseIdx: 1, phase: '数据结构', tagType: 'warning',
    title: 'task[64]：全局进程表，task[0] = init_task（静态初始化）',
    srcRef: 'kernel/sched.c:60', scene: 'task-array',
    explain: 'Linux 0.11 最多支持 64 个进程（NR_TASKS=64）。task[0] 是 init 进程，静态定义在 sched.c 中永不消失。其余槽位初始为 NULL，fork() 时找空槽分配。',
    detail: 'task[] 是全局指针数组，每项指向一个 task_struct。find_empty_process() 从 task[1] 开始向后找第一个 NULL 槽，同时分配一个新的 pid（全局递增）。进程退出后 task[i] 变回 NULL，但进程页面要等父进程 wait() 后才释放。current 全局指针始终指向当前在 CPU 上运行的进程。',
    vars: [{ name: 'NR_TASKS', val: '64' }, { name: 'task[0]', val: 'init_task（永不销毁）' }, { name: 'current', val: '&task[current_idx]' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10 },
      { pid: 2, state: 0, counter: 3,  priority: 8  },
    ],
  },
  // Phase 2
  {
    phaseIdx: 2, phase: '调度算法', tagType: 'success',
    title: '状态转换图：什么操作触发进程状态切换',
    srcRef: 'kernel/sched.c:218', scene: 'state-trans',
    explain: '进程状态不会自动改变，必须由内核代码显式设置 state 字段再调用 schedule()。理解转换条件是读懂所有阻塞 I/O 代码的关键。',
    detail: 'RUNNING→INTERRUPTIBLE：进程主动调用 interruptible_sleep_on()，等待某个条件（如终端输入）。INTERRUPTIBLE→RUNNING：wake_up() 或信号到来（schedule() 第一阶段检测）。RUNNING→UNINTERRUPTIBLE：等待 I/O 完成（如硬盘读写），不能被信号打断。UNINTERRUPTIBLE→RUNNING：I/O 完成后 wake_up() 唤醒。RUNNING→ZOMBIE：进程调用 exit()，资源尚未完全释放，等待父进程 wait()。',
    vars: [{ name: 'sleep_on()', val: '→ UNINTERRUPTIBLE' }, { name: 'inter.sleep_on()', val: '→ INTERRUPTIBLE' }, { name: 'wake_up()', val: '→ RUNNING' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10 },
      { pid: 2, state: 2, counter: 5,  priority: 8  },
    ],
  },
  {
    phaseIdx: 2, phase: '调度算法', tagType: 'success',
    title: 'schedule() 第一阶段：检查 alarm，将有信号的 INTERRUPTIBLE 进程唤醒',
    srcRef: 'kernel/sched.c:80', scene: 'schedule-wake',
    explain: 'schedule() 第一件事不是选进程，而是遍历所有进程检查 alarm 超时和待处理信号，把符合条件的 INTERRUPTIBLE 进程状态改为 RUNNING，让它们有机会被选中。',
    detail: 'alarm 是进程设置的定时器（秒级），alarm < jiffies 表示已超时，此时设置 SIGALRM 信号位。信号检测：未屏蔽的信号 (signal & ~blocked) 非零，且进程处于 INTERRUPTIBLE 状态，则直接改为 RUNNING（不需要 wake_up()）。这是 Linux 信号唤醒睡眠进程的核心路径。',
    vars: [{ name: 'jiffies', val: '当前tick计数' }, { name: 'alarm', val: '进程定时器到期tick' }, { name: 'signal', val: '待处理信号位图' }, { name: 'blocked', val: '屏蔽信号位图' }],
    tasks: [
      { pid: 0, state: 0, counter: 5,  priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10, signal: '0x0200' },
      { pid: 2, state: 1, counter: 6,  priority: 8  },
    ],
  },
  {
    phaseIdx: 2, phase: '调度算法', tagType: 'success',
    title: 'schedule() 第二阶段：遍历 task[]，选 counter 最大的 RUNNING 进程',
    srcRef: 'kernel/sched.c:92', scene: 'schedule-pick',
    explain: 'schedule() 核心：从后向前遍历 task[]，找 state=RUNNING 且 counter 最大的进程作为 next，调用 switch_to(next) 切换。若所有 RUNNING 进程 counter 均为0，先重计算再选。',
    detail: '遍历从 task[NR_TASKS-1] 开始向前，这意味着高索引进程在 counter 相等时会优先被选（后入先出的隐式策略）。c 变量追踪当前找到的最大 counter，next 记录对应的下标。循环结束后 c=-1（没有任何进程）或 c>0（找到了进程），c=0 表示所有进程 counter 归零需重计算。',
    vars: [{ name: 'c', val: '当前最大counter' }, { name: 'next', val: '选中进程下标' }, { name: '遍历方向', val: '从后→前' }],
    tasks: [
      { pid: 0, state: 0, counter: 0,  priority: 15, current: true },
      { pid: 1, state: 0, counter: 11, priority: 10, next: true },
      { pid: 2, state: 1, counter: 6,  priority: 8  },
      { pid: 3, state: 0, counter: 7,  priority: 5  },
    ],
  },
  {
    phaseIdx: 2, phase: '调度算法', tagType: 'success',
    title: 'counter 重计算：所有进程 counter = (counter >> 1) + priority',
    srcRef: 'kernel/sched.c:100', scene: 'counter-recalc',
    explain: '当所有 RUNNING 进程 counter 均为 0 时，对 task[] 中所有非 NULL 进程（含 SLEEPING）重新计算 counter。公式让等待中的进程获得"积累"的时间片，再次运行时优先级更高。',
    detail: '公式 counter = (counter >> 1) + priority 的妙处：① SLEEPING 进程的 counter 不断积累（每次重计算后都在增加），唤醒后拥有更高的 counter，能立即获得 CPU；② 右移1位（除以2）防止 counter 无限增大；③ 加上 priority 确保高优先级进程在每轮中基础时间片更长。这是 Linux 0.11 对"I/O 密集型进程"的隐式优待。',
    vars: [{ name: '公式', val: 'ctr = (ctr>>1) + pri' }, { name: '右移', val: '防止counter溢出' }, { name: '+priority', val: '基础时间片' }],
    tasks: [
      { pid: 0, state: 0, counter: 0,  priority: 15, current: true },
      { pid: 1, state: 0, counter: 0,  priority: 10 },
      { pid: 2, state: 1, counter: 0,  priority: 8  },
      { pid: 3, state: 0, counter: 0,  priority: 5  },
    ],
  },
  // Phase 3
  {
    phaseIdx: 3, phase: '上下文切换', tagType: 'danger',
    title: 'do_timer()：100Hz 时钟中断驱动调度，内核态不被抢占',
    srcRef: 'kernel/sched.c:122', scene: 'do-timer',
    explain: '每隔 10ms 触发一次硬件中断 IRQ0，内核响应后调用 do_timer()。当前进程 counter--，归零时才调用 schedule()。注意：内核态（cpl=0）不会被抢占，这是 Linux 0.11 的重要特性。',
    detail: 'do_timer() 的参数 cpl（Current Privilege Level）决定是否抢占：cpl=0 表示时钟中断发生时 CPU 在内核态，此时即使 counter 归零也不调用 schedule()，保证内核代码执行的原子性。cpl=3 表示在用户态，counter 归零时立即调用 schedule()。这是 Linux 0.11 最重要的并发保证之一。',
    vars: [{ name: 'cpl', val: '0=内核态 3=用户态' }, { name: 'counter', val: '倒计时，归零触发调度' }, { name: 'HZ', val: '100（每秒100次中断）' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15 },
      { pid: 1, state: 0, counter: 10, priority: 10, current: true },
      { pid: 2, state: 1, counter: 8,  priority: 8  },
    ],
  },
  {
    phaseIdx: 3, phase: '上下文切换', tagType: 'danger',
    title: 'TSS（Task State Segment）：保存/恢复进程 CPU 状态的完整快照',
    srcRef: 'include/linux/sched.h:100', scene: 'tss',
    explain: 'TSS 是 x86 硬件支持的进程切换结构，包含进程被换出时 CPU 的完整状态。switch_to() 通过 ljmp 到 TSS 描述符，CPU 自动完成寄存器的保存和恢复。',
    detail: 'TSS 最重要的字段：esp0/ss0 是进程的内核栈指针（用户态切换到内核态时使用）；cr3 是该进程的页目录地址（实现进程间内存隔离）；eip 是下次恢复执行的指令地址；ldt 是该进程的 LDT 选择子。每个进程在 GDT 中有一个对应的 TSS 描述符，switch_to() 通过 _TSS(n) 宏计算第 n 个进程的 TSS 在 GDT 中的偏移。',
    vars: [{ name: 'esp0', val: '内核栈指针（ring0）' }, { name: 'cr3', val: '进程页目录基址' }, { name: 'eip', val: '切换后执行地址' }, { name: 'ldt', val: 'LDT选择子' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 0, counter: 10, priority: 10 },
    ],
  },
  {
    phaseIdx: 3, phase: '上下文切换', tagType: 'danger',
    title: 'switch_to(n)：一条 ljmp 指令，硬件完成全部寄存器保存/恢复',
    srcRef: 'include/linux/sched.h:196', scene: 'switch-to',
    explain: 'switch_to 是一个宏，核心是一条 ljmp（far jump）到目标进程的 TSS 选择子。x86 硬件在执行 far jump 时自动把所有通用寄存器、段寄存器、eflags、eip 存入当前 TSS，再从目标 TSS 加载——无需软件逐个保存。',
    detail: 'switch_to 先检查 current 是否等于 task[n]（如果相同直接跳过），然后用 xchgl 原子地更新 current 指针，再执行 ljmp。ljmp 的目标是一个内存中的"伪描述符"（__tmp），其段选择子字段被设为 _TSS(n) = (((n)<<4)+FIRST_TSS_ENTRY)<<3。CPU 执行 ljmp 后控制权立即转移到 task[n]，从它上次被切换出时的 eip 处继续执行（上次也是 ljmp 指令之后）。',
    vars: [{ name: 'ljmp', val: 'far jump → TSS切换' }, { name: '_TSS(n)', val: 'GDT中第n个TSS偏移' }, { name: 'current', val: 'xchgl原子更新' }],
    tasks: [
      { pid: 0, state: 0, counter: 0,  priority: 15, current: true },
      { pid: 1, state: 0, counter: 11, priority: 10, next: true },
    ],
  },
  // Phase 4
  {
    phaseIdx: 4, phase: '阻塞与唤醒', tagType: 'info',
    title: 'sleep_on()：进程链入等待队列，让出 CPU 等待特定事件',
    srcRef: 'kernel/sched.c:218', scene: 'sleep-on',
    explain: 'sleep_on() 实现一个"栈式"等待队列：每个等待者把自己链在队列头，被唤醒后再唤醒链中的前一个等待者，形成连锁唤醒。这是 Linux 0.11 I/O 阻塞的核心实现。',
    detail: 'sleep_on() 的等待队列是一个通过局部变量 tmp 实现的隐式链表——tmp 保存在各自的内核栈帧上，不需要额外的链表节点内存。唤醒顺序是 LIFO（后进先出）：最后进入等待的进程最先被唤醒。wake_up() 只唤醒队列头（最新的等待者），被唤醒者在 schedule() 返回后通过 if(tmp) tmp->state=0 继续唤醒链中下一个。',
    vars: [{ name: '*p', val: '等待队列头指针' }, { name: 'tmp', val: '前一个等待者（栈帧）' }, { name: '唤醒顺序', val: 'LIFO（后进先出）' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 2, counter: 8,  priority: 10 },
      { pid: 2, state: 2, counter: 5,  priority: 8  },
    ],
  },
  {
    phaseIdx: 4, phase: '阻塞与唤醒', tagType: 'info',
    title: 'wake_up() vs interruptible_sleep_on()：两种睡眠的使用场景',
    srcRef: 'kernel/sched.c:239', scene: 'wake-up',
    explain: 'sleep_on() 用于等待硬件 I/O（不能被信号打断）；interruptible_sleep_on() 用于等待用户事件（可被 Ctrl+C 等信号打断）。选错会导致进程无法被 kill 或信号丢失。',
    detail: 'wake_up() 只将队列头进程设为 RUNNING，其余进程通过 sleep_on() 返回后的链式唤醒逐个恢复。interruptible_sleep_on() 的实现更复杂：被信号唤醒后要检查自己是否还是队列头，不是的话要等队列头先运行，再由链式唤醒传递到自己。这保证了等待同一资源的进程按顺序被服务。',
    vars: [{ name: 'UNINTERRUPTIBLE', val: '等待I/O完成' }, { name: 'INTERRUPTIBLE', val: '等待用户事件' }, { name: '连锁唤醒', val: 'sleep_on栈式链' }],
    tasks: [
      { pid: 0, state: 0, counter: 15, priority: 15, current: true },
      { pid: 1, state: 1, counter: 8,  priority: 10 },
      { pid: 2, state: 2, counter: 5,  priority: 8  },
      { pid: 3, state: 0, counter: 3,  priority: 5  },
    ],
  },
]

// ─── 状态 ────────────────────────────────────────────────────
const currentIdx = ref(0)
const playing = ref(false)
const changedTasks = ref(new Set())
const changedVars = ref(new Set())
const schedWakeSub = ref(0)
const schedPickPos = ref(-2)  // -2=未开始, >=0=扫描中, -1=完成
const schedPickWinner = ref(-1)
const switchSub = ref(0)
const sleepSub = ref(0)
const dtTick = ref(0)
const wakeUpDone = ref(false)

let playTimer = null
let subTimer = null
let dtTimer = null

// ─── Computed ─────────────────────────────────────────────────
const step = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => step.value.phaseIdx)

const sceneTitle = computed(() => {
  const m = {
    'overview': '进程调度全局架构',
    'task-struct': 'task_struct 字段分组',
    'states': '5种进程状态定义',
    'task-array': 'task[64] 任务数组',
    'state-trans': '进程状态转换图',
    'schedule-wake': 'schedule() 第一阶段',
    'schedule-pick': 'schedule() 第二阶段：counter 比较',
    'counter-recalc': 'counter 重计算',
    'do-timer': 'do_timer() 时钟中断',
    'tss': 'TSS 结构详解',
    'switch-to': 'switch_to() 切换动画',
    'sleep-on': 'sleep_on() 等待队列',
    'wake-up': 'wake_up() 唤醒机制',
  }
  return m[step.value.scene] || ''
})

const rightTitle = computed(() => {
  if (['schedule-wake','schedule-pick','counter-recalc'].includes(step.value.scene)) return 'schedule() 完整源码'
  return '源码参考'
})

// counter 重计算展示数据
const crBefore = computed(() => step.value.tasks.map(t => ({
  pid: t.pid,
  before: t.counter,
  after: Math.floor(t.counter / 2) + t.priority,
})))

// 时钟中断 counter 动画数组
const dtCounterDisplay = Array.from({ length: 10 }, (_, i) => i + 1)

// ─── 静态数据 ──────────────────────────────────────────────────
const stateLabel = (s) => ['RUNNING', 'INTERRUPTIBLE', 'UNINTERRUPTIBLE', 'ZOMBIE', 'STOPPED'][s] || `state=${s}`

const stateDefinitions = [
  { val: 0, label: 'RUNNING',         cname: 'TASK_RUNNING',         desc: '可运行（就绪或正在执行），schedule() 唯一候选态' },
  { val: 1, label: 'INTERRUPTIBLE',   cname: 'TASK_INTERRUPTIBLE',   desc: '可中断睡眠，信号/alarm 可唤醒' },
  { val: 2, label: 'UNINTERRUPTIBLE', cname: 'TASK_UNINTERRUPTIBLE', desc: '不可中断睡眠，只能 wake_up() 唤醒' },
  { val: 3, label: 'ZOMBIE',          cname: 'TASK_ZOMBIE',          desc: '进程已退出，等待父进程 wait()' },
  { val: 4, label: 'STOPPED',         cname: 'TASK_STOPPED',         desc: 'SIGSTOP 暂停，SIGCONT 恢复' },
]

const taskStructGroups = [
  {
    name: '调度控制', color: '#409EFF',
    fields: [
      { type: 'long', name: 'state',    val: '0',      tip: '进程状态：0=RUNNING, 1=INTERRUPTIBLE...' },
      { type: 'long', name: 'counter',  val: '15',     tip: '剩余时间片（ticks），归零触发调度' },
      { type: 'long', name: 'priority', val: '15',     tip: '静态优先级，counter 归零后作为基础时间片' },
      { type: 'long', name: 'signal',   val: '0',      tip: '待处理信号位图（bit i = 第i+1号信号）' },
      { type: 'long', name: 'blocked',  val: '0',      tip: '屏蔽的信号位图' },
      { type: 'long', name: 'alarm',    val: '0',      tip: '定时器到期 jiffies，超时设置 SIGALRM' },
    ],
  },
  {
    name: '进程标识', color: '#E6A23C',
    fields: [
      { type: 'long', name: 'pid',    val: '1',  tip: '进程ID（全局唯一递增）' },
      { type: 'long', name: 'father', val: '0',  tip: '父进程 pid' },
      { type: 'long', name: 'pgrp',   val: '1',  tip: '进程组ID' },
      { type: 'short', name: 'uid',   val: '0',  tip: '用户ID（0=root）' },
      { type: 'short', name: 'gid',   val: '0',  tip: '组ID' },
    ],
  },
  {
    name: '内存管理', color: '#67C23A',
    fields: [
      { type: 'ulong', name: 'start_code', val: '0x00', tip: '代码段起始线性地址' },
      { type: 'ulong', name: 'end_code',   val: '…',    tip: '代码段结束地址' },
      { type: 'ulong', name: 'brk',        val: '…',    tip: '堆顶地址（malloc扩展点）' },
      { type: 'desc_struct', name: 'ldt[3]', val: '…',  tip: 'LDT描述符：ldt[1]=代码段, ldt[2]=数据段' },
      { type: 'tss_struct',  name: 'tss',    val: '…',  tip: 'CPU状态快照，switch_to时由硬件填充' },
    ],
  },
  {
    name: '文件系统', color: '#F56C6C',
    fields: [
      { type: 'm_inode*', name: 'pwd',       val: '…', tip: '当前工作目录 inode' },
      { type: 'm_inode*', name: 'root',      val: '…', tip: '根目录 inode' },
      { type: 'm_inode*', name: 'executable',val: '…', tip: '可执行文件 inode' },
      { type: 'file*',    name: 'filp[20]',  val: '…', tip: '打开文件指针表（最多20个）' },
    ],
  },
]

const tssGroups = [
  {
    name: '内核栈',
    fields: [
      { name: 'esp0', val: '0xXXXX', desc: 'ring0内核栈指针（用户→内核特权切换时使用）' },
      { name: 'ss0',  val: '0x10',   desc: '内核栈段选择子（GDT[2]）' },
    ],
  },
  {
    name: '通用寄存器',
    fields: [
      { name: 'eax/ecx/edx/ebx', val: '…', desc: '通用寄存器（switch_to时自动保存）' },
      { name: 'esp/ebp/esi/edi', val: '…', desc: '栈/变址寄存器' },
      { name: 'eip',             val: '…', desc: '下次执行的指令地址（切换后从这里继续）' },
      { name: 'eflags',          val: '…', desc: 'CPU标志寄存器' },
    ],
  },
  {
    name: '段寄存器',
    fields: [
      { name: 'cs/ds/es/ss', val: '…', desc: '代码/数据/附加/栈段选择子' },
      { name: 'ldt',         val: '…', desc: '当前进程LDT选择子（GDT中的LDT描述符）' },
      { name: 'cr3',         val: '…', desc: '页目录基址（进程切换时切换地址空间）' },
    ],
  },
]

const overviewFns = [
  { name: 'schedule()', file: 'sched.c:68', desc: '选下一个进程' },
  { name: 'switch_to(n)', file: 'sched.h:196', desc: 'ljmp 切换上下文' },
  { name: 'do_timer()', file: 'sched.c:122', desc: '时钟中断处理' },
  { name: 'sleep_on()', file: 'sched.c:218', desc: '进程阻塞（UNINTERRUPTIBLE）' },
  { name: 'interruptible_sleep_on()', file: 'sched.c:228', desc: '可被信号唤醒的阻塞' },
  { name: 'wake_up()', file: 'sched.c:239', desc: '唤醒等待队列头' },
]

const cpuRegs = ['EIP', 'ESP', 'EAX', 'EBX', 'ECX', 'CS', 'DS', 'EFLAGS', 'CR3']

// task-array cell
const taskArrayCell = (i) => {
  const t = step.value.tasks[i]
  if (!t) return `task[${i}] = NULL（空槽）`
  return `task[${i}]: pid=${t.pid} ${stateLabel(t.state)}`
}
const taskArrayCellClass = (i) => {
  const t = step.value.tasks[i]
  if (!t) return 'ta-empty-cell'
  return `badge-${t.state} ta-filled`
}

// ─── Watch ────────────────────────────────────────────────────
watch(currentIdx, (newIdx, oldIdx) => {
  // 变量闪烁
  const nv = new Set(steps[newIdx].vars.map(v => v.name))
  const ov = new Set((steps[oldIdx]?.vars || []).map(v => v.name))
  changedVars.value = new Set([...nv].filter(n => {
    const nval = steps[newIdx].vars.find(v => v.name === n)?.val
    const oval = (steps[oldIdx]?.vars || []).find(v => v.name === n)?.val
    return nval !== oval || !ov.has(n)
  }))
  setTimeout(() => { changedVars.value = new Set() }, 900)

  // task闪烁
  const newPids = new Set(steps[newIdx].tasks.map(t => t.pid))
  changedTasks.value = newPids
  setTimeout(() => { changedTasks.value = new Set() }, 900)

  // 重置动画状态
  clearTimeout(subTimer)
  clearInterval(dtTimer)
  schedWakeSub.value = 0
  schedPickPos.value = -2
  schedPickWinner.value = -1
  switchSub.value = 0
  sleepSub.value = 0
  dtTick.value = 0
  wakeUpDone.value = false

  const scene = steps[newIdx].scene
  if (scene === 'schedule-wake') startSchedWakeAnim()
  if (scene === 'schedule-pick') startSchedPickAnim()
  if (scene === 'switch-to') startSwitchAnim()
  if (scene === 'sleep-on') startSleepAnim()
  if (scene === 'do-timer') startDtAnim()
  if (scene === 'wake-up') { setTimeout(() => { wakeUpDone.value = true }, 1000) }
})

function startSchedWakeAnim() {
  let s = 0
  const tick = () => { s++; schedWakeSub.value = s; if (s < 3) subTimer = setTimeout(tick, 800) }
  subTimer = setTimeout(tick, 600)
}

function startSchedPickAnim() {
  const tasks = steps[currentIdx.value].tasks
  let pos = tasks.length - 1
  schedPickPos.value = pos
  let best = -1, bestC = -1
  const tick = () => {
    const t = tasks[pos]
    if (t.state === 0 && t.counter > bestC) { bestC = t.counter; best = pos }
    pos--
    if (pos >= 0) { schedPickPos.value = pos; subTimer = setTimeout(tick, 400) }
    else { schedPickPos.value = -1; schedPickWinner.value = best }
  }
  subTimer = setTimeout(tick, 600)
}

function startSwitchAnim() {
  let s = 0
  const tick = () => { s++; switchSub.value = s; if (s < 3) subTimer = setTimeout(tick, 900) }
  subTimer = setTimeout(tick, 700)
}

function startSleepAnim() {
  let s = 0
  const tick = () => { s++; sleepSub.value = s; if (s < 5) subTimer = setTimeout(tick, 700) }
  subTimer = setTimeout(tick, 600)
}

function startDtAnim() {
  dtTimer = setInterval(() => {
    dtTick.value++
    if (dtTick.value >= 10) clearInterval(dtTimer)
  }, 300)
}

// ─── 导航 ──────────────────────────────────────────────────────
function goStep(idx) {
  if (idx < 0 || idx >= steps.length) return
  currentIdx.value = idx
}

function jumpToPhase(pi) {
  goStep(phases[pi].startStep)
}

function togglePlay() {
  if (playing.value) {
    clearInterval(playTimer); playing.value = false
  } else {
    playing.value = true
    playTimer = setInterval(() => {
      if (currentIdx.value < steps.length - 1) goStep(currentIdx.value + 1)
      else { clearInterval(playTimer); playing.value = false }
    }, 4000)
  }
}

function reset() {
  clearInterval(playTimer); clearTimeout(subTimer); clearInterval(dtTimer)
  playing.value = false; currentIdx.value = 0
  schedWakeSub.value = 0; schedPickPos.value = -2; schedPickWinner.value = -1
  switchSub.value = 0; sleepSub.value = 0; dtTick.value = 0; wakeUpDone.value = false
  changedTasks.value = new Set(); changedVars.value = new Set()
}

onUnmounted(() => {
  clearInterval(playTimer); clearTimeout(subTimer); clearInterval(dtTimer)
})
</script>

<style scoped>
.ps-root { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }

/* Phase bar */
.phase-bar { display: flex; gap: 4px; }
.phase-seg {
  flex: 1; padding: 8px 10px; border-radius: 6px;
  background: #f5f7fa; border: 1px solid #e4e7ed;
  cursor: pointer; transition: all 0.2s;
  display: flex; flex-direction: column; gap: 2px;
}
.phase-seg:hover { background: #ecf5ff; border-color: #b3d8ff; }
.phase-seg.active { background: #ecf5ff; border-color: #409eff; }
.phase-seg.done { background: #f0f9eb; border-color: #b3e19d; }
.phase-label { font-size: 12px; font-weight: 600; color: #303133; }
.phase-seg.active .phase-label { color: #409eff; }
.phase-seg.done .phase-label { color: #67c23a; }
.phase-file { font-size: 10px; color: #909399; font-family: monospace; }

/* Step dots */
.step-indicator { display: flex; gap: 6px; padding: 0 4px; }
.step-dot { width: 8px; height: 8px; border-radius: 50%; background: #dcdfe6; cursor: pointer; transition: all 0.2s; }
.step-dot:hover { transform: scale(1.3); }
.step-dot.active { background: #409eff; transform: scale(1.4); }
.step-dot.done { background: #67c23a; }

/* Grid */
.ps-grid { display: grid; grid-template-columns: 250px 1fr 270px; gap: 12px; min-height: 520px; }

/* 通用 panel */
.ps-left, .ps-center, .ps-right {
  background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; padding: 14px; overflow: auto;
}
.ps-left, .ps-right { display: flex; flex-direction: column; gap: 8px; }
.ps-center { display: flex; flex-direction: column; gap: 12px; }
.panel-title { font-size: 11px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: 0.5px; }

/* task-row */
.task-row {
  padding: 6px 8px; border-radius: 6px;
  border: 1px solid #e4e7ed; border-left: 3px solid #dcdfe6;
  display: flex; flex-direction: column; gap: 2px;
  transition: all 0.3s;
}
.task-row.task-current { border-left-color: #409eff; background: #ecf5ff; }
.task-row.task-next { border-left-color: #67c23a; background: #f0f9eb; }
.task-pid { display: flex; align-items: center; gap: 6px; font-size: 12px; font-family: monospace; font-weight: 600; }
.task-meta { display: flex; gap: 8px; font-size: 10px; color: #909399; font-family: monospace; }
.task-counter { color: #409eff; }

@keyframes task-flash {
  0% { background: rgba(64,158,255,0.25); }
  100% { background: transparent; }
}
.task-row.task-changed { animation: task-flash 0.85s ease forwards; }

/* state badges */
.task-state-badge, .badge-0, .badge-1, .badge-2, .badge-3, .badge-4 {
  font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; white-space: nowrap;
}
.badge-0 { background: #67c23a; color: #fff; }
.badge-1 { background: #e6a23c; color: #fff; }
.badge-2 { background: #f56c6c; color: #fff; }
.badge-3 { background: #909399; color: #fff; }
.badge-4 { background: #9b59b6; color: #fff; }

/* var-row */
.var-row {
  display: flex; justify-content: space-between; padding: 3px 6px;
  border-radius: 4px; font-size: 12px; border-left: 2px solid transparent;
}
.var-name { color: #606266; font-family: monospace; }
.var-val { color: #303133; font-weight: 500; font-family: monospace; font-size: 11px; text-align: right; }
@keyframes var-flash {
  0% { background: rgba(64,158,255,0.2); border-left-color: rgba(64,158,255,0.6); }
  100% { background: transparent; border-left-color: transparent; }
}
.var-row.var-changed { animation: var-flash 0.85s ease forwards; }
.explain-box { font-size: 12px; color: #606266; line-height: 1.6; padding: 8px; background: #f5f7fa; border-radius: 4px; }

/* ─── scene: overview ─── */
.sc-overview { display: flex; flex-direction: column; gap: 14px; }
.ov-arch { display: flex; gap: 12px; align-items: flex-start; }
.ov-task-pool { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 8px; padding: 10px; min-width: 120px; }
.ov-pool-title { font-size: 11px; font-weight: 700; color: #606266; margin-bottom: 8px; }
.ov-tasks { display: flex; flex-direction: column; gap: 4px; }
.ov-task-box { display: flex; flex-direction: column; gap: 2px; padding: 4px 6px; border-radius: 4px; font-size: 10px; font-family: monospace; }
.ov-state { font-size: 8px; opacity: 0.8; }
.ov-flow-col { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.ov-arrow-box { display: flex; align-items: center; gap: 6px; width: 100%; }
.ov-trigger { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.ov-trig-item { font-size: 10px; color: #606266; padding: 3px 6px; background: #fff3cd; border-radius: 3px; }
.ov-arrow-right { font-size: 18px; color: #409eff; font-weight: 700; }
.ov-arrow-right2 { font-size: 18px; color: #409eff; font-weight: 700; align-self: center; }
.ov-sched-box {
  padding: 8px 14px; background: #ecf5ff; border: 2px solid #409eff;
  border-radius: 8px; font-size: 12px; font-weight: 700; color: #409eff; text-align: center;
}
.ov-switch-box {
  padding: 8px 14px; background: #fdf6ec; border: 2px solid #e6a23c;
  border-radius: 8px; font-size: 12px; font-weight: 700; color: #e6a23c; text-align: center;
}
.ov-cpu-box {
  padding: 8px 14px; background: #f0f9eb; border: 2px solid #67c23a;
  border-radius: 8px; font-size: 12px; font-weight: 700; color: #67c23a; text-align: center;
}
.ov-note { font-size: 12px; color: #606266; line-height: 1.7; padding: 10px; background: #f5f7fa; border-radius: 6px; }

/* ─── scene: task-struct ─── */
.sc-task-struct { display: flex; flex-direction: column; gap: 10px; }
.ts-group { display: flex; flex-direction: column; gap: 4px; }
.ts-grp-title { font-size: 11px; font-weight: 700; margin-bottom: 2px; }
.ts-fields { display: flex; flex-direction: column; gap: 2px; }
.ts-field {
  display: flex; gap: 8px; padding: 3px 8px;
  border-left: 2px solid; border-radius: 0 4px 4px 0;
  background: #f5f7fa; font-size: 11px; cursor: default;
  transition: transform 0.1s;
}
.ts-field:hover { transform: translateX(2px); }
.ts-type { color: #909399; font-family: monospace; min-width: 60px; }
.ts-fname { font-family: monospace; font-weight: 600; color: #303133; flex: 1; }
.ts-fval { font-family: monospace; color: #409eff; }

/* ─── scene: states ─── */
.sc-states { display: flex; flex-direction: column; gap: 8px; }
.state-def-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 6px; background: #f5f7fa;
}
.state-def-badge { min-width: 100px; text-align: center; font-size: 10px; padding: 3px 6px; }
.state-def-val { font-family: monospace; font-size: 13px; font-weight: 700; color: #303133; min-width: 24px; }
.state-def-name { font-family: monospace; font-size: 11px; color: #909399; min-width: 140px; }
.state-def-desc { font-size: 11px; color: #606266; }

/* ─── scene: state-trans ─── */
.sc-state-trans { display: flex; flex-direction: column; gap: 10px; }
.st-diagram { display: flex; flex-direction: column; gap: 8px; }
.st-center-row { display: flex; justify-content: center; }
.st-big { padding: 10px 20px; font-size: 13px; font-weight: 700; border-radius: 8px; text-align: center; }
.st-edges { display: flex; flex-direction: column; gap: 8px; }
.st-edge-group { display: flex; align-items: center; gap: 10px; }
.st-state { padding: 6px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; min-width: 120px; text-align: center; }
.st-edge-arrows { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.st-arrow { font-size: 10px; padding: 2px 6px; border-radius: 3px; }
.to-sleep { color: #f56c6c; background: #fef0f0; }
.to-run { color: #67c23a; background: #f0f9eb; }

/* ─── scene: task-array ─── */
.sc-task-array { display: flex; flex-direction: column; gap: 8px; }
.ta-info { font-size: 11px; color: #606266; padding: 6px 8px; background: #f5f7fa; border-radius: 4px; font-family: monospace; }
.ta-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; }
.ta-cell {
  aspect-ratio: 1; border-radius: 3px; cursor: default;
  background: #f5f7fa; border: 1px solid #e4e7ed;
  display: flex; align-items: center; justify-content: center;
  font-size: 7px; color: #909399; transition: all 0.1s;
}
.ta-cell:hover { transform: scale(1.1); }
.ta-filled { font-weight: 700; color: #fff; }
.ta-empty-cell { background: #f5f7fa; }
.ta-legend { display: flex; gap: 10px; flex-wrap: wrap; }
.ta-leg { font-size: 10px; padding: 2px 8px; border-radius: 3px; }
.ta-empty { background: #f5f7fa; border: 1px solid #e4e7ed; font-size: 10px; padding: 2px 8px; border-radius: 3px; color: #909399; }

/* ─── scene: schedule-wake ─── */
.sc-sched-wake { display: flex; flex-direction: column; gap: 12px; }
.sw-title { font-size: 12px; font-weight: 700; color: #303133; }
.sw-code-flow { display: flex; flex-direction: column; gap: 6px; }
.sw-step {
  display: flex; gap: 8px; padding: 6px 10px; border-radius: 6px;
  font-size: 11px; color: #c0c4cc; background: #f5f7fa; transition: all 0.4s;
}
.sw-step.sw-active { color: #303133; background: #ecf5ff; border-left: 2px solid #409eff; }
.sw-num { font-weight: 700; color: #409eff; }
.sw-task-vis { display: flex; gap: 8px; }
.sw-task {
  flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #e4e7ed;
  display: flex; flex-direction: column; gap: 4px; align-items: center;
  font-size: 11px; transition: all 0.5s;
}
.sw-task.sw-woken { background: #f0f9eb; border-color: #67c23a; }
.sw-t-pid { font-family: monospace; font-weight: 600; }
.sw-t-signal { font-size: 9px; color: #f56c6c; font-family: monospace; }

/* ─── scene: schedule-pick ─── */
.sc-sched-pick { display: flex; flex-direction: column; gap: 10px; }
.sp-title { font-size: 12px; font-weight: 700; color: #303133; }
.sp-bars { display: flex; flex-direction: column; gap: 6px; }
.sp-bar-row {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 8px; border-radius: 6px; border: 1px solid #e4e7ed;
  transition: all 0.3s;
}
.sp-bar-row.sp-scanning { background: #fdf6ec; border-color: #e6a23c; }
.sp-bar-row.sp-winner { background: #f0f9eb; border-color: #67c23a; border-width: 2px; }
.sp-bar-row.sp-skip { opacity: 0.5; }
.sp-bar-label { font-size: 11px; font-family: monospace; min-width: 50px; }
.sp-bar-wrap { flex: 1; height: 12px; background: #f5f7fa; border-radius: 6px; overflow: hidden; }
.sp-bar-inner { height: 100%; border-radius: 6px; transition: width 0.3s; }
.sp-bar-val { font-size: 10px; color: #909399; font-family: monospace; min-width: 80px; }
.sp-winner-label { font-size: 11px; font-weight: 700; color: #67c23a; }
.sp-result { padding: 8px 12px; background: #f0f9eb; border: 1px solid #b3e19d; border-radius: 6px; font-size: 12px; font-weight: 600; color: #67c23a; font-family: monospace; }

/* ─── scene: counter-recalc ─── */
.sc-counter-recalc { display: flex; flex-direction: column; gap: 12px; }
.cr-title { font-size: 12px; font-weight: 700; color: #303133; }
.cr-formula { display: flex; flex-direction: column; gap: 4px; }
.cr-f-box { padding: 10px 14px; background: #fdf6ec; border: 1px solid #faecd8; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: 700; color: #e6a23c; text-align: center; }
.cr-f-note { font-size: 11px; color: #909399; padding: 2px 4px; }
.cr-before-after { display: flex; align-items: center; gap: 12px; }
.cr-col { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.cr-col-title { font-size: 11px; font-weight: 700; color: #606266; margin-bottom: 4px; }
.cr-row { display: flex; justify-content: space-between; padding: 4px 8px; background: #f5f7fa; border-radius: 4px; font-size: 11px; font-family: monospace; }
.cr-val-before { color: #f56c6c; font-weight: 600; }
.cr-val-after { color: #67c23a; font-weight: 600; }
.cr-arrow { font-size: 20px; color: #409eff; font-weight: 700; }

/* ─── scene: do-timer ─── */
.sc-do-timer { display: flex; flex-direction: column; gap: 12px; }
.dt-title { font-size: 12px; font-weight: 700; color: #303133; }
.dt-flow { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dt-node { padding: 6px 16px; border-radius: 6px; font-size: 11px; font-weight: 600; text-align: center; line-height: 1.5; }
.dt-node.irq { background: #fef0f0; border: 1px solid #fbc4c4; color: #f56c6c; }
.dt-node.timer { background: #fdf6ec; border: 1px solid #faecd8; color: #e6a23c; }
.dt-node.check { background: #ecf5ff; border: 1px solid #b3d8ff; color: #409eff; }
.dt-node.ok { background: #f0f9eb; border: 1px solid #b3e19d; color: #67c23a; }
.dt-node.sched { background: #f5f0fe; border: 1px solid #d3aef7; color: #9b59b6; }
.dt-arrow { font-size: 11px; color: #909399; text-align: center; }
.dt-arrow.small { font-size: 10px; }
.dt-branch { display: flex; gap: 20px; }
.dt-branch-yes, .dt-branch-no { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dt-counter-anim { padding: 10px; background: #f5f7fa; border-radius: 6px; display: flex; flex-direction: column; gap: 6px; }
.dt-c-title { font-size: 11px; color: #606266; }
.dt-c-bars { display: flex; gap: 3px; }
.dt-c-tick { width: 18px; height: 18px; border-radius: 3px; background: #dcdfe6; transition: all 0.2s; }
.dt-c-tick.dt-c-active { background: #409eff; }
.dt-c-tick.dt-c-zero { background: #f56c6c; animation: pulse 0.5s ease infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }
.dt-c-val { font-size: 12px; font-weight: 600; color: #303133; font-family: monospace; }

/* ─── scene: tss ─── */
.sc-tss { display: flex; flex-direction: column; gap: 8px; }
.tss-title { font-size: 12px; font-weight: 700; color: #303133; }
.tss-groups { display: flex; flex-direction: column; gap: 8px; }
.tss-group { background: #f5f7fa; border-radius: 6px; padding: 8px; }
.tss-grp-title { font-size: 11px; font-weight: 700; color: #409eff; margin-bottom: 6px; }
.tss-fields { display: flex; flex-direction: column; gap: 3px; }
.tss-field { display: flex; gap: 8px; font-size: 11px; padding: 2px 0; }
.tss-fname { font-family: monospace; font-weight: 600; color: #303133; min-width: 100px; }
.tss-fval { font-family: monospace; color: #409eff; min-width: 60px; }
.tss-fdesc { color: #606266; }

/* ─── scene: switch-to ─── */
.sc-switch-to { display: flex; flex-direction: column; gap: 12px; }
.swt-title { font-size: 12px; font-weight: 700; color: #303133; }
.swt-flow { display: flex; align-items: center; gap: 12px; }
.swt-box {
  padding: 10px; border-radius: 8px; border: 2px solid #e4e7ed;
  display: flex; flex-direction: column; gap: 4px; transition: all 0.4s;
}
.swt-box.swt-active { border-color: #409eff; background: #ecf5ff; }
.swt-box-title { font-size: 10px; font-weight: 700; color: #606266; margin-bottom: 4px; }
.cpu-box { min-width: 100px; }
.swt-reg { font-size: 10px; font-family: monospace; color: #409eff; }
.swt-arrows { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.swt-arrow-save, .swt-arrow-load {
  font-size: 11px; color: #909399; padding: 3px 6px; border-radius: 4px; transition: all 0.4s; white-space: nowrap;
}
.swt-arrow-save.swt-anim { color: #f56c6c; background: #fef0f0; font-weight: 700; }
.swt-arrow-load.swt-anim { color: #67c23a; background: #f0f9eb; font-weight: 700; }
.swt-tsses { display: flex; flex-direction: column; gap: 6px; }
.old-tss.swt-active { border-color: #f56c6c; background: #fef0f0; }
.new-tss.swt-active { border-color: #67c23a; background: #f0f9eb; }
.swt-tss-note { font-size: 11px; color: #909399; }
.swt-ljmp { font-family: monospace; font-size: 12px; padding: 8px 12px; background: #1e1e1e; color: #d4d4d4; border-radius: 6px; transition: all 0.4s; }
.swt-ljmp.swt-highlight { color: #569cd6; font-weight: 700; }
.swt-result { padding: 8px 12px; background: #f0f9eb; border: 1px solid #b3e19d; border-radius: 6px; font-size: 12px; font-weight: 600; color: #67c23a; }

/* ─── scene: sleep-on ─── */
.sc-sleep-on { display: flex; flex-direction: column; gap: 10px; }
.so-title { font-size: 12px; font-weight: 700; color: #303133; }
.so-steps { display: flex; flex-direction: column; gap: 5px; }
.so-step { display: flex; gap: 8px; padding: 5px 10px; border-radius: 6px; font-size: 11px; color: #c0c4cc; background: #f5f7fa; transition: all 0.4s; }
.so-step.so-done { color: #303133; background: #ecf5ff; border-left: 2px solid #409eff; }
.so-num { font-weight: 700; color: #409eff; }
.so-queue { display: flex; flex-direction: column; gap: 6px; }
.so-q-title { font-size: 11px; font-weight: 700; color: #606266; }
.so-q-chain { display: flex; align-items: center; gap: 6px; }
.so-q-node { padding: 6px 10px; border-radius: 6px; font-size: 10px; font-weight: 600; text-align: center; background: #ecf5ff; border: 1px solid #b3d8ff; color: #409eff; }
.so-q-node.head { background: #f0f9eb; border-color: #b3e19d; color: #67c23a; }
.so-q-arrow { font-size: 12px; color: #909399; }

/* ─── scene: wake-up ─── */
.sc-wake-up { display: flex; flex-direction: column; gap: 10px; }
.wu-title { font-size: 12px; font-weight: 700; color: #303133; }
.wu-compare { display: flex; gap: 12px; }
.wu-col { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 10px; background: #f5f7fa; border-radius: 6px; }
.wu-col-title { font-size: 11px; font-weight: 700; color: #303133; }
.wu-col-note { font-size: 10px; color: #909399; }
.wu-col-code { background: #1e1e1e; border-radius: 4px; padding: 6px 8px; }
.wu-col-code pre { margin: 0; font-size: 10px; color: #d4d4d4; font-family: monospace; line-height: 1.5; }
.wu-col-usage { font-size: 10px; color: #606266; }
.wu-wake-anim { display: flex; gap: 8px; }
.wu-task { flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #e4e7ed; display: flex; flex-direction: column; gap: 4px; align-items: center; font-size: 11px; transition: all 0.5s; font-family: monospace; }
.wu-task.wu-woken { background: #f0f9eb; border-color: #67c23a; }

/* ─── 右栏 ─── */
.rp-code { display: flex; flex-direction: column; gap: 6px; }
.rp-code-title { font-size: 11px; font-weight: 700; color: #303133; }
.rp-code-block {
  background: #1e1e1e; color: #d4d4d4; padding: 10px 12px; border-radius: 6px;
  font-family: 'Consolas', monospace; font-size: 10px; line-height: 1.55;
  overflow: auto; margin: 0; flex: 1;
}
.rp-overview { display: flex; flex-direction: column; gap: 6px; }
.rp-key-title { font-size: 11px; font-weight: 700; color: #303133; margin-bottom: 2px; }
.rp-fn-row { display: flex; flex-direction: column; gap: 1px; padding: 5px 8px; background: #f5f7fa; border-radius: 4px; }
.rp-fn-name { font-family: monospace; font-size: 11px; font-weight: 700; color: #409eff; }
.rp-fn-file { font-family: monospace; font-size: 10px; color: #909399; }
.rp-fn-desc { font-size: 10px; color: #606266; }

/* ─── Controls + Detail ─── */
.controls { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.detail-card { background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; padding: 14px; }
.dc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dc-title { font-size: 14px; font-weight: 600; color: #303133; flex: 1; }
.dc-body { display: flex; gap: 16px; }
.dc-detail { flex: 1; font-size: 13px; color: #606266; line-height: 1.7; }
</style>
