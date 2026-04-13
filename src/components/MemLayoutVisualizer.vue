<template>
  <div class="ml-root">
    <!-- 主体：左侧导航 + 三栏内容 -->
    <div class="ml-body">
      <!-- 左侧竖向导航：Phase + 步骤指示器 -->
      <div class="ml-nav">
        <div class="nav-section-title">阶段</div>
        <div class="phase-bar">
          <div
            v-for="(ph, pi) in phases"
            :key="pi"
            class="phase-seg"
            :class="{ active: currentPhase === pi, done: currentPhase > pi }"
            @click="jumpToPhase(pi)"
          >
            <span class="phase-label">{{ ph.name }}</span>
            <span class="phase-file">{{ ph.file }}</span>
          </div>
        </div>

        <div class="nav-section-title" style="margin-top:8px">步骤 {{ currentIdx + 1 }} / {{ steps.length }}</div>
        <div class="step-indicator">
          <span
            v-for="i in steps.length"
            :key="i"
            class="step-dot"
            :class="{ active: currentIdx === i - 1, done: currentIdx > i - 1 }"
            @click="goStep(i - 1)"
          />
        </div>
      </div>

      <!-- 三栏主体 -->
      <div class="ml-grid">
      <!-- 左栏：地址状态 + 变量 -->
      <div class="ml-left">
        <div class="panel-title">地址 / 寄存器</div>

        <!-- 当前地址示例 -->
        <div class="addr-block">
          <div class="addr-row logical" :class="{ active: isSegActive || isPageActive }">
            <span class="addr-label">逻辑地址</span>
            <span class="addr-val">
              <span class="sel-part">{{ step.addrExample.logicalSel }}</span>
              :
              <span class="off-part">{{ step.addrExample.logicalOff }}</span>
            </span>
          </div>
          <div class="addr-row linear" :class="{ active: isPageActive }">
            <span class="addr-label">线性地址</span>
            <span class="addr-val lin-color">{{ step.addrExample.linear }}</span>
          </div>
          <div class="addr-row physical" :class="{ active: step.addrExample.activeStage === 'both' }">
            <span class="addr-label">物理地址</span>
            <span class="addr-val phys-color">{{ step.addrExample.physical }}</span>
          </div>
          <div class="addr-note">{{ step.addrExample.note }}</div>
        </div>

        <el-divider style="margin: 10px 0" />

        <!-- 关键寄存器/变量 -->
        <div
          v-for="v in step.vars"
          :key="v.name"
          class="var-row"
          :class="{ 'var-changed': changedVars.has(v.name) }"
        >
          <span class="var-name">{{ v.name }}</span>
          <span class="var-val">{{ v.val }}</span>
        </div>

        <el-divider style="margin: 10px 0" />

        <!-- 当前阶段说明 -->
        <div class="explain-box">{{ step.explain }}</div>
      </div>

      <!-- 中栏：地址翻译流程图 + 场景可视化 -->
      <div class="ml-center">
        <div class="panel-title">地址翻译流程</div>

        <!-- 地址翻译流水线 -->
        <div class="addr-pipeline">
          <div class="pipe-node logical-node">
            <div class="node-label">逻辑地址</div>
            <div class="node-val">
              <div>{{ step.addrExample.logicalSel }}</div>
              <div style="font-size:11px;color:#909399">: {{ step.addrExample.logicalOff }}</div>
            </div>
          </div>

          <div class="pipe-arrow" :class="{ 'arrow-active': isSegActive }">
            <div class="arrow-line" />
            <div class="arrow-label">分段</div>
            <div class="arrow-sublabel">GDT/LDT<br>Base+offset</div>
            <div v-if="isSegActive" class="flow-dot seg-dot" />
          </div>

          <div class="pipe-node linear-node" :class="{ 'node-active': isSegActive || isPageActive }">
            <div class="node-label">线性地址</div>
            <div class="node-val lin-color">{{ step.addrExample.linear }}</div>
          </div>

          <div class="pipe-arrow" :class="{ 'arrow-active': isPageActive }">
            <div class="arrow-line" />
            <div class="arrow-label">分页</div>
            <div class="arrow-sublabel">CR3→PDE<br>→PTE</div>
            <div v-if="isPageActive" class="flow-dot page-dot" />
          </div>

          <div class="pipe-node physical-node" :class="{ 'node-active': step.addrExample.activeStage === 'both' }">
            <div class="node-label">物理地址</div>
            <div class="node-val phys-color">{{ step.addrExample.physical }}</div>
          </div>
        </div>

        <!-- 场景可视化区域 -->
        <div class="scene-area">
          <div class="scene-title">{{ sceneTitle }}</div>

          <!-- overview: 两层翻译概览 -->
          <div v-if="step.scene === 'overview'" class="sc-overview">
            <div class="ov-compare">
              <div class="ov-mode">
                <div class="ov-mode-title">实模式</div>
                <div class="ov-flow">
                  <div class="ov-box log">逻辑地址<br><small>CS×16+IP</small></div>
                  <div class="ov-arrow">→</div>
                  <div class="ov-box phys">物理地址</div>
                </div>
                <div class="ov-note">仅分段（简单偏移）</div>
              </div>
              <div class="ov-vs">vs</div>
              <div class="ov-mode">
                <div class="ov-mode-title">保护模式（Linux 0.11）</div>
                <div class="ov-flow">
                  <div class="ov-box log">逻辑地址<br><small>CS:offset</small></div>
                  <div class="ov-arrow">→</div>
                  <div class="ov-box lin">线性地址<br><small>32-bit</small></div>
                  <div class="ov-arrow">→</div>
                  <div class="ov-box phys">物理地址</div>
                </div>
                <div class="ov-note">分段 + 分页（CR0.PG=1）</div>
              </div>
            </div>
            <div class="ov-regs">
              <div class="ov-reg-item">
                <span class="ov-reg-name">GDTR</span>
                <span class="ov-reg-desc">→ 全局描述符表（GDT）基址</span>
              </div>
              <div class="ov-reg-item">
                <span class="ov-reg-name">LDTR</span>
                <span class="ov-reg-desc">→ 当前进程 LDT 选择子</span>
              </div>
              <div class="ov-reg-item">
                <span class="ov-reg-name">CR3</span>
                <span class="ov-reg-desc">→ 页目录基址（分页）</span>
              </div>
              <div class="ov-reg-item">
                <span class="ov-reg-name">CR0.PG</span>
                <span class="ov-reg-desc">= 1 时开启分页机制</span>
              </div>
            </div>
          </div>

          <!-- cr-regs: 控制寄存器详解 -->
          <div v-else-if="step.scene === 'cr-regs'" class="sc-crregs">
            <div class="cr-grid">
              <div v-for="cr in crRegs" :key="cr.name" class="cr-card"
                :class="{ 'cr-key': cr.key }"
                :style="cr.key ? `border-color:${cr.color};background:${cr.color}10` : ''">
                <div class="crc-name" :style="cr.key ? `color:${cr.color}` : ''">{{ cr.name }}</div>
                <div class="crc-role">{{ cr.role }}</div>
                <div v-if="cr.bits" class="crc-bits">
                  <div v-for="b in cr.bits" :key="b.name" class="crcb-bit"
                    :style="`flex:${b.width};background:${b.color}20;border-color:${b.color}`">
                    <div class="crcb-label">{{ b.name }}</div>
                    <div class="crcb-pos">bit{{ b.pos }}</div>
                    <div class="crcb-desc">{{ b.desc }}</div>
                  </div>
                </div>
                <div class="crc-when">{{ cr.when }}</div>
              </div>
            </div>
            <div class="cr-timeline">
              <div class="crt-title">head.s 启动时序：CR 寄存器的设置顺序</div>
              <div class="crt-steps">
                <div v-for="(s, i) in crTimeline" :key="i" class="crts-step">
                  <div class="crts-num">{{ i + 1 }}</div>
                  <div class="crts-body">
                    <span class="crts-reg" :style="`color:${s.color}`">{{ s.reg }}</span>
                    <span class="crts-act">{{ s.action }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- why-seg: 设计动机对比 -->
          <div v-else-if="step.scene === 'why-seg'" class="sc-whyseg">
            <div class="ws-compare">
              <!-- 内核 -->
              <div class="wsc-col">
                <div class="wscc-title" style="color:#409eff">内核段：Base = 0</div>
                <div class="wscc-chain">
                  <div class="wscc-box">CS:0x5000</div>
                  <div class="wscc-arrow">↓ GDT[1] Base=0</div>
                  <div class="wscc-box lin-box">线性 = 0 + 0x5000 = 0x5000</div>
                  <div class="wscc-arrow">↓ 恒等映射</div>
                  <div class="wscc-box phys-box">物理 = 0x5000</div>
                </div>
                <div class="wscc-why">
                  <div class="wsccw-title">为什么选 Base=0？</div>
                  <div class="wsccw-item">逻辑偏移 = 线性地址 = 物理地址</div>
                  <div class="wsccw-item">内核驱动可直接写物理地址常量</div>
                  <div class="wsccw-item">中断向量、I/O端口等无需换算</div>
                </div>
              </div>

              <div class="wsc-vs">vs</div>

              <!-- 用户 -->
              <div class="wsc-col">
                <div class="wscc-title" style="color:#e6a23c">用户进程：Base = nr × 64MB</div>
                <div class="wscc-procs">
                  <div v-for="p in whySegProcs" :key="p.nr" class="wscp-proc">
                    <div class="wscpp-hdr" :style="`color:${p.color}`">task[{{ p.nr }}] offset=0x1000</div>
                    <div class="wscpp-chain">
                      <span class="wscpp-base">Base={{ p.base }}</span>
                      <span>+</span>
                      <span class="wscpp-off">0x1000</span>
                      <span>→</span>
                      <span class="wscpp-lin" :style="`color:${p.color}`">线性={{ p.linear }}</span>
                    </div>
                  </div>
                </div>
                <div class="wscc-why">
                  <div class="wsccw-title">为什么选 nr×64MB？</div>
                  <div class="wsccw-item">相同逻辑偏移 → 不同线性地址</div>
                  <div class="wsccw-item">用户程序不用改，系统帮你错开</div>
                  <div class="wsccw-item">64进程×64MB = 4GB（填满32位）</div>
                </div>
              </div>
            </div>
          </div>

          <!-- selector: 选择子位域 -->
          <div v-else-if="step.scene === 'selector'" class="sc-selector">
            <div class="sel-title">选择子（Selector）16位结构</div>
            <div class="bit-field-row">
              <div class="bf-seg wide">
                <div class="bf-bits">15 ─────────── 3</div>
                <div class="bf-name">描述符索引（13位）</div>
                <div class="bf-val">{{ selIdx }}</div>
              </div>
              <div class="bf-seg narrow">
                <div class="bf-bits">2</div>
                <div class="bf-name">TI</div>
                <div class="bf-val" :class="selTI === '0' ? 'ti-gdt' : 'ti-ldt'">{{ selTI }}</div>
              </div>
              <div class="bf-seg narrow">
                <div class="bf-bits">1:0</div>
                <div class="bf-name">RPL</div>
                <div class="bf-val">{{ selRPL }}</div>
              </div>
            </div>
            <div class="sel-decode">
              <div class="sel-dec-row">
                <span class="sel-dec-label">TI={{ selTI }}</span>
                <span class="sel-dec-val" :class="selTI === '0' ? 'ti-gdt' : 'ti-ldt'">
                  {{ selTI === '0' ? '查 GDT（全局描述符表）' : '查 LDT（进程本地描述符表）' }}
                </span>
              </div>
              <div class="sel-dec-row">
                <span class="sel-dec-label">RPL={{ selRPL }}</span>
                <span class="sel-dec-val">
                  {{ selRPL === '0' ? '内核态（ring 0）' : '用户态（ring 3）' }}
                </span>
              </div>
              <div class="sel-dec-row">
                <span class="sel-dec-label">Index={{ selIdx }}</span>
                <span class="sel-dec-val">描述符表第 {{ parseInt(selIdx) }} 项</span>
              </div>
            </div>
            <div class="sel-examples">
              <div class="sel-ex-title">常用选择子</div>
              <div v-for="ex in selExamples" :key="ex.val" class="sel-ex-row"
                   :class="{ 'sel-ex-active': ex.val === step.addrExample.logicalSel }">
                <span class="sel-ex-val">{{ ex.val }}</span>
                <span class="sel-ex-desc">{{ ex.desc }}</span>
              </div>
            </div>
          </div>

          <!-- seg-desc: 段描述符64位结构 -->
          <div v-else-if="step.scene === 'seg-desc'" class="sc-segdesc">
            <div class="sd-title">段描述符（64位）</div>
            <div class="sd-row">
              <div class="sd-row-label">高32位</div>
              <div class="sd-fields">
                <el-tooltip v-for="f in segDescHigh" :key="f.name" :content="f.tip" placement="top">
                  <div class="sd-field" :style="`flex: ${f.width}`" :class="f.cls">
                    <div class="sd-fname">{{ f.name }}</div>
                    <div class="sd-fval">{{ f.val }}</div>
                  </div>
                </el-tooltip>
              </div>
            </div>
            <div class="sd-row">
              <div class="sd-row-label">低32位</div>
              <div class="sd-fields">
                <el-tooltip v-for="f in segDescLow" :key="f.name" :content="f.tip" placement="top">
                  <div class="sd-field" :style="`flex: ${f.width}`" :class="f.cls">
                    <div class="sd-fname">{{ f.name }}</div>
                    <div class="sd-fval">{{ f.val }}</div>
                  </div>
                </el-tooltip>
              </div>
            </div>
            <div class="sd-note">↑ hover 字段查看含义</div>
            <div class="sd-example">
              <div class="sd-ex-title">内核代码段描述符（GDT[1]）</div>
              <div class="sd-ex-row"><span>Base</span><span>0x00000000</span></div>
              <div class="sd-ex-row"><span>Limit</span><span>0x7FFFFF（8MB - 1）</span></div>
              <div class="sd-ex-row"><span>DPL</span><span>0（内核态）</span></div>
              <div class="sd-ex-row"><span>Type</span><span>0xA（代码段，可执行可读）</span></div>
            </div>
          </div>

          <!-- ldt: 进程地址空间分布 -->
          <div v-else-if="step.scene === 'ldt'" class="sc-ldt">
            <div class="ldt-title">Linux 0.11 进程虚拟地址空间（LDT）</div>
            <div class="ldt-formula">Base = task_nr × 0x4000000（64MB）</div>
            <div class="ldt-tasks">
              <div v-for="t in ldtTasks" :key="t.nr" class="ldt-task-row">
                <div class="ldt-task-nr">task[{{ t.nr }}]</div>
                <div class="ldt-task-bar-wrap">
                  <div class="ldt-task-bar" :style="`margin-left: ${t.nr * 12}%`">
                    <div class="ldt-task-used" />
                    <div class="ldt-task-unused" />
                  </div>
                </div>
                <div class="ldt-task-info">
                  <span class="ldt-base">Base={{ t.base }}</span>
                  <span class="ldt-limit">Limit=640KB</span>
                </div>
              </div>
            </div>
            <div class="ldt-note">每进程占用 64MB 线性地址槽，实际使用仅 640KB</div>
          </div>

          <!-- seg-trans: 分段翻译演示 -->
          <div v-else-if="step.scene === 'seg-trans'" class="sc-segtrans">
            <div v-for="(ex, ei) in segTransExamples" :key="ei" class="st-example"
                 :class="{ 'st-active': ei === segTransActive }">
              <div class="st-ex-title">{{ ex.title }}</div>
              <div class="st-steps">
                <div class="st-step" :class="{ 'st-done': segTransSub >= 1 }">
                  <span class="st-step-num">①</span>
                  <span>选择子 {{ ex.sel }} → TI={{ ex.ti }} → 查{{ ex.ti === '0' ? 'GDT' : 'LDT' }}[{{ ex.idx }}]</span>
                </div>
                <div class="st-step" :class="{ 'st-done': segTransSub >= 2 }">
                  <span class="st-step-num">②</span>
                  <span>描述符 Base = <strong>{{ ex.base }}</strong></span>
                </div>
                <div class="st-step" :class="{ 'st-done': segTransSub >= 3 }">
                  <span class="st-step-num">③</span>
                  <span>线性地址 = Base + offset = {{ ex.base }} + {{ ex.off }} = <strong class="lin-color">{{ ex.linear }}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <!-- linear-split: 线性地址拆分 -->
          <div v-else-if="step.scene === 'linear-split'" class="sc-linearsplit">
            <div class="ls-title">线性地址 32 位拆分</div>
            <div class="ls-addr">示例地址：<strong>{{ step.addrExample.linear }}</strong></div>
            <div class="ls-bits">
              <div class="ls-seg pd-seg">
                <div class="ls-bit-range">31 ─── 22</div>
                <div class="ls-seg-name">页目录索引（PD）</div>
                <div class="ls-seg-bits">10 位</div>
                <div class="ls-seg-val">{{ pdIndex }}</div>
                <div class="ls-seg-note">1024 个页目录项</div>
              </div>
              <div class="ls-sep">|</div>
              <div class="ls-seg pt-seg">
                <div class="ls-bit-range">21 ─── 12</div>
                <div class="ls-seg-name">页表索引（PT）</div>
                <div class="ls-seg-bits">10 位</div>
                <div class="ls-seg-val">{{ ptIndex }}</div>
                <div class="ls-seg-note">1024 个页表项</div>
              </div>
              <div class="ls-sep">|</div>
              <div class="ls-seg off-seg">
                <div class="ls-bit-range">11 ─── 0</div>
                <div class="ls-seg-name">页内偏移</div>
                <div class="ls-seg-bits">12 位</div>
                <div class="ls-seg-val">{{ pageOffset }}</div>
                <div class="ls-seg-note">4096 字节/页</div>
              </div>
            </div>
          </div>

          <!-- pde: 页目录项结构 -->
          <div v-else-if="step.scene === 'pde'" class="sc-pde">
            <div class="pde-title">页目录项（PDE）32位结构</div>
            <div class="pde-bits">
              <el-tooltip v-for="f in pdeFields" :key="f.name" :content="f.tip" placement="top">
                <div class="pde-field" :style="`flex: ${f.width}`" :class="f.cls">
                  <div class="pde-fname">{{ f.name }}</div>
                </div>
              </el-tooltip>
            </div>
            <div class="pde-bit-labels">
              <span>31 ───────────────────── 12</span>
              <span>11 ─── 9</span>
              <span style="margin-left:auto">0</span>
            </div>
            <div class="pde-example">
              <div class="pde-ex-title">当前示例 PDE 值（{{ step.addrExample.linear }} 对应）</div>
              <div class="pde-ex-val">{{ pdeVal }}</div>
              <div class="pde-ex-note">页表物理基址 = PDE[31:12] × 4096</div>
            </div>
            <div class="pde-note">↑ hover 字段查看含义（P=1 表示页表存在）</div>
          </div>

          <!-- pte: 页表项结构 -->
          <div v-else-if="step.scene === 'pte'" class="sc-pte">
            <div class="pte-title">页表项（PTE）32位结构</div>
            <div class="pte-bits">
              <el-tooltip v-for="f in pteFields" :key="f.name" :content="f.tip" placement="top">
                <div class="pte-field" :style="`flex: ${f.width}`" :class="f.cls">
                  <div class="pte-fname">{{ f.name }}</div>
                </div>
              </el-tooltip>
            </div>
            <div class="pte-bit-labels">
              <span>31 ───────────────────── 12</span>
              <span style="margin-left:auto">0</span>
            </div>
            <div class="pte-example">
              <div class="pte-ex-title">当前示例 PTE 值</div>
              <div class="pte-ex-val">{{ pteVal }}</div>
              <div class="pte-ex-note">物理帧地址 = PTE[31:12] × 4096，P=1 表示页面存在</div>
            </div>
            <div class="pte-note">↑ hover 字段查看含义（P=0 触发缺页异常 INT 14）</div>
          </div>

          <!-- page-trans: 分页翻译演示 -->
          <div v-else-if="step.scene === 'page-trans'" class="sc-pagetrans">
            <div class="pt-title">线性地址 → 物理地址（恒等映射验证）</div>
            <div class="pt-addr">线性地址：<strong class="lin-color">{{ step.addrExample.linear }}</strong></div>
            <div class="pt-steps">
              <div class="pt-step" :class="{ 'pt-done': pageTransSub >= 1 }">
                <span class="pt-num">①</span>
                <span>CR3 → 页目录基址 <strong>0x000000</strong>（head.s 建立）</span>
              </div>
              <div class="pt-step" :class="{ 'pt-done': pageTransSub >= 2 }">
                <span class="pt-num">②</span>
                <span>PD 索引 = {{ pdIndex }} → PDE = <strong>{{ pdeVal }}</strong>（指向页表）</span>
              </div>
              <div class="pt-step" :class="{ 'pt-done': pageTransSub >= 3 }">
                <span class="pt-num">③</span>
                <span>PT 索引 = {{ ptIndex }} → PTE = <strong>{{ pteVal }}</strong>（指向物理帧）</span>
              </div>
              <div class="pt-step" :class="{ 'pt-done': pageTransSub >= 4 }">
                <span class="pt-num">④</span>
                <span>物理地址 = 帧地址 + 页内偏移 = <strong class="phys-color">{{ step.addrExample.physical }}</strong></span>
              </div>
              <div class="pt-identity" :class="{ 'pt-done': pageTransSub >= 4 }">
                恒等映射：线性地址 = 物理地址（前16MB）✓
              </div>
            </div>
          </div>

          <!-- fault: 缺页异常流程 -->
          <div v-else-if="step.scene === 'fault'" class="sc-fault">
            <div class="fault-title">缺页异常（Page Fault）处理流程</div>
            <div class="fault-flow">
              <div class="ff-node trigger">访问地址<br><small>PTE.P=0</small></div>
              <div class="ff-arrow">↓ INT 14</div>
              <div class="ff-node handler">do_no_page()<br><small>mm/memory.c:250</small></div>
              <div class="ff-arrow">↓ 调用</div>
              <div class="ff-node alloc">get_free_page()<br><small>mm/memory.c:86</small></div>
              <div class="ff-arrow">↓ 找到空闲帧</div>
              <div class="ff-node map">put_page()<br><small>更新 PTE（P=1）</small></div>
              <div class="ff-arrow">↓ 返回</div>
              <div class="ff-node retry">重试触发异常的指令</div>
            </div>
            <div class="fault-note">
              <div>mem_map[i] = 0 → 空闲页帧</div>
              <div>mem_map[i] = 1 → 已分配（引用计数）</div>
            </div>
          </div>

          <!-- get-page: mem_map 扫描 -->
          <div v-else-if="step.scene === 'get-page'" class="sc-getpage">
            <div class="gp-title">get_free_page()：扫描 mem_map[] 找空闲帧</div>
            <div class="gp-info">
              <span>扫描位置: {{ scanPos >= 0 ? scanPos : '初始化' }}</span>
              <span v-if="scanFound >= 0">找到空闲帧: #{{ scanFound }}</span>
            </div>
            <div class="mm-grid">
              <el-tooltip
                v-for="(cell, i) in memMapCells"
                :key="i"
                :content="`帧 #${i}：${cell.label}（${cell.zone}）`"
                placement="top"
                :disabled="i % 64 !== 0"
              >
                <div
                  class="mm-cell"
                  :class="[cell.cls, {
                    'mm-scan': i === scanPos,
                    'mm-found': i === scanFound
                  }]"
                />
              </el-tooltip>
            </div>
            <div class="mm-legend">
              <span class="ml-item kernel">内核代码</span>
              <span class="ml-item buffer">缓冲区</span>
              <span class="ml-item free">空闲</span>
              <span class="ml-item scan-dot">当前扫描</span>
              <span class="ml-item found-dot">找到！</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：数据结构详图 -->
      <div class="ml-right">
        <div class="panel-title">{{ rightPanelTitle }}</div>

        <!-- overview右侧：关键数据结构 -->
        <div v-if="step.scene === 'overview'" class="rp-overview">
          <div class="rp-struct">
            <div class="rp-st-title">分段机制</div>
            <div class="rp-st-item">GDT — 全局描述符表</div>
            <div class="rp-st-item">LDT — 进程描述符表</div>
            <div class="rp-st-item">段描述符 64位</div>
          </div>
          <div class="rp-struct">
            <div class="rp-st-title">分页机制</div>
            <div class="rp-st-item">页目录（PD）1024项</div>
            <div class="rp-st-item">页表（PT）1024项</div>
            <div class="rp-st-item">物理帧 4KB</div>
          </div>
          <div class="rp-struct">
            <div class="rp-st-title">Linux 0.11 特殊性</div>
            <div class="rp-st-item">内核段 Base=0（恒等映射）</div>
            <div class="rp-st-item">head.s 建立前16MB页表</div>
            <div class="rp-st-item">用户进程 Base=nr×64MB</div>
          </div>
        </div>

        <!-- cr-regs 右侧：进程切换时 CR3 变化 -->
        <div v-else-if="step.scene === 'cr-regs'" class="rp-cr3">
          <div class="rp-f-title">进程切换时 CR3 变化</div>
          <div class="rpc3-note">switch_to() 把新进程的页目录地址写入 CR3，CPU 立刻使用新的页表，虚拟地址空间瞬间切换。</div>
          <div class="rpc3-procs">
            <div class="rpc3-proc">
              <div class="rpc3p-name">task[1]</div>
              <div class="rpc3p-cr3">CR3 = 0x4000（页目录A）</div>
            </div>
            <div class="rpc3-arrow">切换↓</div>
            <div class="rpc3-proc">
              <div class="rpc3p-name">task[2]</div>
              <div class="rpc3p-cr3">CR3 = 0x8000（页目录B）</div>
            </div>
          </div>
          <div class="rp-f-title" style="margin-top:12px">缺页时 CR2 的作用</div>
          <div class="rpc2-flow">
            <div class="rpc2-step">访问线性地址 0x5001000</div>
            <div class="rpc2-arrow">↓ PTE.P=0</div>
            <div class="rpc2-step">CPU 自动：CR2 = 0x5001000</div>
            <div class="rpc2-arrow">↓ INT 14</div>
            <div class="rpc2-step">do_no_page(address=CR2)</div>
            <div class="rpc2-arrow">↓ 分配页帧</div>
            <div class="rpc2-step">更新 PTE.P=1，重试指令</div>
          </div>
        </div>

        <!-- why-seg 右侧：线性地址空间布局 -->
        <div v-else-if="step.scene === 'why-seg'" class="rp-linear-map">
          <div class="rp-f-title">64MB × 64 = 4GB 线性空间</div>
          <div class="rplm-bar">
            <div v-for="p in whySegProcs" :key="p.nr" class="rplmb-slot"
              :style="`background:${p.color}25;border-color:${p.color}`">
              <div class="rplmbs-nr" :style="`color:${p.color}`">task[{{ p.nr }}]</div>
              <div class="rplmbs-range">{{ p.base }}~</div>
            </div>
            <div class="rplmb-rest">task[4..63]<br>···</div>
          </div>
          <div class="rplm-note">每格 = 64MB 线性空间，共 64 格 = 4GB</div>
        </div>

        <!-- selector右侧：GDT布局 -->
        <div v-else-if="step.scene === 'selector'" class="rp-gdt">
          <div class="rp-gdt-title">Linux 0.11 GDT 布局</div>
          <div v-for="entry in gdtEntries" :key="entry.idx" class="rp-gdt-row"
               :class="{ 'rp-gdt-active': entry.idx === parseInt(selIdx) }">
            <span class="rp-gdt-idx">GDT[{{ entry.idx }}]</span>
            <span class="rp-gdt-sel">{{ entry.sel }}</span>
            <span class="rp-gdt-desc">{{ entry.desc }}</span>
          </div>
        </div>

        <!-- seg-desc右侧：字段说明 -->
        <div v-else-if="step.scene === 'seg-desc'" class="rp-fields">
          <div class="rp-f-title">关键字段含义</div>
          <div v-for="f in segDescMeaning" :key="f.name" class="rp-f-row">
            <span class="rp-f-name">{{ f.name }}</span>
            <span class="rp-f-desc">{{ f.desc }}</span>
          </div>
        </div>

        <!-- ldt右侧：copy_mem源码 -->
        <div v-else-if="step.scene === 'ldt'" class="rp-code">
          <div class="rp-code-title">kernel/sched.c copy_mem()</div>
          <pre class="rp-code-block">/* 设置新进程的LDT */
new_data_base = new_code_base
  = nr * 0x4000000;
/* 0x4000000 = 64MB */

set_base(p->ldt[1],
  new_code_base);
set_base(p->ldt[2],
  new_data_base);
set_limit(p->ldt[1],
  data_limit);
set_limit(p->ldt[2],
  data_limit);</pre>
        </div>

        <!-- seg-trans右侧：翻译公式 -->
        <div v-else-if="step.scene === 'seg-trans'" class="rp-formula">
          <div class="rp-f-title">分段翻译公式</div>
          <div class="rp-formula-box">
            线性地址 =<br>
            段描述符.Base<br>
            + 逻辑地址.offset
          </div>
          <div class="rp-f-title" style="margin-top:12px">两个例子</div>
          <div class="rp-ex-row"><span>内核</span><span>0+0x1500=0x1500</span></div>
          <div class="rp-ex-row"><span>task[1]</span><span>64MB+0x1000=0x4001000</span></div>
        </div>

        <!-- linear-split右侧：地址计算 -->
        <div v-else-if="step.scene === 'linear-split'" class="rp-calc">
          <div class="rp-f-title">地址字段计算</div>
          <div class="rp-calc-row">
            <span>线性地址</span>
            <span class="lin-color">{{ step.addrExample.linear }}</span>
          </div>
          <div class="rp-calc-row">
            <span>PD 索引</span>
            <span>bits[31:22] = {{ pdIndex }}</span>
          </div>
          <div class="rp-calc-row">
            <span>PT 索引</span>
            <span>bits[21:12] = {{ ptIndex }}</span>
          </div>
          <div class="rp-calc-row">
            <span>页内偏移</span>
            <span>bits[11:0] = 0x{{ pageOffset.toString(16).padStart(3,'0') }}</span>
          </div>
          <div class="rp-f-title" style="margin-top:12px">大小关系</div>
          <div class="rp-calc-row"><span>页目录</span><span>4KB（1024×4B）</span></div>
          <div class="rp-calc-row"><span>页表</span><span>4KB（1024×4B）</span></div>
          <div class="rp-calc-row"><span>页面</span><span>4KB（2^12）</span></div>
        </div>

        <!-- pde/pte右侧：位字段说明 -->
        <div v-else-if="step.scene === 'pde' || step.scene === 'pte'" class="rp-fields">
          <div class="rp-f-title">关键控制位</div>
          <div v-for="f in ptBitMeaning" :key="f.name" class="rp-f-row">
            <span class="rp-f-name">{{ f.name }}</span>
            <span class="rp-f-desc">{{ f.desc }}</span>
          </div>
        </div>

        <!-- page-trans右侧：恒等映射说明 -->
        <div v-else-if="step.scene === 'page-trans'" class="rp-identity">
          <div class="rp-f-title">恒等映射（Identity Mapping）</div>
          <div class="rp-id-desc">
            head.s 为前 16MB 建立页表：<br>
            PDE[0] → PT at 0x1000<br>
            PT[0..4095] = 帧 0x0 ~ 0xFFF000<br>
            <br>
            线性地址 = 物理地址（0 ~ 16MB）
          </div>
          <div class="rp-id-verify">
            <span>验证：</span>
            <span class="lin-color">{{ step.addrExample.linear }}</span>
            <span> → </span>
            <span class="phys-color">{{ step.addrExample.physical }}</span>
            <span> ✓</span>
          </div>
        </div>

        <!-- fault/get-page右侧：mem_map说明 -->
        <div v-else-if="step.scene === 'fault' || step.scene === 'get-page'" class="rp-memmap">
          <div class="rp-f-title">mem_map[] 数组</div>
          <div class="rp-mm-desc">
            每个字节对应一个 4KB 物理帧<br>
            值 = 0：空闲<br>
            值 > 0：已分配（引用计数）<br>
            <br>
            共管理 <strong>{{ totalFrames }}</strong> 个帧<br>
            = {{ totalFrames * 4 / 1024 }}MB 物理内存
          </div>
          <div class="rp-f-title" style="margin-top:12px">内存分布</div>
          <div class="rp-mm-zone">
            <span class="mm-z-dot kernel" />内核 0~640KB（{{ kernelFrames }}帧）
          </div>
          <div class="rp-mm-zone">
            <span class="mm-z-dot buffer" />缓冲区 640KB~4MB（{{ bufferFrames }}帧）
          </div>
          <div class="rp-mm-zone">
            <span class="mm-z-dot free" />空闲 4MB+ （{{ freeFrames }}帧）
          </div>
        </div>
      </div>
    </div>
    </div><!-- /ml-body -->

    <!-- 控制按钮 -->
    <div class="controls">
      <el-button @click="goStep(currentIdx - 1)" :disabled="currentIdx === 0" size="small">← 上一步</el-button>
      <el-button @click="togglePlay" :type="playing ? 'warning' : 'primary'" size="small">
        {{ playing ? '⏸ 暂停' : '▶ 自动播放' }}
      </el-button>
      <el-button @click="goStep(currentIdx + 1)" :disabled="currentIdx === steps.length - 1" size="small">下一步 →</el-button>
      <el-button @click="reset" size="small">重置</el-button>
    </div>

    <!-- 详情卡片 -->
    <div class="detail-card">
      <div class="dc-header">
        <el-tag type="info" size="small" style="font-family:monospace">{{ step.srcRef }}</el-tag>
        <span class="dc-title">{{ step.title }}</span>
        <el-tag :type="step.tagType || 'primary'" size="small">{{ step.phase }}</el-tag>
      </div>
      <div class="dc-body">
        <div class="dc-detail">{{ step.detail }}</div>
        <pre v-if="step.code" class="dc-code">{{ step.code }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

// ─────────────────────────────────────────
// 阶段定义
// ─────────────────────────────────────────
const phases = [
  { name: '总览', file: 'boot/head.s', startStep: 0 },
  { name: '分段', file: 'include/linux/sched.h', startStep: 2 },
  { name: '分页', file: 'boot/head.s:156', startStep: 7 },
  { name: '缺页', file: 'mm/memory.c', startStep: 11 },
]

// ─────────────────────────────────────────
// 步骤数据
// ─────────────────────────────────────────
const steps = [
  // ── Phase 0: 总览 ──
  {
    phaseIdx: 0, phase: '总览',
    title: '两层翻译：逻辑→线性→物理全局图',
    srcRef: 'boot/head.s:10', srcFn: 'startup_32',
    tagType: 'info',
    scene: 'overview',
    explain: '为什么访问空指针会崩溃，而不是真的写到地址 0？为什么两个进程各自有"自己的"内存，互不干扰？这些都靠地址翻译——你写的地址和最终物理内存地址之间，硬件做了两层转换。\n\n保护模式下地址翻译分两层：分段机制将逻辑地址转为32位线性地址，分页机制再将线性地址映射到物理地址。',
    detail: 'Linux 0.11 运行在 x86 保护模式下。每次内存访问都经过两层硬件翻译：① 分段（Segmentation）：根据段选择子查 GDT/LDT，得到段基址，与偏移相加得到线性地址；② 分页（Paging）：CR0.PG=1 时，按 PDE→PTE 两级页表将线性地址翻译为物理地址。head.s 建立了内核的 GDT 和页表，main() 之前整个机制就已启动。',
    code: `/* boot/head.s:10 — 进入保护模式后的第一条指令 */
startup_32:
    movl $0x10,%eax   /* 内核数据段选择子 0x10 */
    mov  %ax,%ds
    mov  %ax,%es
    mov  %ax,%fs
    mov  %ax,%gs`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x000000',
      linear: '0x000000', physical: '0x000000',
      activeStage: 'none', note: '内核代码段（初始状态）',
    },
    vars: [
      { name: 'CR0.PE', val: '1（保护模式）' },
      { name: 'CR0.PG', val: '1（分页开启）' },
      { name: 'GDTR', val: '0x0000:0x5CB8' },
      { name: 'CR3', val: '0x000000（页目录基址）' },
    ],
  },

  // ── Phase 0 补充：CR 寄存器 ──
  {
    phaseIdx: 0, phase: '总览',
    title: 'CR0/CR2/CR3：控制寄存器决定 CPU 工作在哪种模式',
    srcRef: 'boot/head.s — setup_paging / mm/memory.c — do_no_page',
    tagType: 'info',
    scene: 'cr-regs',
    explain: 'CR0 控制 CPU 模式开关，CR2 记录缺页地址，CR3 指向当前页目录——这三个寄存器串联起整个地址翻译机制。CR1 是 x86 保留字段，Linux 0.11 不使用。',
    detail: 'CR0.PE（bit0）=1 进入保护模式；CR0.PG（bit31）=1 开启分页，两者都在 head.s 里设置。CR3 存放页目录的物理基址，进程切换时 switch_to() 会更新 CR3，使新进程的页表立刻生效。CR2 由 CPU 硬件在缺页时自动写入触发缺页的线性地址，do_no_page() 读取 CR2 才知道该分配哪个地址的页。',
    code: `/* boot/head.s — 开启分页 */
setup_paging:
    movl $pg_dir,%eax
    movl %eax,%cr3      /* CR3 = 页目录基址 */

    movl %cr0,%eax
    orl  $0x80000000,%eax
    movl %eax,%cr0      /* CR0.PG=1，开启分页 */
    ret

/* mm/memory.c:do_no_page — 读 CR2 */
void do_no_page(unsigned long error_code,
                unsigned long address) {
    /* address 就是 CPU 写入 CR2 的缺页地址 */
    get_empty_page(address);
}`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x000000',
      linear: '0x000000', physical: '0x000000',
      activeStage: 'none', note: 'CR3=0x0000（页目录在物理地址0）',
    },
    vars: [
      { name: 'CR0.PE',  val: '1（保护模式已开启）' },
      { name: 'CR0.PG',  val: '1（分页已开启）' },
      { name: 'CR2',     val: '缺页时 CPU 自动写入' },
      { name: 'CR3',     val: '0x000000（页目录基址）' },
    ],
  },

  // ── Phase 1: 分段 ──
  {
    phaseIdx: 1, phase: '分段',
    title: '选择子（Selector）：TI位决定查 GDT 还是 LDT',
    srcRef: 'include/linux/sched.h:163',
    tagType: 'warning',
    scene: 'selector',
    explain: '段寄存器（CS/DS/SS等）存放选择子，16位中 TI=0 查全局GDT，TI=1 查进程LDT，低2位是请求特权级RPL。',
    detail: '选择子（Selector）是16位整数：高13位是描述符索引，bit[2]（TI）决定查 GDT 还是 LDT，bit[1:0]（RPL）是请求特权级。内核态 CS=0x08（GDT[1], RPL=0），用户态 CS=0x0F（LDT[1], RPL=3）。sched.h 中 task_struct 保存了每个进程的 LDT 描述符。',
    code: `/* include/linux/sched.h:163 */
struct task_struct {
    ...
    struct desc_struct ldt[3];
    /* ldt[0] = NULL描述符
     * ldt[1] = 代码段
     * ldt[2] = 数据段 */
};`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'seg', note: 'CS=0x08：GDT[1]内核代码段',
    },
    vars: [
      { name: 'CS', val: '0x0008（内核代码段）' },
      { name: 'DS', val: '0x0010（内核数据段）' },
      { name: 'SS', val: '0x0010（内核栈段）' },
      { name: 'TI位', val: '0 → 查GDT' },
    ],
  },
  {
    phaseIdx: 1, phase: '分段',
    title: '段描述符 64 位格式：Base/Limit/DPL/Type',
    srcRef: 'include/asm/system.h:34',
    tagType: 'warning',
    scene: 'seg-desc',
    explain: '每个段描述符 8 字节（64位），描述段的基址、长度、类型和权限。GDT 存放内核段描述符，LDT 存放进程段描述符。',
    detail: '段描述符 64 位被拆成高低各 32 位。Base 散落在三个字段（因历史兼容），Limit 分成两部分（15:0 和 19:16），G 位（粒度）=1 表示 Limit 单位为 4KB，DPL 是描述符特权级（0=内核, 3=用户）。Linux 0.11 内核段 Base=0, Limit=8MB-1（G=0，字节粒度）。',
    code: `/* include/asm/system.h:34 */
#define _set_seg_desc(gate_addr, type, dpl, base, limit) \\
  *(gate_addr) = ((base) & 0xff000000) | \\
    (((base) & 0x00ff0000)>>16) | \\
    ((type)<<16) | ((dpl)<<13) | \\
    0x8000 | ((limit)&0xf0000) | \\
    (((limit)>>16)&0xf);         \\
  *((gate_addr)+1) = (((base)&0x0000ffff)<<16) | \\
    ((limit)&0x0000ffff);`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'seg', note: 'GDT[1] Base=0, offset直接=线性',
    },
    vars: [
      { name: 'Base', val: '0x000000（8字节=64位）' },
      { name: 'Limit', val: '0x7FFFFF（8MB-1）' },
      { name: 'DPL', val: '0（内核态）' },
      { name: 'G', val: '0（字节粒度）' },
    ],
  },
  {
    phaseIdx: 1, phase: '分段',
    title: 'Linux 0.11 LDT：每进程 Base=nr×64MB，Limit=640KB',
    srcRef: 'kernel/sched.c:143',
    tagType: 'warning',
    scene: 'ldt',
    explain: '每个用户进程有独立的 LDT。进程 nr 的代码/数据段 Base = nr×64MB，因此各进程线性地址空间不重叠，内核通过段机制隔离进程。',
    detail: 'copy_mem() 在 fork 时为新进程设置 LDT。Base = task_nr × 0x4000000（64MB），每进程最多使用 640KB（与实模式时内存上限一致）。因此 task[1] 的逻辑地址 0x1000 会被翻译为线性地址 0x4001000，与内核或其他进程的地址空间完全隔离。',
    code: `/* kernel/sched.c:386 (copy_mem) */
new_data_base = new_code_base
  = nr * 0x4000000;

set_base(p->ldt[1], new_code_base);
set_base(p->ldt[2], new_data_base);
set_limit(p->ldt[1], data_limit);
set_limit(p->ldt[2], data_limit);`,
    addrExample: {
      logicalSel: '0x000F', logicalOff: '0x001000',
      linear: '0x4001000', physical: '0x4001000',
      activeStage: 'seg', note: 'task[1] LDT[1] Base=64MB=0x4000000',
    },
    vars: [
      { name: 'task_nr', val: '1' },
      { name: 'Base', val: '0x4000000（=64MB）' },
      { name: 'Limit', val: '0x9FFFF（640KB-1）' },
      { name: 'LDT[1]', val: 'Code seg, DPL=3' },
    ],
  },
  {
    phaseIdx: 1, phase: '分段',
    title: '演示：逻辑地址 → 线性地址翻译（内核 + 用户各一例）',
    srcRef: 'mm/memory.c:1',
    tagType: 'warning',
    scene: 'seg-trans',
    explain: '内核代码段 Base=0，逻辑偏移直接等于线性地址。用户进程 LDT Base=nr×64MB，线性地址=Base+offset，两者相差 64MB×nr。',
    detail: '这一步展示分段翻译的两个具体例子：① 内核 CS=0x08 查 GDT[1]，Base=0，线性地址=0+0x1500=0x1500；② task[1] CS=0x0F 查自身 LDT[1]，Base=0x4000000，线性地址=0x4000000+0x1000=0x4001000。两个地址在线性地址空间中完全不同，实现了进程隔离。',
    code: `/* 翻译过程（硬件自动执行）:
 * 1. 读取 CS 寄存器得到选择子
 * 2. 根据 TI 位查 GDT 或 LDT
 * 3. 取出段描述符的 Base 字段
 * 4. 线性地址 = Base + 逻辑偏移
 */`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'seg', note: '内核段翻译结果（hover 步骤卡片）',
    },
    vars: [
      { name: '内核线性', val: '0+0x1500=0x001500' },
      { name: 'task[1]线性', val: '0x4000000+0x1000' },
      { name: '', val: '= 0x4001000' },
    ],
  },

  // ── Phase 1 补充：设计动机 ──
  {
    phaseIdx: 1, phase: '分段',
    title: '为什么内核 Base=0、用户 Base=nr×64MB？— 设计动机对比',
    srcRef: 'kernel/fork.c:copy_mem + boot/head.s:gdt',
    tagType: 'warning',
    scene: 'why-seg',
    explain: '内核 Base=0 让逻辑偏移=物理地址，内核代码可以直接用绝对地址编写。用户 Base=nr×64MB 让各进程"相同的偏移 0x1000"映射到完全不同的线性地址，靠段机制实现进程隔离，不需要改变用户代码。',
    detail: '内核为什么选 Base=0？因为 head.s 同时建立了恒等映射（线性=物理），Base=0 使三层地址全部相等，内核驱动/中断处理函数可以直接使用物理地址常量，无需任何换算。用户为什么选 nr×64MB？每个进程都写"我的数组在地址 0x2000"，如果 Base 相同就会冲突。用不同 Base 把它们错开到线性空间的不同位置，再通过分页各自映射到不同物理帧，既实现隔离又让用户程序不感知。64MB 是刻意选的：64 个进程 × 64MB = 4GB，刚好填满 32 位线性地址空间。',
    code: `/* 相同偏移 0x1000，不同进程的线性地址：
 * task[0]: Base=0x0000000, 线性=0x0000000+0x1000=0x0001000
 * task[1]: Base=0x4000000, 线性=0x4000000+0x1000=0x4001000
 * task[2]: Base=0x8000000, 线性=0x8000000+0x1000=0x8001000
 *
 * 内核代码: CS:0x5000 → Base=0 → 线性=0x5000=物理0x5000
 * 内核可以写: *(int*)0x5000 = 1; // 直接物理地址
 */`,
    addrExample: {
      logicalSel: '0x000F', logicalOff: '0x001000',
      linear: '0x4001000', physical: '0x4001000',
      activeStage: 'seg', note: 'task[1] 与 task[2] 的 0x1000 → 不同线性地址',
    },
    vars: [
      { name: 'task[0] Base', val: '0x0000000（进程0）' },
      { name: 'task[1] Base', val: '0x4000000（+64MB）' },
      { name: 'task[2] Base', val: '0x8000000（+128MB）' },
      { name: '64×64MB', val: '= 4GB = 32位线性空间' },
    ],
  },

  // ── Phase 2: 分页 ──
  {
    phaseIdx: 2, phase: '分页',
    title: '线性地址拆分：[31:22] PD 索引 + [21:12] PT 索引 + [11:0] 偏移',
    srcRef: 'boot/head.s:156',
    tagType: 'success',
    scene: 'linear-split',
    explain: '32位线性地址被硬件拆成三段：高10位索引页目录（1024个PDE），中10位索引页表（1024个PTE），低12位是4KB页内偏移。',
    detail: 'x86 两级页表结构：一个页目录（CR3指向）覆盖 4GB 地址空间，每个 PDE 指向一个页表，每个 PTE 指向一个 4KB 物理帧。Linux 0.11 的 head.s 在进入 main() 前建立了前 16MB 的页目录和页表，实现恒等映射。',
    code: `/* boot/head.s:156 — 设置页目录基址 */
setup_paging:
    movl $1024*5,%ecx  /* 清零5页（1页目录+4页表） */
    xorl %eax,%eax
    xorl %edi,%edi
    rep stosl           /* 清零 */
    movl $pg0+7,pg_dir  /* PDE[0]→pg0, P=W=U=1 */
    movl $pg1+7,pg_dir+4
    movl $pg2+7,pg_dir+8
    movl $pg3+7,pg_dir+12`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'page', note: '线性 0x001500 = PD[0] PT[1] off=0x500',
    },
    vars: [
      { name: 'CR3', val: '0x000000（页目录）' },
      { name: 'PD 索引', val: '0（bits[31:22]）' },
      { name: 'PT 索引', val: '1（bits[21:12]）' },
      { name: '页内偏移', val: '0x500（bits[11:0]）' },
    ],
  },
  {
    phaseIdx: 2, phase: '分页',
    title: '页目录项（PDE）：指向页表的物理地址 + P/R/W 位',
    srcRef: 'boot/head.s:175',
    tagType: 'success',
    scene: 'pde',
    explain: 'PDE（Page Directory Entry）32位：高20位是页表的物理帧号（×4096得物理地址），低12位是控制位（P/R/W/U等）。',
    detail: 'PDE[31:12] 存放页表的物理基址的高20位（低12位必须对齐，故为0）。P=1 表示页表存在于物理内存。R/W=1 允许读写。U/S=1 用户可访问。Linux 0.11 的 head.s 建立 4 个 PDE（pg0~pg3）映射前 16MB。',
    code: `/* boot/head.s:175 — 填充页表 */
    movl $pg3+4092,%edi  /* 从最后一个PTE开始倒序填 */
    movl $0xfff007,%eax  /* 最后一帧=16MB-4KB, U=W=P=1 */
    std
1:  stosl
    subl $0x1000,%eax    /* 每次减4KB */
    jge  1b`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'page', note: 'PDE[0]指向pg0页表（恒等映射）',
    },
    vars: [
      { name: 'PDE[0]', val: '0x001007（pg0基址+flags）' },
      { name: 'P 位', val: '1（页表存在）' },
      { name: 'R/W 位', val: '1（可读写）' },
      { name: 'U/S 位', val: '1（用户可访问）' },
    ],
  },
  {
    phaseIdx: 2, phase: '分页',
    title: '页表项（PTE）：指向物理页帧 + P/R/W/U 位',
    srcRef: 'mm/memory.c:145',
    tagType: 'success',
    scene: 'pte',
    explain: 'PTE（Page Table Entry）32位：高20位是物理帧号（×4096得物理帧地址），P=0时触发缺页异常（INT 14）。',
    detail: 'PTE 是页表翻译的最后一步。PTE[31:12] 给出物理帧号，加上线性地址的低12位偏移就是最终物理地址。PTE.P=0 时 CPU 触发 Page Fault（INT 14），内核的 do_no_page() 负责分配新帧并更新 PTE.P=1。',
    code: `/* mm/memory.c:145 — put_page */
unsigned long put_page(unsigned long
  page, unsigned long address) {
    unsigned long tmp, *page_table;
    /* 计算PDE地址 */
    page_table = (unsigned long *)
      ((address>>20) & 0xffc);
    /* 取PTE指针 */
    tmp = *(unsigned long *)page_table;
    page_table = (unsigned long *)
      (tmp & 0xfffff000);
    /* 写入PTE */
    page_table[(address>>12) & 0x3ff]
      = page | 7;  /* P=W=U=1 */
}`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'page', note: 'PTE[1]=0x001007（帧1，flags=7）',
    },
    vars: [
      { name: 'PTE[1]', val: '0x001007（P=W=U=1）' },
      { name: '物理帧号', val: '1（第2个4KB帧）' },
      { name: '物理地址', val: '0x1000 + 0x500 = 0x1500' },
      { name: 'P 位', val: '1（页面存在）' },
    ],
  },
  {
    phaseIdx: 2, phase: '分页',
    title: '演示：线性地址 → 物理地址翻译（恒等映射验证）',
    srcRef: 'mm/memory.c:160',
    tagType: 'success',
    scene: 'page-trans',
    explain: '完整展示线性地址 0x001500 如何通过两级页表翻译到物理地址，验证 head.s 建立的恒等映射（线性=物理）。',
    detail: '翻译过程：① CR3=0 → 页目录在物理地址 0；② 取 PD 索引=0，读 PDE[0]=0x1007，页表基址=0x1000；③ 取 PT 索引=1，读 PTE[1]=0x1007（实际 Linux 0.11 head.s 设置为 0x1007），物理帧基址=0x1000；④ 物理地址=0x1000+0x500=0x1500=线性地址，恒等映射成立。',
    code: `/* 验证：head.s 建立的页表结构
 * pg_dir[0] = pg0 + 7 = 0x1007
 *   -> pg0(页表) 在物理 0x1000
 * pg0[0] = 0x000007  (帧0, P=W=U=1)
 * pg0[1] = 0x001007  (帧1, P=W=U=1)
 * pg0[i] = i*0x1000 + 7
 * 因此线性 = 物理（恒等映射）
 */`,
    addrExample: {
      logicalSel: '0x0008', logicalOff: '0x001500',
      linear: '0x001500', physical: '0x001500',
      activeStage: 'both', note: '恒等映射验证：线性 = 物理',
    },
    vars: [
      { name: 'CR3', val: '0x000000' },
      { name: 'PDE[0]', val: '0x001007' },
      { name: 'PTE[1]', val: '0x001007' },
      { name: '物理地址', val: '0x001500 ✓' },
    ],
  },

  // ── Phase 3: 缺页 ──
  {
    phaseIdx: 3, phase: '缺页',
    title: 'do_no_page()：PTE.P=0 触发 INT 14，分配新页帧',
    srcRef: 'mm/memory.c:250',
    tagType: 'danger',
    scene: 'fault',
    explain: '当访问的页面 PTE.P=0 时，CPU 触发缺页异常（INT 14）。内核 do_no_page() 调用 get_free_page() 分配物理帧，再用 put_page() 更新页表。',
    detail: '缺页异常是 Linux 0.11 按需分配内存的核心机制。用户进程的逻辑地址空间在创建时只分配了描述符，物理帧在第一次访问时才实际分配（demand paging 的简化版）。do_no_page() 在 mm/memory.c:250，先找空闲帧，再建立 PTE 映射。',
    code: `/* mm/memory.c:250 — do_no_page */
void do_no_page(unsigned long address) {
    unsigned long tmp;
    /* 分配一个新的物理帧 */
    tmp = get_free_page();
    if (!tmp) oom(); /* 内存耗尽 */
    /* 建立线性地址→物理地址映射 */
    if (put_page(tmp, address))
        return;
    free_page(tmp);
    oom();
}`,
    addrExample: {
      logicalSel: '0x000F', logicalOff: '0x002000',
      linear: '0x4002000', physical: '（待分配）',
      activeStage: 'page', note: 'PTE.P=0 → 触发缺页',
    },
    vars: [
      { name: 'INT 14', val: 'Page Fault' },
      { name: '错误地址', val: '0x4002000' },
      { name: 'PTE.P', val: '0 → 触发异常' },
      { name: '处理函数', val: 'do_no_page()' },
    ],
  },
  {
    phaseIdx: 3, phase: '缺页',
    title: 'get_free_page()：扫描 mem_map[] 找空闲帧，更新 PTE',
    srcRef: 'mm/memory.c:86',
    tagType: 'danger',
    scene: 'get-page',
    explain: 'get_free_page() 从高地址向低地址扫描 mem_map[]，找到第一个值为 0 的项（空闲帧），标记为已用并返回物理地址。',
    detail: 'mem_map[] 是 Linux 0.11 管理物理内存的核心数据结构，每字节对应一个 4KB 物理帧的引用计数。get_free_page() 用汇编实现，从高地址往低地址扫描（减少碎片），找到空闲帧后将 mem_map[i] 置 1，清零帧内容，返回帧的物理地址供 put_page() 建立 PTE 映射。',
    code: `/* mm/memory.c:86 — get_free_page */
unsigned long get_free_page(void) {
    register unsigned long __res asm("ax");
    __asm__(
        "std ; repne ; scasb\n\t"
        /* 从高地址扫描mem_map[],找值=0的项 */
        "jne 1f\n\t"
        "movb $1,1(%%edi)\n\t"
        /* mem_map[i]=1，标记已分配 */
        ...
        "1: movl $0,%%eax"
        :"=a" (__res)
    );
    return __res;
}`,
    addrExample: {
      logicalSel: '0x000F', logicalOff: '0x002000',
      linear: '0x4002000', physical: '（动态分配）',
      activeStage: 'both', note: '分配帧后 PTE.P=1，映射建立',
    },
    vars: [
      { name: 'mem_map[]', val: '4096 字节数组' },
      { name: '扫描方向', val: '高地址 → 低地址' },
      { name: '空闲标记', val: 'mem_map[i] = 0' },
      { name: '分配后', val: 'mem_map[i] = 1' },
    ],
  },
]

// ─────────────────────────────────────────
// 状态
// ─────────────────────────────────────────
const currentIdx = ref(0)
const playing = ref(false)
const changedVars = ref(new Set())
const scanPos = ref(-1)
const scanFound = ref(-1)
const segTransSub = ref(0)
const pageTransSub = ref(0)

let playTimer = null
let scanTimer = null
let subTimer = null

// ─────────────────────────────────────────
// Computed
// ─────────────────────────────────────────
const step = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => step.value.phaseIdx)

const isSegActive = computed(() =>
  step.value.addrExample.activeStage === 'seg' || step.value.addrExample.activeStage === 'both'
)
const isPageActive = computed(() =>
  step.value.addrExample.activeStage === 'page' || step.value.addrExample.activeStage === 'both'
)

// 从线性地址解析分页字段
const linearAddr = computed(() => {
  const v = step.value.addrExample.linear
  if (v.startsWith('0x') || v.startsWith('0X')) return parseInt(v, 16)
  return 0
})
const pdIndex = computed(() => (linearAddr.value >>> 22) & 0x3FF)
const ptIndex = computed(() => (linearAddr.value >>> 12) & 0x3FF)
const pageOffset = computed(() => linearAddr.value & 0xFFF)

const pdeVal = computed(() => {
  // Linux 0.11 head.s: PDE[i] = pg_i_phys + 7
  // pg0在0x1000, pg1在0x2000, pg2在0x3000, pg3在0x4000
  const ptBase = (pdIndex.value + 1) * 0x1000
  return '0x' + (ptBase + 7).toString(16).padStart(7, '0')
})
const pteVal = computed(() => {
  // 恒等映射: 线性地址的帧号=物理帧号
  const frameBase = (pdIndex.value * 1024 + ptIndex.value) * 0x1000
  return '0x' + (frameBase + 7).toString(16).padStart(7, '0')
})

// 选择子解析
const selIdx = computed(() => {
  const v = step.value.addrExample.logicalSel
  const n = parseInt(v, 16)
  return String((n >>> 3) & 0x1FFF)
})
const selTI = computed(() => {
  const v = step.value.addrExample.logicalSel
  const n = parseInt(v, 16)
  return String((n >>> 2) & 1)
})
const selRPL = computed(() => {
  const v = step.value.addrExample.logicalSel
  const n = parseInt(v, 16)
  return String(n & 3)
})

const sceneTitle = computed(() => {
  const m = {
    'overview': '整体架构对比（实模式 vs 保护模式）',
    'selector': '选择子（Selector）结构',
    'seg-desc': '段描述符（Segment Descriptor）',
    'ldt': '进程 LDT 地址空间分布',
    'seg-trans': '分段翻译演示',
    'linear-split': '线性地址三段拆分',
    'pde': '页目录项（PDE）结构',
    'pte': '页表项（PTE）结构',
    'page-trans': '分页翻译演示',
    'fault': '缺页异常处理流程',
    'get-page': 'get_free_page() 内存分配',
  }
  return m[step.value.scene] || step.value.scene
})

const rightPanelTitle = computed(() => {
  const m = {
    'overview': '核心数据结构',
    'selector': 'GDT 布局',
    'seg-desc': '字段含义',
    'ldt': '源码参考',
    'seg-trans': '翻译公式',
    'linear-split': '地址计算',
    'pde': '控制位含义',
    'pte': '控制位含义',
    'page-trans': '恒等映射',
    'fault': 'mem_map[] 说明',
    'get-page': 'mem_map[] 说明',
  }
  return m[step.value.scene] || '详细信息'
})

// ─────────────────────────────────────────
// 静态数据
// ─────────────────────────────────────────

const crRegs = [
  {
    name: 'CR0', key: true, color: '#409eff',
    role: '系统控制寄存器 — 决定 CPU 工作在哪种模式',
    bits: [
      { name: 'PE',  pos: '0',  width: 2,  color: '#409eff', desc: '=1 进入保护模式（实模式→保护模式的开关）' },
      { name: '...',  pos: '1-30', width: 10, color: '#c0c4cc', desc: '其他控制位（WP写保护、NE等）' },
      { name: 'PG',  pos: '31', width: 2,  color: '#f56c6c', desc: '=1 开启分页机制（分页的总开关）' },
    ],
    when: 'head.s: 先设 PE=1 进保护模式，建好页表后再设 PG=1 开分页',
  },
  {
    name: 'CR1', key: false, color: '#c0c4cc',
    role: 'x86 保留，Intel 从未定义用途',
    bits: null,
    when: 'Linux 0.11 从不访问 CR1',
  },
  {
    name: 'CR2', key: true, color: '#e6a23c',
    role: '缺页线性地址寄存器 — 只读，CPU 自动写入',
    bits: null,
    when: '发生缺页（INT 14）时，CPU 把触发异常的线性地址写入 CR2，do_no_page() 读取它',
  },
  {
    name: 'CR3', key: true, color: '#67c23a',
    role: '页目录基址寄存器（PDBR）— 分页的入口',
    bits: [
      { name: '页目录物理地址[31:12]', pos: '31:12', width: 10, color: '#67c23a', desc: '页目录表的物理地址高20位（低12位为0，4KB对齐）' },
      { name: '标志', pos: '11:0', width: 2, color: '#c0c4cc', desc: 'PCD/PWT 缓存控制位' },
    ],
    when: '进程切换时 switch_to() 写入新进程的页目录物理地址，CPU 立刻使用新页表',
  },
]

const crTimeline = [
  { reg: 'CR0.PE=1', color: '#409eff', action: '进入保护模式，GDT 生效，CS/DS 变为选择子' },
  { reg: 'GDTR',     color: '#9c27b0', action: 'lgdt 指令加载 GDT 基址和长度' },
  { reg: 'CR3',      color: '#67c23a', action: '写入页目录物理地址（还未开分页，先准备好）' },
  { reg: 'CR0.PG=1', color: '#f56c6c', action: '开启分页，之后所有地址访问都要走页表' },
]

const whySegProcs = [
  { nr: 0, base: '0x0000000', linear: '0x0001000', color: '#409eff' },
  { nr: 1, base: '0x4000000', linear: '0x4001000', color: '#67c23a' },
  { nr: 2, base: '0x8000000', linear: '0x8001000', color: '#e6a23c' },
]

const selExamples = [
  { val: '0x0008', desc: 'GDT[1] 内核代码段 ring0' },
  { val: '0x0010', desc: 'GDT[2] 内核数据/栈段 ring0' },
  { val: '0x000F', desc: 'LDT[1] 用户代码段 ring3' },
  { val: '0x0017', desc: 'LDT[2] 用户数据/栈段 ring3' },
]

const gdtEntries = [
  { idx: 0, sel: '0x0000', desc: 'NULL 描述符' },
  { idx: 1, sel: '0x0008', desc: '内核代码段 Base=0 DPL=0' },
  { idx: 2, sel: '0x0010', desc: '内核数据段 Base=0 DPL=0' },
  { idx: 3, sel: '0x0018', desc: '用户代码段 Base=0 DPL=3' },
  { idx: 4, sel: '0x0020', desc: '用户数据段 Base=0 DPL=3' },
  { idx: 5, sel: '0x0028', desc: 'task[0] TSS' },
  { idx: 6, sel: '0x0030', desc: 'task[0] LDT' },
]

const segDescHigh = [
  { name: 'Base[31:24]', width: 2, cls: 'sd-base', val: '0x00', tip: '段基址高8位' },
  { name: 'G', width: 1, cls: 'sd-flag', val: '0', tip: 'G=0字节粒度，G=1×4KB粒度' },
  { name: 'D/B', width: 1, cls: 'sd-flag', val: '1', tip: '默认操作数大小：1=32位' },
  { name: '0', width: 1, cls: 'sd-reserved', val: '0', tip: '保留位，必须为0' },
  { name: 'AVL', width: 1, cls: 'sd-flag', val: '0', tip: '软件可用位（OS自用）' },
  { name: 'Lmt[19:16]', width: 1, cls: 'sd-limit', val: '0x7', tip: '段长度高4位' },
  { name: 'P', width: 1, cls: 'sd-flag', val: '1', tip: 'P=1段存在，P=0不在内存' },
  { name: 'DPL', width: 1, cls: 'sd-dpl', val: '0', tip: '描述符特权级：0=内核，3=用户' },
  { name: 'S', width: 1, cls: 'sd-flag', val: '1', tip: 'S=1普通段，S=0系统段' },
  { name: 'Type', width: 1, cls: 'sd-type', val: '0xA', tip: '代码段（可执行可读）' },
  { name: 'Base[23:16]', width: 2, cls: 'sd-base', val: '0x00', tip: '段基址中间8位' },
]
const segDescLow = [
  { name: 'Base[15:0]', width: 3, cls: 'sd-base', val: '0x0000', tip: '段基址低16位' },
  { name: 'Limit[15:0]', width: 5, cls: 'sd-limit', val: '0xFFFF', tip: '段长度低16位（内核段=0x7FFFFF）' },
]

const segDescMeaning = [
  { name: 'P', desc: '存在位，0=段不在内存' },
  { name: 'DPL', desc: '特权级：0内核 / 3用户' },
  { name: 'S', desc: '0=系统描述符（TSS/LDT）' },
  { name: 'Type', desc: '0xA=代码段可执行' },
  { name: 'G', desc: '粒度：0=字节 1=4KB' },
  { name: 'D/B', desc: '1=32位操作数' },
]

const ldtTasks = [
  { nr: 0, base: '0x0000000（0MB）' },
  { nr: 1, base: '0x4000000（64MB）' },
  { nr: 2, base: '0x8000000（128MB）' },
  { nr: 3, base: '0xC000000（192MB）' },
]

const segTransExamples = [
  {
    title: '① 内核代码（CS=0x08）',
    sel: '0x08', ti: '0', idx: '1', base: '0x000000',
    off: '0x001500', linear: '0x001500',
  },
  {
    title: '② 用户进程 task[1]（CS=0x0F）',
    sel: '0x0F', ti: '1', idx: '1', base: '0x4000000',
    off: '0x001000', linear: '0x4001000',
  },
]
const segTransActive = computed(() => {
  if (currentIdx.value !== 4) return 0
  return segTransSub.value >= 3 ? 1 : 0
})

const pdeFields = [
  { name: '物理帧号[31:12]', width: 8, cls: 'pde-addr', tip: '页表的物理基址 = 此值 × 4096' },
  { name: 'AVL', width: 1, cls: 'pde-flag', tip: '软件可用位' },
  { name: 'G', width: 1, cls: 'pde-flag', tip: 'G=1全局页，CR3刷新时不作废TLB' },
  { name: '0', width: 1, cls: 'pde-reserved', tip: '保留位' },
  { name: 'D', width: 1, cls: 'pde-flag', tip: 'Dirty：页面被写过' },
  { name: 'A', width: 1, cls: 'pde-flag', tip: 'Accessed：页面被访问过' },
  { name: 'CD', width: 1, cls: 'pde-flag', tip: 'Cache Disable' },
  { name: 'WT', width: 1, cls: 'pde-flag', tip: 'Write Through' },
  { name: 'U', width: 1, cls: 'pde-flag', tip: 'U=1用户可访问，U=0仅内核' },
  { name: 'W', width: 1, cls: 'pde-flag', tip: 'W=1读写，W=0只读' },
  { name: 'P', width: 1, cls: 'pde-present', tip: 'P=1页表存在，P=0触发缺页异常' },
]

const pteFields = [
  { name: '物理帧号[31:12]', width: 8, cls: 'pte-addr', tip: '物理帧的基址 = 此值 × 4096' },
  { name: 'AVL', width: 1, cls: 'pte-flag', tip: '软件可用位' },
  { name: 'G', width: 1, cls: 'pte-flag', tip: 'G=1全局页' },
  { name: '0', width: 1, cls: 'pte-reserved', tip: '保留' },
  { name: 'D', width: 1, cls: 'pte-flag', tip: 'Dirty：此帧被写过' },
  { name: 'A', width: 1, cls: 'pte-flag', tip: 'Accessed' },
  { name: 'CD', width: 1, cls: 'pte-flag', tip: 'Cache Disable' },
  { name: 'WT', width: 1, cls: 'pte-flag', tip: 'Write Through' },
  { name: 'U', width: 1, cls: 'pte-flag', tip: 'U/S: 用户态可访问' },
  { name: 'W', width: 1, cls: 'pte-flag', tip: 'Read/Write' },
  { name: 'P', width: 1, cls: 'pte-present', tip: 'P=0 → 触发 INT 14 缺页异常' },
]

const ptBitMeaning = [
  { name: 'P', desc: '存在位：0→缺页异常INT14' },
  { name: 'R/W', desc: '0只读 / 1读写' },
  { name: 'U/S', desc: '0仅内核 / 1用户可访问' },
  { name: 'A', desc: 'Accessed：CPU自动置1' },
  { name: 'D', desc: 'Dirty：写操作后置1' },
  { name: '[31:12]', desc: '物理帧号（页对齐）' },
]

// mem_map 相关
const TOTAL_FRAMES = 1024
const KERNEL_FRAMES = 160  // 640KB / 4KB
const BUFFER_FRAMES = 192  // ~768KB (640KB~4MB) 简化
const totalFrames = TOTAL_FRAMES
const kernelFrames = KERNEL_FRAMES
const bufferFrames = BUFFER_FRAMES
const freeFrames = TOTAL_FRAMES - KERNEL_FRAMES - BUFFER_FRAMES

const memMapCells = computed(() => {
  return Array.from({ length: TOTAL_FRAMES }, (_, i) => {
    if (i < KERNEL_FRAMES) return { cls: 'mm-kernel', zone: '内核区', label: '已用' }
    if (i < KERNEL_FRAMES + BUFFER_FRAMES) return { cls: 'mm-buffer', zone: '缓冲区', label: '已用' }
    return { cls: 'mm-free', zone: '空闲区', label: '空闲' }
  })
})

// ─────────────────────────────────────────
// Watch: 变量闪烁 + 场景动画
// ─────────────────────────────────────────
watch(currentIdx, (newIdx, oldIdx) => {
  // 变量闪烁
  const newVars = new Set(steps[newIdx].vars.map(v => v.name))
  const oldVars = new Set(steps[oldIdx]?.vars.map(v => v.name) || [])
  const changed = [...newVars].filter(n => {
    if (!oldVars.has(n)) return true
    const nv = steps[newIdx].vars.find(v => v.name === n)?.val
    const ov = steps[oldIdx].vars.find(v => v.name === n)?.val
    return nv !== ov
  })
  changedVars.value = new Set(changed)
  setTimeout(() => { changedVars.value = new Set() }, 900)

  // 重置场景状态
  clearTimeout(subTimer)
  clearInterval(scanTimer)
  scanPos.value = -1
  scanFound.value = -1
  segTransSub.value = 0
  pageTransSub.value = 0

  // 场景动画
  const scene = steps[newIdx].scene
  if (scene === 'seg-trans') startSegTransAnim()
  if (scene === 'page-trans') startPageTransAnim()
  if (scene === 'get-page') startScanAnim()
})

function startSegTransAnim() {
  let sub = 0
  const tick = () => {
    sub++
    segTransSub.value = sub
    if (sub < 3) subTimer = setTimeout(tick, 700)
  }
  subTimer = setTimeout(tick, 600)
}

function startPageTransAnim() {
  let sub = 0
  const tick = () => {
    sub++
    pageTransSub.value = sub
    if (sub < 4) subTimer = setTimeout(tick, 700)
  }
  subTimer = setTimeout(tick, 600)
}

function startScanAnim() {
  const startFrame = TOTAL_FRAMES - 1
  let pos = startFrame
  scanPos.value = pos
  scanTimer = setInterval(() => {
    if (memMapCells.value[pos].cls === 'mm-free') {
      scanFound.value = pos
      scanPos.value = -1
      clearInterval(scanTimer)
      return
    }
    pos--
    if (pos < 0) {
      clearInterval(scanTimer)
      return
    }
    scanPos.value = pos
  }, 30)
}

// ─────────────────────────────────────────
// 导航
// ─────────────────────────────────────────
function goStep(idx) {
  if (idx < 0 || idx >= steps.length) return
  currentIdx.value = idx
}

function jumpToPhase(pi) {
  goStep(phases[pi].startStep)
}

function togglePlay() {
  if (playing.value) {
    clearInterval(playTimer)
    playing.value = false
  } else {
    playing.value = true
    playTimer = setInterval(() => {
      if (currentIdx.value < steps.length - 1) {
        goStep(currentIdx.value + 1)
      } else {
        clearInterval(playTimer)
        playing.value = false
      }
    }, 3500)
  }
}

function reset() {
  clearInterval(playTimer)
  clearInterval(scanTimer)
  clearTimeout(subTimer)
  playing.value = false
  currentIdx.value = 0
  scanPos.value = -1
  scanFound.value = -1
  segTransSub.value = 0
  pageTransSub.value = 0
  changedVars.value = new Set()
}

onUnmounted(() => {
  clearInterval(playTimer)
  clearInterval(scanTimer)
  clearTimeout(subTimer)
})
</script>

<style scoped>
/* ─── 根容器 ─── */
.ml-root {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ─── 主体：左侧导航 + 三栏内容 ─── */
.ml-body {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 12px;
  align-items: start;
}

/* ─── 左侧竖向导航 ─── */
.ml-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nav-section-title {
  font-size: 10px;
  font-weight: 600;
  color: #c0c4cc;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 2px;
}

/* ─── Phase 进度条（竖向） ─── */
.phase-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.phase-seg {
  padding: 8px 10px;
  border-radius: 6px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.phase-seg:hover { background: #ecf5ff; border-color: #b3d8ff; }
.phase-seg.active { background: #ecf5ff; border-color: #409eff; }
.phase-seg.done { background: #f0f9eb; border-color: #b3e19d; }
.phase-label { font-size: 13px; font-weight: 600; color: #303133; }
.phase-seg.active .phase-label { color: #409eff; }
.phase-seg.done .phase-label { color: #67c23a; }
.phase-file { font-size: 10px; color: #909399; font-family: monospace; word-break: break-all; }

/* ─── 步骤指示器（竖向列内自动换行） ─── */
.step-indicator {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 5px;
  padding: 2px;
}
.step-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #dcdfe6;
  cursor: pointer;
  transition: all 0.2s;
}
.step-dot:hover { transform: scale(1.3); }
.step-dot.active { background: #409eff; transform: scale(1.4); }
.step-dot.done { background: #67c23a; }

/* ─── 三栏布局 ─── */
.ml-grid {
  display: grid;
  grid-template-columns: 230px 1fr 230px;
  gap: 12px;
}

/* ─── 左栏 ─── */
.ml-left {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

/* 地址显示 */
.addr-block { display: flex; flex-direction: column; gap: 4px; }
.addr-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f5f7fa;
  border-left: 2px solid transparent;
  transition: all 0.3s;
}
.addr-row.active { border-left-color: #409eff; background: #ecf5ff; }
.addr-label { font-size: 11px; color: #909399; }
.addr-val { font-family: monospace; font-size: 12px; font-weight: 600; }
.sel-part { color: #e6a23c; }
.off-part { color: #409eff; }
.lin-color { color: #e6a23c !important; }
.phys-color { color: #67c23a !important; }
.addr-note {
  font-size: 11px; color: #909399;
  padding: 2px 4px;
  font-style: italic;
}

/* 变量行 */
.var-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  border-left: 2px solid transparent;
  transition: background 0.3s;
}
.var-name { color: #606266; font-family: monospace; }
.var-val { color: #303133; font-weight: 500; font-family: monospace; font-size: 11px; text-align: right; }

@keyframes var-flash {
  0%   { background: rgba(64,158,255,0.2); border-left-color: rgba(64,158,255,0.6); }
  100% { background: rgba(64,158,255,0.05); border-left-color: transparent; }
}
.var-row.var-changed { animation: var-flash 0.85s ease forwards; }

.explain-box {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

/* ─── 中栏 ─── */
.ml-center {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

/* 地址翻译流水线 */
.addr-pipeline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 12px 8px;
  background: #f5f7fa;
  border-radius: 8px;
  flex-shrink: 0;
}

.pipe-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid #e4e7ed;
  background: #fff;
  min-width: 90px;
  transition: all 0.3s;
}
.pipe-node.node-active { border-color: #409eff; box-shadow: 0 0 8px rgba(64,158,255,0.3); }
.logical-node { border-color: #409eff; }
.linear-node.node-active { border-color: #e6a23c; }
.physical-node.node-active { border-color: #67c23a; }
.node-label { font-size: 10px; color: #909399; font-weight: 600; }
.node-val { font-size: 12px; font-family: monospace; font-weight: 600; color: #303133; text-align: center; }

.pipe-arrow {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
  flex-shrink: 0;
}
.arrow-line {
  height: 2px;
  width: 100%;
  background: #dcdfe6;
  position: relative;
  transition: background 0.3s;
}
.pipe-arrow.arrow-active .arrow-line { background: #409eff; }
.arrow-label { font-size: 10px; color: #909399; font-weight: 600; margin-top: 2px; }
.arrow-sublabel { font-size: 9px; color: #c0c4cc; text-align: center; line-height: 1.3; }

/* 流动粒子 */
@keyframes flow-seg {
  0%   { left: 0; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { left: calc(100% - 6px); opacity: 0; }
}
@keyframes flow-page {
  0%   { left: 0; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { left: calc(100% - 6px); opacity: 0; }
}
.flow-dot {
  position: absolute;
  top: -2px;
  width: 6px; height: 6px;
  border-radius: 50%;
}
.seg-dot { background: #409eff; animation: flow-seg 1.2s ease-in-out infinite; }
.page-dot { background: #67c23a; animation: flow-page 1.2s ease-in-out infinite 0.3s; }

/* 场景区 */
.scene-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}
.scene-title {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f0f0;
}

/* ─── 右栏 ─── */
.ml-right {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

/* ─── 控制按钮 ─── */
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

/* ─── 详情卡片 ─── */
.detail-card {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px;
}
.dc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.dc-title { font-size: 14px; font-weight: 600; color: #303133; flex: 1; }
.dc-body { display: flex; gap: 16px; }
.dc-detail { flex: 1; font-size: 13px; color: #606266; line-height: 1.7; }
.dc-code {
  flex: 1;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 10px 12px;
  border-radius: 6px;
  font-family: 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
  overflow: auto;
  max-height: 200px;
  margin: 0;
}

/* ═══════════════════════════════════════
   场景样式
═══════════════════════════════════════ */

/* overview */
.sc-overview { display: flex; flex-direction: column; gap: 12px; }
.ov-compare { display: flex; align-items: center; gap: 12px; }
.ov-vs { font-size: 16px; font-weight: 700; color: #dcdfe6; flex-shrink: 0; }
.ov-mode { flex: 1; }
.ov-mode-title { font-size: 12px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.ov-flow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ov-box {
  padding: 4px 8px; border-radius: 4px; font-size: 11px;
  font-weight: 600; text-align: center; line-height: 1.4;
}
.ov-box.log { background: #ecf5ff; color: #409eff; border: 1px solid #b3d8ff; }
.ov-box.lin { background: #fdf6ec; color: #e6a23c; border: 1px solid #faecd8; }
.ov-box.phys { background: #f0f9eb; color: #67c23a; border: 1px solid #b3e19d; }
.ov-arrow { color: #909399; font-size: 14px; }
.ov-note { font-size: 11px; color: #909399; margin-top: 4px; }
.ov-regs { display: flex; flex-direction: column; gap: 4px; }
.ov-reg-item { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: #f5f7fa; border-radius: 4px; }
.ov-reg-name { font-family: monospace; font-size: 11px; font-weight: 700; color: #409eff; min-width: 60px; }
.ov-reg-desc { font-size: 11px; color: #606266; }

/* selector */
.sc-selector { display: flex; flex-direction: column; gap: 10px; }
.sel-title { font-size: 12px; font-weight: 600; color: #303133; }
.bit-field-row { display: flex; gap: 2px; }
.bf-seg {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 6px; border-radius: 4px; text-align: center;
}
.bf-seg.wide { flex: 6; background: #ecf5ff; border: 1px solid #b3d8ff; }
.bf-seg.narrow { flex: 1; background: #fdf6ec; border: 1px solid #faecd8; }
.bf-bits { font-size: 9px; color: #909399; font-family: monospace; }
.bf-name { font-size: 10px; font-weight: 600; color: #606266; }
.bf-val { font-size: 12px; font-weight: 700; font-family: monospace; }
.ti-gdt { color: #409eff; }
.ti-ldt { color: #f56c6c; }

.sel-decode { display: flex; flex-direction: column; gap: 4px; }
.sel-dec-row { display: flex; gap: 8px; align-items: center; font-size: 12px; padding: 3px 6px; background: #f5f7fa; border-radius: 4px; }
.sel-dec-label { font-family: monospace; font-weight: 700; color: #909399; min-width: 50px; }
.sel-dec-val { color: #303133; }

.sel-examples { display: flex; flex-direction: column; gap: 3px; }
.sel-ex-title { font-size: 11px; font-weight: 600; color: #909399; margin-bottom: 2px; }
.sel-ex-row { display: flex; gap: 8px; font-size: 11px; padding: 3px 6px; border-radius: 4px; border-left: 2px solid transparent; }
.sel-ex-row.sel-ex-active { background: #ecf5ff; border-left-color: #409eff; }
.sel-ex-val { font-family: monospace; font-weight: 600; color: #409eff; min-width: 50px; }
.sel-ex-desc { color: #606266; }

/* seg-desc */
.sc-segdesc { display: flex; flex-direction: column; gap: 10px; }
.sd-title { font-size: 12px; font-weight: 700; color: #303133; }
.sd-row { display: flex; gap: 4px; align-items: center; }
.sd-row-label { font-size: 10px; color: #909399; min-width: 36px; font-family: monospace; }
.sd-fields { display: flex; gap: 1px; flex: 1; }
.sd-field {
  display: flex; flex-direction: column; align-items: center;
  padding: 3px 2px; border-radius: 3px; cursor: default;
  transition: transform 0.1s; min-width: 0;
}
.sd-field:hover { transform: translateY(-2px); }
.sd-fname { font-size: 8px; color: #606266; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.sd-fval { font-size: 9px; font-family: monospace; font-weight: 700; }
.sd-base { background: #ecf5ff; }
.sd-limit { background: #fdf6ec; }
.sd-flag { background: #f0f9eb; }
.sd-dpl { background: #fef0f0; }
.sd-type { background: #f5f0fe; }
.sd-reserved { background: #f5f7fa; }
.sd-note { font-size: 10px; color: #909399; }
.sd-example { background: #f5f7fa; border-radius: 6px; padding: 8px; }
.sd-ex-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.sd-ex-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.sd-ex-row span:first-child { color: #909399; }
.sd-ex-row span:last-child { font-family: monospace; color: #303133; }

/* ldt */
.sc-ldt { display: flex; flex-direction: column; gap: 8px; }
.ldt-title { font-size: 12px; font-weight: 700; color: #303133; }
.ldt-formula {
  font-family: monospace; font-size: 11px;
  padding: 6px 10px; background: #fdf6ec;
  border-radius: 4px; border-left: 3px solid #e6a23c;
  color: #e6a23c;
}
.ldt-tasks { display: flex; flex-direction: column; gap: 6px; }
.ldt-task-row { display: flex; align-items: center; gap: 8px; }
.ldt-task-nr { font-size: 11px; font-family: monospace; font-weight: 600; color: #409eff; min-width: 52px; }
.ldt-task-bar-wrap { flex: 1; height: 16px; background: #f5f7fa; border-radius: 4px; overflow: hidden; position: relative; }
.ldt-task-bar { display: flex; height: 100%; }
.ldt-task-used { width: 10%; background: #409eff; opacity: 0.8; }
.ldt-task-unused { flex: 1; background: #f5f7fa; }
.ldt-task-info { display: flex; flex-direction: column; font-size: 10px; min-width: 100px; }
.ldt-base { color: #e6a23c; font-family: monospace; }
.ldt-limit { color: #909399; }
.ldt-note { font-size: 11px; color: #909399; }

/* seg-trans */
.sc-segtrans { display: flex; flex-direction: column; gap: 10px; }
.st-example {
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
  background: #f5f7fa;
  transition: all 0.3s;
}
.st-example.st-active { border-color: #409eff; background: #ecf5ff; }
.st-ex-title { font-size: 12px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.st-steps { display: flex; flex-direction: column; gap: 4px; }
.st-step {
  font-size: 11px; color: #c0c4cc;
  padding: 3px 6px; border-radius: 4px;
  transition: color 0.4s;
}
.st-step.st-done { color: #303133; }
.st-step-num { margin-right: 6px; font-weight: 700; }

/* linear-split */
.sc-linearsplit { display: flex; flex-direction: column; gap: 10px; }
.ls-title { font-size: 12px; font-weight: 700; color: #303133; }
.ls-addr { font-size: 12px; color: #606266; }
.ls-bits { display: flex; gap: 4px; align-items: stretch; }
.ls-sep { color: #dcdfe6; font-size: 16px; display: flex; align-items: center; }
.ls-seg {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 8px 4px;
  border-radius: 6px; text-align: center;
}
.pd-seg { background: #ecf5ff; border: 1px solid #b3d8ff; }
.pt-seg { background: #fdf6ec; border: 1px solid #faecd8; }
.off-seg { background: #f0f9eb; border: 1px solid #b3e19d; }
.ls-bit-range { font-size: 9px; color: #909399; font-family: monospace; }
.ls-seg-name { font-size: 10px; font-weight: 600; color: #303133; }
.ls-seg-bits { font-size: 9px; color: #909399; }
.ls-seg-val { font-size: 16px; font-weight: 700; font-family: monospace; }
.pd-seg .ls-seg-val { color: #409eff; }
.pt-seg .ls-seg-val { color: #e6a23c; }
.off-seg .ls-seg-val { color: #67c23a; }
.ls-seg-note { font-size: 9px; color: #909399; }

/* pde / pte */
.sc-pde, .sc-pte { display: flex; flex-direction: column; gap: 8px; }
.pde-title, .pte-title { font-size: 12px; font-weight: 700; color: #303133; }
.pde-bits, .pte-bits { display: flex; gap: 1px; }
.pde-field, .pte-field {
  display: flex; align-items: center; justify-content: center;
  padding: 6px 2px; border-radius: 3px; cursor: default;
  transition: transform 0.1s; min-height: 36px;
}
.pde-field:hover, .pte-field:hover { transform: translateY(-2px); }
.pde-fname, .pte-fname { font-size: 9px; font-weight: 600; color: #fff; text-align: center; word-break: break-all; }
.pde-addr, .pte-addr { background: #409eff; }
.pde-flag, .pte-flag { background: #67c23a; }
.pde-reserved, .pte-reserved { background: #dcdfe6; }
.pde-present, .pte-present { background: #f56c6c; }
.pde-bit-labels, .pte-bit-labels {
  display: flex; justify-content: space-between;
  font-size: 9px; color: #909399; font-family: monospace;
}
.pde-example, .pte-example {
  background: #f5f7fa; border-radius: 6px; padding: 8px;
}
.pde-ex-title, .pte-ex-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.pde-ex-val, .pte-ex-val { font-family: monospace; font-size: 14px; font-weight: 700; color: #409eff; margin-bottom: 4px; }
.pde-ex-note, .pte-ex-note { font-size: 10px; color: #909399; }
.pde-note, .pte-note { font-size: 10px; color: #909399; }

/* page-trans */
.sc-pagetrans { display: flex; flex-direction: column; gap: 8px; }
.pt-title { font-size: 12px; font-weight: 700; color: #303133; }
.pt-addr { font-size: 12px; color: #606266; }
.pt-steps { display: flex; flex-direction: column; gap: 6px; }
.pt-step {
  font-size: 11px; color: #c0c4cc;
  padding: 5px 8px; border-radius: 4px;
  transition: all 0.4s;
}
.pt-step.pt-done { color: #303133; background: #f0f9eb; }
.pt-num { margin-right: 6px; font-weight: 700; }
.pt-identity {
  margin-top: 4px; padding: 8px;
  border-radius: 6px; font-size: 12px; font-weight: 600;
  color: #c0c4cc; background: #f5f7fa;
  text-align: center; transition: all 0.4s;
}
.pt-identity.pt-done { color: #67c23a; background: #f0f9eb; border: 1px solid #b3e19d; }

/* fault */
.sc-fault { display: flex; flex-direction: column; gap: 8px; }
.fault-title { font-size: 12px; font-weight: 700; color: #303133; }
.fault-flow {
  display: flex; flex-direction: column;
  align-items: center; gap: 0;
}
.ff-node {
  padding: 6px 14px; border-radius: 6px;
  font-size: 11px; font-weight: 600; text-align: center;
  line-height: 1.4; width: 180px;
}
.ff-node.trigger { background: #fef0f0; border: 1px solid #fbc4c4; color: #f56c6c; }
.ff-node.handler { background: #fdf6ec; border: 1px solid #faecd8; color: #e6a23c; }
.ff-node.alloc { background: #ecf5ff; border: 1px solid #b3d8ff; color: #409eff; }
.ff-node.map { background: #f0f9eb; border: 1px solid #b3e19d; color: #67c23a; }
.ff-node.retry { background: #f5f0fe; border: 1px solid #d3aef7; color: #9b59b6; }
.ff-arrow { font-size: 11px; color: #909399; padding: 2px 0; }
.fault-note { display: flex; flex-direction: column; gap: 3px; }
.fault-note div { font-size: 11px; color: #606266; padding: 2px 6px; background: #f5f7fa; border-radius: 4px; font-family: monospace; }

/* get-page */
.sc-getpage { display: flex; flex-direction: column; gap: 8px; }
.gp-title { font-size: 12px; font-weight: 700; color: #303133; }
.gp-info { display: flex; gap: 16px; font-size: 11px; color: #606266; font-family: monospace; }
.mm-grid {
  display: grid;
  grid-template-columns: repeat(32, 1fr);
  gap: 1px;
}
.mm-cell {
  width: 100%; aspect-ratio: 1;
  border-radius: 1px;
  transition: all 0.05s;
}
.mm-kernel { background: #fbc4c4; }
.mm-buffer { background: #faecd8; }
.mm-free { background: #b3e19d; }
.mm-scan { background: #409eff !important; transform: scale(1.5); }
.mm-found { background: #f56c6c !important; box-shadow: 0 0 4px #f56c6c; }
.mm-legend { display: flex; gap: 12px; flex-wrap: wrap; }
.ml-item { font-size: 10px; color: #606266; display: flex; align-items: center; gap: 4px; }
.ml-item::before { content: ''; width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.ml-item.kernel::before { background: #fbc4c4; }
.ml-item.buffer::before { background: #faecd8; }
.ml-item.free::before { background: #b3e19d; }
.ml-item.scan-dot::before { background: #409eff; }
.ml-item.found-dot::before { background: #f56c6c; }

/* ═══ 右栏各场景样式 ═══ */
.rp-overview { display: flex; flex-direction: column; gap: 10px; }
.rp-struct { display: flex; flex-direction: column; gap: 4px; }
.rp-st-title { font-size: 11px; font-weight: 700; color: #409eff; margin-bottom: 2px; }
.rp-st-item { font-size: 11px; color: #606266; padding: 2px 6px; background: #f5f7fa; border-radius: 3px; }

.rp-gdt { display: flex; flex-direction: column; gap: 3px; }
.rp-gdt-title { font-size: 11px; font-weight: 700; color: #303133; margin-bottom: 4px; }
.rp-gdt-row { display: flex; gap: 4px; font-size: 10px; padding: 3px 4px; border-radius: 4px; border-left: 2px solid transparent; }
.rp-gdt-row.rp-gdt-active { background: #ecf5ff; border-left-color: #409eff; }
.rp-gdt-idx { font-family: monospace; color: #909399; min-width: 34px; }
.rp-gdt-sel { font-family: monospace; color: #409eff; min-width: 40px; }
.rp-gdt-desc { color: #606266; }

.rp-fields { display: flex; flex-direction: column; gap: 4px; }
.rp-f-title { font-size: 11px; font-weight: 700; color: #303133; margin-bottom: 2px; }
.rp-f-row { display: flex; gap: 6px; font-size: 11px; padding: 3px 4px; background: #f5f7fa; border-radius: 3px; }
.rp-f-name { font-family: monospace; font-weight: 700; color: #409eff; min-width: 40px; }
.rp-f-desc { color: #606266; }

.rp-code { display: flex; flex-direction: column; gap: 6px; }
.rp-code-title { font-size: 11px; font-weight: 700; color: #303133; }
.rp-code-block {
  background: #1e1e1e; color: #d4d4d4;
  padding: 8px; border-radius: 4px;
  font-size: 10px; font-family: monospace;
  line-height: 1.5; overflow: auto;
  margin: 0;
}

.rp-formula { display: flex; flex-direction: column; gap: 8px; }
.rp-formula-box {
  padding: 10px; background: #f5f7fa;
  border-radius: 6px; font-size: 12px; font-weight: 600;
  color: #303133; text-align: center; line-height: 1.6;
  border-left: 3px solid #409eff;
}
.rp-ex-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 4px; }
.rp-ex-row span:first-child { color: #909399; }
.rp-ex-row span:last-child { font-family: monospace; color: #303133; }

.rp-calc { display: flex; flex-direction: column; gap: 4px; }
.rp-calc-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 4px; background: #f5f7fa; border-radius: 3px; }
.rp-calc-row span:first-child { color: #909399; }
.rp-calc-row span:last-child { font-family: monospace; color: #303133; }

.rp-identity { display: flex; flex-direction: column; gap: 8px; }
.rp-id-desc { font-size: 11px; color: #606266; line-height: 1.7; padding: 8px; background: #f5f7fa; border-radius: 4px; font-family: monospace; }
.rp-id-verify {
  padding: 8px; background: #f0f9eb;
  border-radius: 4px; font-size: 12px; font-family: monospace;
  font-weight: 600; text-align: center;
}

.rp-memmap { display: flex; flex-direction: column; gap: 6px; }
.rp-mm-desc { font-size: 11px; color: #606266; line-height: 1.7; padding: 8px; background: #f5f7fa; border-radius: 4px; }
.rp-mm-zone { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #606266; }
.mm-z-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
.mm-z-dot.kernel { background: #fbc4c4; }
.mm-z-dot.buffer { background: #faecd8; }
.mm-z-dot.free { background: #b3e19d; }

/* CR 寄存器 */
.sc-crregs { display: flex; flex-direction: column; gap: 12px; }
.cr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cr-card { border: 1px solid #e4e7ed; border-radius: 6px; padding: 10px; transition: all .2s; }
.cr-key { border-width: 2px; }
.crc-name { font-size: 14px; font-weight: 700; font-family: monospace; margin-bottom: 4px; color: #909399; }
.crc-role { font-size: 10px; color: #606266; line-height: 1.5; margin-bottom: 6px; }
.crc-bits { display: flex; gap: 3px; margin-bottom: 6px; height: 48px; }
.crcb-bit { border: 1px solid; border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; text-align: center; }
.crcb-label { font-size: 10px; font-weight: 700; }
.crcb-pos   { font-size: 8px; color: #909399; font-family: monospace; }
.crcb-desc  { font-size: 8px; color: #606266; line-height: 1.3; }
.crc-when { font-size: 9px; color: #909399; background: #f5f7fa; border-radius: 3px; padding: 4px 6px; line-height: 1.5; }
.cr-timeline { background: #f5f7fa; border-radius: 4px; padding: 8px 10px; }
.crt-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 6px; }
.crt-steps { display: flex; flex-direction: column; gap: 5px; }
.crts-step { display: flex; align-items: center; gap: 8px; }
.crts-num  { width: 16px; height: 16px; border-radius: 50%; background: #409eff; color: #fff; font-size: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.crts-reg  { font-family: monospace; font-size: 11px; font-weight: 600; min-width: 70px; }
.crts-act  { font-size: 10px; color: #606266; }

/* CR3 右栏 */
.rp-cr3 { }
.rpc3-note { font-size: 10px; color: #606266; line-height: 1.6; margin-bottom: 8px; background: #f0fff4; border-radius: 4px; padding: 5px 7px; }
.rpc3-procs { border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
.rpc3-proc { padding: 7px 10px; }
.rpc3p-name { font-size: 11px; font-weight: 600; color: #303133; }
.rpc3p-cr3  { font-size: 10px; font-family: monospace; color: #67c23a; margin-top: 2px; }
.rpc3-arrow { text-align: center; font-size: 10px; color: #c0c4cc; padding: 4px; background: #f5f7fa; }
.rpc2-flow { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.rpc2-step { border: 1px solid #e4e7ed; border-radius: 3px; padding: 4px 8px; font-size: 9px; font-family: monospace; color: #303133; background: #f5f7fa; text-align: center; width: 90%; }
.rpc2-arrow { font-size: 10px; color: #e6a23c; }

/* why-seg */
.sc-whyseg { }
.ws-compare { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: start; }
.wsc-col { display: flex; flex-direction: column; gap: 8px; }
.wscc-title { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.wscc-chain { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.wscc-box { border: 1px solid #e4e7ed; border-radius: 4px; padding: 5px 10px; font-size: 10px; font-family: monospace; color: #303133; background: #f5f7fa; text-align: center; }
.lin-box  { border-color: #e6a23c44; background: #fffbf0; color: #e6a23c; font-weight: 600; }
.phys-box { border-color: #67c23a44; background: #f0fff4; color: #67c23a; font-weight: 600; }
.wscc-arrow { font-size: 10px; color: #c0c4cc; text-align: center; }
.wscc-why { border: 1px solid #e4e7ed; border-radius: 4px; padding: 7px 9px; background: #f5f7fa; }
.wsccw-title { font-size: 10px; font-weight: 600; color: #303133; margin-bottom: 5px; }
.wsccw-item { font-size: 10px; color: #606266; line-height: 1.7; }
.wsccw-item::before { content: '✓ '; color: #67c23a; }
.wsc-vs { font-size: 14px; font-weight: 600; color: #c0c4cc; align-self: center; }
.wscc-procs { display: flex; flex-direction: column; gap: 5px; }
.wscp-proc { border: 1px solid #e4e7ed; border-radius: 4px; padding: 5px 7px; }
.wscpp-hdr { font-size: 10px; font-weight: 600; margin-bottom: 3px; }
.wscpp-chain { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 9px; font-family: monospace; color: #606266; }
.wscpp-base { color: #9c27b0; }
.wscpp-off  { color: #409eff; }
.wscpp-lin  { font-weight: 600; }

/* why-seg 右栏 */
.rp-linear-map { }
.rplm-bar { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
.rplmb-slot { border: 1px solid; border-radius: 3px; padding: 5px 7px; }
.rplmbs-nr    { font-size: 10px; font-weight: 600; font-family: monospace; }
.rplmbs-range { font-size: 9px; color: #909399; font-family: monospace; }
.rplmb-rest { border: 1px dashed #e4e7ed; border-radius: 3px; padding: 5px 7px; text-align: center; font-size: 9px; color: #c0c4cc; }
.rplm-note { font-size: 9px; color: #909399; text-align: center; }
</style>
