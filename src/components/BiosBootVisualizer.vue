<template>
  <div class="bios-visualizer">
    <!-- 标题 -->
    <div class="page-header">
      <el-button link @click="$router.push('/')" style="color:#909399;margin-bottom:6px">← 返回</el-button>
      <h2>Linux 0.11 完整启动流程</h2>
      <p class="subtitle">从上电到 main() — BIOS → bootsect → setup → head.s</p>
    </div>

    <!-- 阶段进度条 -->
    <el-card shadow="never" class="phase-card">
      <div class="phase-bar">
        <div
          v-for="(ph, pi) in phases"
          :key="pi"
          class="phase-seg"
          :class="{ active: currentPhase === pi, done: currentPhase > pi }"
          @click="goToPhaseStart(pi)"
        >
          <span class="ph-label">{{ ph.name }}</span>
          <span class="ph-file">{{ ph.file }}</span>
        </div>
      </div>
      <div class="step-indicator">
        步骤 {{ currentStep + 1 }} / {{ steps.length }} &nbsp;—&nbsp;
        <span class="step-cur-title">{{ currentState.title }}</span>
      </div>
    </el-card>

    <!-- 主体三栏 -->
    <div class="main-panel">

      <!-- 左：CPU 寄存器 -->
      <el-card shadow="never" class="panel cpu-panel">
        <template #header>
          <div class="panel-title"><el-icon><Cpu /></el-icon> CPU 寄存器</div>
        </template>

        <div class="reg-list">
          <el-tooltip
            v-for="(val, key) in currentState.regs"
            :key="key"
            placement="right"
            effect="light"
            :show-after="120"
          >
            <template #content>
              <div class="reg-tip">
                <div class="rt-name mono">{{ key }}</div>
                <div class="rt-full">{{ REG_TIPS[key]?.full || key }}</div>
                <div class="rt-desc">{{ REG_TIPS[key]?.desc || '' }}</div>
              </div>
            </template>
            <div
              class="reg-row"
              :class="{ highlight: currentState.activeRegs?.includes(key), changed: changedRegs.has(key) }"
            >
              <span class="reg-name mono">{{ key }}</span>
              <Transition name="regval">
                <span :key="val" class="reg-val mono">{{ val }}</span>
              </Transition>
            </div>
          </el-tooltip>
        </div>

        <!-- 段:偏移公式（仅在相关步骤显示） -->
        <Transition name="fade">
          <div v-if="currentState.segFormula" class="seg-formula">
            <div class="formula-title">实模式寻址公式</div>
            <div class="formula-body mono" v-for="line in currentState.segFormula" :key="line">{{ line }}</div>
          </div>
        </Transition>

        <el-divider style="margin:10px 0" />
        <el-tag :type="currentState.tagType" style="width:100%;justify-content:center;font-size:12px">
          {{ currentState.phase }}
        </el-tag>
        <div class="explain-box">
          <Transition name="fade">
            <p :key="currentStep" class="explain-text">{{ currentState.explain }}</p>
          </Transition>
        </div>

        <el-divider style="margin:8px 0" />
        <!-- 栈帧面板 -->
        <div class="stack-panel">
          <div class="stack-title">
            <span>栈帧</span>
            <Transition name="regval">
              <span :key="currentStep" class="stack-sp mono">SS:{{ currentStack.ss }} SP:{{ currentStack.sp }}</span>
            </Transition>
          </div>
          <div class="stack-desc">{{ currentStack.desc }}</div>
          <div class="stack-frames">
            <div
              v-for="(f, fi) in currentStack.frames"
              :key="fi"
              class="stack-frame"
              :class="{ 'frame-top': f.isTop, 'frame-note': f.isNote }"
            >
              <template v-if="!f.isNote">
                <span class="frame-addr mono">{{ f.addr }}</span>
                <span class="frame-val mono">{{ f.val }}</span>
              </template>
              <span class="frame-label">{{ f.label }}</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 中：内存地址空间 -->
      <el-card shadow="never" class="panel mem-panel">
        <template #header>
          <div class="panel-title">
            <el-icon><DataBoard /></el-icon>
            内存地址空间
            <span style="font-size:11px;color:#C0C4CC;margin-left:4px">（非等比例示意）</span>
          </div>
        </template>

        <div class="mem-table">
          <div class="mem-hi-label mono">↑ 高地址 0xFFFFF</div>

          <div class="mem-rows">
            <el-tooltip
              v-for="r in visibleRegions"
              :key="r.key"
              placement="right"
              effect="light"
              :show-after="100"
            >
              <!-- 悬浮详情 -->
              <template #content>
                <div class="mem-tip">
                  <div class="tip-range mono">{{ r.range }}</div>
                  <div class="tip-size">大小：{{ r.size }}</div>
                  <div class="tip-desc">{{ r.desc }}</div>
                </div>
              </template>

              <!-- 每一行 -->
              <div
                class="mem-row"
                :class="{
                  'row-active': currentState.memHighlights?.includes(r.key),
                  'row-dim': r.dim
                }"
                :style="{ '--rc': r.color }"
              >
                <!-- CPU 位置指示 -->
                <div class="row-cpu">
                  <span v-if="currentState.cpuPtrRegion === r.key" class="cpu-here">▶</span>
                </div>
                <!-- 颜色色块 -->
                <div class="row-dot" :style="{ background: r.color }"></div>
                <!-- 比例条（右侧，直观表示相对大小） -->
                <div class="row-bar-wrap">
                  <div
                    class="row-bar"
                    :style="{ width: Math.max(r.pct / 27 * 36, 4) + 'px', background: r.color }"
                  ></div>
                </div>
                <!-- 文字 -->
                <div class="row-text">
                  <span class="row-addr mono">{{ r.addrLabel }}</span>
                  <span class="row-name">{{ r.name }}</span>
                </div>
                <!-- 悬浮提示图标 -->
                <span class="row-hint">?</span>
              </div>
            </el-tooltip>
          </div>

          <div class="mem-lo-label mono">↓ 低地址 0x00000</div>
        </div>
      </el-card>

      <!-- 右：动态场景面板 -->
      <el-card shadow="never" class="panel scene-panel">
        <template #header>
          <div class="panel-title">
            <el-icon><Monitor /></el-icon>
            {{ sceneTitle }}
          </div>
        </template>

        <!-- scene: disk (磁盘读取) -->
        <div v-if="currentState.scene === 'disk'" class="scene-disk">
          <div class="disk-wrap">
            <div class="disk" :class="{ spinning: diskSpinning }">
              <div class="d-track" v-for="t in 4" :key="t" :class="{ active: diskReading && t <= 2 }"></div>
              <div class="d-center"></div>
              <div class="d-arm" :class="{ seek: diskReading }"></div>
            </div>
          </div>
          <div class="sector-label">{{ currentState.diskLabel || '磁盘扇区' }}</div>
          <div class="sector-grid">
            <el-tooltip
              v-for="i in 32" :key="i"
              placement="top"
              effect="light"
              :show-after="80"
            >
              <template #content>
                <div style="font-size:11px;max-width:180px">
                  <template v-if="i === 31 || i === 32">
                    <b>引导签名字节</b><br>偏移 {{ i === 31 ? '510 (0x55)' : '511 (0xAA)' }}<br>
                    BIOS 靠这两字节确认这是可引导扇区
                  </template>
                  <template v-else>
                    字节块 {{ (i-1)*16 }}–{{ i*16-1 }}<br>
                    <span v-if="diskReading && i <= loadedBlocks" style="color:#409EFF">正在从磁盘读取…</span>
                    <span v-else-if="!diskReading && loadedBlocks >= 32" style="color:#67C23A">已加载到内存</span>
                    <span v-else style="color:#909399">待读取</span>
                  </template>
                </div>
              </template>
              <div
                class="s-block"
                :class="{
                  loading: diskReading && i <= loadedBlocks,
                  done:    !diskReading && loadedBlocks >= 32,
                  sig:     (i === 31 || i === 32) && loadedBlocks >= 32
                }"
              ></div>
            </el-tooltip>
          </div>
          <!-- 图例 -->
          <div class="sector-legend">
            <span class="sl-item"><i class="sl-dot" style="background:#f0f2f5;border:1px solid #e4e7ed"></i>待读取</span>
            <span class="sl-item"><i class="sl-dot" style="background:rgba(64,158,255,0.3)"></i>读取中</span>
            <span class="sl-item"><i class="sl-dot" style="background:rgba(64,158,255,0.15)"></i>已加载</span>
            <span class="sl-item"><i class="sl-dot" style="background:rgba(103,194,58,0.25)"></i>0x55AA</span>
          </div>
          <div class="sig-row" v-if="currentStep >= 3">
            <el-icon v-if="currentStep >= 4" color="#67C23A" size="14"><CircleCheckFilled /></el-icon>
            <el-icon v-else color="#E6A23C" size="14"><WarningFilled /></el-icon>
            <span class="sig-text">引导签名 0x55AA {{ currentStep >= 4 ? '✓ 已验证' : '校验中…' }}</span>
          </div>
          <Transition name="fade">
            <div v-if="showFlow" class="flow-box">
              <div class="flow-lbl">{{ currentState.flowLabel || '磁盘 → 内存' }}</div>
              <div class="flow-track">
                <div v-for="p in 7" :key="p" class="flow-dot" :style="{ animationDelay: (p*200) + 'ms' }"></div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- scene: memcopy (内存块复制) -->
        <div v-else-if="currentState.scene === 'memcopy'" class="scene-memcopy">
          <div class="mc-title">内存复制操作</div>
          <div class="mc-row">
            <div class="mc-block src" :style="{ '--bc': currentState.mcSrcColor || '#409EFF' }">
              <div class="mc-addr mono">{{ currentState.mcSrc }}</div>
              <div class="mc-name">{{ currentState.mcSrcName }}</div>
            </div>
            <div class="mc-arrow-col">
              <div class="mc-arrow">→</div>
              <div class="mc-size mono">{{ currentState.mcSize }}</div>
              <div class="flow-track v">
                <div v-for="p in 5" :key="p" class="flow-dot v" :style="{ animationDelay: (p*250) + 'ms' }"></div>
              </div>
            </div>
            <div class="mc-block dst" :style="{ '--bc': currentState.mcDstColor || '#67C23A' }">
              <div class="mc-addr mono">{{ currentState.mcDst }}</div>
              <div class="mc-name">{{ currentState.mcDstName }}</div>
            </div>
          </div>
          <div class="mc-note">{{ currentState.mcNote }}</div>
        </div>

        <!-- scene: setup (setup收集硬件信息) -->
        <div v-else-if="currentState.scene === 'setup'" class="scene-setup">
          <div class="su-title">setup 收集的硬件参数</div>
          <div class="su-row" v-for="item in setupItems" :key="item.addr">
            <span class="su-addr mono">{{ item.addr }}</span>
            <span class="su-key">{{ item.key }}</span>
            <Transition name="fade">
              <span v-if="currentStep >= 8" class="su-val mono">{{ item.val }}</span>
            </Transition>
          </div>
          <div class="su-note">数据来自 BIOS 中断，写入 0x90000 附近固定偏移</div>
        </div>

        <!-- scene: pmode (进保护模式) -->
        <div v-else-if="currentState.scene === 'pmode'" class="scene-pmode">
          <div class="pm-title">进入保护模式</div>
          <div class="pm-step" v-for="s in pmodeSteps" :key="s.label">
            <el-icon :color="s.done ? '#67C23A' : '#DCDFE6'" size="14">
              <CircleCheckFilled v-if="s.done" /><CirclePlus v-else />
            </el-icon>
            <span :class="{ 'pm-done': s.done }">{{ s.label }}</span>
          </div>
          <div class="cr0-box">
            <span class="cr0-lbl mono">CR0</span>
            <div class="cr0-bits">
              <div v-for="b in cr0Bits" :key="b.name" class="cr0-bit" :class="{ set: b.set }">
                <span class="bit-name">{{ b.name }}</span>
                <span class="bit-val">{{ b.set ? '1' : '0' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- scene: kernel (head.s + main) -->
        <div v-else-if="currentState.scene === 'kernel'" class="scene-kernel">
          <div class="kn-title">32位保护模式启动完成</div>
          <div class="kn-items">
            <div class="kn-item" v-for="item in kernelItems" :key="item.label">
              <el-icon color="#67C23A" size="13"><CircleCheckFilled /></el-icon>
              <span>{{ item.label }}</span>
            </div>
          </div>
          <div class="kn-map">
            <div class="kn-title2">前 16MB 恒等映射（identity map）</div>
            <div class="kn-mapping">
              <span class="mono" style="color:#606266">线性地址 0x00000</span>
              <span class="kn-eq">→</span>
              <span class="mono" style="color:#67C23A">物理地址 0x00000</span>
            </div>
            <div class="kn-mapping">
              <span class="mono" style="color:#606266">线性地址 0x12345</span>
              <span class="kn-eq">→</span>
              <span class="mono" style="color:#67C23A">物理地址 0x12345</span>
            </div>
          </div>
          <div class="kn-note">head.s 最后跳转 main()，C 代码开始初始化内核子系统</div>
          <div class="gdt-box">
            <div class="kn-title2" style="margin-top:10px">GDT（全局描述符表）</div>
            <div class="gdt-header gdt-row">
              <span>选择子</span><span>名称</span><span>Limit</span><span>DPL</span>
            </div>
            <el-tooltip
              v-for="e in gdtEntries" :key="e.sel"
              placement="right" effect="light" :show-after="80"
            >
              <template #content>
                <div style="font-size:11px;max-width:200px;line-height:1.7">
                  <b class="mono">{{ e.sel }}</b> — {{ e.name }}<br>
                  Base: {{ e.base }}，Limit: {{ e.limit }}，DPL={{ e.dpl }}
                </div>
              </template>
              <div class="gdt-row" :class="{ 'gdt-null': e.dpl === '—', 'gdt-user': e.dpl === '3' }">
                <span class="mono">{{ e.sel }}</span>
                <span>{{ e.name }}</span>
                <span>{{ e.limit }}</span>
                <span class="mono" :style="{ color: e.dpl === '3' ? '#E6A23C' : e.dpl === '0' ? '#67C23A' : '#C0C4CC' }">{{ e.dpl }}</span>
              </div>
            </el-tooltip>
          </div>
        </div>

        <!-- scene: cpu (上电/POST) -->
        <div v-else class="scene-cpu">
          <div class="cpu-box">
            <div class="cpu-icon">⚙</div>
            <div class="cpu-status">{{ currentState.cpuStatus }}</div>
          </div>
        </div>

      </el-card>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <el-button @click="prevStep" :disabled="currentStep === 0">上一步</el-button>
      <el-button :type="autoPlaying ? 'danger' : 'primary'" @click="toggleAuto">
        {{ autoPlaying ? '暂停' : '自动播放' }}
      </el-button>
      <el-button @click="nextStep" :disabled="currentStep >= steps.length - 1">下一步</el-button>
      <el-button link @click="reset" style="color:#909399">重置</el-button>
    </div>

    <!-- 详情卡片 -->
    <el-card shadow="never" class="detail-card">
      <Transition name="fade">
        <div :key="currentStep">
          <div class="detail-header">
            <span class="step-num mono">{{ String(currentStep + 1).padStart(2,'0') }}/{{ steps.length }}</span>
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

// ─── 寄存器说明 ──────────────────────────────────────────
const REG_TIPS = {
  CS:  { full: 'Code Segment（代码段寄存器）',      desc: '当前执行代码所在段的段地址。实模式下物理地址 = CS×16 + IP。' },
  IP:  { full: 'Instruction Pointer（指令指针）',   desc: '下一条将执行指令的段内偏移。CS:IP 组合唯一确定一条指令的物理地址。' },
  EIP: { full: 'Extended IP（32位指令指针）',       desc: '保护模式下的指令偏移，32位版本的 IP。配合 CS 段描述符使用。' },
  DS:  { full: 'Data Segment（数据段寄存器）',      desc: '数据操作的默认段寄存器。读写内存时若未指定段前缀，默认用 DS。' },
  ES:  { full: 'Extra Segment（附加段寄存器）',     desc: '字符串操作的目标段。rep movsw 中目标地址 = ES:DI（物理地址 = ES×16 + DI）。' },
  SS:  { full: 'Stack Segment（栈段寄存器）',       desc: '堆栈所在段。SS:SP 指向当前栈顶，push/pop/call/ret 都用这对寄存器。' },
  SP:  { full: 'Stack Pointer（栈指针）',           desc: '栈顶的段内偏移。x86 栈向下增长，每次 push 后 SP 减小 2（16位）。' },
  AX:  { full: 'Accumulator（累加器）',             desc: 'INT 13h 磁盘服务时：AH = 功能号（0x02=读），AL = 读取扇区数。也常用于函数返回值。' },
  BX:  { full: 'Base Register（基址寄存器）',       desc: 'INT 13h 读盘时：ES:BX 指定目标内存地址（偏移部分）。例如 BX=0x7C00 表示读到偏移 0x7C00。' },
  CX:  { full: 'Counter（计数寄存器）',             desc: 'rep 指令循环计数。rep movsw 时每执行一次 movsw，CX 减 1，直到 CX=0 停止。' },
  DX:  { full: 'Data Register（数据寄存器）',       desc: 'INT 13h 磁盘服务：DH = 磁头号，DL = 驱动器号（0x80 = 第一块硬盘）。' },
  SI:  { full: 'Source Index（源索引寄存器）',      desc: '字符串操作源地址偏移。rep movsw 从 DS:SI 读数据，每次操作后 SI += 2。' },
  DI:  { full: 'Destination Index（目标索引）',     desc: '字符串操作目标地址偏移。rep movsw 写到 ES:DI，每次操作后 DI += 2。' },
  CR0: { full: 'Control Register 0（控制寄存器0）', desc: 'bit0(PE)=1 进入保护模式；bit31(PG)=1 开启分页。写 CR0 是切换 CPU 运行模式的关键操作。' },
  CR3: { full: 'Page Directory Base（页目录基址）', desc: '保护模式分页时，CR3 存放页目录的物理地址。CR0.PG=1 后 CPU 用 CR3 找页目录来翻译虚拟地址。' },
  A20: { full: 'A20 地址线',                        desc: '第 21 根地址线。关闭时超过 1MB 的地址会回绕到 0（兼容 8086）。内核需要访问高地址，必须先开启 A20。' },
}

// ─── 阶段定义 ─────────────────────────────────────────────
const phases = [
  { name: 'BIOS',      file: 'ROM固件',         startStep: 0 },
  { name: 'bootsect',  file: 'boot/bootsect.s', startStep: 4 },
  { name: 'setup',     file: 'boot/setup.s',    startStep: 8 },
  { name: 'head.s',    file: 'boot/head.s',     startStep: 10 },
]

// ─── 步骤数据 ─────────────────────────────────────────────
const steps = [
  // ── Phase 0: BIOS ──
  {
    phaseIdx: 0, phase: 'Power On Reset',
    shortTitle: 'CPU上电复位',
    title: 'CPU 上电复位，跳转 BIOS 入口',
    srcRef: '(BIOS ROM 0xFFFF0)',
    tagType: 'info',
    regs: { CS: '0xF000', IP: '0xFFF0', DS: '0x0000', SS: '0x0000', SP: '0x0000' },
    activeRegs: ['CS', 'IP'],
    segFormula: ['CS:IP = 0xF000:0xFFF0', '物理地址 = 0xF000×16 + 0xFFF0', '        = 0xFFFF0  ✓ BIOS入口'],
    explain: 'CPU 硬件将 CS:IP 强制设为 0xF000:0xFFF0，物理地址 0xFFFF0，指向 BIOS ROM。',
    detail: 'x86 实模式寻址：物理地址 = 段寄存器 × 16 + 偏移。上电瞬间 CS=0xF000, IP=0xFFF0，计算得物理地址 0xFFFF0。这是 BIOS ROM 末尾 16 字节区域，通常放一条 far jmp 指令，跳进 BIOS 主体。',
    code: `; BIOS ROM 0xFFFF0 — 第一条指令
; 物理地址 = CS×16 + IP = 0xF000×16 + 0xFFF0 = 0xFFFF0
jmp far 0xF000:0xE05B   ; 跳到 BIOS 主入口`,
    scene: 'cpu', cpuStatus: 'CPU 上电复位',
    memHighlights: ['bios-rom'],
    cpuPtrLabel: '0xFFFF0 BIOS', cpuPtrRegion: 'bios-rom',
  },
  {
    phaseIdx: 0, phase: 'POST 硬件自检',
    shortTitle: 'POST 自检',
    title: 'BIOS 执行 POST，初始化中断向量表',
    srcRef: '(BIOS ROM)',
    tagType: 'info',
    regs: { CS: '0xF000', IP: '0xE05B', DS: '0x0000', SS: '0x0000', SP: '0x0400' },
    activeRegs: ['IP'],
    explain: 'BIOS 检测内存大小、显卡、键盘等硬件，并初始化 0x00000 处的中断向量表（IVT，256项×4字节=1KB）。',
    detail: 'POST（Power-On Self Test）期间：① 检测并初始化中断向量表（IVT，0x000–0x3FF）；② 初始化 BIOS 数据区（BDA，0x400–0x4FF）；③ 检测内存容量写入 0x413；④ 初始化显卡、键盘、磁盘控制器。完成后搜索可引导设备。',
    code: `; 初始化中断向量表 (IVT) —— 256 个中断向量
; 地址 0x00000 ~ 0x003FF，每项 4 字节 (IP + CS)
xor ax, ax
mov es, ax
; ... BIOS 逐一写入 256 个中断服务地址 ...`,
    scene: 'cpu', cpuStatus: 'POST 自检中…',
    memHighlights: ['bios-rom', 'ivt'],
    cpuPtrLabel: '0xFFFF0', cpuPtrRegion: 'bios-rom',
  },
  {
    phaseIdx: 0, phase: 'Load bootsect',
    shortTitle: '读引导扇区',
    title: 'BIOS INT 13h 读第 0 扇区 → 0x7C00',
    srcRef: '(INT 13h)',
    tagType: 'warning',
    regs: { CS: '0xF000', IP: '0xE3FE', AX: '0x0201', BX: '0x7C00', DX: '0x0080' },
    activeRegs: ['AX', 'BX'],
    explain: 'BIOS 调用磁盘服务 INT 13h，将硬盘第 0 柱第 1 扇区（512 字节）读入内存 0x7C00。目标地址写法：ES:BX = 0x0000:0x7C00。',
    detail: 'INT 13h AH=0x02 磁盘读取参数：AL=1（读1扇区），CH=0（磁道0），CL=1（扇区从1计），DH=0（磁头0），DL=0x80（第一块硬盘），ES:BX=目标地址（0x0000:0x7C00 = 物理 0x7C00）。读完后 bootsect.s 的 512 字节代码已在内存中。',
    code: `; BIOS 读磁盘到 0x7C00
mov ah, 0x02    ; 功能：读扇区
mov al, 1       ; 读 1 个扇区 (512B)
mov ch, 0       ; 磁道 0
mov cl, 1       ; 扇区 1（BIOS 从1计数）
mov dh, 0       ; 磁头 0
mov dl, 0x80    ; 第一块硬盘
mov bx, 0x7C00  ; 目标偏移
xor ax, ax
mov es, ax      ; ES=0, 物理地址 = 0:0x7C00 = 0x7C00
int 0x13`,
    scene: 'disk', diskLabel: '硬盘第 0 扇区 (bootsect)', flowLabel: '磁盘 → 内存 0x7C00',
    triggerDiskRead: true,
    memHighlights: ['boot-sector'],
    cpuPtrLabel: '→ 0x7C00', cpuPtrRegion: 'boot-sector',
  },
  {
    phaseIdx: 0, phase: '验证签名',
    shortTitle: '验签 + 跳转',
    title: 'BIOS 验证 0x55AA 签名，jmp 0x7C00',
    srcRef: '(bootsect.s:10)',
    tagType: 'success',
    regs: { CS: '0xF000', IP: '0xE401', AX: '0xAA55', SI: '0x7DFE', DX: '0x0080' },
    activeRegs: ['AX', 'SI'],
    explain: 'BIOS 检查 0x7DFE（= 0x7C00 + 510）处的 2 字节是否为 0x55AA。验证通过后执行 jmp far 0x0000:0x7C00，BIOS 完成使命。',
    detail: '引导签名规定：扇区末尾两字节 [510]=0x55, [511]=0xAA（x86 小端序读出来是 0xAA55）。BIOS 验证后执行 `jmp far 0x0000:0x7C00`，此后 CPU 进入 bootsect.s 的代码。',
    code: `; 0x7DFE = 0x7C00 + 510 = 扇区最后 2 字节
cmp word [0x7DFE], 0xAA55
jne  try_next_device  ; 签名错误，跳下一个设备
; 签名正确：
jmp  far 0x0000:0x7C00  ; 控制权交给 bootsect`,
    scene: 'disk', diskLabel: '硬盘第 0 扇区 (bootsect)',
    memHighlights: ['boot-sector'],
    cpuPtrLabel: '→ 0x7C00', cpuPtrRegion: 'boot-sector',
  },

  // ── Phase 1: bootsect ──
  {
    phaseIdx: 1, phase: 'bootsect 执行',
    shortTitle: 'bootsect 开始',
    title: 'bootsect 在 0x07C0:0x0000 开始执行',
    srcRef: 'boot/bootsect.s:10',
    tagType: 'warning',
    regs: { CS: '0x07C0', IP: '0x0000', DS: '0x07C0', SS: '0x07C0', SP: '0x0400' },
    activeRegs: ['CS', 'IP'],
    segFormula: [
      '段:偏移 有两种等价写法：',
      '0x0000:0x7C00 → 0x0000×16+0x7C00 = 0x7C00',
      '0x07C0:0x0000 → 0x07C0×16+0x0000 = 0x7C00',
      '指向同一物理地址！0x07C0 是"段写法"',
    ],
    explain: 'BIOS jmp 后 CPU 在 0x7C00 执行 bootsect.s。源码用 BOOTSEG=0x07C0，因为 0x07C0×16=0x7C00。两种写法等价，指向同一物理地址。',
    detail: 'boot/bootsect.s 第10行：BOOTSEG = 0x07C0。这是段地址写法，物理地址 = 0x07C0 × 16 = 0x7C00。同时你会在代码里看到 INITSEG = 0x9000（即 0x90000），SETUPSEG = 0x9020（即 0x90200）。bootsect 先把自己从 0x7C00 搬到 0x90000，腾出低端内存给 system。',
    code: `; boot/bootsect.s:10
BOOTSEG  = 0x07C0   ; 段地址, 物理=0x7C00
INITSEG  = 0x9000   ; 搬家目标, 物理=0x90000
SETUPSEG = 0x9020   ; setup落点, 物理=0x90200
SYSSEG   = 0x1000   ; system落点, 物理=0x10000`,
    scene: 'cpu', cpuStatus: 'bootsect 开始执行',
    memHighlights: ['boot-sector'],
    cpuPtrLabel: '0x7C00 bootsect', cpuPtrRegion: 'boot-sector',
  },
  {
    phaseIdx: 1, phase: '自我复制',
    shortTitle: '自我复制',
    title: 'bootsect 把自身从 0x7C00 复制到 0x90000',
    srcRef: 'boot/bootsect.s:37',
    tagType: 'warning',
    regs: { CS: '0x07C0', IP: '0x0020', DS: '0x07C0', ES: '0x9000', CX: '0x0100' },
    activeRegs: ['DS', 'ES', 'CX'],
    explain: 'bootsect 用 rep movsw 把自身 512 字节（256 字）从 DS:SI=0x07C0:0x0000 复制到 ES:DI=0x9000:0x0000，即物理 0x90000。目的：腾出 0x7C00 附近空间给内核。',
    detail: '复制完成后 bootsect 执行 `jmp far 0x9000:0x0000`，CPU 跳到 0x90000 继续执行（自己的副本）。这就是为什么 init/main.c 里能在 0x9xxxx 地址取到 BIOS 参数——bootsect 后来把信息写在了那里。',
    code: `; boot/bootsect.s:37 — 把自身复制到 0x90000
mov ax, BOOTSEG   ; ax = 0x07C0
mov ds, ax        ; DS = 0x07C0  (源段)
mov ax, INITSEG   ; ax = 0x9000
mov es, ax        ; ES = 0x9000  (目标段)
xor si, si        ; SI = 0 (源偏移)
xor di, di        ; DI = 0 (目标偏移)
mov cx, 256       ; 256 字 = 512 字节
rep movsw         ; 复制！
jmp far INITSEG:go  ; 跳到 0x90000 继续执行`,
    scene: 'memcopy',
    mcSrc: '0x7C00', mcSrcName: 'bootsect (BIOS加载处)',
    mcDst: '0x90000', mcDstName: 'bootsect 副本 (INITSEG)',
    mcSize: '512 字节', mcNote: '复制后 CPU 跳转到 0x90000:0x0000 继续执行副本',
    mcSrcColor: '#409EFF', mcDstColor: '#F56C6C',
    memHighlights: ['boot-sector', 'bootsect-home'],
    cpuPtrLabel: '→ 0x90000', cpuPtrRegion: 'bootsect-home',
  },
  {
    phaseIdx: 1, phase: '加载 setup',
    shortTitle: '加载 setup',
    title: 'bootsect 读磁盘，加载 setup → 0x90200',
    srcRef: 'boot/bootsect.s:38',
    tagType: 'warning',
    regs: { CS: '0x9000', IP: '0x0048', AX: '0x0204', BX: '0x0200', DX: '0x0080' },
    activeRegs: ['AX', 'BX'],
    explain: 'bootsect 调用 INT 13h 读取磁盘第 2~5 扇区（共 4 扇区=2KB），放入 0x9020:0x0000 = 物理地址 0x90200。紧接在 bootsect 副本之后。',
    detail: 'SETUPSEG = 0x9020，物理地址 0x9020×16 = 0x90200 = 0x90000 + 512（bootsect 占了第一个扇区 512 字节，setup 紧随其后）。setup.s 是 4 个扇区 = 2KB，负责收集硬件参数并完成实模式→保护模式的切换。',
    code: `; boot/bootsect.s:38 — 读 setup (4 扇区) 到 0x90200
load_setup:
  mov ax, #0x0204   ; AH=2(读),AL=4(4扇区)
  mov bx, #0x0200   ; 目标偏移 0x200
  mov cx, #0x0002   ; 磁道0, 扇区2
  mov dx, #0x0080   ; 硬盘0, 磁头0
  push ax
  mov ax, SETUPSEG  ; ES = 0x9020
  mov es, ax
  pop ax
  int 0x13
  jc  load_setup    ; 出错重试`,
    scene: 'disk', diskLabel: 'setup 扇区 (2~5)', flowLabel: '磁盘 → 内存 0x90200',
    triggerDiskRead: true,
    memHighlights: ['bootsect-home', 'setup-area'],
    cpuPtrLabel: '0x90000 bootsect', cpuPtrRegion: 'bootsect-home',
  },
  {
    phaseIdx: 1, phase: '加载 system',
    shortTitle: '加载 system',
    title: 'bootsect 读磁盘，加载 system → 0x10000',
    srcRef: 'boot/bootsect.s:39',
    tagType: 'warning',
    regs: { CS: '0x9000', IP: '0x00E0', AX: '0x0280', BX: '0x0000', ES: '0x1000' },
    activeRegs: ['AX', 'ES'],
    explain: 'bootsect 把内核主体（system）加载到 SYSSEG = 0x1000 处，即物理 0x10000。system 约 200KB，用多次 INT 13h 循环读取，每次读一个磁道。',
    detail: 'SYSSEG = 0x1000 → 物理地址 0x10000（64KB 对齐，方便 BIOS 分段读盘）。system 是编译后的 head.o + main.o + 所有内核对象文件链接生成的二进制。读完后 bootsect 跳转到 setup。0xA0000 以下全是可用 RAM，system 放到这里安全。',
    code: `; boot/bootsect.s:39 — 读 system 到 0x10000
mov ax, SYSSEG    ; ax = 0x1000
mov es, ax        ; ES = 0x1000 (物理 0x10000)
call read_it      ; 循环读取所有内核扇区
; 读完后跳到 setup 执行
jmp far SETUPSEG:0  ; 跳转 0x90200`,
    scene: 'disk', diskLabel: 'system 内核 (多扇区)', flowLabel: '磁盘 → 内存 0x10000',
    triggerDiskRead: true,
    memHighlights: ['system-load', 'bootsect-home'],
    cpuPtrLabel: '0x90000', cpuPtrRegion: 'bootsect-home',
  },

  // ── Phase 2: setup ──
  {
    phaseIdx: 2, phase: 'setup 收集参数',
    shortTitle: 'setup 收集参数',
    title: 'setup 向 BIOS 查询硬件参数，写入 0x90000',
    srcRef: 'boot/setup.s:7',
    tagType: 'warning',
    regs: { CS: '0x9020', IP: '0x0000', DS: '0x9000', SS: '0x9000', SP: '0xFF00' },
    activeRegs: ['CS', 'DS'],
    explain: 'setup 用 BIOS 中断（INT 0x15, 0x10, 0x41 等）查询扩展内存大小、显卡模式、硬盘参数，写入 0x90000 以上的固定地址。init/main.c 之后直接从这些地址取值。',
    detail: 'setup.s 在实模式下完成最后的硬件信息收集。写入地址示例（来自 init/main.c:59）：\n  0x90002 → 扩展内存大小（KB）\n  0x90080 → 硬盘0参数\n  0x901FC → 根设备号\n这块 0x90000 区域是启动早期的"信息中转站"，main.c 通过 PARAM 宏读取。',
    code: `; boot/setup.s:7 — 查询并保存扩展内存大小
mov  ah, #0x88         ; BIOS INT 15h 功能
int  0x15              ; AX = 扩展内存KB数
mov  [2], ax           ; 写入 DS:0x0002 = 0x90002

; init/main.c:59 读取方式（C代码）
#define EXT_MEM_K (*(unsigned short *)0x90002)`,
    scene: 'setup',
    memHighlights: ['bootsect-home', 'setup-area'],
    cpuPtrLabel: '0x90200 setup', cpuPtrRegion: 'setup-area',
  },
  {
    phaseIdx: 2, phase: '进入保护模式',
    shortTitle: '进保护模式',
    title: 'setup 搬移 system、开 A20、进保护模式',
    srcRef: 'boot/setup.s:111',
    tagType: 'success',
    regs: { CS: '0x9020', IP: '0x014A', CR0: '0x0001', A20: '开启', DS: '0x0000' },
    activeRegs: ['CR0', 'A20'],
    explain: '① setup 把 system 从 0x10000 搬到 0x00000（覆盖 IVT/BDA，但这时实模式中断已不需要了）；② 开启 A20 线，解锁 1MB 以上地址；③ 设置 GDT，将 CR0.PE 位置 1，CPU 进入 32 位保护模式。',
    detail: 'boot/setup.s:111 是搬移 system 的循环。搬完后低地址 0x00000 就是 system（head.s 的机器码）。开 A20 是因为老 PC 兼容性问题：A20 线未开时，地址超过 1MB 会回绕到 0。进入保护模式：设置 CR0.PE=1，再做 far jmp 刷新流水线，CPU 正式按保护模式运行。此后 BIOS 中断全部失效。',
    code: `; boot/setup.s:111 — 把 system 搬到 0x00000
; (覆盖实模式 IVT，但保护模式用 IDT，不冲突)
mov ax, 0x0000
mov es, ax          ; 目标段
mov ax, 0x1000
mov ds, ax          ; 源段 (0x10000)
...
rep movsw           ; 复制 system

; 开 A20 (通过 8042 键盘控制器)
call empty_8042
...

; 置 CR0.PE = 1
mov ax, #0x0001
lmsw ax             ; 加载机器状态字，PE=1
jmpi 0, 8          ; far jmp，正式进保护模式`,
    scene: 'pmode',
    memHighlights: ['system-final'],
    cpuPtrLabel: '→ 0x00000', cpuPtrRegion: 'system-final',
  },

  // ── Phase 3: head.s ──
  {
    phaseIdx: 3, phase: 'head.s → main()',
    shortTitle: 'head.s + main()',
    title: 'head.s 建 GDT/IDT/页表，恒等映射前 16MB，跳 main()',
    srcRef: 'boot/head.s:10,156',
    tagType: 'success',
    regs: { CS: '0x0008', EIP: '0x00000000', CR0: '0x80000001', CR3: '0x00000000', DS: '0x0010' },
    activeRegs: ['CS', 'EIP', 'CR0'],
    explain: 'head.s 是 32 位保护模式的第一段代码，位于 0x00000。它建立真正的 IDT/GDT，建立页目录和页表，打开分页（CR0.PG=1），然后跳入 main() 开始内核初始化。',
    detail: 'head.s:10 — 建临时 GDT（内核代码段 0x08，数据段 0x10）\nhead.s:156 — 建页表：前 16MB 恒等映射（线性地址 = 物理地址），4个页目录项各管理 4MB。打开分页后 call main，从汇编进入 C 世界，内核真正开始运行。',
    code: `; boot/head.s:156 — 建页表，恒等映射前 16MB
setup_paging:
  mov ecx, 1024*5        ; 清零 5 页（页目录+4页表）
  xor eax, eax
  rep stosl
  ; 页目录 4 项 → 指向 4 个页表
  mov [pg_dir],   pg0+7  ; 第0项
  mov [pg_dir+4], pg1+7  ; 第1项
  ...
  ; 每项恒等映射：线性地址 = 物理地址
  mov eax, 0x00fff007    ; 最后一页 + 属性
  ...
  ret                    ; 返回到 main()`,
    scene: 'kernel',
    memHighlights: ['system-final'],
    cpuPtrLabel: '0x00000 head.s', cpuPtrRegion: 'system-final',
  },
]

// ─── 内存区域 ────────────────────────────────────────────
// 从上到下 = 从高地址到低地址
// pct 仅用于左侧"比例条"宽度示意，不再控制行高（行高等高）
const allRegions = [
  {
    key: 'bios-rom', name: 'BIOS ROM', addrLabel: '0xF0000', pct: 9, color: '#E6A23C',
    range: '0xF0000 – 0xFFFFF', size: '64 KB',
    desc: 'BIOS 固件存储区。CPU 上电后 CS:IP=0xF000:0xFFF0，物理地址 0xFFFF0 即在此区域内，这是第一条指令的位置。',
  },
  {
    key: 'video-rom', name: '显卡/ROM保留区', addrLabel: '0xA0000', pct: 7, color: '#909399',
    range: '0xA0000 – 0xEFFFF', size: '320 KB',
    desc: '显存映射区（0xA0000–0xBFFFF）和扩展 ROM（0xC0000–0xEFFFF）。不可随意写入，内核不能放在这里。',
  },
  {
    key: 'setup-area', name: 'setup.s', addrLabel: '0x90200', pct: 5, color: '#E6A23C', initially: 'dim',
    range: '0x90200 – 0x909FF', size: '2 KB（4扇区）',
    desc: 'bootsect.s 把 setup.s 读到这里（SETUPSEG=0x9020，物理=0x90200=0x90000+512）。setup 负责收集硬件参数并切换保护模式。',
  },
  {
    key: 'bootsect-home', name: 'bootsect 副本', addrLabel: '0x90000', pct: 5, color: '#F56C6C', initially: 'dim',
    range: '0x90000 – 0x901FF', size: '512 B',
    desc: 'bootsect.s 自我复制的目标（INITSEG=0x9000，物理=0x90000）。复制后 jmp 到此处继续执行，同时把硬件参数写入 0x90000 附近固定偏移（main.c 从这里读取）。',
  },
  {
    key: 'system-load', name: 'system 临时区', addrLabel: '0x10000', pct: 22, color: '#9B59B6', initially: 'dim',
    range: '0x10000 – 约 0x8FFFF', size: '≈ 200 KB',
    desc: '内核主体（system = head.o + main.o + 所有内核对象）的临时装载位置（SYSSEG=0x1000，物理=0x10000）。setup.s 之后会把它搬到 0x00000。',
  },
  {
    key: 'free-low', name: '可用低端 RAM', addrLabel: '0x07E00', pct: 22, color: '#DCDFE6',
    range: '0x07E00 – 0x0FFFF', size: '≈ 32 KB',
    desc: 'bootsect 执行后释放的低端内存。Linux 0.11 启动期间这里是空闲区，内核堆栈、临时缓冲等可临时使用。',
  },
  {
    key: 'boot-sector', name: 'Boot Sector', addrLabel: '0x07C00', pct: 6, color: '#409EFF', initially: 'dim',
    range: '0x07C00 – 0x07DFF', size: '512 B',
    desc: 'BIOS 把磁盘第 0 扇区（bootsect.s）读到此处。这是 IBM PC 的硬性约定，地址固定为 0x7C00。段地址写法：BOOTSEG=0x07C0，物理地址 = 0x07C0×16 = 0x7C00。',
  },
  {
    key: 'bda', name: 'BIOS 数据区 BDA', addrLabel: '0x00400', pct: 4, color: '#909399',
    range: '0x00400 – 0x004FF', size: '256 B',
    desc: 'BIOS Data Area。POST 期间由 BIOS 初始化，存储键盘状态、串口地址、内存大小等硬件参数。',
  },
  {
    key: 'ivt', name: '中断向量表 IVT', addrLabel: '0x00000', pct: 6, color: '#67C23A',
    range: '0x00000 – 0x003FF', size: '1 KB（256×4字节）',
    desc: '实模式中断向量表。每个中断向量 4 字节（CS:IP），共 256 个。POST 期间由 BIOS 写入。setup.s 把 system 搬到 0x00000 时会覆盖此区域（此时已不需要实模式中断）。',
  },
  // 最终态：system 搬到 0x00000，覆盖 IVT/BDA
  {
    key: 'system-final', name: 'system（最终）', addrLabel: '0x00000', pct: 10, color: '#9B59B6', initially: 'dim',
    range: '0x00000 – 约 0x3FFFF', size: '≈ 200 KB',
    desc: 'setup.s 把 system 从 0x10000 搬到 0x00000 后的位置。head.s 就从 0x00000 开始执行，因此它假定自己在绝对地址 0，页目录也建在这里。',
  },
]

// ─── setup 参数展示 ─────────────────────────────────────
const setupItems = [
  { addr: '0x90002', key: '扩展内存(KB)', val: '0x3C00' },
  { addr: '0x90080', key: '硬盘0参数',   val: '0x0010' },
  { addr: '0x901FC', key: '根设备号',    val: '0x0301' },
  { addr: '0x90006', key: '显卡列数',    val: '0x0050' },
]

// ─── 保护模式步骤 ─────────────────────────────────────
const pmodeSteps = computed(() => [
  { label: '搬移 system → 0x00000',  done: currentStep.value >= 9 },
  { label: '开启 A20 地址线',        done: currentStep.value >= 9 },
  { label: 'CR0.PE = 1 进保护模式', done: currentStep.value >= 9 },
])

const cr0Bits = computed(() => [
  { name: 'PG', set: currentStep.value >= 10 },
  { name: '…',  set: false },
  { name: 'PE', set: currentStep.value >= 9  },
])

// ─── kernel 展示 ─────────────────────────────────────
const kernelItems = [
  { label: '32位保护模式 GDT 建立完成' },
  { label: 'IDT（中断描述符表）就绪' },
  { label: '页目录 + 页表建立完成' },
  { label: 'CR0.PG = 1，分页已开启' },
  { label: '前 16MB 恒等映射（线性=物理）' },
]

// ─── 可见内存区域（随步骤变化） ─────────────────────────
const visibleRegions = computed(() => {
  const s = currentStep.value
  return allRegions
    .filter(r => {
      if (r.key === 'system-final') return s >= 9
      if (r.key === 'ivt' || r.key === 'bda') return s < 9
      if (r.key === 'free-low') return s < 9
      return true
    })
    .map(r => ({
      ...r,
      dim: r.initially === 'dim' && !dimOverride(r.key, s),
    }))
})

function dimOverride(key, s) {
  // 某个区域在某步骤之后不再是 dim
  if (key === 'boot-sector')   return s >= 2
  if (key === 'bootsect-home') return s >= 5
  if (key === 'setup-area')    return s >= 6
  if (key === 'system-load')   return s >= 7
  return false
}

// cpuPtrRegion 直接在 visibleRegions 里按 key 匹配，不再需要独立的 pct 映射

// ─── 阶段 ───────────────────────────────────────────
const currentPhase = computed(() => steps[currentStep.value].phaseIdx)

function goToPhaseStart(pi) {
  goStep(phases[pi].startStep)
}

// ─── 当前步骤 ───────────────────────────────────────
const currentStep = ref(0)
const currentState = computed(() => steps[currentStep.value])

const sceneTitle = computed(() => {
  const sc = currentState.value.scene
  if (sc === 'disk')    return '磁盘读取'
  if (sc === 'memcopy') return '内存复制'
  if (sc === 'setup')   return 'BIOS 参数收集'
  if (sc === 'pmode')   return '进入保护模式'
  if (sc === 'kernel')  return 'head.s 初始化'
  return 'CPU 状态'
})

// ─── 动画状态 ────────────────────────────────────────
const diskSpinning = ref(false)
const diskReading  = ref(false)
const loadedBlocks = ref(0)
const showFlow     = ref(false)
const autoPlaying  = ref(false)
let autoTimer = null
let loadTimer = null
let flashTimer = null

function goStep(n) {
  clearTimers()
  diskReading.value  = false
  showFlow.value     = false
  loadedBlocks.value = 0
  currentStep.value  = n

  const s = steps[n]
  if (s.triggerDiskRead) {
    diskSpinning.value = true
    diskReading.value  = true
    showFlow.value     = true
    let b = 0
    loadTimer = setInterval(() => {
      b++
      loadedBlocks.value = b
      if (b >= 32) { clearInterval(loadTimer); diskReading.value = false }
    }, 70)
  } else if (n >= 3) {
    loadedBlocks.value = 32
    diskSpinning.value = false
  } else {
    diskSpinning.value = false
    loadedBlocks.value = 0
  }
}

function nextStep() { if (currentStep.value < steps.length - 1) goStep(currentStep.value + 1) }
function prevStep() { if (currentStep.value > 0) goStep(currentStep.value - 1) }

function reset() {
  stopAuto()
  clearTimers()
  diskSpinning.value = false
  diskReading.value  = false
  showFlow.value     = false
  loadedBlocks.value = 0
  currentStep.value  = 0
}

function toggleAuto() {
  if (autoPlaying.value) { stopAuto(); return }
  autoPlaying.value = true
  autoTimer = setInterval(() => {
    if (currentStep.value >= steps.length - 1) { stopAuto(); return }
    nextStep()
  }, 3500)
}

function stopAuto() {
  autoPlaying.value = false
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
}

function clearTimers() {
  if (loadTimer) { clearInterval(loadTimer); loadTimer = null }
}

onUnmounted(() => { stopAuto(); clearTimers(); if (flashTimer) clearTimeout(flashTimer) })

// ─── 寄存器变化高亮 ───────────────────────────────────
const changedRegs = ref(new Set())

watch(currentStep, (newVal, oldVal) => {
  const prev = steps[oldVal]?.regs || {}
  const next = steps[newVal]?.regs || {}
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const changed = new Set()
  for (const k of allKeys) { if (prev[k] !== next[k]) changed.add(k) }
  changedRegs.value = changed
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { changedRegs.value = new Set() }, 900)
})

// ─── 栈帧数据 ───────────────────────────────────────────
const stackData = [
  { ss: '0x0000', sp: '0xFFFE', desc: 'BIOS 硬件默认', frames: [
    { addr: '0xFFFFE', val: '(未知)', label: '← SP 初始位置', isTop: true },
  ]},
  { ss: '0x0000', sp: '0x03FE', desc: 'BIOS 内部调用', frames: [
    { addr: '0x003FE', val: '0xE05B', label: '← SP', isTop: true },
    { addr: '0x00400', val: '0xF000', label: 'BIOS 调用帧 CS' },
  ]},
  { ss: '0x0000', sp: '0x03FA', desc: 'INT 13h 调用帧', frames: [
    { addr: '0x003FA', val: '0xE3FE', label: '← SP (INT 13h 返回)', isTop: true },
    { addr: '0x003FC', val: '0x0202', label: 'FLAGS 快照' },
    { addr: '0x003FE', val: '0xE05B', label: '上层返回地址' },
  ]},
  { ss: '0x0000', sp: '0x03FC', desc: '验签后跳转前', frames: [
    { addr: '0x003FC', val: '0xAA55', label: '← SP', isTop: true },
    { addr: '0x003FE', val: '0xE401', label: '签名校验返回地址' },
  ]},
  { ss: '0x07C0', sp: '0x03FC', desc: 'bootsect 初始栈', frames: [
    { addr: '0x07FFC', val: '—', label: '← SP (bootsect 栈)', isTop: true },
  ]},
  { ss: '0x07C0', sp: '0x03FA', desc: 'rep movsw 复制中', frames: [
    { addr: '0x07FFA', val: '0x0020', label: '← SP (复制循环帧)', isTop: true },
    { addr: '0x07FFC', val: '0x07C0', label: 'CS 保存值' },
  ]},
  { ss: '0x9000', sp: '0xFF00', desc: 'bootsect 副本重设栈', frames: [
    { addr: '0x9FF00', val: '—', label: '← SP (新栈顶)', isTop: true },
  ]},
  { ss: '0x9000', sp: '0xFEFC', desc: 'read_it 多次读盘', frames: [
    { addr: '0x9FEFC', val: '0x00E4', label: '← SP (read_it 调用)', isTop: true },
    { addr: '0x9FEFE', val: '0x9000', label: '循环段地址' },
    { addr: '0x9FF00', val: '—', label: '栈底' },
  ]},
  { ss: '0x9000', sp: '0xFF00', desc: 'setup.s 运行', frames: [
    { addr: '0x9FF00', val: '—', label: '← SP (setup 栈顶)', isTop: true },
    { addr: '0x9FF02', val: '0x0050', label: '参数缓冲区' },
  ]},
  { ss: '0x0010', sp: '?', desc: '保护模式，段为选择子', frames: [
    { addr: '—', val: '—', label: '实模式栈废弃 (CR0.PE=1)', isNote: true },
    { addr: '—', val: '—', label: 'head.s 将建立内核栈', isNote: true },
  ]},
  { ss: '0x0010', sp: 'user_stack', desc: 'head.s 内核栈', frames: [
    { addr: 'user_stack', val: '0x00000000', label: '← ESP (内核栈顶)', isTop: true },
    { addr: '(栈底-4)', val: '(main地址)', label: 'call main 压入的返回地址' },
  ]},
]

const currentStack = computed(() => stackData[currentStep.value] || stackData[0])

// ─── GDT 描述符表 ─────────────────────────────────────
const gdtEntries = [
  { sel: '0x0000', name: 'NULL',       base: '—',         limit: '—',       dpl: '—' },
  { sel: '0x0008', name: '内核代码段', base: '0x000000',  limit: '8 MB',    dpl: '0' },
  { sel: '0x0010', name: '内核数据段', base: '0x000000',  limit: '8 MB',    dpl: '0' },
  { sel: '0x0018', name: '用户代码段', base: '0x000000',  limit: '640 KB',  dpl: '3' },
  { sel: '0x0020', name: '用户数据段', base: '0x000000',  limit: '640 KB',  dpl: '3' },
  { sel: '0x0028', name: 'task[0] TSS', base: '(动态)',   limit: '104 B',   dpl: '0' },
  { sel: '0x0030', name: 'task[0] LDT', base: '(动态)',   limit: '24 B',    dpl: '0' },
]
</script>

<style scoped>
/* ── 整体 ── */
.bios-visualizer {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-header h2  { font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.subtitle        { font-size: 13px; color: #909399; }

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
  transition: all 0.3s ease;
  text-align: center;
}

.phase-seg.active { background: rgba(64,158,255,0.08); border-color: rgba(64,158,255,0.4); }
.phase-seg.done   { background: rgba(103,194,58,0.06);  border-color: rgba(103,194,58,0.3); }

.ph-label { display: block; font-size: 13px; font-weight: 600; color: #303133; }
.ph-file  { display: block; font-size: 11px; color: #C0C4CC; margin-top: 2px; font-family: ui-monospace, monospace; }

.step-indicator { font-size: 12px; color: #909399; }
.step-cur-title { color: #606266; }

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

.panel-title {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 500; color: #606266;
}

/* ── CPU 寄存器 ── */
.reg-list { display: flex; flex-direction: column; gap: 5px; margin-bottom: 4px; }

.reg-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 8px; border-radius: 4px;
  transition: background 0.4s, border-left 0.4s;
}

.reg-row.highlight {
  background: rgba(64,158,255,0.07);
  border-left: 2px solid rgba(64,158,255,0.45);
}

.reg-name { font-size: 11px; color: #909399; min-width: 36px; }
.reg-val  { font-size: 12px; color: #303133; font-weight: 500; }
.mono     { font-family: ui-monospace, Consolas, monospace; }

/* 段公式框 */
.seg-formula {
  margin: 8px 0;
  background: rgba(230,162,60,0.06);
  border: 1px solid rgba(230,162,60,0.2);
  border-radius: 4px;
  padding: 8px 10px;
}

.formula-title { font-size: 10px; color: #909399; margin-bottom: 5px; }
.formula-body  { font-size: 11px; color: #606266; line-height: 1.7; }

.explain-box  { min-height: 60px; margin-top: 8px; }
.explain-text { font-size: 12px; color: #606266; line-height: 1.7; }

/* ── 内存表 ── */
.mem-table {
  display: flex;
  flex-direction: column;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.mem-hi-label,
.mem-lo-label {
  font-size: 10px;
  color: #C0C4CC;
  padding: 4px 10px;
  background: #fafafa;
  border-bottom: 1px solid #f0f2f5;
  flex-shrink: 0;
}

.mem-lo-label { border-top: 1px solid #f0f2f5; border-bottom: none; }

.mem-rows {
  display: flex;
  flex-direction: column;
}

/* 每行等高，cursor: help 提示可悬浮 */
.mem-row {
  display: flex;
  align-items: center;
  gap: 0;
  height: 38px;
  border-bottom: 1px solid #f5f7fa;
  cursor: help;
  transition: background 0.35s ease;
  padding-right: 6px;
}

.mem-row:last-child { border-bottom: none; }

.mem-row:hover { background: rgba(0,0,0,0.025); }

.mem-row.row-active {
  background: color-mix(in srgb, var(--rc) 10%, white);
}

.mem-row.row-dim { opacity: 0.55; }

/* CPU 位置列 */
.row-cpu {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cpu-here {
  font-size: 10px;
  color: #409EFF;
  animation: cpu-pulse 1.4s ease-in-out infinite;
}

@keyframes cpu-pulse {
  0%, 100% { opacity: 1; transform: translateX(0); }
  50%       { opacity: 0.3; transform: translateX(2px); }
}

/* 颜色方块 */
.row-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
  margin: 0 8px 0 0;
  opacity: 0.7;
  transition: opacity 0.35s;
}

.row-active .row-dot { opacity: 1; }

/* 比例条（右对齐，可视化相对大小） */
.row-bar-wrap {
  display: flex;
  align-items: center;
  width: 38px;
  flex-shrink: 0;
  margin-right: 8px;
}

.row-bar {
  height: 4px;
  border-radius: 2px;
  opacity: 0.4;
  transition: opacity 0.35s, width 0.35s;
}

.row-active .row-bar { opacity: 0.8; }

/* 文字区 */
.row-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.row-addr {
  font-size: 10px;
  color: #909399;
  line-height: 1.2;
  font-family: ui-monospace, monospace;
  transition: color 0.35s;
}

.row-active .row-addr {
  color: color-mix(in srgb, var(--rc) 80%, #606266);
}

.row-name {
  font-size: 12px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.35s, font-weight 0.35s;
}

.row-active .row-name { color: #303133; font-weight: 600; }

/* 悬浮提示图标 */
.row-hint {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f0f2f5;
  color: #C0C4CC;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.mem-row:hover .row-hint { background: #e4e7ed; color: #909399; }

/* Tooltip 内容 */
.mem-tip { max-width: 240px; }
.tip-range { font-size: 12px; color: #303133; font-weight: 600; margin-bottom: 3px; }
.tip-size  { font-size: 11px; color: #909399; margin-bottom: 5px; }
.tip-desc  { font-size: 12px; color: #606266; line-height: 1.7; }

/* ── 场景：CPU ── */
.scene-cpu { display: flex; flex-direction: column; align-items: center; padding: 20px 0; gap: 8px; }
.cpu-icon   { font-size: 36px; opacity: 0.6; }
.cpu-status { font-size: 12px; color: #909399; }

/* ── 场景：磁盘 ── */
.scene-disk { display: flex; flex-direction: column; gap: 12px; }

.disk-wrap { display: flex; justify-content: center; }

.disk {
  position: relative;
  width: 90px; height: 90px;
  border-radius: 50%;
  background: #f0f2f5;
  border: 2px solid #e4e7ed;
  display: flex; align-items: center; justify-content: center;
}

.disk.spinning { animation: spin 3s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.d-track {
  position: absolute; border-radius: 50%;
  border: 1px solid #dcdfe6; transition: border-color 0.3s;
}
.d-track:nth-child(1) { width: 82px; height: 82px; }
.d-track:nth-child(2) { width: 60px; height: 60px; }
.d-track:nth-child(3) { width: 40px; height: 40px; }
.d-track:nth-child(4) { width: 22px; height: 22px; }
.d-track.active { border-color: rgba(64,158,255,0.45); }

.d-center {
  width: 10px; height: 10px; border-radius: 50%;
  background: #c0c4cc; position: absolute; z-index: 2;
}

.d-arm {
  position: absolute; width: 2px; height: 36px;
  background: #c0c4cc; top: 9px; left: 50%;
  transform-origin: bottom center; transform: rotate(-30deg);
  border-radius: 1px; transition: transform 0.8s ease; z-index: 3;
}
.d-arm.seek { transform: rotate(10deg); background: rgba(64,158,255,0.6); }

.sector-label { font-size: 11px; color: #909399; }
.sector-grid  { display: grid; grid-template-columns: repeat(8,1fr); gap: 3px; }

.s-block {
  height: 9px; border-radius: 2px;
  background: #f0f2f5; border: 1px solid #e4e7ed;
  transition: background 0.2s, border-color 0.2s;
}

.s-block.loading { background: rgba(64,158,255,0.28); border-color: rgba(64,158,255,0.35); }
.s-block.done    { background: rgba(64,158,255,0.14); border-color: rgba(64,158,255,0.2); }
.s-block.sig     { background: rgba(103,194,58,0.22) !important; border-color: rgba(103,194,58,0.35) !important; }

.sig-row {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 8px; border-radius: 4px; font-size: 11px; color: #606266;
  background: rgba(103,194,58,0.05); border: 1px solid rgba(103,194,58,0.18);
}

.sig-text { font-size: 11px; color: #606266; }

/* 数据流 */
.flow-box {
  background: rgba(64,158,255,0.04); border: 1px solid rgba(64,158,255,0.14);
  border-radius: 5px; padding: 8px;
}
.flow-lbl   { font-size: 11px; color: #909399; margin-bottom: 6px; }
.flow-track { display: flex; justify-content: space-around; height: 18px; }

.flow-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(64,158,255,0.45);
  animation: fdrop 1.8s ease-in-out infinite;
  opacity: 0;
}

@keyframes fdrop {
  0%   { opacity: 0;   transform: translateY(-3px); }
  25%  { opacity: 0.55; }
  75%  { opacity: 0.55; }
  100% { opacity: 0;   transform: translateY(12px); }
}

/* ── 场景：内存复制 ── */
.scene-memcopy { display: flex; flex-direction: column; gap: 14px; }
.mc-title { font-size: 12px; color: #909399; }

.mc-row {
  display: flex; align-items: center; gap: 8px;
  background: #fafafa; border: 1px solid #e4e7ed;
  border-radius: 6px; padding: 12px 8px;
}

.mc-block {
  flex: 1; border-radius: 5px; padding: 10px 8px; text-align: center;
  background: color-mix(in srgb, var(--bc) 10%, white);
  border: 1px solid color-mix(in srgb, var(--bc) 30%, transparent);
}

.mc-addr { font-family: ui-monospace, monospace; font-size: 12px; font-weight: 600; color: #303133; }
.mc-name { font-size: 10px; color: #909399; margin-top: 3px; }

.mc-arrow-col {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; flex-shrink: 0;
}

.mc-arrow { font-size: 18px; color: #c0c4cc; }
.mc-size  { font-family: ui-monospace, monospace; font-size: 10px; color: #909399; }

.flow-track.v  { flex-direction: column; height: auto; width: 18px; gap: 3px; }
.flow-dot.v    {
  animation: fdrop-v 1.8s ease-in-out infinite;
}
@keyframes fdrop-v {
  0%   { opacity: 0;   transform: translateX(-3px); }
  25%  { opacity: 0.55; }
  75%  { opacity: 0.55; }
  100% { opacity: 0;   transform: translateX(10px); }
}

.mc-note { font-size: 11px; color: #C0C4CC; }

/* ── 场景：setup ── */
.scene-setup { display: flex; flex-direction: column; gap: 8px; }
.su-title { font-size: 12px; color: #909399; margin-bottom: 4px; }

.su-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; border-radius: 3px;
  font-size: 11px; background: #fafafa; border: 1px solid #f0f2f5;
}

.su-addr { font-family: ui-monospace, monospace; color: #409EFF; min-width: 58px; }
.su-key  { flex: 1; color: #606266; }
.su-val  { font-family: ui-monospace, monospace; color: #67C23A; }
.su-note { font-size: 10px; color: #C0C4CC; margin-top: 4px; }

/* ── 场景：保护模式 ── */
.scene-pmode { display: flex; flex-direction: column; gap: 10px; }
.pm-title { font-size: 12px; color: #909399; }

.pm-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #909399;
}

.pm-done { color: #606266; }

.cr0-box {
  margin-top: 4px;
  background: #fafafa; border: 1px solid #e4e7ed;
  border-radius: 5px; padding: 10px;
}

.cr0-lbl { font-size: 11px; color: #909399; display: block; margin-bottom: 6px; }

.cr0-bits { display: flex; gap: 6px; }

.cr0-bit {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 8px; border-radius: 3px;
  background: #f0f2f5; border: 1px solid #e4e7ed;
  font-size: 10px; transition: background 0.4s;
}

.cr0-bit.set { background: rgba(64,158,255,0.1); border-color: rgba(64,158,255,0.3); }

.bit-name { color: #909399; }
.bit-val  { font-family: ui-monospace, monospace; color: #303133; font-weight: 600; margin-top: 2px; }

/* ── 场景：kernel ── */
.scene-kernel { display: flex; flex-direction: column; gap: 10px; }
.kn-title   { font-size: 12px; color: #909399; }
.kn-title2  { font-size: 11px; color: #909399; margin-bottom: 6px; }

.kn-items { display: flex; flex-direction: column; gap: 6px; }

.kn-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #606266;
}

.kn-map {
  background: #fafafa; border: 1px solid #e4e7ed;
  border-radius: 5px; padding: 10px;
}

.kn-mapping {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; margin-bottom: 5px;
}

.kn-eq { color: #C0C4CC; }
.kn-note { font-size: 10px; color: #C0C4CC; }

/* ── 控制 ── */
.controls {
  display: flex; justify-content: center; align-items: center; gap: 10px;
}

/* ── 详情卡片 ── */
.detail-card :deep(.el-card__body) { padding: 16px 18px; }

.detail-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;
}

.step-num    { font-size: 11px; color: #C0C4CC; font-family: ui-monospace, monospace; }
.step-title-big { font-size: 14px; font-weight: 600; color: #303133; }
.src-ref     { font-size: 11px; color: #909399; font-family: ui-monospace, monospace; }

.detail-desc { font-size: 13px; color: #606266; line-height: 1.85; white-space: pre-line; margin-bottom: 10px; }

.code-box {
  background: #f8f9fb; border: 1px solid #ebeef5;
  border-radius: 4px; padding: 12px 14px; overflow-x: auto;
}
.code-box pre  { margin: 0; }
.code-box code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #476582; line-height: 1.85; }

/* ── 过渡 ── */
/* 寄存器 tooltip */
.reg-tip { max-width: 220px; }
.rt-name { font-size: 14px; font-weight: 700; color: #303133; margin-bottom: 3px; }
.rt-full { font-size: 12px; color: #606266; margin-bottom: 4px; }
.rt-desc { font-size: 12px; color: #909399; line-height: 1.65; }

/* 磁盘块图例 */
.sector-legend {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.sl-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #909399;
}

.sl-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* 寄存器变化高亮 */
@keyframes reg-flash {
  0%   { background: rgba(64,158,255,0.2); border-left-color: rgba(64,158,255,0.6); }
  100% { background: transparent; border-left-color: transparent; }
}
.reg-row.changed {
  animation: reg-flash 0.85s ease forwards;
  border-left: 2px solid transparent;
}

/* ── 栈帧面板 ── */
.stack-panel { margin-top: 4px; }
.stack-title {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: #606266; font-weight: 500; margin-bottom: 3px;
}
.stack-sp { font-size: 10px; color: #909399; }
.stack-desc { font-size: 10px; color: #C0C4CC; margin-bottom: 5px; }
.stack-frames { display: flex; flex-direction: column; gap: 2px; }
.stack-frame {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 6px; border-radius: 3px;
  background: #fafafa; border: 1px solid #f0f2f5;
  font-size: 10px; line-height: 1.4;
}
.frame-top {
  border-left: 2px solid rgba(64,158,255,0.5);
  background: rgba(64,158,255,0.04);
}
.frame-note {
  background: transparent; border-color: transparent; color: #C0C4CC;
}
.frame-addr { color: #409EFF; min-width: 58px; flex-shrink: 0; font-size: 10px; }
.frame-val  { color: #303133; min-width: 68px; flex-shrink: 0; font-size: 10px; }
.frame-label { color: #909399; flex: 1; font-size: 10px; }

/* ── GDT 表格 ── */
.gdt-box { margin-top: 4px; }
.gdt-row {
  display: grid; grid-template-columns: 46px 1fr 50px 28px;
  gap: 3px; align-items: center;
  padding: 3px 5px; font-size: 10px;
  border-bottom: 1px solid #f0f2f5; cursor: help;
  transition: background 0.2s;
}
.gdt-row:hover { background: rgba(0,0,0,0.025); }
.gdt-header {
  color: #C0C4CC; font-size: 9px; background: #fafafa;
  border-radius: 3px 3px 0 0; cursor: default;
}
.gdt-row:last-child { border-bottom: none; }
.gdt-null { opacity: 0.5; }
.gdt-user { background: rgba(230,162,60,0.04); }

/* 过渡 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.35s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }

.regval-enter-active, .regval-leave-active { transition: opacity 0.22s ease; }
.regval-enter-from,   .regval-leave-to     { opacity: 0; }
</style>
