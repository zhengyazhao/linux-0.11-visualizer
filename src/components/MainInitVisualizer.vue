<template>
  <div class="main-visualizer">
    <!-- 标题 -->
    <div class="page-header">
      <el-button link @click="$router.push('/')" style="color:#909399;margin-bottom:6px">← 返回</el-button>
      <h2>Linux 0.11 main() 初始化流程</h2>
      <p class="subtitle">从 head.s 跳入 main() 到第一个 shell 进程启动的完整过程 — init/main.c</p>
    </div>

    <!-- 阶段进度 -->
    <el-card shadow="never" class="phase-card">
      <div class="phase-bar">
        <div
          v-for="(ph, pi) in phases"
          :key="pi"
          class="phase-seg"
          :class="{ active: currentPhase === pi, done: currentPhase > pi }"
          @click="goStep(ph.startStep)"
        >
          <span class="ph-label">{{ ph.name }}</span>
          <span class="ph-file">{{ ph.file }}</span>
        </div>
      </div>
      <div class="step-indicator mono">
        {{ String(currentStep + 1).padStart(2,'0') }}/{{ steps.length }}
        &nbsp;—&nbsp;<span style="color:#303133">{{ currentState.title }}</span>
      </div>
    </el-card>

    <!-- 三栏 -->
    <div class="main-panel">

      <!-- 左：代码上下文 -->
      <el-card shadow="never" class="panel left-panel">
        <template #header>
          <div class="panel-title"><el-icon><Document /></el-icon> 代码位置</div>
        </template>

        <div class="code-loc">
          <div class="loc-file mono">{{ currentState.srcFile }}</div>
          <div class="loc-fn mono">{{ currentState.srcFn }}</div>
        </div>

        <el-divider style="margin:10px 0" />

        <!-- 关键变量值 -->
        <div class="var-list">
          <div
            v-for="v in currentState.vars"
            :key="v.name"
            class="var-row"
            :class="{ 'var-highlight': v.hot, 'var-changed': changedVars.has(v.name) }"
          >
            <el-tooltip placement="right" effect="light" :show-after="100">
              <template #content>
                <div style="max-width:200px;font-size:12px;line-height:1.7;color:#606266">{{ v.tip }}</div>
              </template>
              <div class="var-inner">
                <span class="var-name mono">{{ v.name }}</span>
                <Transition name="regval">
                  <span :key="v.val" class="var-val mono">{{ v.val }}</span>
                </Transition>
              </div>
            </el-tooltip>
          </div>
        </div>

        <el-divider style="margin:10px 0" />
        <el-tag :type="currentState.tagType" style="width:100%;justify-content:center;font-size:12px">
          {{ currentState.phase }}
        </el-tag>
        <div class="explain-box">
          <Transition name="fade">
            <p :key="currentStep" class="explain-text">{{ currentState.explain }}</p>
          </Transition>
        </div>
      </el-card>

      <!-- 中：内存布局 -->
      <el-card shadow="never" class="panel mem-panel">
        <template #header>
          <div class="panel-title">
            <el-icon><DataBoard /></el-icon>
            物理内存布局（以 16 MB 系统为例）
          </div>
        </template>

        <div class="mem-zones">
          <div class="mz-scale-top mono">16 MB</div>

          <div class="mz-bar">
            <el-tooltip
              v-for="z in visibleZones"
              :key="z.key"
              placement="right"
              effect="light"
              :show-after="80"
            >
              <template #content>
                <div class="zone-tip">
                  <div class="zt-range mono">{{ z.range }}</div>
                  <div class="zt-size">大小：{{ z.size }}</div>
                  <div class="zt-desc">{{ z.desc }}</div>
                </div>
              </template>
              <div
                class="mz-zone"
                :class="{
                  'zone-active': currentState.memActive?.includes(z.key),
                  'zone-dim':    z.dim
                }"
                :style="{ flex: z.pct, '--zc': z.color }"
              >
                <span class="zone-label">{{ z.name }}</span>
                <span class="zone-addr mono">{{ z.addrLabel }}</span>
              </div>
            </el-tooltip>
          </div>

          <div class="mz-scale-bot mono">0 MB</div>

          <!-- 图例 -->
          <div class="mz-legend">
            <span v-for="z in zoneLegend" :key="z.key" class="mzl-item">
              <i class="mzl-dot" :style="{ background: z.color }"></i>{{ z.name }}
            </span>
          </div>
        </div>
      </el-card>

      <!-- 右：动态场景 -->
      <el-card shadow="never" class="panel scene-panel">
        <template #header>
          <div class="panel-title"><el-icon><Monitor /></el-icon> {{ sceneTitle }}</div>
        </template>

        <!-- scene: params 硬件参数 -->
        <div v-if="currentState.scene === 'params'" class="scene-params">
          <div class="sp-title">从 0x90000 读取（setup.s 写入）</div>
          <div class="sp-row" v-for="p in hwParams" :key="p.addr">
            <span class="sp-addr mono">{{ p.addr }}</span>
            <span class="sp-key">{{ p.key }}</span>
            <span class="sp-val mono">{{ p.val }}</span>
          </div>
          <div class="sp-note">这些值由 setup.s 在实模式下通过 BIOS 中断收集，main() 一进来就读走</div>
        </div>

        <!-- scene: mem-calc 内存划分计算 -->
        <div v-else-if="currentState.scene === 'mem-calc'" class="scene-memcalc">
          <div class="mc-title">内存区域划分（16 MB 系统）</div>
          <div class="mc-item" v-for="item in memCalcItems" :key="item.name"
            :class="{ 'mci-hot': currentState.calcHot?.includes(item.name) }">
            <span class="mci-name">{{ item.name }}</span>
            <span class="mci-eq">=</span>
            <span class="mci-val mono">{{ item.val }}</span>
            <span class="mci-note">{{ item.note }}</span>
          </div>
          <div class="mc-formula">
            <pre>if memory_end > 12MB:
  buffer_memory_end = 4MB
main_memory_start  = buffer_memory_end</pre>
          </div>
        </div>

        <!-- scene: subsys 子系统初始化 -->
        <div v-else-if="currentState.scene === 'subsys'" class="scene-subsys">
          <div class="ss-title">内核子系统初始化</div>
          <div class="ss-item" v-for="item in subsysItems" :key="item.fn">
            <el-icon :color="item.done ? '#67C23A' : '#DCDFE6'" size="13">
              <CircleCheckFilled v-if="item.done" />
              <CirclePlus v-else />
            </el-icon>
            <div class="ss-text">
              <span class="ss-fn mono">{{ item.fn }}</span>
              <span class="ss-desc">{{ item.desc }}</span>
            </div>
          </div>
        </div>

        <!-- scene: sched 调度器 -->
        <div v-else-if="currentState.scene === 'sched'" class="scene-sched">
          <div class="sc-title">task[] 进程表（NR_TASKS = 64）</div>
          <div class="sc-tasks">
            <div
              v-for="i in 8" :key="i"
              class="sc-task"
              :class="{
                'task-0': i === 1,
                'task-1': i === 2 && currentStep >= 7,
                'task-empty': !(i === 1 || (i === 2 && currentStep >= 7))
              }"
            >
              <span class="task-idx">{{ i - 1 }}</span>
              <span class="task-name">
                {{ i === 1 ? 'idle' : (i === 2 && currentStep >= 7 ? 'init' : '—') }}
              </span>
            </div>
            <div class="sc-task task-ellipsis">…63</div>
          </div>

          <div class="sc-task0-detail" v-if="currentStep >= 5">
            <div class="sc-d-title">task_struct: task[0] (idle)</div>
            <div class="sc-d-section">核心字段</div>
            <div class="sc-d-row"><span>state</span><span class="mono">0 (RUNNING)</span></div>
            <div class="sc-d-row"><span>pid</span><span class="mono">0</span></div>
            <div class="sc-d-row"><span>priority</span><span class="mono">15</span></div>
            <div class="sc-d-row"><span>signal</span><span class="mono">0x0000</span></div>
            <div class="sc-d-section">TSS（任务状态段）</div>
            <div class="sc-d-row"><span>esp0</span><span class="mono">内核栈顶</span></div>
            <div class="sc-d-row"><span>ss0</span><span class="mono">0x10（内核数据段）</span></div>
            <div class="sc-d-row"><span>cr3</span><span class="mono">0x0（页目录基址）</span></div>
            <div class="sc-d-section">LDT（局部描述符）</div>
            <div class="sc-d-row"><span>ldt[1] Code</span><span class="mono">0~640KB DPL=3</span></div>
            <div class="sc-d-row"><span>ldt[2] Data</span><span class="mono">0~640KB DPL=3</span></div>
          </div>

          <div class="sc-irq-box" v-if="currentStep >= 5">
            <el-icon color="#67C23A" size="12"><CircleCheckFilled /></el-icon>
            <span>IRQ0 时钟中断已注册（10ms 调度）</span>
          </div>
        </div>

        <!-- scene: usermode 用户态 + fork -->
        <div v-else-if="currentState.scene === 'usermode'" class="scene-usermode">
          <div class="um-title">特权级切换</div>
          <div class="um-flow">
            <div class="um-box ring0">
              <div class="um-ring">Ring 0</div>
              <div class="um-bname">内核态</div>
              <div class="um-note">head.s → main()</div>
            </div>
            <div class="um-arrow">
              <span>move_to_user_mode()</span>
              <span class="um-arr">↓</span>
              <span class="mono" style="font-size:10px">iret 指令</span>
            </div>
            <div class="um-box ring3" :class="{ 'um-active': currentStep >= 6 }">
              <div class="um-ring">Ring 3</div>
              <div class="um-bname">用户态</div>
              <div class="um-note">task[0] idle 循环</div>
            </div>
          </div>

          <Transition name="fade">
            <div v-if="currentStep >= 7" class="um-fork">
              <div class="uf-title">fork() 创建进程 1</div>
              <div class="uf-flow">
                <div class="uf-proc">task[0]<br><span class="mono" style="font-size:9px">pid=0</span></div>
                <div class="uf-arrow">fork() →</div>
                <div class="uf-proc child">task[1]<br><span class="mono" style="font-size:9px">pid=1</span></div>
              </div>
              <div class="uf-note">进程1执行 init()，挂载根文件系统，启动 shell</div>
            </div>
          </Transition>
        </div>

        <!-- scene: memmap mem_map[] 页帧网格 -->
        <div v-else-if="currentState.scene === 'memmap'" class="scene-memmap">
          <div class="mm-title">mem_map[] — 4KB 页帧分布（16 MB / 4 KB = 4096 帧）</div>
          <div class="mm-legend">
            <span class="mml-item"><i class="mml-dot" style="background:rgba(64,158,255,0.6)"></i>内核（USED）</span>
            <span class="mml-item"><i class="mml-dot" style="background:rgba(230,162,60,0.6)"></i>缓冲区（USED）</span>
            <span class="mml-item"><i class="mml-dot" style="background:rgba(103,194,58,0.55)"></i>主内存（FREE）</span>
          </div>
          <div class="mm-grid">
            <el-tooltip
              v-for="i in 4096" :key="i"
              placement="top" effect="light" :show-after="60"
              :disabled="i % 128 !== 1"
            >
              <template #content>
                <div style="font-size:11px;line-height:1.7">
                  <template v-if="i <= 256">
                    帧 {{ i-1 }}（地址 {{ '0x' + ((i-1)*4096).toString(16).toUpperCase().padStart(5,'0') }}）<br>
                    状态：<b style="color:#409EFF">USED</b>（内核区）
                  </template>
                  <template v-else-if="i <= 1024">
                    帧 {{ i-1 }}（地址 {{ '0x' + ((i-1)*4096).toString(16).toUpperCase().padStart(6,'0') }}）<br>
                    状态：<b style="color:#E6A23C">USED</b>（缓冲区）
                  </template>
                  <template v-else>
                    帧 {{ i-1 }}（地址 {{ '0x' + ((i-1)*4096).toString(16).toUpperCase().padStart(6,'0') }}）<br>
                    状态：<b style="color:#67C23A">FREE</b>（可分配）
                  </template>
                </div>
              </template>
              <div
                class="mm-cell"
                :class="{
                  'cell-kernel': i <= 256,
                  'cell-buffer': i > 256 && i <= 1024,
                  'cell-free':   i > 1024,
                }"
              ></div>
            </el-tooltip>
          </div>
          <div class="mm-note">mem_init() 先全部标 USED，再将 4MB~16MB（3072帧）置 0（空闲）</div>
        </div>

        <!-- scene: buflist buffer_head 链表 -->
        <div v-else-if="currentState.scene === 'buflist'" class="scene-buflist">
          <div class="bl-title">buffer_head 循环双向链表（free_list）</div>
          <div class="bl-subtitle">每块 1 KB，内核 end ~ 4 MB 共 ≈ 307 块</div>
          <div class="bl-list">
            <template v-for="n in Math.min(bufAnimNodes, 5)" :key="n">
              <div class="bl-node" :class="{ 'bl-head': n === 1 }">
                <div class="bl-node-top">
                  <span class="bl-label mono">bh{{ n-1 }}</span>
                  <span v-if="n === 1" class="bl-tag">free_list</span>
                </div>
                <div class="bl-field">b_data: <span class="mono">{{ '0x' + (0x400000 - n * 0x400).toString(16).toUpperCase() }}</span></div>
                <div class="bl-field">b_count: <span class="mono">0</span></div>
                <div class="bl-field">b_dirt: <span class="mono">0</span></div>
              </div>
              <div v-if="n < Math.min(bufAnimNodes, 5)" class="bl-arrow">⇄</div>
            </template>
            <template v-if="bufAnimNodes >= 5">
              <div class="bl-ellipsis">… ≈302块</div>
              <div class="bl-back">↩ → bh0</div>
            </template>
          </div>
          <div class="bl-note" v-if="bufAnimNodes > 0">
            <el-icon color="#67C23A" size="12"><CircleCheckFilled /></el-icon>
            {{ bufAnimNodes >= 5 ? 'free_list 循环双向链表构建完成' : `正在初始化第 ${bufAnimNodes} 个缓冲块…` }}
          </div>
        </div>

        <!-- scene: init init进程 -->
        <div v-else-if="currentState.scene === 'init'" class="scene-init">
          <div class="si-title">init() 进程启动序列</div>
          <div class="si-step" v-for="s in initSteps" :key="s.label">
            <el-icon :color="s.done ? '#67C23A' : '#DCDFE6'" size="13">
              <CircleCheckFilled v-if="s.done" /><CirclePlus v-else />
            </el-icon>
            <span :class="{ 'si-done': s.done }">{{ s.label }}</span>
          </div>

          <Transition name="fade">
            <div v-if="currentStep >= 8" class="si-shell">
              <div class="sis-title">进程树</div>
              <div class="sis-tree">
                <div class="sis-node root">init (pid=1)</div>
                <div class="sis-children">
                  <div class="sis-node">sh (pid=2)</div>
                </div>
              </div>
            </div>
          </Transition>
        </div>

      </el-card>
    </div>

    <!-- 控制 -->
    <div class="controls">
      <el-button @click="prevStep" :disabled="currentStep === 0">上一步</el-button>
      <el-button :type="autoPlaying ? 'danger' : 'primary'" @click="toggleAuto">
        {{ autoPlaying ? '暂停' : '自动播放' }}
      </el-button>
      <el-button @click="nextStep" :disabled="currentStep >= steps.length - 1">下一步</el-button>
      <el-button link @click="reset" style="color:#909399">重置</el-button>
    </div>

    <!-- 详情 -->
    <el-card shadow="never" class="detail-card">
      <Transition name="fade">
        <div :key="currentStep">
          <div class="detail-header">
            <span class="step-num mono">{{ String(currentStep+1).padStart(2,'0') }}/{{ steps.length }}</span>
            <span class="step-title-big">{{ currentState.title }}</span>
            <span class="src-ref mono" v-if="currentState.srcRef">{{ currentState.srcRef }}</span>
          </div>
          <p class="detail-desc">{{ currentState.detail }}</p>
          <div v-if="currentState.code" class="code-box">
            <pre><code>{{ currentState.code }}</code></pre>
          </div>
        </div>
      </Transition>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

// ─── 阶段 ────────────────────────────────────────────────
const phases = [
  { name: '读取参数',   file: 'main.c:59',   startStep: 0 },
  { name: '内存划分',   file: 'main.c:91',   startStep: 1 },
  { name: '子系统初始化', file: 'main.c:116', startStep: 3 },
  { name: '用户态+进程', file: 'main.c:138', startStep: 6 },
]

// ─── 步骤数据 ──────────────────────────────────────────
const steps = [
  // Phase 0: 读取硬件参数
  {
    phaseIdx: 0, phase: '读取硬件参数',
    title: 'main() 入口：读取 setup 写入的硬件参数',
    srcFile: 'init/main.c', srcFn: 'void main(void)',
    srcRef: 'init/main.c:59',
    tagType: 'info',
    vars: [
      { name: 'ROOT_DEV',    val: '0x0301',   hot: true,  tip: '根文件系统设备号。0x03=硬盘，0x01=第1分区。内核启动后挂载此设备为根目录。' },
      { name: 'memory_end',  val: '?',        hot: false, tip: '物理内存上界（字节）。等于 1MB + 扩展内存大小，最大 16MB。' },
      { name: 'EXT_MEM_K',   val: '0x3C00',   hot: true,  tip: '扩展内存大小（KB），由 setup.s 通过 BIOS INT 15h 查询后写入 0x90002。0x3C00 = 15360 KB = 15 MB。' },
    ],
    explain: '就像你入职第一天要办工牌、配电脑、申请各种权限，内核也要在正式运行之前把所有子系统都初始化好——内存怎么分、中断怎么响、进程怎么调度，全在这一步完成。\n\nmain() 第一件事是从 setup.s 留在 0x90000 附近的参数区读取硬件信息。这些地址是 setup 和 main.c 之间约定好的"接口"。',
    detail: 'init/main.c:59 开始一系列宏定义读取：\n  ROOT_DEV = *(short*)0x901FC  根设备号\n  EXT_MEM_K = *(short*)0x90002  扩展内存 KB 数\n  DRIVE_INFO 来自 0x90080  硬盘参数\n这是实模式（setup）向保护模式（main）传递信息的唯一手段——共享内存地址。',
    code: `/* init/main.c:59 — 读取 setup.s 写入的参数 */
#define EXT_MEM_K   (*(unsigned short *)0x90002)
#define DRIVE_INFO  (*(struct drive_info *)0x90080)
#define ORIG_ROOT_DEV (*(short *)0x901FC)

void main(void) {
    ROOT_DEV = ORIG_ROOT_DEV;       // 根设备号
    drive_info = DRIVE_INFO;        // 硬盘参数表
    memory_end = (1<<20) + (EXT_MEM_K<<10);  // 1MB + 扩展内存
    memory_end &= 0xfffff000;       // 4KB 对齐`,
    scene: 'params',
    memActive: ['kernel'],
  },

  // Phase 1: 内存划分
  {
    phaseIdx: 1, phase: '计算内存布局',
    title: '根据 memory_end 划分三个区域',
    srcFile: 'init/main.c', srcFn: 'void main(void)',
    srcRef: 'init/main.c:100',
    tagType: 'warning',
    vars: [
      { name: 'memory_end',         val: '16 MB',  hot: true,  tip: '物理内存总量上界。超过 16MB 时截断为 16MB（Linux 0.11 的限制）。' },
      { name: 'buffer_memory_end',  val: '4 MB',   hot: true,  tip: '缓冲区上界（= 主内存下界）。内存>12MB时取 4MB，>6MB时取 2MB，否则 1MB。' },
      { name: 'main_memory_start',  val: '4 MB',   hot: true,  tip: '主内存（用户进程可用）起始地址 = buffer_memory_end。' },
    ],
    explain: '内存被切成三块：内核代码区（0~end）、缓冲区（end~4MB）、主内存（4MB~16MB）。这三块各自有独立的管理器。',
    detail: '三块内存各有用途：\n① 内核区（0x00000~end）：内核代码+数据+BSS，固定不动\n② 缓冲区（end~4MB）：磁盘 I/O 缓冲，由 buffer_init() 管理，以 1KB 块为单位\n③ 主内存（4MB~16MB）：用户进程申请页面，由 mem_init() 管理，以 4KB 页为单位',
    code: `/* init/main.c:100 */
if (memory_end > 16*1024*1024)
    memory_end = 16*1024*1024;       // 上限 16MB
if (memory_end > 12*1024*1024)
    buffer_memory_end = 4*1024*1024; // 缓冲区到 4MB
else if (memory_end > 6*1024*1024)
    buffer_memory_end = 2*1024*1024;
else
    buffer_memory_end = 1*1024*1024;
main_memory_start = buffer_memory_end; // 主内存从 4MB 开始`,
    scene: 'mem-calc',
    calcHot: ['buffer_memory_end', 'main_memory_start'],
    memActive: ['kernel', 'buffer', 'main-mem'],
  },
  {
    phaseIdx: 1, phase: 'mem_init()',
    title: 'mem_init()：初始化主内存页面管理',
    srcFile: 'mm/memory.c', srcFn: 'mem_init()',
    srcRef: 'mm/memory.c:86',
    tagType: 'warning',
    vars: [
      { name: 'main_memory_start', val: '0x400000', hot: true,  tip: '主内存起始地址（4MB）。mem_init 从这里开始管理页面。' },
      { name: 'memory_end',        val: '0x1000000',hot: true,  tip: '主内存结束地址（16MB）。' },
      { name: 'mem_map[]',         val: '初始化',   hot: false, tip: 'mem_map 数组记录每个 4KB 页面的引用计数。0=空闲，>0=已占用。共 (16MB-4MB)/4KB = 3072 个页面。' },
    ],
    explain: 'mem_init() 把主内存（4MB~16MB）的每个 4KB 页面登记到 mem_map[] 数组，初始标为 USED，然后把空闲页面标为 0（可分配）。',
    detail: 'mm/memory.c:86 的 mem_init() 逻辑：\n  paging_pages = (memory_end - main_memory_start) / PAGE_SIZE\n  = (16MB - 4MB) / 4KB = 3072 个页\n  先全部标 USED，再把 main_memory_start~memory_end 之间的页标 0（空闲）\n  之后 get_free_page() 从 mem_map 找空闲页分配给进程',
    code: `/* mm/memory.c:86 */
#define PAGING_PAGES ((memory_end-main_memory_start)/PAGE_SIZE)

void mem_init(long start_mem, long end_mem) {
    int i;
    HIGH_MEMORY = end_mem;
    for (i=0; i < PAGING_PAGES; i++)
        mem_map[i] = USED;           // 全部标占用
    i = MAP_NR(start_mem);           // 从 start_mem 开始
    end_mem -= start_mem;
    end_mem >>= 12;                  // 转换为页数
    while (end_mem-- > 0)
        mem_map[i++] = 0;            // 标为空闲
}`,
    scene: 'memmap',
    memActive: ['kernel', 'buffer', 'main-mem'],
  },

  // Phase 2: 子系统初始化
  {
    phaseIdx: 2, phase: 'trap_init()',
    title: 'trap_init()：设置 IDT，注册异常处理',
    srcFile: 'kernel/traps.c', srcFn: 'trap_init()',
    srcRef: 'kernel/traps.c:185',
    tagType: 'warning',
    vars: [
      { name: 'IDT',      val: '256 项',    hot: true,  tip: '中断描述符表（保护模式版 IVT）。每项 8 字节，描述中断服务程序的地址和特权级。' },
      { name: 'divide_error', val: 'INT 0', hot: false, tip: '除零异常处理程序，注册到 IDT[0]。' },
      { name: 'page_fault',   val: 'INT 14',hot: false, tip: '缺页异常，注册到 IDT[14]。进程访问未映射页面时触发，内核在此处分配新页。' },
    ],
    explain: 'trap_init() 把各种 CPU 异常（除零、越界、缺页等）的处理程序地址填入 IDT。这是保护模式下"中断向量表"的升级版。',
    detail: 'kernel/traps.c 中用宏 set_trap_gate / set_system_gate 填写 IDT 描述符：\n  INT 0  divide_error（除零）\n  INT 3  int3（断点，Ring3可触发）\n  INT 4  overflow\n  INT 13 general_protection\n  INT 14 page_fault（缺页，最重要的一个）\n  INT 128 (0x80) system_call（系统调用入口）\n设置完后 lidt 指令加载 IDT 基址。',
    code: `/* kernel/traps.c:185 */
void trap_init(void) {
    set_trap_gate(0,  &divide_error);
    set_trap_gate(1,  &debug);
    set_trap_gate(3,  &int3);       // Ring3 可触发（用于调试）
    set_trap_gate(4,  &overflow);
    set_trap_gate(13, &general_protection);
    set_trap_gate(14, &page_fault); // 缺页异常 — 内存管理核心
    set_system_gate(0x80, &system_call); // 系统调用入口
}`,
    scene: 'subsys',
    subsysStep: 1,
    memActive: ['kernel'],
  },
  {
    phaseIdx: 2, phase: 'sched_init()',
    title: 'sched_init()：初始化调度器，建立 task[0]',
    srcFile: 'kernel/sched.c', srcFn: 'sched_init()',
    srcRef: 'kernel/sched.c:385',
    tagType: 'warning',
    vars: [
      { name: 'task[0]',    val: 'idle 进程', hot: true,  tip: 'task[0] 是内核手工建立的第一个进程（"0号进程"）。不通过 fork()，直接由 sched_init 设置 TSS 和 LDT。' },
      { name: 'LATCH',      val: '11932',     hot: false, tip: '定时器计数初值。8253 定时器频率 1.193MHz / 11932 ≈ 100 Hz，即每 10ms 触发一次时钟中断（IRQ0）。' },
      { name: 'jiffies',    val: '0',         hot: false, tip: '系统启动以来的时钟中断计数，每 10ms 加 1。进程时间片、sleep 等都基于 jiffies 计算。' },
    ],
    explain: 'sched_init() 做三件事：① 在 GDT 中为 task[0] 设置 TSS 和 LDT 描述符；② 注册 IRQ0 时钟中断（10ms 一次）；③ 把 task[0] 标为 RUNNING。',
    detail: 'kernel/sched.c:385：\n  1. 清空 task[] 数组，设置 task[0] = &init_task（静态定义的内核进程）\n  2. 在 GDT 的第 4、5 项填入 task[0] 的 TSS 和 LDT 描述符\n  3. ltr/lldt 指令加载 TSS 和 LDT\n  4. 设置 8253 定时器（LATCH=11932 → 100Hz），注册 IRQ0 → timer_interrupt\n  5. 注册 0x80 系统调用（set_system_gate）',
    code: `/* kernel/sched.c:385 */
void sched_init(void) {
    set_tss_desc(gdt+4, &(init_task.task.tss)); // task[0] TSS
    set_ldt_desc(gdt+5, &(init_task.task.ldt)); // task[0] LDT
    // 清空其余 task 槽
    for (i=1; i<NR_TASKS; i++) task[i] = NULL;
    // 加载 TSS 和 LDT
    ltr(0); lldt(0);
    // 设置 8253 定时器：100Hz 时钟中断
    outb_p(0x36, 0x43);
    outb_p(LATCH & 0xff, 0x40);
    outb_p(LATCH >> 8,   0x40);
    set_intr_gate(0x20, &timer_interrupt); // IRQ0
    set_system_gate(0x80, &system_call);
}`,
    scene: 'sched',
    subsysStep: 3,
    memActive: ['kernel'],
  },
  {
    phaseIdx: 2, phase: 'buffer_init + hd_init',
    title: 'buffer_init() + hd_init()：缓冲区和硬盘驱动',
    srcFile: 'fs/buffer.c', srcFn: 'buffer_init()',
    srcRef: 'fs/buffer.c:348 / kernel/hd.c:343',
    tagType: 'warning',
    vars: [
      { name: 'buffer_memory_end', val: '4 MB',    hot: true,  tip: '缓冲区上界。buffer_init 在内核 end 到 4MB 这段内存里建立缓冲块链表。' },
      { name: 'NR_BUFFERS',        val: '≈ 307',   hot: false, tip: '缓冲区块数量 = (4MB - kernel_end) / 1024。每块 1KB，用于磁盘数据缓存。' },
      { name: 'free_list',         val: '双向链表', hot: false, tip: '空闲缓冲块链表头。每次磁盘读写先查这里，命中直接返回（页缓存雏形）。' },
    ],
    explain: 'buffer_init() 把内核 end 到 4MB 的内存切成 1KB 大小的缓冲块，构成双向 LRU 链表。磁盘读写都先经过这里——这是 Linux 0.11 的"磁盘缓存"。',
    detail: 'buffer_init() 从两端向中间建立缓冲块：\n  - 低端：buffer_head（描述结构）\n  - 高端：实际数据区（1KB）\n  两者相遇时分配结束。所有空闲块串成双向链表 free_list。\n\nhd_init() 注册 IRQ14（硬盘中断），设置硬盘读写中断处理程序，之后所有硬盘操作都是异步的：发命令→等中断→处理结果。',
    code: `/* fs/buffer.c:348 */
void buffer_init(long buffer_end) {
    struct buffer_head *h = start_buffer;
    void *b = (void *) buffer_end;
    while ( (b -= BLOCK_SIZE) >= ((void *)(h+1)) ) {
        h->b_dev  = 0;
        h->b_dirt = 0;
        h->b_count = 0;
        h->b_data = (char *) b;  // 数据区在高端
        // 插入 free_list 链表
        h++;
    }
}

/* kernel/hd.c:343 — 注册硬盘中断 */
void hd_init(void) {
    blk_dev[MAJOR_NR].request_fn = do_hd_request;
    set_intr_gate(0x2E, &hd_interrupt); // IRQ14
    outb_p(inb_p(0x21)&0xfb, 0x21);    // 开 IRQ14
}`,
    scene: 'buflist',
    memActive: ['kernel', 'buffer'],
  },

  // Phase 3: 用户态 + 进程
  {
    phaseIdx: 3, phase: 'sti() + 切用户态',
    title: 'sti() 开中断，move_to_user_mode() 切换到 Ring3',
    srcFile: 'init/main.c', srcFn: 'main()',
    srcRef: 'init/main.c:138',
    tagType: 'success',
    vars: [
      { name: 'IF flag',  val: '1 (开)',   hot: true,  tip: 'CPU EFLAGS 的 IF 位。sti() 指令将 IF 置 1，之后时钟中断（IRQ0）开始工作，进程调度正式启动。' },
      { name: 'CPL',      val: '0 → 3',   hot: true,  tip: '当前特权级（Current Privilege Level）。move_to_user_mode() 通过伪造 iret 帧，把 CPL 从 Ring0（内核）切换到 Ring3（用户）。' },
    ],
    explain: 'sti() 之前所有初始化在中断关闭状态下进行。开中断后时钟中断触发，调度器开始工作。move_to_user_mode() 把 task[0] 降到 Ring3，内核不再"裸跑"。',
    detail: 'move_to_user_mode() 的实现很巧妙：手工在栈上压入一个"假的"中断返回帧（SS、ESP、EFLAGS、CS、EIP），其中 CS 的 RPL=3。\n执行 iret 后 CPU 认为"从中断返回到用户态"，CPL 变为 3。\n从此 task[0] 在用户态空转（for(;;) pause()），等待被 fork 出来的进程1抢占。',
    code: `/* init/main.c:138 */
sti();                  // 开中断，调度器开始工作
move_to_user_mode();    // task[0] 切换到 Ring3

/* include/asm/system.h — move_to_user_mode 实现 */
#define move_to_user_mode() \\
__asm__ ("movl %%esp,%%eax\\n\\t" \\
    "pushl $0x17\\n\\t"   /* SS  = 用户数据段 */ \\
    "pushl %%eax\\n\\t"   /* ESP */             \\
    "pushfl\\n\\t"        /* EFLAGS */          \\
    "pushl $0x0f\\n\\t"   /* CS  = 用户代码段 */ \\
    "pushl $1f\\n\\t"     /* EIP */ \\
    "iret\\n"             /* 伪造中断返回，CPL→3 */ \\
    "1:\\t")`,
    scene: 'usermode',
    memActive: ['kernel', 'buffer', 'main-mem'],
  },
  {
    phaseIdx: 3, phase: 'fork() 创建进程1',
    title: 'fork() 创建进程1，执行 init()',
    srcFile: 'init/main.c', srcFn: 'main() → init()',
    srcRef: 'init/main.c:142',
    tagType: 'success',
    vars: [
      { name: 'pid',    val: '0 / 1',  hot: true,  tip: 'fork() 在父进程（task[0]）返回 1（子进程pid），在子进程（task[1]）返回 0。main.c 用 if(!fork()) 判断：返回0则执行 init()。' },
      { name: 'task[1]',val: 'init',  hot: true,  tip: '进程1是第一个真正的用户进程。它挂载根文件系统，打开终端，执行 /etc/rc 脚本，最后创建 shell。' },
    ],
    explain: 'task[0] 在 Ring3 调用 fork()，系统调用进入 Ring0，copy_process() 复制 task[0] 的 task_struct 和页表，创建 task[1]。调度器选中 task[1] 运行 init()。',
    detail: 'init/main.c:142:\n  if (!fork()) { init(); }\n  // task[0]: fork()返回1, 不执行 init, 进入 for(;;)pause()\n  // task[1]: fork()返回0, 执行 init()\n\ninit() 做的事：\n  1. setup(0x901C) — 读分区表、挂载根文件系统\n  2. open("/dev/tty0") × 3 — stdin/stdout/stderr\n  3. execve("/etc/rc") — 执行初始化脚本\n  4. 创建 shell 进程（通常 /bin/sh）',
    code: `/* init/main.c:142 */
if (!fork())        /* fork() 返回 0 → 进入子进程(task[1]) */
    init();         /* 执行初始化 */
for(;;) pause();    /* task[0] 空转等待 */

/* 进程1 init() 的核心逻辑 */
void init(void) {
    setup((void *) &drive_info); // 挂载根文件系统
    (void) open("/dev/tty0",O_RDWR,0); // stdin
    (void) dup(0);  // stdout
    (void) dup(0);  // stderr
    execve("/etc/rc", argv_rc, envp_rc);
    // rc 脚本执行完后，fork 创建 shell
    if (!(pid=fork())) {
        execve("/bin/sh", argv, envp);
    }
}`,
    scene: 'usermode',
    memActive: ['kernel', 'buffer', 'main-mem'],
  },
  {
    phaseIdx: 3, phase: 'init() → shell',
    title: 'init() 挂载根文件系统，启动 shell',
    srcFile: 'init/main.c', srcFn: 'init()',
    srcRef: 'init/main.c:157',
    tagType: 'success',
    vars: [
      { name: 'root_dev',   val: '0x0301',   hot: true,  tip: '根文件系统设备。0x03=硬盘，0x01=第1分区。init() 调用 setup() 挂载它。' },
      { name: '/dev/tty0',  val: 'fd=0,1,2', hot: false, tip: '打开终端三次分别作为 stdin/stdout/stderr（文件描述符 0/1/2）。之后所有进程继承这三个 fd。' },
      { name: '/bin/sh',    val: 'shell',    hot: true,  tip: 'Linux 0.11 的 shell。init() fork 后 execve 加载 /bin/sh，用户就看到了命令提示符。' },
    ],
    explain: 'init() 是整个内核启动的终点：挂载文件系统、打开终端、执行 rc 脚本、最终拉起 shell。用户看到的第一个 $ 提示符就从这里来。',
    detail: 'init() 完成后系统进入稳定运行状态：\n  - task[0] (idle)：Ring3 空转，CPU 空闲时运行\n  - task[1] (init)：等待子进程，守护 shell 重启\n  - task[2] (sh)：shell 进程，接收用户输入\n  - 之后每个用户命令 fork/exec 出新进程\n\n至此，Linux 0.11 内核启动完成。',
    code: `/* init/main.c:157 */
void init(void) {
    int pid, i;
    setup((void *) &drive_info);  // 挂载根文件系统
    (void) open("/dev/tty0",O_RDWR,0);
    (void) dup(0);  // stdout
    (void) dup(0);  // stderr
    // 执行 /etc/rc 初始化脚本
    if (!(pid=fork())) {
        execve("/etc/rc", argv_rc, envp_rc);
        exit(2);
    }
    wait(&i);  // 等 rc 脚本跑完
    // 循环创建 shell（退出后重新拉起）
    while (1) {
        if ((pid=fork()) < 0) continue;
        if (!pid) {
            execve("/bin/sh", argv, envp);
            exit(2);
        }
        wait(&i);  // 等 shell 退出，再重启
    }
}`,
    scene: 'init',
    memActive: ['kernel', 'buffer', 'main-mem'],
  },
]

// ─── 内存区域 ─────────────────────────────────────────
const memZones = [
  {
    key: 'main-mem', name: '主内存', addrLabel: '4MB~', pct: 50, color: '#9B59B6',
    range: '4MB – 16MB', size: '12 MB',
    desc: '用户进程可申请的页面区（get_free_page）。mem_init() 管理这里，以 4KB 页为单位分配。进程代码、堆、栈都在这里。',
    initially: 'dim',
  },
  {
    key: 'buffer', name: '缓冲区', addrLabel: 'end~4MB', pct: 20, color: '#E6A23C',
    range: 'kernel_end – 4MB', size: '≈ 3 MB',
    desc: '磁盘 I/O 缓冲区，由 buffer_init() 以 1KB 块为单位管理。所有磁盘读写先查缓冲，命中直接返回，未命中才真正读盘。',
    initially: 'dim',
  },
  {
    key: 'kernel', name: '内核', addrLabel: '0x00000', pct: 30, color: '#409EFF',
    range: '0x00000 – kernel_end', size: '≈ 1 MB',
    desc: '内核代码+数据段（head.s + main.c + 所有内核模块）。这块内存固定，永远不会被交换出去。',
  },
]

const zoneLegend = [
  { key: 'kernel',   name: '内核区',  color: '#409EFF' },
  { key: 'buffer',   name: '缓冲区',  color: '#E6A23C' },
  { key: 'main-mem', name: '主内存',  color: '#9B59B6' },
]

const visibleZones = computed(() => {
  const s = currentStep.value
  return memZones.map(z => ({
    ...z,
    dim: z.initially === 'dim' && !zoneUnlocked(z.key, s),
  }))
})

function zoneUnlocked(key, s) {
  if (key === 'buffer')   return s >= 1
  if (key === 'main-mem') return s >= 1
  return true
}

// ─── 硬件参数 ────────────────────────────────────────
const hwParams = [
  { addr: '0x901FC', key: '根设备号',     val: '0x0301' },
  { addr: '0x90002', key: '扩展内存(KB)', val: '0x3C00 (15MB)' },
  { addr: '0x90080', key: '硬盘0参数',    val: '40头/...' },
  { addr: '0x90000', key: '光标位置',     val: '0x0000' },
]

// ─── 内存计算展示 ────────────────────────────────────
const memCalcItems = [
  { name: 'memory_end',        val: '16 MB (0x1000000)', note: '1MB + 15MB扩展' },
  { name: 'buffer_memory_end', val: '4 MB  (0x400000)',  note: 'memory_end>12MB时' },
  { name: 'main_memory_start', val: '4 MB  (0x400000)',  note: '= buffer_memory_end' },
]

// ─── 子系统初始化列表 ─────────────────────────────────
const subsysItems = computed(() => {
  const s = currentStep.value
  return [
    { fn: 'mem_init()',     desc: '主内存页面管理',   done: s >= 2 },
    { fn: 'trap_init()',    desc: '异常/中断 IDT',     done: s >= 3 },
    { fn: 'blk_dev_init()', desc: '块设备请求队列',   done: s >= 4 },
    { fn: 'tty_init()',     desc: '终端驱动',         done: s >= 4 },
    { fn: 'sched_init()',   desc: '调度器+task[0]',   done: s >= 4 },
    { fn: 'buffer_init()',  desc: '磁盘缓冲区',       done: s >= 5 },
    { fn: 'hd_init()',      desc: '硬盘中断驱动',     done: s >= 5 },
  ]
})

// ─── init() 步骤 ─────────────────────────────────────
const initSteps = computed(() => {
  const s = currentStep.value
  return [
    { label: 'setup() — 挂载根文件系统',         done: s >= 8 },
    { label: 'open("/dev/tty0") — 打开终端',     done: s >= 8 },
    { label: 'execve("/etc/rc") — 初始化脚本',   done: s >= 8 },
    { label: 'fork() + execve("/bin/sh")',        done: s >= 8 },
  ]
})

// ─── 计算属性 ─────────────────────────────────────────
const currentStep  = ref(0)
const currentState = computed(() => steps[currentStep.value])
const currentPhase = computed(() => steps[currentStep.value].phaseIdx)

const sceneTitle = computed(() => {
  const sc = currentState.value.scene
  const map = {
    params: '硬件参数读取', 'mem-calc': '内存布局',
    memmap: 'mem_map[] 页帧分布', buflist: 'buffer_head 链表',
    subsys: '子系统初始化', sched: '调度器状态',
    usermode: '特权级切换', init: 'init() 进程',
  }
  return map[sc] || ''
})

// ─── 播放控制 ─────────────────────────────────────────
const autoPlaying  = ref(false)
const bufAnimNodes = ref(0)
let autoTimer    = null
let bufAnimTimer = null
let varFlashTimer = null

function goStep(n) {
  if (bufAnimTimer) { clearInterval(bufAnimTimer); bufAnimTimer = null }
  currentStep.value = n
  if (steps[n].scene === 'buflist') {
    bufAnimNodes.value = 0
    bufAnimTimer = setInterval(() => {
      bufAnimNodes.value++
      if (bufAnimNodes.value >= 5) { clearInterval(bufAnimTimer); bufAnimTimer = null }
    }, 380)
  }
}
function nextStep() { if (currentStep.value < steps.length - 1) goStep(currentStep.value + 1) }
function prevStep() { if (currentStep.value > 0) goStep(currentStep.value - 1) }
function reset()    { stopAuto(); if (bufAnimTimer) { clearInterval(bufAnimTimer); bufAnimTimer = null } currentStep.value = 0 }

function toggleAuto() {
  if (autoPlaying.value) { stopAuto(); return }
  autoPlaying.value = true
  autoTimer = setInterval(() => {
    if (currentStep.value >= steps.length - 1) { stopAuto(); return }
    nextStep()
  }, 4000)
}

function stopAuto() {
  autoPlaying.value = false
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
}

onUnmounted(() => {
  stopAuto()
  if (bufAnimTimer) clearInterval(bufAnimTimer)
  if (varFlashTimer) clearTimeout(varFlashTimer)
})

// ─── 变量变化高亮 ─────────────────────────────────────
const changedVars = ref(new Set())

watch(currentStep, (newVal, oldVal) => {
  const prevVars = steps[oldVal]?.vars || []
  const nextVars = steps[newVal]?.vars || []
  const prevMap = Object.fromEntries(prevVars.map(v => [v.name, v.val]))
  const changed = new Set()
  for (const v of nextVars) { if (prevMap[v.name] !== v.val) changed.add(v.name) }
  changedVars.value = changed
  if (varFlashTimer) clearTimeout(varFlashTimer)
  varFlashTimer = setTimeout(() => { changedVars.value = new Set() }, 900)
})
</script>

<style scoped>
/* ── 整体 ── */
.main-visualizer {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-header h2  { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.subtitle        { font-size: 13px; color: #909399; }
.mono            { font-family: ui-monospace, Consolas, monospace; }

/* ── 阶段进度 ── */
.phase-card :deep(.el-card__body) { padding: 14px 16px; }

.phase-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}

.phase-seg {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.phase-seg.active { background: rgba(64,158,255,0.08); border-color: rgba(64,158,255,0.4); }
.phase-seg.done   { background: rgba(103,194,58,0.06);  border-color: rgba(103,194,58,0.3); }

.ph-label { display: block; font-size: 13px; font-weight: 600; color: #303133; }
.ph-file  { display: block; font-size: 11px; color: #C0C4CC; margin-top: 2px; font-family: ui-monospace, monospace; }
.step-indicator { font-size: 12px; color: #909399; }

/* ── 三栏 ── */
.main-panel {
  display: grid;
  grid-template-columns: 250px 1fr 250px;
  gap: 14px;
  align-items: start;
}

.panel { border: 1px solid #e4e7ed; }
.panel :deep(.el-card__header) { padding: 9px 14px; border-bottom: 1px solid #f0f2f5; }
.panel :deep(.el-card__body)   { padding: 14px; }

.panel-title { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; color: #606266; }

/* ── 左面板 ── */
.code-loc { margin-bottom: 2px; }
.loc-file { font-size: 11px; color: #909399; }
.loc-fn   { font-size: 13px; color: #303133; font-weight: 600; margin-top: 2px; }

.var-list { display: flex; flex-direction: column; gap: 4px; }

.var-row { border-radius: 4px; transition: background 0.3s; }
.var-row:hover { background: #f5f7fa; }
.var-row.var-highlight { background: rgba(64,158,255,0.07); border-left: 2px solid rgba(64,158,255,0.45); }

.var-inner { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; cursor: help; }
.var-name  { font-size: 11px; color: #909399; font-family: ui-monospace, monospace; }
.var-val   { font-size: 12px; color: #303133; font-weight: 500; font-family: ui-monospace, monospace; }

.explain-box  { min-height: 60px; margin-top: 8px; }
.explain-text { font-size: 12px; color: #606266; line-height: 1.7; }

/* ── 内存区域（横向条） ── */
.mem-zones { display: flex; flex-direction: column; gap: 6px; }

.mz-scale-top, .mz-scale-bot {
  font-size: 10px; color: #C0C4CC; text-align: right;
}

.mz-bar {
  display: flex;
  flex-direction: column;
  height: 320px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.mz-zone {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 12px;
  border-left: 3px solid transparent;
  cursor: help;
  transition: background 0.4s, border-color 0.4s;
  overflow: hidden;
  min-height: 0;
}

.mz-zone:hover { filter: brightness(0.97); }

.mz-zone.zone-dim {
  background: #f5f7fa !important;
  border-left-color: #e4e7ed !important;
}

.mz-zone.zone-active {
  background: color-mix(in srgb, var(--zc) 12%, white);
  border-left-color: var(--zc);
}

.zone-label { font-size: 12px; color: #303133; font-weight: 500; }
.zone-addr  { font-size: 10px; color: #909399; margin-top: 2px; }

.zone-dim .zone-label,
.zone-dim .zone-addr { color: #C0C4CC; }

.mz-legend { display: flex; gap: 12px; flex-wrap: wrap; }
.mzl-item  { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #909399; }
.mzl-dot   { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }

/* zone tooltip */
.zone-tip  { max-width: 220px; }
.zt-range  { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 3px; }
.zt-size   { font-size: 11px; color: #909399; margin-bottom: 4px; }
.zt-desc   { font-size: 12px; color: #606266; line-height: 1.65; }

/* ── 场景：硬件参数 ── */
.scene-params { display: flex; flex-direction: column; gap: 8px; }
.sp-title { font-size: 12px; color: #909399; margin-bottom: 4px; }

.sp-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 4px;
  background: #fafafa; border: 1px solid #f0f2f5;
  font-size: 11px;
}

.sp-addr { font-family: ui-monospace, monospace; color: #409EFF; min-width: 62px; }
.sp-key  { flex: 1; color: #606266; }
.sp-val  { font-family: ui-monospace, monospace; color: #67C23A; }
.sp-note { font-size: 10px; color: #C0C4CC; margin-top: 4px; }

/* ── 场景：内存计算 ── */
.scene-memcalc { display: flex; flex-direction: column; gap: 8px; }
.mc-title { font-size: 12px; color: #909399; }

.mc-item {
  display: flex; align-items: baseline; gap: 6px;
  padding: 5px 8px; border-radius: 4px;
  font-size: 11px; background: #fafafa; border: 1px solid #f0f2f5;
  transition: background 0.3s;
}

.mc-item.mci-hot { background: rgba(64,158,255,0.07); border-color: rgba(64,158,255,0.2); }

.mci-name { font-family: ui-monospace, monospace; color: #303133; font-weight: 500; min-width: 90px; }
.mci-eq   { color: #C0C4CC; }
.mci-val  { font-family: ui-monospace, monospace; color: #409EFF; flex: 1; }
.mci-note { font-size: 10px; color: #C0C4CC; }

.mc-formula {
  background: #f8f9fb; border: 1px solid #ebeef5;
  border-radius: 4px; padding: 8px 10px; margin-top: 4px;
}

.mc-formula pre {
  margin: 0; font-family: ui-monospace, monospace;
  font-size: 11px; color: #476582; line-height: 1.8;
}

/* ── 场景：子系统 ── */
.scene-subsys { display: flex; flex-direction: column; gap: 7px; }
.ss-title { font-size: 12px; color: #909399; margin-bottom: 4px; }

.ss-item { display: flex; align-items: flex-start; gap: 6px; }

.ss-text { display: flex; flex-direction: column; gap: 1px; }
.ss-fn   { font-family: ui-monospace, monospace; font-size: 12px; color: #303133; }
.ss-desc { font-size: 10px; color: #909399; }

/* ── 场景：调度器 ── */
.scene-sched { display: flex; flex-direction: column; gap: 10px; }
.sc-title { font-size: 12px; color: #909399; }

.sc-tasks {
  display: grid; grid-template-columns: repeat(4,1fr);
  gap: 4px;
}

.sc-task {
  display: flex; flex-direction: column; align-items: center;
  padding: 5px 4px; border-radius: 4px; border: 1px solid #e4e7ed;
  font-size: 10px; transition: all 0.4s;
}

.task-0     { background: rgba(64,158,255,0.1);  border-color: rgba(64,158,255,0.3);  }
.task-1     { background: rgba(103,194,58,0.1);  border-color: rgba(103,194,58,0.3);  }
.task-empty { background: #fafafa; color: #C0C4CC; }
.task-ellipsis { grid-column: span 4; justify-content: center; flex-direction: row; gap: 4px; background: #fafafa; color: #C0C4CC; }

.task-idx  { font-family: ui-monospace, monospace; font-size: 9px; color: #909399; }
.task-name { font-size: 11px; font-weight: 500; color: #303133; }

.sc-task0-detail {
  background: rgba(64,158,255,0.05); border: 1px solid rgba(64,158,255,0.15);
  border-radius: 5px; padding: 8px 10px;
}

.sc-d-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 6px; }

.sc-d-row {
  display: flex; justify-content: space-between; font-size: 11px;
  color: #606266; margin-bottom: 3px;
}

.sc-d-row .mono { font-family: ui-monospace, monospace; color: #409EFF; }

.sc-irq-box {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #606266;
  padding: 5px 8px; background: rgba(103,194,58,0.06);
  border: 1px solid rgba(103,194,58,0.2); border-radius: 4px;
}

/* ── 场景：用户态 ── */
.scene-usermode { display: flex; flex-direction: column; gap: 12px; }
.um-title { font-size: 12px; color: #909399; }

.um-flow { display: flex; flex-direction: column; align-items: center; gap: 6px; }

.um-box {
  width: 100%; padding: 10px;
  border-radius: 6px; text-align: center;
  border: 1px solid #e4e7ed; background: #f5f7fa;
  transition: background 0.4s, border-color 0.4s;
}

.um-box.ring0 { border-color: rgba(230,162,60,0.4); background: rgba(230,162,60,0.05); }
.um-box.ring3 { opacity: 0.45; }
.um-box.ring3.um-active { opacity: 1; border-color: rgba(103,194,58,0.4); background: rgba(103,194,58,0.06); }

.um-ring  { font-size: 11px; font-weight: 600; color: #303133; }
.um-bname { font-size: 12px; color: #606266; margin-top: 2px; }
.um-note  { font-size: 10px; color: #C0C4CC; margin-top: 2px; font-family: ui-monospace, monospace; }

.um-arrow {
  display: flex; flex-direction: column; align-items: center;
  font-size: 11px; color: #909399; gap: 1px;
}

.um-arr { font-size: 16px; color: #67C23A; }

.um-fork {
  background: rgba(103,194,58,0.05); border: 1px solid rgba(103,194,58,0.2);
  border-radius: 6px; padding: 10px;
}

.uf-title { font-size: 12px; color: #909399; margin-bottom: 8px; }

.uf-flow { display: flex; align-items: center; gap: 8px; justify-content: center; }

.uf-proc {
  padding: 8px 14px; border-radius: 5px; text-align: center;
  background: rgba(64,158,255,0.08); border: 1px solid rgba(64,158,255,0.25);
  font-size: 12px; font-weight: 600; color: #303133;
}

.uf-proc.child {
  background: rgba(103,194,58,0.1); border-color: rgba(103,194,58,0.3);
}

.uf-arrow { font-size: 12px; color: #909399; }
.uf-note  { font-size: 10px; color: #C0C4CC; margin-top: 6px; }

/* ── 场景：init ── */
.scene-init { display: flex; flex-direction: column; gap: 8px; }
.si-title { font-size: 12px; color: #909399; }

.si-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #909399; transition: color 0.3s;
}

.si-done { color: #303133; }

.si-shell {
  margin-top: 6px;
  background: rgba(103,194,58,0.05); border: 1px solid rgba(103,194,58,0.2);
  border-radius: 6px; padding: 10px;
}

.sis-title { font-size: 11px; color: #909399; margin-bottom: 8px; }

.sis-tree  { display: flex; flex-direction: column; gap: 4px; }
.sis-node  {
  padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;
  background: rgba(64,158,255,0.08); border: 1px solid rgba(64,158,255,0.2);
  color: #303133; width: fit-content;
}

.sis-node.root { background: rgba(103,194,58,0.1); border-color: rgba(103,194,58,0.3); }

.sis-children {
  padding-left: 20px; border-left: 1px dashed #e4e7ed; margin-left: 14px;
}

/* ── 控制 ── */
.controls { display: flex; justify-content: center; align-items: center; gap: 10px; }

/* ── 详情卡片 ── */
.detail-card :deep(.el-card__body) { padding: 16px 18px; }

.detail-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.step-num       { font-size: 11px; color: #C0C4CC; font-family: ui-monospace, monospace; }
.step-title-big { font-size: 14px; font-weight: 600; color: #303133; }
.src-ref        { font-size: 11px; color: #909399; font-family: ui-monospace, monospace; }

.detail-desc { font-size: 13px; color: #606266; line-height: 1.85; white-space: pre-line; margin-bottom: 10px; }

.code-box { background: #f8f9fb; border: 1px solid #ebeef5; border-radius: 4px; padding: 12px 14px; overflow-x: auto; }
.code-box pre  { margin: 0; }
.code-box code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #476582; line-height: 1.85; }

/* 变量变化高亮 */
@keyframes var-flash {
  0%   { background: rgba(64,158,255,0.2); }
  100% { background: rgba(64,158,255,0.07); }
}
.var-row.var-changed {
  animation: var-flash 0.85s ease forwards;
}

/* ── task_struct 增强 ── */
.sc-d-section {
  font-size: 10px; color: #C0C4CC; font-weight: 500;
  margin: 5px 0 2px; padding-top: 4px;
  border-top: 1px solid #f0f2f5;
}
.sc-d-section:first-of-type { border-top: none; margin-top: 2px; }

/* ── 场景：mem_map[] 网格 ── */
.scene-memmap { display: flex; flex-direction: column; gap: 7px; }
.mm-title { font-size: 11px; color: #909399; }
.mm-legend { display: flex; gap: 8px; flex-wrap: wrap; }
.mml-item { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #909399; }
.mml-dot  { display: inline-block; width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

.mm-grid {
  display: grid;
  grid-template-columns: repeat(64, 1fr);
  gap: 1px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 3px;
  background: #fafafa;
}

.mm-cell {
  aspect-ratio: 1;
  border-radius: 1px;
  transition: opacity 0.3s;
}
.mm-cell:hover { opacity: 0.7; cursor: help; }
.cell-kernel { background: rgba(64,158,255,0.55); }
.cell-buffer { background: rgba(230,162,60,0.55); }
.cell-free   { background: rgba(103,194,58,0.45); }

.mm-note { font-size: 10px; color: #C0C4CC; }

/* ── 场景：buffer_head 链表 ── */
.scene-buflist { display: flex; flex-direction: column; gap: 8px; }
.bl-title    { font-size: 12px; color: #909399; }
.bl-subtitle { font-size: 10px; color: #C0C4CC; }

.bl-list {
  display: flex; align-items: center; gap: 4px;
  flex-wrap: wrap; min-height: 80px;
  padding: 8px; background: #fafafa;
  border: 1px solid #e4e7ed; border-radius: 6px;
}

.bl-node {
  border-radius: 5px; padding: 6px 8px;
  background: #fff; border: 1px solid #e4e7ed;
  font-size: 10px; min-width: 80px;
  animation: node-appear 0.3s ease;
  transition: border-color 0.3s;
}
.bl-head {
  border-color: rgba(64,158,255,0.4);
  background: rgba(64,158,255,0.04);
}
@keyframes node-appear {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}

.bl-node-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.bl-label    { color: #303133; font-size: 11px; font-weight: 600; }
.bl-tag      { font-size: 9px; background: rgba(64,158,255,0.1); color: #409EFF; padding: 1px 4px; border-radius: 2px; }
.bl-field    { color: #909399; line-height: 1.6; }
.bl-field .mono { color: #606266; }

.bl-arrow   { font-size: 14px; color: #C0C4CC; flex-shrink: 0; }
.bl-ellipsis { font-size: 10px; color: #C0C4CC; }
.bl-back    { font-size: 10px; color: #409EFF; opacity: 0.7; }

.bl-note {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #606266;
  padding: 5px 8px; background: rgba(103,194,58,0.05);
  border: 1px solid rgba(103,194,58,0.2); border-radius: 4px;
}

/* ── 过渡 ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.35s ease; }
.fade-enter-from,   .fade-leave-to     { opacity: 0; }
.regval-enter-active, .regval-leave-active { transition: opacity 0.22s ease; }
.regval-enter-from,   .regval-leave-to     { opacity: 0; }
</style>
