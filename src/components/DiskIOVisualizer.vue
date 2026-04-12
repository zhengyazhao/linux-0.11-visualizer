<template>
  <div style="max-width: 1100px; margin: 0 auto">
    <div style="margin-bottom: 16px">
      <h2 style="font-size: 18px; font-weight: 600; color: #303133; margin-bottom: 4px">磁盘 I/O 与缓冲缓存</h2>
      <p style="color: #909399; font-size: 13px">fs/buffer.c — bread() 如何用 buffer_head 双索引避免每次读都碰磁盘</p>
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
      <!-- 左：调用链 + buffer 状态 -->
      <div class="panel-left">
        <div class="panel-title">I/O 调用链</div>
        <div class="call-chain">
          <div v-for="node in callChain" :key="node.name" class="cc-node"
            :class="{ 'cc-active': currentStep.activeLayer === node.id }"
            :style="currentStep.activeLayer === node.id ? `border-color:${node.color};background:${node.color}15` : ''">
            <span class="cc-name" :style="currentStep.activeLayer === node.id ? `color:${node.color}` : ''">{{ node.name }}</span>
            <span class="cc-src">{{ node.src }}</span>
          </div>
        </div>

        <div style="margin-top: 14px">
          <div class="panel-title">buffer_head 状态位</div>
          <div class="bh-flags">
            <div v-for="fl in bhFlags" :key="fl.name" class="bhf-row"
              :class="{ 'bhf-active': currentStep.highlightFlag === fl.name }">
              <span class="bhf-name">{{ fl.name }}</span>
              <span class="bhf-desc">{{ fl.desc }}</span>
            </div>
          </div>
        </div>

        <div style="margin-top: 14px">
          <div class="panel-title">速度对比</div>
          <div class="speed-rows">
            <div class="spd-row">
              <span class="spd-label">内存访问</span>
              <div class="spd-bar spd-fast" style="width:12px"></div>
              <span class="spd-val">~100 ns</span>
            </div>
            <div class="spd-row">
              <span class="spd-label">SSD 读取</span>
              <div class="spd-bar spd-mid" style="width:50px"></div>
              <span class="spd-val">~100 µs</span>
            </div>
            <div class="spd-row">
              <span class="spd-label">HDD 寻道</span>
              <div class="spd-bar spd-slow" style="width:110px"></div>
              <span class="spd-val">~10 ms</span>
            </div>
          </div>
          <div style="font-size:9px;color:#909399;margin-top:4px">HDD vs 内存 = 10万倍差距</div>
        </div>
      </div>

      <!-- 中：主可视化 -->
      <div class="panel-center">
        <div class="step-title">{{ currentStep.title }}</div>

        <!-- 总览：完整 I/O 路径图 -->
        <template v-if="currentStep.scene === 'overview'">
          <div class="io-overview">
            <div class="iov-layer user-layer">
              <div class="iovl-title">用户进程</div>
              <div class="iovl-call">read(fd, buf, n)</div>
            </div>
            <div class="iov-arrow">↓ 系统调用 int 0x80</div>
            <div class="iov-layer vfs-layer">
              <div class="iovl-title">VFS</div>
              <div class="iovl-call">sys_read() → file_read()</div>
            </div>
            <div class="iov-arrow">↓</div>
            <div class="iov-cache">
              <div class="iovc-title">Buffer Cache（内核内存）</div>
              <div class="iovc-body">
                <div class="iovc-hit">
                  <div class="iovc-label">命中</div>
                  <div class="iovc-bh">buffer_head<br><span style="font-size:9px;color:#67c23a">b_uptodate=1</span></div>
                </div>
                <div class="iovc-miss">
                  <div class="iovc-label">未命中</div>
                  <div class="iovc-bh" style="border-color:#f56c6c;color:#f56c6c">buffer_head<br><span style="font-size:9px">b_uptodate=0</span></div>
                </div>
              </div>
              <div class="iovc-note">getblk() 先查 hash 表 → 未命中才向下</div>
            </div>
            <div class="iov-arrow iov-miss-arrow">↓ 仅在未命中时</div>
            <div class="iov-layer blk-layer">
              <div class="iovl-title">块设备层</div>
              <div class="iovl-call">ll_rw_block() → make_request() → request 队列</div>
            </div>
            <div class="iov-arrow">↓ 磁盘中断</div>
            <div class="iov-layer disk-layer">
              <div class="iovl-title">磁盘硬件</div>
              <div class="iovl-call">IDE 控制器 / 中断 IRQ14</div>
            </div>
          </div>
        </template>

        <!-- buffer_head 结构 -->
        <template v-else-if="currentStep.scene === 'bh-struct'">
          <div class="field-detail">
            <div class="fd-struct">
              <div class="fds-title">/* fs/buffer.c — struct buffer_head */</div>
              <div v-for="f in bhFields" :key="f.name" class="fds-row"
                :class="{ 'fds-highlight': currentStep.highlightFields?.includes(f.name) }">
                <span class="fds-type">{{ f.type }}</span>
                <span class="fds-name">{{ f.name }}</span>
                <span class="fds-comment">// {{ f.comment }}</span>
              </div>
            </div>
            <div class="fd-diagram">
              <div class="fdd-title">buffer_head 与物理内存的关系</div>
              <div class="bh-mem-diagram">
                <div class="bhmd-meta">
                  <div class="bhmd-title">struct buffer_head</div>
                  <div class="bhmd-field">b_data ──────────┐</div>
                  <div class="bhmd-field">b_blocknr = 47  │</div>
                  <div class="bhmd-field">b_dev = 0x301   │</div>
                  <div class="bhmd-field">b_uptodate = 1  │</div>
                  <div class="bhmd-field">b_dirt = 0      │</div>
                  <div class="bhmd-field">b_count = 1     │</div>
                </div>
                <div class="bhmd-arrow">→</div>
                <div class="bhmd-data">
                  <div class="bhmd-title">1KB 数据块</div>
                  <div class="bhmd-block">
                    <div class="bhdb-row" v-for="i in 4" :key="i">
                      {{ ['inode数据', '目录项', '文件内容', '...'][i-1] }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="fdd-note">每个 buffer_head 描述一个 1KB 的磁盘块缓冲区。b_data 指向实际数据，b_blocknr 是磁盘块号，(b_dev, b_blocknr) 组合唯一标识一个块。</div>
            </div>
          </div>
        </template>

        <!-- 双索引：hash + freelist -->
        <template v-else-if="currentStep.scene === 'hash-freelist'">
          <div class="dual-index">
            <div class="di-hash">
              <div class="di-title">Hash 表（快速查找）</div>
              <div class="hash-table">
                <div class="ht-desc">hash(dev, block) 决定桶号</div>
                <div class="ht-buckets">
                  <div v-for="(bucket, i) in hashBuckets" :key="i" class="ht-bucket">
                    <div class="htb-idx">[{{ i }}]</div>
                    <div class="htb-chain">
                      <div v-if="bucket.length === 0" class="htb-null">NULL</div>
                      <div v-for="bh in bucket" :key="bh.id" class="htb-bh"
                        :class="{ 'htb-highlight': bh.highlight }">
                        bh({{ bh.dev }},{{ bh.blk }})
                      </div>
                    </div>
                  </div>
                </div>
                <div class="ht-formula">桶号 = (dev ^ block) % NR_HASH</div>
              </div>
            </div>
            <div class="di-lru">
              <div class="di-title">Freelist（LRU 淘汰）</div>
              <div class="lru-list">
                <div class="lru-desc">双向链表，按访问时间排序</div>
                <div class="lru-chain">
                  <div class="lruc-head">HEAD<br><span style="font-size:8px">(最久未用)</span></div>
                  <div class="lruc-arrow">→</div>
                  <div v-for="(bh, i) in lruItems" :key="i" class="lruc-bh"
                    :class="{ 'lruc-dirty': bh.dirty }">
                    <div class="lrucb-id">bh{{ i+1 }}</div>
                    <div class="lrucb-state">{{ bh.dirty ? 'dirty' : 'clean' }}</div>
                  </div>
                  <div class="lruc-arrow">→</div>
                  <div class="lruc-tail">TAIL<br><span style="font-size:8px">(最近用)</span></div>
                </div>
                <div class="lru-note">getblk() 从 HEAD 取空闲块；brelse() 将块放回 TAIL；dirty 块必须先写回磁盘才能回收</div>
              </div>
            </div>
          </div>
        </template>

        <!-- getblk() 流程 -->
        <template v-else-if="currentStep.scene === 'getblk'">
          <div class="flow-diagram">
            <div class="fld-title">getblk(dev, block) 执行路径</div>
            <div class="fld-steps">
              <div v-for="(s, i) in getblkSteps" :key="i" class="flds-step"
                :class="{ 'flds-active': currentStep.activeFlowStep === i, 'flds-hit': s.isHit, 'flds-miss': s.isMiss }">
                <div class="fldss-num">{{ i + 1 }}</div>
                <div class="fldss-body">
                  <div class="fldss-title">{{ s.title }}</div>
                  <div class="fldss-code">{{ s.code }}</div>
                  <div v-if="s.note" class="fldss-note">{{ s.note }}</div>
                </div>
                <div v-if="s.result" class="fldss-result" :class="s.isHit ? 'res-hit' : 'res-miss'">{{ s.result }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- bread() 命中路径 -->
        <template v-else-if="currentStep.scene === 'bread-hit'">
          <div class="timeline-panel">
            <div class="tl-header">
              <div class="tlh-col">应用进程</div>
              <div class="tlh-col">内核 bread()</div>
              <div class="tlh-col">磁盘</div>
            </div>
            <div v-for="(row, i) in breadHitRows" :key="i">
              <div v-if="row.type === 'divider'" class="tl-divider" :class="row.style">{{ row.text }}</div>
              <div v-else class="tl-row">
                <div class="tlr-app">
                  <div v-if="row.app" class="tlr-call" :class="row.app.style">{{ row.app.text }}</div>
                </div>
                <div class="tlr-kernel">
                  <div v-if="row.kernel" class="tlr-act" :class="row.kernel.style">{{ row.kernel.text }}</div>
                </div>
                <div class="tlr-disk">
                  <div v-if="row.disk" class="tlr-disk-act">{{ row.disk }}</div>
                </div>
              </div>
            </div>
            <div class="tl-result hit-result">命中路径：0 次磁盘 I/O，纯内存操作，ns 级返回</div>
          </div>
        </template>

        <!-- ll_rw_block() 未命中 + request 队列 -->
        <template v-else-if="currentStep.scene === 'll-rw-block'">
          <div class="timeline-panel">
            <div class="tl-header">
              <div class="tlh-col">应用进程</div>
              <div class="tlh-col">内核块设备层</div>
              <div class="tlh-col">磁盘硬件</div>
            </div>
            <div v-for="(row, i) in llRwRows" :key="i">
              <div v-if="row.type === 'divider'" class="tl-divider" :class="row.style">{{ row.text }}</div>
              <div v-else class="tl-row">
                <div class="tlr-app">
                  <div v-if="row.app" class="tlr-call" :class="row.app.style">{{ row.app.text }}</div>
                </div>
                <div class="tlr-kernel">
                  <div v-if="row.kernel" class="tlr-act" :class="row.kernel.style">{{ row.kernel.text }}</div>
                </div>
                <div class="tlr-disk">
                  <div v-if="row.disk" class="tlr-disk-act">{{ row.disk }}</div>
                </div>
              </div>
            </div>
            <div class="req-queue-note">
              <div class="rqn-title">struct request 队列（电梯算法排序）</div>
              <div class="rqn-items">
                <div v-for="(r, i) in reqQueue" :key="i" class="rqn-item" :class="{ 'rqn-current': r.current }">
                  req[{{ i }}]: dev={{ r.dev }}, block={{ r.block }}{{ r.current ? ' ← 当前处理' : '' }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 寻址原理：位宽决定上限 -->
        <template v-else-if="currentStep.scene === 'disk-addr'">
          <div class="addr-diagram">
            <div class="addr-rule">
              <span class="adr-label">统一规律：</span>
              <span class="adr-formula">索引/地址位数 = N &nbsp;→&nbsp; 最大可寻址空间 = 2<sup>N</sup> × 单位大小</span>
              <span class="adr-sub">硬件接口、文件系统、内核各自有独立的位宽限制，取最小值</span>
            </div>

            <div class="addr-cols">
              <!-- 左：三层嵌套限制图 -->
              <div class="addr-col">
                <div class="adrc-title" style="color:#303133">Linux 0.11 磁盘容量：三层叠加限制</div>
                <div class="three-layers">
                  <!-- 最外层：b_blocknr -->
                  <div class="tl-layer tl-soft">
                    <div class="tll-header">
                      <span class="tll-name">内核 buffer cache</span>
                      <span class="tll-limit">b_blocknr: 32位 → 理论 4 TB</span>
                    </div>
                    <div class="tll-src">unsigned long b_blocknr（不是瓶颈）</div>
                    <!-- 中层：CHS -->
                    <div class="tl-layer tl-hw">
                      <div class="tll-header">
                        <span class="tll-name">硬件 CHS 寻址</span>
                        <span class="tll-limit tll-warn">10+4+6 位 → 504 MB</span>
                      </div>
                      <div class="tll-src">BIOS INT 13h 接口位宽限制</div>
                      <div class="chs-bits" style="margin:6px 0">
                        <div class="chsb-field" style="flex:10;border-color:#9c27b0;background:#9c27b015">
                          <div class="chsbf-bits">10位</div>
                          <div class="chsbf-name">Cyl</div>
                        </div>
                        <div class="chsb-field" style="flex:4;border-color:#e6a23c;background:#e6a23c15">
                          <div class="chsbf-bits">4位</div>
                          <div class="chsbf-name">Head</div>
                        </div>
                        <div class="chsb-field" style="flex:6;border-color:#67c23a;background:#67c23a15">
                          <div class="chsbf-bits">6位</div>
                          <div class="chsbf-name">Sec</div>
                        </div>
                      </div>
                      <!-- 最内层：Minix FS -->
                      <div class="tl-layer tl-fs">
                        <div class="tll-header">
                          <span class="tll-name">Minix 文件系统</span>
                          <span class="tll-limit tll-crit">zone_t: 16位 → 64 MB ← 真正瓶颈</span>
                        </div>
                        <div class="tll-src">typedef unsigned short zone_t</div>
                        <div class="tll-body">
                          <div class="tllb-row">
                            <span class="tllb-key">zone 号范围：</span>
                            <span class="tllb-val">0 ~ 65535（2¹⁶ - 1）</span>
                          </div>
                          <div class="tllb-row">
                            <span class="tllb-key">每 zone 大小：</span>
                            <span class="tllb-val">1 KB（BLOCK_SIZE）</span>
                          </div>
                          <div class="tllb-row">
                            <span class="tllb-key">文件系统上限：</span>
                            <span class="tllb-val tllb-crit">65536 × 1KB = 64 MB</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="overflow-note">
                  <div class="ovn-title">磁盘"太大"时会怎样？</div>
                  <div class="ovn-row">
                    <span class="ovn-label">超出 504MB（CHS）：</span>
                    <span class="ovn-val">那些柱面的扇区根本生成不了地址，永久不可见</span>
                  </div>
                  <div class="ovn-row">
                    <span class="ovn-label">超出 64MB（Minix）：</span>
                    <span class="ovn-val">zone 号装不下，格式化时直接忽略，文件只能存前 64MB</span>
                  </div>
                </div>
              </div>

              <!-- 右：各层对比表 + 内存类比 -->
              <div class="addr-col">
                <div class="adrc-title" style="color:#2980b9">各层限制对比</div>
                <div class="limit-table">
                  <div class="limt-header">
                    <span>层次</span><span>位宽</span><span>上限</span><span>来源</span>
                  </div>
                  <div v-for="row in limitRows" :key="row.layer" class="limt-row"
                    :class="{ 'limt-crit': row.isCrit }">
                    <span class="limtr-layer">{{ row.layer }}</span>
                    <span class="limtr-bits">{{ row.bits }}</span>
                    <span class="limtr-max" :style="`color:${row.color}`">{{ row.max }}</span>
                    <span class="limtr-src">{{ row.src }}</span>
                  </div>
                </div>

                <div class="adrc-title" style="color:#2980b9;margin-top:12px">内存寻址：同一原理</div>
                <div class="mem-addr-table">
                  <div class="mat-header">
                    <span>模式</span><span>位数</span><span>上限</span>
                  </div>
                  <div v-for="row in memAddrRows" :key="row.mode" class="mat-row"
                    :class="{ 'mat-highlight': row.highlight }">
                    <div class="matr-mode">{{ row.mode }}</div>
                    <div class="matr-bits">
                      <div class="matrb-bar">
                        <div class="matrb-fill" :style="`width:${row.barW}%;background:${row.color}`"></div>
                      </div>
                      <span class="matrb-num">{{ row.bits }}</span>
                    </div>
                    <div class="matr-max" :style="`color:${row.color}`">{{ row.max }}</div>
                  </div>
                </div>

                <div class="ide-port" style="margin-top:8px">
                  <div class="idep-title">IDE 数据通路宽度：16 位</div>
                  <div class="idep-body">insw 每次 2 字节，读 512B 扇区需循环 256 次<br>CPU 32 位 ≠ 数据通路 16 位，是独立概念</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 磁盘中断与唤醒 -->
        <template v-else-if="currentStep.scene === 'disk-interrupt'">
          <div class="interrupt-diagram">
            <div class="intd-title">磁盘中断处理链</div>
            <div class="intd-flow">
              <div v-for="(step, i) in intSteps" :key="i" class="intd-step"
                :class="{ 'intds-highlight': step.highlight }">
                <div class="intds-num">{{ i + 1 }}</div>
                <div class="intds-body">
                  <div class="intds-title">{{ step.title }}</div>
                  <div class="intds-code">{{ step.code }}</div>
                </div>
                <div v-if="i < intSteps.length - 1" class="intds-arrow">↓</div>
              </div>
            </div>
            <div class="intd-note">
              <div class="intn-row">
                <span class="intn-key">进程状态变化：</span>
                <span class="intn-val">TASK_UNINTERRUPTIBLE → TASK_RUNNING（被 wake_up 放回就绪队列）</span>
              </div>
              <div class="intn-row">
                <span class="intn-key">关键标志：</span>
                <span class="intn-val">b_uptodate=1（数据有效），b_lock=0（解锁），唤醒 b_wait 等待队列</span>
              </div>
            </div>
          </div>
        </template>

        <!-- 脏缓冲与回写 -->
        <template v-else-if="currentStep.scene === 'dirty-writeback'">
          <div class="writeback-diagram">
            <div class="wb-title">Write 路径：何时数据真正到磁盘？</div>
            <div class="wb-flow">
              <div class="wb-write">
                <div class="wbw-title">应用 write()</div>
                <div class="wbw-path">
                  <div class="wbwp-step">write(fd, buf, n)</div>
                  <div class="wbwp-arrow">↓</div>
                  <div class="wbwp-step">file_write() → bread()</div>
                  <div class="wbwp-arrow">↓</div>
                  <div class="wbwp-step highlight-step">修改 buffer_head 数据<br>b_dirt = 1（标记脏）</div>
                  <div class="wbwp-arrow">↓</div>
                  <div class="wbwp-step">brelse() → 放回 freelist</div>
                  <div class="wbwp-note">write() 返回！此时数据仍在内存</div>
                </div>
              </div>
              <div class="wb-sync">
                <div class="wbs-title">何时真正落盘？</div>
                <div class="wbs-triggers">
                  <div v-for="t in syncTriggers" :key="t.name" class="wbst-item">
                    <div class="wbsti-name">{{ t.name }}</div>
                    <div class="wbsti-desc">{{ t.desc }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="wb-dirty-chain">
              <div class="wbdc-title">脏块回写路径：</div>
              <div class="wbdc-flow">
                <span class="wbdcf-node dirty-node">b_dirt=1 buffer</span>
                <span class="wbdcf-arrow">→ ll_rw_block(WRITE) →</span>
                <span class="wbdcf-node">request 队列</span>
                <span class="wbdcf-arrow">→ 磁盘写完中断 →</span>
                <span class="wbdcf-node clean-node">b_dirt=0 b_uptodate=1</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 右：源码引用 + 说明 -->
      <div class="panel-right">
        <div class="panel-title">源码位置</div>
        <div class="pr-src">{{ currentStep.srcRef }}</div>
        <div v-if="currentStep.rightContent?.length" class="pr-items">
          <div v-for="item in currentStep.rightContent" :key="item.label" class="pri-row">
            <span class="pri-label">{{ item.label }}</span>
            <span class="pri-text">{{ item.text }}</span>
          </div>
        </div>
        <div v-if="currentStep.code" class="pr-code">
          <pre>{{ currentStep.code }}</pre>
        </div>
      </div>
    </div>

    <!-- 控制 -->
    <div class="controls">
      <el-button size="small" @click="prev" :disabled="currentIdx === 0">← 上一步</el-button>
      <el-button size="small" type="primary" @click="togglePlay">{{ playing ? '⏸ 暂停' : '▶ 自动播放' }}</el-button>
      <el-button size="small" @click="next" :disabled="currentIdx === steps.length - 1">下一步 →</el-button>
      <el-button size="small" @click="goTo(0)">↺ 重置</el-button>
      <span style="font-size:12px;color:#909399;margin-left:8px">{{ currentIdx + 1 }} / {{ steps.length }}</span>
    </div>

    <!-- 详情卡片 -->
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

const phases = ['总览', '数据结构', '读路径', '写路径']

const callChain = [
  { id: 'user',   name: 'read(fd, buf, n)',          src: 'libc',              color: '#409eff' },
  { id: 'vfs',    name: 'sys_read() / file_read()',  src: 'fs/read_write.c',   color: '#67c23a' },
  { id: 'bread',  name: 'bread() / getblk()',        src: 'fs/buffer.c',       color: '#e6a23c' },
  { id: 'llrw',   name: 'll_rw_block() / make_request()', src: 'drivers/block/ll_rw_blk.c', color: '#f56c6c' },
  { id: 'disk',   name: 'IDE 中断 / end_request()',  src: 'drivers/block/hd.c',color: '#9c27b0' },
]

const bhFlags = [
  { name: 'b_uptodate', desc: '数据与磁盘一致（=1 可直接用）' },
  { name: 'b_dirty',    desc: '内存已修改，磁盘未更新（=1 需回写）' },
  { name: 'b_lock',     desc: 'I/O 进行中（=1 其他读写需等待）' },
  { name: 'b_req',      desc: '已提交到 request 队列' },
]

const bhFields = [
  { type: 'char *',              name: 'b_data',     comment: '指向 1KB 数据块的内核地址' },
  { type: 'unsigned long',       name: 'b_blocknr',  comment: '磁盘逻辑块号（从分区起点计算）' },
  { type: 'unsigned short',      name: 'b_dev',      comment: '设备号（0x301 = /dev/hda1）' },
  { type: 'unsigned char',       name: 'b_uptodate', comment: '=1 表示数据有效，可直接返回' },
  { type: 'unsigned char',       name: 'b_dirt',     comment: '=1 表示数据被修改，需回写磁盘' },
  { type: 'unsigned char',       name: 'b_count',    comment: '引用计数，=0 才可被 LRU 回收' },
  { type: 'unsigned char',       name: 'b_lock',     comment: '=1 表示 I/O 进行中，需等待' },
  { type: 'struct task_struct *',name: 'b_wait',     comment: '等待此缓冲区的进程队列头' },
  { type: 'struct buffer_head *',name: 'b_prev',     comment: '同一 hash 桶内的前向指针' },
  { type: 'struct buffer_head *',name: 'b_next',     comment: '同一 hash 桶内的后向指针' },
  { type: 'struct buffer_head *',name: 'b_prev_free',comment: 'freelist 双向链表前向指针' },
  { type: 'struct buffer_head *',name: 'b_next_free',comment: 'freelist 双向链表后向指针' },
]

const hashBuckets = [
  [{ id: 'bh1', dev: '0x301', blk: '47', highlight: true }, { id: 'bh2', dev: '0x301', blk: '115', highlight: false }],
  [],
  [{ id: 'bh3', dev: '0x302', blk: '8', highlight: false }],
  [],
  [{ id: 'bh4', dev: '0x301', blk: '4', highlight: false }],
  [],
]

const lruItems = [
  { dirty: false },
  { dirty: true },
  { dirty: false },
  { dirty: false },
  { dirty: true },
]

const getblkSteps = [
  {
    title: '计算 hash 桶号',
    code: 'h = _hashfn(dev, block) % NR_HASH',
    note: 'NR_HASH = 307（素数，减少碰撞）',
    isHit: false, isMiss: false,
  },
  {
    title: '遍历 hash 链：查找 (dev, block)',
    code: 'bh = hash_table[h];\nwhile (bh && (bh->b_dev!=dev || bh->b_blocknr!=block))\n    bh = bh->b_next;',
    isHit: false, isMiss: false,
  },
  {
    title: '命中：等待 b_lock 解除后返回',
    code: 'if (bh) {\n    wait_on_buffer(bh);\n    bh->b_count++;\n    return bh;\n}',
    result: '✓ 缓存命中，无磁盘 I/O',
    isHit: true, isMiss: false,
  },
  {
    title: '未命中：从 freelist 取最久未用的 clean 块',
    code: 'tmp = free_list;\ndo {\n    if (!tmp->b_count)\n        if (!bh || BADNESS(tmp)<BADNESS(bh))\n            bh = tmp;\n} while ((tmp=tmp->b_next_free) != free_list);',
    note: 'dirty 块 BADNESS 更高，优先取 clean 块',
    isHit: false, isMiss: false,
  },
  {
    title: '取到 bh：若 dirty 先写回，再重置插入新 hash',
    code: 'if (bh->b_dirt) ll_rw_block(WRITE, bh);\nremove_from_queues(bh);\nbh->b_dev = dev;\nbh->b_blocknr = block;\nbh->b_uptodate = 0;\ninsert_into_queues(bh);\nreturn bh;',
    result: '✗ 缓存未命中，需发起磁盘读',
    isHit: false, isMiss: true,
  },
]

const breadHitRows = [
  { app: { text: 'bread(dev=0x301, block=47)', style: 'call-style' } },
  { kernel: { text: 'getblk(dev, block)', style: 'kernel-style' } },
  { kernel: { text: 'hash_table 查找命中 bh', style: 'kernel-style' } },
  { type: 'divider', text: 'b_uptodate = 1', style: 'ok-div' },
  { kernel: { text: 'wait_on_buffer(bh) — b_lock=0，无需等待', style: 'kernel-style' } },
  { kernel: { text: 'bh->b_count++', style: 'kernel-style' } },
  { kernel: { text: 'return bh（指向 1KB 数据块）', style: 'kernel-ok' } },
  { app: { text: 'copy_to_user(buf, bh->b_data, n)', style: 'call-style' } },
  { app: { text: 'brelse(bh)  // 释放引用', style: 'call-style' } },
]

const llRwRows = [
  { app: { text: 'bread(dev=0x301, block=99)', style: 'call-style' } },
  { kernel: { text: 'getblk() → 未命中，取空闲 bh', style: 'kernel-style' } },
  { kernel: { text: 'll_rw_block(READ, bh)', style: 'kernel-style' } },
  { kernel: { text: 'make_request() → 加入 request 队列', style: 'kernel-style' } },
  { type: 'divider', text: '进程调用 sleep_on(&bh->b_wait)', style: 'wait-div' },
  { app: { text: '（进程变为 TASK_UNINTERRUPTIBLE）', style: 'wait-style' } },
  { disk: '磁盘寻道 + 旋转等待 ~10ms' },
  { disk: '读取 1KB 数据 → DMA 传输到 bh->b_data' },
  { disk: '触发 IRQ14 磁盘中断' },
  { type: 'divider', text: '中断处理：end_request()', style: 'ok-div' },
  { kernel: { text: 'bh->b_uptodate = 1', style: 'kernel-ok' } },
  { kernel: { text: 'wake_up(&bh->b_wait)', style: 'kernel-ok' } },
  { app: { text: '进程恢复运行', style: 'call-style' } },
  { app: { text: 'copy_to_user(buf, bh->b_data, n)', style: 'call-style' } },
]

const reqQueue = [
  { dev: '0x301', block: '12',  current: false },
  { dev: '0x301', block: '47',  current: true  },
  { dev: '0x301', block: '99',  current: false },
  { dev: '0x302', block: '8',   current: false },
]

const intSteps = [
  { title: '磁盘控制器 DMA 完成', code: 'IDE 控制器通过 DMA 将扇区数据写入 bh->b_data', highlight: false },
  { title: '触发 IRQ14 中断', code: 'CPU 保存现场，跳转到中断向量 hd_interrupt()', highlight: false },
  { title: 'end_request(1) — 标记成功', code: 'bh->b_uptodate = 1;\nbh->b_dirt = 0;\nunlock_buffer(bh);  // b_lock=0', highlight: true },
  { title: 'wake_up(&bh->b_wait)', code: '// 唤醒 sleep_on(&bh->b_wait) 等待的进程\n// 进程状态变为 TASK_RUNNING', highlight: true },
  { title: '处理队列下一项', code: 'do_request();  // 继续处理 request 队列中的下一个请求', highlight: false },
]

const limitRows = [
  { layer: 'Minix FS zone_t', bits: '16 位', max: '64 MB',  color: '#f56c6c', src: '文件系统',  isCrit: true  },
  { layer: 'CHS（BIOS）',     bits: '20 位', max: '504 MB', color: '#e6a23c', src: '硬件接口',  isCrit: false },
  { layer: 'b_blocknr',       bits: '32 位', max: '4 TB',   color: '#67c23a', src: '内核软件', isCrit: false },
]

const memAddrRows = [
  { mode: '8086 实模式',        bits: '20 位', max: '1 MB',    color: '#909399', barW: 20,  highlight: false },
  { mode: 'x86 保护模式 32 位', bits: '32 位', max: '4 GB',    color: '#409eff', barW: 48,  highlight: true  },
  { mode: 'x86 PAE',            bits: '36 位', max: '64 GB',   color: '#67c23a', barW: 62,  highlight: false },
  { mode: 'x86-64 物理',        bits: '52 位', max: '4 PB',    color: '#e6a23c', barW: 85,  highlight: false },
  { mode: 'x86-64 虚拟',        bits: '48 位', max: '256 TB',  color: '#9c27b0', barW: 72,  highlight: false },
]

const syncTriggers = [
  { name: 'sync()',      desc: '手动同步所有脏缓冲区到磁盘' },
  { name: 'fsync(fd)',   desc: '同步单个文件的所有数据和元数据' },
  { name: 'umount()',    desc: '卸载文件系统前强制回写所有脏块' },
  { name: '系统关机',    desc: 'sys_sync() 在 halt/reboot 前调用' },
  { name: '缓冲区回收', desc: 'getblk() 找不到 clean 块时，先写回 dirty 块' },
]

const steps = [
  {
    phaseIdx: 0, tagType: 'info',
    activeLayer: null,
    title: '为什么需要 Buffer Cache：磁盘比内存慢 10 万倍',
    srcRef: 'fs/buffer.c:1 — init_buffer()',
    scene: 'overview',
    explain: '机械硬盘平均寻道时间约 10ms，内存访问约 100ns，差距高达 10 万倍。如果每次 read() 都直接访问磁盘，即使是顺序读文件也会极慢。Buffer Cache 是内核在主内存中开辟的块缓冲区池，以 1KB 磁盘块为单位缓存最近读写的数据。再次访问同一块时直接从内存返回，完全绕过磁盘。Linux 0.11 中 buffer cache 由 buffer_start 到 buffer_end 之间的内存区域构成，大小在 main() 初始化时确定。',
    rightContent: [
      { label: '位置', text: 'buffer_start ~ buffer_end（main()初始化时划定）' },
      { label: '块大小', text: '1024 字节（BLOCK_SIZE=1024）' },
      { label: '索引', text: 'hash 表（快速查找）+ freelist（LRU淘汰）' },
      { label: '核心函数', text: 'bread() → getblk() → ll_rw_block()' },
    ],
  },
  {
    phaseIdx: 1, tagType: 'warning',
    activeLayer: 'bread',
    highlightFields: ['b_data', 'b_blocknr', 'b_dev', 'b_uptodate'],
    title: 'struct buffer_head：描述一个 1KB 缓冲块的元数据',
    srcRef: 'include/linux/fs.h — struct buffer_head',
    scene: 'bh-struct',
    explain: 'struct buffer_head 是 buffer cache 的核心数据结构，每个 1KB 缓冲块都有一个对应的 buffer_head。b_data 指向实际数据内存；(b_dev, b_blocknr) 组合唯一标识这块缓冲区对应的磁盘块；b_uptodate=1 表示数据与磁盘一致，可以直接使用；b_dirt=1 表示内存数据比磁盘新，需要写回；b_lock=1 表示正在进行 I/O，其他进程需 wait_on_buffer() 等待；b_count 是引用计数，大于 0 时不能被 LRU 回收。',
    code: `// include/linux/fs.h
struct buffer_head {
    char * b_data;            /* 数据块指针 */
    unsigned long b_blocknr;  /* 磁盘块号 */
    unsigned short b_dev;     /* 设备号 */
    unsigned char b_uptodate; /* 是否有效 */
    unsigned char b_dirt;     /* 是否脏 */
    unsigned char b_count;    /* 引用计数 */
    unsigned char b_lock;     /* I/O 锁 */
    struct task_struct * b_wait;
    struct buffer_head * b_prev;
    struct buffer_head * b_next;
    struct buffer_head * b_prev_free;
    struct buffer_head * b_next_free;
};`,
  },
  {
    phaseIdx: 1, tagType: 'warning',
    activeLayer: 'bread',
    title: '双索引：Hash 表快速查找 + Freelist LRU 淘汰',
    srcRef: 'fs/buffer.c — hash_table[] + free_list',
    scene: 'hash-freelist',
    explain: 'Buffer cache 维护两套索引，各司其职。Hash 表：用 (dev, block) 哈希到桶，查找时间 O(1)，内核用素数 NR_HASH=307 减少碰撞。Freelist：全部 buffer_head 组成双向链表，按 LRU 顺序排列——最久未使用的在链表头，最近使用的在链表尾。需要分配新缓冲区时从头部取；brelse() 释放时将 buffer_head 移到尾部。dirty 的块不能直接回收，getblk() 遇到 dirty 块会先写回磁盘再复用。两套索引同时维护，每次操作都要同步更新。',
    rightContent: [
      { label: 'NR_HASH', text: '307（素数，减少 hash 碰撞）' },
      { label: '查找', text: 'O(1) hash 桶定位 + 链表扫描' },
      { label: '淘汰', text: 'LRU：从 free_list 头部取最久未用块' },
      { label: 'dirty', text: '脏块 BADNESS 高，优先保留，回收时先写盘' },
    ],
  },
  {
    phaseIdx: 2, tagType: 'info',
    activeLayer: 'bread',
    title: 'getblk()：Buffer Cache 的门卫，命中直接返回，未命中分配空闲块',
    srcRef: 'fs/buffer.c:getblk()',
    scene: 'getblk',
    explain: 'getblk() 是 buffer cache 的统一入口，bread() 通过它获取缓冲块。流程：①计算 hash 桶号；②遍历 hash 链查找匹配的 (dev, block)；③命中则等待 b_lock 解除，增加 b_count，返回；④未命中则扫描 freelist，选 BADNESS 最小的块（clean 优先于 dirty）；⑤若选中的块是 dirty，先写回；⑥重置该块的 dev/blocknr/uptodate，插入新 hash 桶，返回未填充的 bh（b_uptodate=0）。bread() 收到 b_uptodate=0 的 bh 后，会调用 ll_rw_block() 触发实际磁盘读。',
    code: `// fs/buffer.c
struct buffer_head * getblk(int dev, int block) {
    struct buffer_head *tmp, *bh;
repeat:
    // 先查 hash 表
    if ((bh = get_hash_table(dev, block)))
        return bh;
    // 从 freelist 找 BADNESS 最小的块
    tmp = free_list;
    do {
        if (tmp->b_count)
            continue;
        if (!bh || BADNESS(tmp) < BADNESS(bh))
            bh = tmp;
        if (!BADNESS(bh)) break;
    } while ((tmp=tmp->b_next_free) != free_list);
    // 等 dirty 块写回后重试
    if (bh->b_dirt) {
        sync_dirty_buffer(bh);
        goto repeat;
    }
    // 重置并返回
    bh->b_count = 1;
    bh->b_dirt = 0;
    bh->b_uptodate = 0;
    remove_from_queues(bh);
    bh->b_dev = dev;
    bh->b_blocknr = block;
    insert_into_queues(bh);
    return bh;
}`,
  },
  {
    phaseIdx: 2, tagType: 'success',
    activeLayer: 'bread',
    highlightFlag: 'b_uptodate',
    title: 'bread() 缓存命中路径：b_uptodate=1，纯内存操作',
    srcRef: 'fs/buffer.c:bread()',
    scene: 'bread-hit',
    explain: '当 getblk() 从 hash 表找到对应的 (dev, block) 且 b_uptodate=1 时，表示缓冲区中的数据与磁盘完全一致，可以直接使用。bread() 只需等待 b_lock 解除（确保没有进行中的 I/O），然后增加引用计数并返回。整个过程完全在内存中完成，不发出任何磁盘 I/O 请求，延迟仅为纳秒级。这是 buffer cache 核心价值的体现——同一个磁盘块被反复访问时，只有第一次需要等磁盘。',
    code: `// fs/buffer.c
struct buffer_head * bread(int dev, int block) {
    struct buffer_head * bh;
    bh = getblk(dev, block);
    if (bh->b_uptodate)
        return bh;  // 缓存命中！直接返回
    ll_rw_block(READ, bh);
    wait_on_buffer(bh);
    if (bh->b_uptodate)
        return bh;
    brelse(bh);
    return NULL;
}`,
  },
  {
    phaseIdx: 2, tagType: 'danger',
    activeLayer: 'llrw',
    highlightFlag: 'b_lock',
    title: 'll_rw_block()：缓存未命中，构造 request 入队，进程睡眠等待中断',
    srcRef: 'drivers/block/ll_rw_blk.c — ll_rw_block() + make_request()',
    scene: 'll-rw-block',
    explain: '缓存未命中时，bread() 调用 ll_rw_block(READ, bh) 发起真实磁盘读。ll_rw_block() 调用 make_request() 构造一个 struct request（包含方向/设备/起始扇区/缓冲区指针），用电梯算法（SCAN）将它插入 request 队列——按磁头移动方向排序，减少寻道次数。然后调用 add_request() 启动磁盘控制器（如果队列之前为空）。bread() 随即调用 wait_on_buffer(bh)，将当前进程加入 bh->b_wait 队列并 sleep_on()，进程变为 TASK_UNINTERRUPTIBLE 直到磁盘中断唤醒它。',
    code: `// drivers/block/ll_rw_blk.c
void make_request(int major, int rw,
                  struct buffer_head *bh) {
    struct request *req;
    // 找空闲的 request 槽
    req = blk_dev[major].request;
    // 填充 request
    req->rw = rw;
    req->dev = bh->b_dev;
    req->sector = bh->b_blocknr * 2; // 块→扇区
    req->buffer = bh->b_data;
    req->bh = bh;
    // 电梯算法插入队列
    add_request(major+blk_dev, req);
}`,
  },
  {
    phaseIdx: 2, tagType: 'warning',
    activeLayer: 'llrw',
    title: '三层位宽限制：文件系统(64MB) < CHS硬件(504MB) < 内核b_blocknr(4TB)',
    srcRef: 'include/linux/fs.h:zone_t + drivers/block/hd.c + fs/buffer.c',
    scene: 'disk-addr',
    explain: 'Linux 0.11 磁盘容量受三层独立限制，取最小值才是实际上限。最紧的是 Minix 文件系统：zone 号类型是 unsigned short（16位），最多 65536 个 zone × 1KB = 64MB，这是文件系统层面的限制，与硬件无关。其次是 CHS 寻址：BIOS INT 13h 用 10+4+6=20 位描述磁盘位置，上限 504MB，这是硬件接口的位宽限制。内核 buffer_head 的 b_blocknr 是 32位 unsigned long，理论可到 4TB，反而不是瓶颈。磁盘超出 CHS 范围的扇区永远无法被寻址；文件系统超出 64MB 的空间格式化时直接忽略。',
    rightContent: [
      { label: '真正瓶颈', text: 'Minix FS zone_t（16位）→ 64MB 文件系统上限' },
      { label: 'CHS 上限', text: '1024×16×63×512B = 504 MB（BIOS 接口位宽）' },
      { label: 'b_blocknr', text: '32位 unsigned long，理论 4TB，不是瓶颈' },
      { label: 'LBA28',     text: '后来突破：28位块号 → 128GB（Linux 2.x）' },
      { label: 'IDE 通路',  text: '16位数据线，读512B扇区 = 256次×2字节' },
    ],
    code: `// drivers/block/hd.c
// b_blocknr（1KB块）→ 扇区 → CHS
sector = block * 2;   // 1块=1KB=2个512B扇区
cyl  = sector / (hd_info[drive].head
               * hd_info[drive].sect);
head = (sector / hd_info[drive].sect)
               % hd_info[drive].head;
sec  = sector % hd_info[drive].sect + 1;

// 读扇区数据：16位数据端口，循环256次
insw(HD_DATA, buffer, 256); // 256×2B=512B`,
  },
  {
    phaseIdx: 2, tagType: 'info',
    activeLayer: 'disk',
    highlightFlag: 'b_uptodate',
    title: '磁盘中断：end_request() 标记数据有效，wake_up() 唤醒等待进程',
    srcRef: 'drivers/block/hd.c — read_intr() + end_request()',
    scene: 'disk-interrupt',
    explain: '磁盘控制器完成 DMA 传输后触发 IRQ14 中断。中断服务程序 read_intr() 被调用：确认传输无误后调用 end_request(1)。end_request() 做三件事：设 b_uptodate=1（数据已从磁盘读入，可用）；设 b_dirt=0；调用 unlock_buffer(bh)（清 b_lock，唤醒 bh->b_wait 队列上的进程）。wait_on_buffer() 中睡眠的 bread() 进程被唤醒，重新检查 b_uptodate，确认为 1 后返回 bh。整个等待期间（约 10ms）进程不占 CPU，调度器可以运行其他进程。',
    code: `// drivers/block/hd.c
static void read_intr(void) {
    // 从 IDE 端口读取数据到 bh->b_data
    insw(HD_DATA, CURRENT->buffer, 256);
    CURRENT->errors = 0;
    end_request(1);  // 成功
}

// fs/buffer.c
void end_request(int uptodate) {
    CURRENT->bh->b_uptodate = uptodate;
    unlock_buffer(CURRENT->bh);  // b_lock=0, wake_up
    wake_up(&CURRENT->waiting);
    // 处理下一个 request
    do_request();
}`,
  },
  {
    phaseIdx: 3, tagType: 'danger',
    activeLayer: 'vfs',
    highlightFlag: 'b_dirty',
    title: '脏缓冲与写回：write() 不直接写磁盘，b_dirt=1 延迟落盘',
    srcRef: 'fs/buffer.c — bwrite() + sync_dev() + fs/super.c — sys_sync()',
    scene: 'dirty-writeback',
    explain: '应用程序调用 write() 时，数据先写入 buffer cache（修改 bh->b_data），设 b_dirt=1 后立即返回——此时数据还在内存，磁盘尚未更新。这叫"写缓冲"或"延迟写"，优点是 write() 极快（内存速度），多次小写可合并成一次磁盘写；缺点是断电会丢失未回写的数据。真正触发回写的时机有：显式调用 sync()/fsync()、卸载文件系统（umount）、系统关机（halt 前调用 sys_sync()）、以及 getblk() 需要回收 dirty 块时。Linux 0.11 没有后台 pdflush 线程，完全靠显式 sync 触发。',
    code: `// fs/buffer.c — 标记脏并延迟写
void bwrite(struct buffer_head *bh) {
    if (!bh) return;
    bh->b_dirt = 1;   // 标记脏，不写磁盘
    bh->b_uptodate = 1;
    // 不调用 ll_rw_block！
}

// fs/super.c — 系统调用 sync()
int sys_sync(void) {
    int i;
    struct buffer_head *bh;
    // 同步所有 inode
    sync_inodes();
    // 遍历所有缓冲区，写回脏块
    bh = start_buffer;
    for (i=0; i<NR_BUFFERS; i++, bh++) {
        wait_on_buffer(bh);
        if (bh->b_dirt)
            ll_rw_block(WRITE, bh);
    }
    return 0;
}`,
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
.phase-seg.active { background: #2980b9; color: #fff; border-color: #2980b9; }
.step-dots { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.step-dot { width: 10px; height: 10px; border-radius: 50%; background: #dcdfe6; cursor: pointer; transition: background .2s; }
.step-dot.active { background: #2980b9; }
.step-dot.done { background: #67c23a; }
.main-grid { display: grid; grid-template-columns: 230px 1fr 230px; gap: 12px; margin-bottom: 12px; }
.panel-left, .panel-right { background: #fafafa; border: 1px solid #e4e7ed; border-radius: 6px; padding: 12px; min-height: 400px; }
.panel-center { background: #fff; border: 1px solid #e4e7ed; border-radius: 6px; padding: 14px; }
.panel-title { font-size: 11px; font-weight: 600; color: #909399; text-transform: uppercase; margin-bottom: 8px; letter-spacing: .5px; }
.step-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 14px; }

/* 调用链 */
.call-chain { display: flex; flex-direction: column; gap: 2px; }
.cc-node { border: 1px solid #e4e7ed; border-radius: 4px; padding: 5px 7px; transition: all .2s; }
.cc-name { display: block; font-size: 10px; font-family: monospace; color: #303133; }
.cc-src  { display: block; font-size: 9px; color: #c0c4cc; margin-top: 1px; }
.cc-active { border-width: 2px; }

/* buffer flags */
.bh-flags { display: flex; flex-direction: column; gap: 4px; }
.bhf-row { border: 1px solid #e4e7ed; border-radius: 3px; padding: 4px 6px; transition: all .2s; }
.bhf-active { border-color: #e6a23c; background: #fff4e5; }
.bhf-name { display: block; font-size: 10px; font-family: monospace; font-weight: 600; color: #303133; }
.bhf-desc { display: block; font-size: 9px; color: #909399; line-height: 1.4; }
.bhf-active .bhf-name { color: #e6a23c; }

/* 速度对比 */
.speed-rows { display: flex; flex-direction: column; gap: 5px; }
.spd-row { display: flex; align-items: center; gap: 4px; }
.spd-label { font-size: 9px; color: #606266; min-width: 50px; }
.spd-bar { height: 8px; border-radius: 2px; }
.spd-fast { background: #67c23a; }
.spd-mid  { background: #e6a23c; }
.spd-slow { background: #f56c6c; }
.spd-val  { font-size: 9px; color: #909399; white-space: nowrap; }

/* 总览 */
.io-overview { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.iov-layer { border: 1px solid #e4e7ed; border-radius: 6px; padding: 8px 14px; width: 90%; text-align: center; }
.iovl-title { font-size: 10px; font-weight: 600; color: #909399; margin-bottom: 3px; }
.iovl-call  { font-size: 11px; font-family: monospace; color: #303133; }
.user-layer { border-color: #409eff44; background: #f0f7ff; }
.vfs-layer  { border-color: #67c23a44; background: #f0fff4; }
.blk-layer  { border-color: #f56c6c44; background: #fff0f0; }
.disk-layer { border-color: #9c27b044; background: #f9f0ff; }
.iov-arrow  { font-size: 12px; color: #c0c4cc; }
.iov-miss-arrow { color: #f56c6c; font-size: 11px; }
.iov-cache  { border: 2px solid #e6a23c; border-radius: 8px; padding: 10px 14px; width: 90%; background: #fffbf0; }
.iovc-title { font-size: 11px; font-weight: 600; color: #e6a23c; margin-bottom: 8px; text-align: center; }
.iovc-body  { display: flex; gap: 10px; justify-content: center; margin-bottom: 6px; }
.iovc-hit, .iovc-miss { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.iovc-label { font-size: 9px; color: #909399; }
.iovc-bh    { border: 1px solid #67c23a; border-radius: 4px; padding: 6px 10px; font-size: 10px; font-family: monospace; color: #67c23a; text-align: center; }
.iovc-note  { font-size: 10px; color: #909399; text-align: center; }

/* field detail (复用 TaskStruct 风格) */
.field-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fd-struct { background: #1e1e1e; border-radius: 6px; padding: 10px; }
.fds-title { font-size: 11px; color: #6a9955; margin-bottom: 8px; font-family: monospace; }
.fds-row { display: flex; gap: 6px; padding: 3px 0; border-bottom: 1px solid #2a2a2a; font-family: monospace; font-size: 10px; transition: background .2s; border-radius: 2px; }
.fds-row.fds-highlight { background: #2a2a1a; padding: 3px 4px; }
.fds-type { color: #569cd6; min-width: 90px; flex-shrink: 0; }
.fds-name { color: #9cdcfe; min-width: 80px; }
.fds-comment { color: #6a9955; font-size: 9px; line-height: 1.5; }
.fd-diagram { }
.fdd-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.fdd-note { font-size: 10px; color: #909399; line-height: 1.6; margin-top: 8px; background: #f5f7fa; border-radius: 4px; padding: 6px; }

/* bh mem diagram */
.bh-mem-diagram { display: flex; align-items: flex-start; gap: 8px; }
.bhmd-meta { background: #1e1e1e; border-radius: 4px; padding: 8px; flex: 1; }
.bhmd-title { font-size: 10px; color: #dcdcaa; font-family: monospace; font-weight: 600; margin-bottom: 5px; border-bottom: 1px solid #333; padding-bottom: 3px; }
.bhmd-field { font-size: 9px; color: #9cdcfe; font-family: monospace; line-height: 1.7; }
.bhmd-arrow { font-size: 16px; color: #e6a23c; margin-top: 28px; }
.bhmd-data { flex: 1; }
.bhmd-block { border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.bhdb-row { padding: 4px 6px; font-size: 9px; color: #606266; border-bottom: 1px solid #f0f2f5; }

/* 双索引 */
.dual-index { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.di-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.hash-table { border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; }
.ht-desc { font-size: 10px; color: #909399; margin-bottom: 6px; }
.ht-buckets { display: flex; flex-direction: column; gap: 3px; }
.ht-bucket { display: flex; align-items: center; gap: 6px; }
.htb-idx { font-size: 10px; font-family: monospace; color: #409eff; min-width: 24px; }
.htb-chain { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.htb-bh { background: #e8f4fd; border: 1px solid #409eff44; border-radius: 3px; padding: 2px 5px; font-size: 9px; color: #409eff; font-family: monospace; }
.htb-highlight { background: #fff4e5; border-color: #e6a23c; color: #e6a23c; font-weight: 600; }
.htb-null { font-size: 10px; color: #c0c4cc; font-family: monospace; }
.ht-formula { font-size: 9px; color: #909399; margin-top: 6px; font-family: monospace; background: #f5f7fa; border-radius: 3px; padding: 3px 5px; }
.lru-list { border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; }
.lru-desc { font-size: 10px; color: #909399; margin-bottom: 8px; }
.lru-chain { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.lruc-head, .lruc-tail { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 3px; padding: 4px 6px; font-size: 9px; color: #909399; text-align: center; line-height: 1.3; }
.lruc-arrow { color: #c0c4cc; }
.lruc-bh { border: 1px solid #e4e7ed; border-radius: 3px; padding: 4px 6px; text-align: center; }
.lrucb-id { font-size: 9px; font-family: monospace; color: #409eff; }
.lrucb-state { font-size: 8px; color: #909399; }
.lruc-dirty { border-color: #f56c6c44; background: #fff0f0; }
.lruc-dirty .lrucb-state { color: #f56c6c; }
.lru-note { font-size: 9px; color: #909399; line-height: 1.5; margin-top: 6px; background: #f5f7fa; border-radius: 3px; padding: 4px 6px; }

/* getblk flowchart */
.flow-diagram { }
.fld-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.fld-steps { display: flex; flex-direction: column; gap: 6px; }
.flds-step { display: flex; gap: 8px; border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; transition: all .2s; }
.flds-active { border-color: #2980b9; background: #f0f7ff; }
.flds-hit { border-color: #67c23a44; }
.flds-miss { border-color: #f56c6c44; }
.fldss-num { width: 18px; height: 18px; border-radius: 50%; background: #409eff; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0; }
.flds-hit .fldss-num { background: #67c23a; }
.flds-miss .fldss-num { background: #f56c6c; }
.fldss-body { flex: 1; }
.fldss-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 3px; }
.fldss-code { font-size: 9px; font-family: monospace; color: #606266; background: #f5f7fa; border-radius: 2px; padding: 3px 5px; white-space: pre; line-height: 1.5; }
.fldss-note { font-size: 9px; color: #909399; margin-top: 3px; }
.fldss-result { font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 10px; flex-shrink: 0; align-self: center; }
.res-hit  { background: #f0fff4; color: #67c23a; }
.res-miss { background: #fff0f0; color: #f56c6c; }

/* timeline */
.timeline-panel { }
.tl-header { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 8px; }
.tlh-col { background: #f5f7fa; border-radius: 4px; padding: 5px 8px; font-size: 11px; font-weight: 600; color: #606266; text-align: center; }
.tl-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; }
.tlr-app, .tlr-kernel, .tlr-disk { display: flex; justify-content: center; min-height: 24px; align-items: center; }
.tlr-call { border: 1px solid #409eff44; border-radius: 4px; padding: 4px 7px; font-size: 10px; font-family: monospace; color: #409eff; background: #f0f7ff; text-align: center; }
.tlr-act  { border: 1px solid #e6a23c44; border-radius: 4px; padding: 4px 7px; font-size: 10px; font-family: monospace; color: #e6a23c; background: #fffbf0; text-align: center; }
.kernel-ok { border-color: #67c23a44; color: #67c23a; background: #f0fff4; }
.tlr-disk-act { border: 1px dashed #9c27b044; border-radius: 4px; padding: 4px 7px; font-size: 10px; color: #9c27b0; background: #f9f0ff; text-align: center; }
.wait-style { border: 1px solid #f56c6c44; border-radius: 4px; padding: 4px 7px; font-size: 10px; color: #f56c6c; background: #fff0f0; text-align: center; }
.tl-divider { grid-column: 1/-1; text-align: center; font-size: 10px; font-weight: 600; padding: 4px; border-radius: 4px; margin: 3px 0; }
.ok-div   { background: #f0fff4; color: #67c23a; }
.wait-div { background: #fff0f0; color: #f56c6c; }
.tl-result { margin-top: 8px; text-align: center; font-size: 11px; font-weight: 600; padding: 6px; border-radius: 4px; }
.hit-result { background: #f0fff4; color: #67c23a; border: 1px solid #67c23a44; }

/* request queue */
.req-queue-note { margin-top: 10px; background: #f9f0ff; border: 1px solid #9c27b044; border-radius: 4px; padding: 8px; }
.rqn-title { font-size: 11px; font-weight: 600; color: #9c27b0; margin-bottom: 5px; }
.rqn-items { display: flex; flex-direction: column; gap: 3px; }
.rqn-item { font-size: 9px; font-family: monospace; color: #606266; padding: 2px 4px; }
.rqn-current { background: #9c27b015; border-radius: 2px; color: #9c27b0; font-weight: 600; }

/* interrupt diagram */
.interrupt-diagram { }
.intd-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.intd-flow { display: flex; flex-direction: column; }
.intd-step { position: relative; }
.intds-step { display: flex; gap: 8px; border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; margin-bottom: 0; }
.intds-highlight { border-color: #e6a23c; background: #fffbf0; }
.intds-num { width: 20px; height: 20px; border-radius: 50%; background: #9c27b0; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0; }
.intds-highlight .intds-num { background: #e6a23c; }
.intds-body { flex: 1; }
.intds-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 3px; }
.intds-code { font-size: 9px; font-family: monospace; color: #606266; background: #f5f7fa; border-radius: 2px; padding: 3px 5px; white-space: pre; line-height: 1.5; }
.intds-arrow { text-align: center; color: #c0c4cc; font-size: 14px; padding: 2px 0; }
.intd-note { margin-top: 10px; background: #f5f7fa; border-radius: 4px; padding: 8px; }
.intn-row { display: flex; gap: 6px; margin-bottom: 4px; font-size: 10px; line-height: 1.5; }
.intn-key { color: #e6a23c; font-weight: 600; flex-shrink: 0; }
.intn-val { color: #606266; }

/* writeback */
.writeback-diagram { }
.wb-title { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.wb-flow { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
.wbw-title, .wbs-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.wbw-path { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.wbwp-step { border: 1px solid #e4e7ed; border-radius: 4px; padding: 5px 10px; font-size: 10px; font-family: monospace; color: #303133; background: #f5f7fa; text-align: center; }
.highlight-step { border-color: #f56c6c; background: #fff0f0; color: #f56c6c; font-weight: 600; }
.wbwp-arrow { color: #c0c4cc; font-size: 12px; }
.wbwp-note { font-size: 10px; color: #f56c6c; font-weight: 600; margin-top: 4px; text-align: center; }
.wbs-triggers { display: flex; flex-direction: column; gap: 5px; }
.wbst-item { border: 1px solid #e4e7ed; border-radius: 3px; padding: 5px 7px; }
.wbsti-name { font-size: 10px; font-family: monospace; font-weight: 600; color: #409eff; }
.wbsti-desc { font-size: 9px; color: #909399; line-height: 1.4; }
.wb-dirty-chain { background: #f5f7fa; border-radius: 4px; padding: 8px 12px; }
.wbdc-title { font-size: 10px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.wbdc-flow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wbdcf-node { border: 1px solid #e4e7ed; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-family: monospace; background: #fff; color: #303133; }
.dirty-node { border-color: #f56c6c44; background: #fff0f0; color: #f56c6c; }
.clean-node { border-color: #67c23a44; background: #f0fff4; color: #67c23a; }
.wbdcf-arrow { font-size: 10px; color: #909399; white-space: nowrap; }

/* right panel */
.pr-src { font-family: monospace; font-size: 10px; color: #909399; margin-bottom: 8px; }
.pr-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.pri-row { display: flex; gap: 6px; }
.pri-label { font-size: 10px; font-weight: 600; color: #2980b9; min-width: 40px; flex-shrink: 0; }
.pri-text { font-size: 10px; color: #606266; line-height: 1.5; }
.pr-code pre { background: #1e1e1e; color: #d4d4d4; border-radius: 4px; padding: 8px; font-size: 10px; overflow-x: auto; margin: 0; line-height: 1.6; white-space: pre; }

/* controls */
.controls { display: flex; gap: 8px; margin-bottom: 12px; }

/* detail card */
.detail-card { background: #f8f9fb; border: 1px solid #e4e7ed; border-radius: 6px; padding: 14px; }
.dc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dc-src { font-family: monospace; font-size: 11px; color: #909399; }
.dc-tag { font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
.tag-info    { background: #e8f4fd; color: #409eff; }
.tag-warning { background: #fff4e5; color: #e6a23c; }
.tag-success { background: #f0fff4; color: #67c23a; }
.tag-danger  { background: #fff0f0; color: #f56c6c; }
.dc-explain { font-size: 13px; color: #303133; line-height: 1.7; }

/* call-style / kernel-style for timeline */
.call-style { border: 1px solid #409eff44; border-radius: 4px; padding: 4px 7px; font-size: 10px; font-family: monospace; color: #409eff; background: #f0f7ff; text-align: center; }
.kernel-style { border: 1px solid #e6a23c44; border-radius: 4px; padding: 4px 7px; font-size: 10px; font-family: monospace; color: #e6a23c; background: #fffbf0; text-align: center; }

/* 寻址原理 */
.addr-diagram { display: flex; flex-direction: column; gap: 12px; }
.addr-rule { background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.adr-label { font-size: 11px; font-weight: 600; color: #303133; flex-shrink: 0; }
.adr-formula { font-size: 12px; font-family: monospace; color: #e6a23c; font-weight: 600; }
.adr-formula sup { font-size: 9px; }
.adr-sub { font-size: 10px; color: #909399; }
.addr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.addr-col { display: flex; flex-direction: column; gap: 8px; }
.adrc-title { font-size: 12px; font-weight: 600; margin-bottom: 4px; }

/* 三层嵌套限制 */
.three-layers { }
.tl-layer { border-radius: 6px; padding: 8px; }
.tl-soft { border: 1px dashed #67c23a; background: #f0fff420; }
.tl-hw   { border: 1px solid #e6a23c;  background: #fffbf0;   margin-top: 6px; }
.tl-fs   { border: 2px solid #f56c6c;  background: #fff0f0;   margin-top: 6px; }
.tll-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px; }
.tll-name  { font-size: 11px; font-weight: 600; color: #303133; }
.tll-limit { font-size: 10px; font-family: monospace; color: #606266; }
.tll-warn  { color: #e6a23c; font-weight: 600; }
.tll-crit  { color: #f56c6c; font-weight: 700; }
.tll-src   { font-size: 9px; font-family: monospace; color: #909399; margin-bottom: 4px; }
.tll-body  { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
.tllb-row  { display: flex; gap: 6px; font-size: 10px; }
.tllb-key  { color: #909399; flex-shrink: 0; }
.tllb-val  { font-family: monospace; color: #303133; }
.tllb-crit { color: #f56c6c; font-weight: 700; }

/* 溢出说明 */
.overflow-note { border: 1px solid #f56c6c22; border-radius: 4px; background: #fff8f8; padding: 7px 9px; }
.ovn-title { font-size: 10px; font-weight: 600; color: #f56c6c; margin-bottom: 5px; }
.ovn-row   { display: flex; gap: 4px; font-size: 10px; margin-bottom: 4px; line-height: 1.5; flex-wrap: wrap; }
.ovn-label { color: #e6a23c; font-weight: 600; flex-shrink: 0; }
.ovn-val   { color: #606266; }

/* 各层对比表 */
.limit-table { border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.limt-header { display: grid; grid-template-columns: 1.2fr 0.8fr 0.7fr 0.8fr; gap: 4px; background: #f5f7fa; padding: 4px 6px; font-size: 9px; font-weight: 600; color: #909399; }
.limt-row    { display: grid; grid-template-columns: 1.2fr 0.8fr 0.7fr 0.8fr; gap: 4px; padding: 5px 6px; border-top: 1px solid #f0f2f5; align-items: center; }
.limt-crit   { background: #fff8f8; }
.limtr-layer { font-size: 10px; font-family: monospace; color: #303133; }
.limtr-bits  { font-size: 10px; font-family: monospace; color: #606266; }
.limtr-max   { font-size: 10px; font-weight: 700; font-family: monospace; }
.limtr-src   { font-size: 9px; color: #909399; }
.limt-crit .limtr-layer { color: #f56c6c; font-weight: 600; }

/* CHS bits */
.chs-bits { display: flex; gap: 3px; height: 60px; }
.chsb-field { border: 1px solid; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; }
.chsbf-bits { font-size: 11px; font-weight: 700; }
.chsbf-name { font-size: 9px; color: #606266; }
.chsbf-max  { font-size: 9px; font-family: monospace; }
.chs-formula { font-size: 11px; font-family: monospace; color: #303133; background: #f5f7fa; border-radius: 3px; padding: 4px 6px; }
.chs-formula strong { color: #f56c6c; }
.chs-vs { border: 1px solid #e4e7ed; border-radius: 4px; padding: 6px 8px; }
.chsvs-row { display: flex; gap: 6px; font-size: 10px; margin-bottom: 3px; }
.chsvs-label { color: #909399; flex-shrink: 0; }
.chsvs-val { font-family: monospace; color: #409eff; }
.warn-val { color: #f56c6c; font-weight: 600; }
.chsvs-note { font-size: 9px; color: #909399; margin-top: 4px; line-height: 1.4; }
.ide-port { border: 1px dashed #9c27b044; border-radius: 4px; padding: 6px 8px; background: #f9f0ff; }
.idep-title { font-size: 10px; font-weight: 600; color: #9c27b0; margin-bottom: 3px; }
.idep-body { font-size: 9px; color: #606266; line-height: 1.7; font-family: monospace; }

/* 内存地址表 */
.mem-addr-table { border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.mat-header { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; background: #f5f7fa; padding: 4px 6px; font-size: 10px; font-weight: 600; color: #909399; }
.mat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; padding: 5px 6px; border-top: 1px solid #f0f2f5; align-items: center; transition: background .2s; }
.mat-highlight { background: #f0f7ff; }
.matr-mode { font-size: 10px; color: #303133; }
.matr-bits { display: flex; flex-direction: column; gap: 2px; }
.matrb-bar { height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.matrb-fill { height: 100%; border-radius: 3px; }
.matrb-num { font-size: 9px; color: #606266; font-family: monospace; }
.matr-max { font-size: 10px; font-weight: 600; font-family: monospace; }
.mem-addr-note { background: #f0f7ff; border: 1px solid #409eff22; border-radius: 4px; padding: 6px 8px; }
.man-item { display: flex; gap: 4px; font-size: 10px; margin-bottom: 4px; line-height: 1.5; }
.mani-key { color: #409eff; font-weight: 600; flex-shrink: 0; }
.mani-val { color: #606266; }
</style>
