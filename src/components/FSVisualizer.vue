<template>
  <div class="fs-vis">
    <!-- Phase 进度条 -->
    <div class="phase-bar">
      <div
        v-for="(ph, pi) in phases"
        :key="pi"
        class="phase-seg"
        :class="{ active: currentPhase === pi, done: currentPhase > pi }"
        @click="jumpToPhase(pi)"
      >{{ ph }}</div>
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

    <!-- 三栏 -->
    <div class="main-grid">
      <!-- 左：文件系统状态 -->
      <div class="left-panel">
        <div class="panel-title">当前操作状态</div>

        <!-- 当前 inode -->
        <div class="cur-inode">
          <div class="ci-title">当前 inode #{{ curInodeNum }}</div>
          <div class="ci-row"><span class="ci-k">i_mode</span><span class="ci-v">{{ curInodeMode }}</span></div>
          <div class="ci-row"><span class="ci-k">i_size</span><span class="ci-v">{{ curInodeSize }}</span></div>
          <div class="ci-row"><span class="ci-k">i_nlinks</span><span class="ci-v">{{ curInodeLinks }}</span></div>
          <div class="ci-row"><span class="ci-k">i_zone[0]</span><span class="ci-v">块 {{ curInodeZone }}</span></div>
          <div class="ci-row"><span class="ci-k">i_count</span><span class="ci-v">{{ curInodeCount }}</span></div>
        </div>

        <!-- 文件描述符表 -->
        <div class="fd-section">
          <div class="ci-title">进程 filp[]</div>
          <div v-for="(fd, fi) in leftFdTable" :key="fi"
            class="lfd-row"
            :class="{ 'lfd-active': fd.active }"
          >
            <span class="lfd-num">{{ fi }}</span>
            <span class="lfd-target">{{ fd.label }}</span>
          </div>
        </div>

        <!-- 路径状态 -->
        <div class="path-state" v-if="currentPath">
          <div class="ci-title">路径解析</div>
          <div class="ps-path">{{ currentPath }}</div>
          <div class="ps-seg" v-for="(seg, si) in pathSegs" :key="si"
            :class="{ 'ps-done': si < pathProgress, 'ps-current': si === pathProgress }"
          >
            <span class="pss-arrow">{{ si === 0 ? '/' : '→ /' }}</span>
            <span class="pss-name">{{ seg }}</span>
            <span class="pss-inode" v-if="si < pathProgress">✓ #{{ seg === 'etc' ? 14 : seg === 'passwd' ? 27 : 1 }}</span>
          </div>
        </div>

        <div class="left-explain">{{ currentStep.explain }}</div>
      </div>

      <!-- 中：主可视化 -->
      <div class="center-panel">

        <!-- overview -->
        <template v-if="currentStep.scene === 'overview'">
          <div class="scene-title">Linux 0.11 文件系统分层架构</div>
          <div class="layer-stack">
            <div class="ls-layer ls-user">
              <div class="ls-label">用户空间</div>
              <div class="ls-items">
                <span>open()</span><span>read()</span><span>write()</span><span>close()</span>
              </div>
            </div>
            <div class="ls-arrow">↓ int 0x80</div>
            <div class="ls-layer ls-vfs">
              <div class="ls-label">VFS（虚拟文件系统）</div>
              <div class="ls-items">
                <span>sys_open()</span><span>sys_read()</span><span>sys_write()</span>
              </div>
              <div class="ls-sub">file_operations 函数指针表 → 多态分发</div>
            </div>
            <div class="ls-arrow">↓ file_operations</div>
            <div class="ls-layer ls-minix">
              <div class="ls-label">Minix 文件系统</div>
              <div class="ls-items">
                <span>namei()</span><span>bmap()</span><span>iget()</span><span>new_block()</span>
              </div>
              <div class="ls-sub">inode / dir_entry / super_block</div>
            </div>
            <div class="ls-arrow">↓ bread() / bwrite()</div>
            <div class="ls-layer ls-buf">
              <div class="ls-label">缓冲区高速缓存</div>
              <div class="ls-items">
                <span>bread()</span><span>bwrite()</span><span>buffer_head</span><span>LRU</span>
              </div>
            </div>
            <div class="ls-arrow">↓ ll_rw_block()</div>
            <div class="ls-layer ls-disk">
              <div class="ls-label">块设备驱动</div>
              <div class="ls-items">
                <span>硬盘 / 软盘</span><span>request_queue</span>
              </div>
            </div>
          </div>
        </template>

        <!-- disk-layout -->
        <template v-else-if="currentStep.scene === 'disk-layout'">
          <div class="scene-title">Minix 磁盘布局（1.44MB 软盘）</div>
          <div class="disk-layout">
            <div v-for="(blk, bi) in diskBlocks" :key="bi"
              class="disk-blk"
              :style="{ flex: blk.flex, background: blk.color }"
              :class="{ 'disk-active': diskActiveIdx === bi }"
            >
              <div class="db-name">{{ blk.name }}</div>
              <div class="db-range">{{ blk.range }}</div>
              <div class="db-detail" v-if="blk.detail">{{ blk.detail }}</div>
            </div>
          </div>
          <!-- 超级块详情 -->
          <div class="super-block-box" v-if="diskAnimSub >= 1">
            <div class="sbb-title">super_block（块 1）</div>
            <div class="sbb-grid">
              <div v-for="f in superFields" :key="f.name" class="sbb-row">
                <span class="sbb-name">{{ f.name }}</span>
                <span class="sbb-val">{{ f.val }}</span>
                <span class="sbb-desc">{{ f.desc }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- inode-struct -->
        <template v-else-if="currentStep.scene === 'inode-struct'">
          <div class="scene-title">struct inode — i_zone[] 块寻址</div>
          <div class="inode-addr">
            <div class="ia-inode">
              <div class="ia-title">inode.i_zone[9]</div>
              <div v-for="(z, zi) in inodeZones" :key="zi"
                class="ia-zone"
                :class="{
                  'ia-direct': zi < 7,
                  'ia-indirect1': zi === 7,
                  'ia-indirect2': zi === 8,
                  'ia-active': inodeAddrSub === zi,
                }"
              >
                <span class="iaz-idx">[{{ zi }}]</span>
                <span class="iaz-type">{{ z.type }}</span>
                <span class="iaz-val">→ 块{{ z.blk }}</span>
              </div>
            </div>
            <div class="ia-blocks">
              <!-- 直接块 -->
              <div class="ia-direct-area">
                <div class="ia-area-title">直接块（0~6）→ 7×1KB = 7KB</div>
                <div class="ia-blk-row">
                  <div v-for="i in 7" :key="i"
                    class="ia-blk"
                    :class="{ 'ia-blk-active': inodeAddrSub < 7 && inodeAddrSub === i - 1 }"
                  >
                    <div class="iabl-num">块{{ 100 + i }}</div>
                    <div class="iabl-data">data</div>
                  </div>
                </div>
              </div>
              <!-- 一级间接 -->
              <div class="ia-ind1-area" v-if="inodeAddrSub >= 7">
                <div class="ia-area-title">一级间接块（[7]）→ 512项×1KB = 512KB</div>
                <div class="ia-ind1-box">
                  <div class="ia-ind1-table">
                    <div v-for="i in 8" :key="i" class="ia-ind1-entry">{{ 200 + i }}</div>
                    <div class="ia-ind1-entry ia-ind1-dots">...</div>
                  </div>
                  <div class="ia-ind1-targets">
                    <div v-for="i in 3" :key="i" class="ia-blk ia-blk-sm">
                      <div class="iabl-num">块{{ 200 + i }}</div>
                    </div>
                    <span style="color:#909399">...</span>
                  </div>
                </div>
              </div>
              <!-- 二级间接 -->
              <div class="ia-ind2-area" v-if="inodeAddrSub >= 8">
                <div class="ia-area-title">二级间接（[8]）→ 512×512×1KB = 256MB</div>
                <div class="ia-ind2-note">inode→间接表→间接表→数据块（两层）</div>
              </div>
            </div>
          </div>
          <div class="inode-size-note">
            最大文件：7 + 512 + 512×512 = <strong>262,663 块 ≈ 256MB</strong>
          </div>
        </template>

        <!-- dir-entry -->
        <template v-else-if="currentStep.scene === 'dir-entry'">
          <div class="scene-title">目录文件 — dir_entry 线性数组</div>
          <div class="dir-demo">
            <div class="dd-inode-box">
              <div class="dd-inode-title">inode #1（根目录 /）</div>
              <div class="dd-inode-info">i_mode=040755 i_size={{ 5*16 }} B</div>
            </div>
            <div class="dd-arrow">↓ 读取数据块</div>
            <div class="dd-entries">
              <div class="dd-header">
                <span class="dde-inode">inode号(2B)</span>
                <span class="dde-name">文件名(14B)</span>
                <span class="dde-type">类型</span>
              </div>
              <div v-for="(ent, ei) in dirEntries" :key="ei"
                class="dde-row"
                :class="{ 'dde-active': dirAnimIdx === ei, 'dde-done': dirAnimIdx > ei }"
              >
                <span class="dde-inode">{{ ent.inode }}</span>
                <span class="dde-name">{{ ent.name }}</span>
                <span class="dde-type" :class="'dde-' + ent.type">{{ ent.typeLabel }}</span>
              </div>
            </div>
          </div>
          <div class="dir-note">
            每个 dir_entry = 16 字节（2B inode + 14B name）。
            目录查找就是线性扫描这个数组，比较 name 字段。
          </div>
        </template>

        <!-- namei -->
        <template v-else-if="currentStep.scene === 'namei'">
          <div class="scene-title">namei("/etc/passwd") — 逐级路径解析</div>
          <div class="namei-flow">
            <div v-for="(node, ni) in nameiNodes" :key="ni"
              class="nf-node"
              :class="{
                'nf-active': nameiSub >= ni,
                'nf-current': nameiSub === ni,
                'nf-dir': node.isDir,
                'nf-file': !node.isDir,
              }"
            >
              <div class="nfn-step">{{ ni + 1 }}</div>
              <div class="nfn-body">
                <div class="nfn-label">{{ node.label }}</div>
                <div class="nfn-detail" v-if="node.detail">{{ node.detail }}</div>
              </div>
              <div class="nfn-result" v-if="nameiSub >= ni">{{ node.result }}</div>
            </div>
          </div>
        </template>

        <!-- sys-open -->
        <template v-else-if="currentStep.scene === 'sys-open'">
          <div class="scene-title">open("/etc/passwd", O_RDONLY) — 调用链</div>
          <div class="open-flow">
            <div v-for="(node, ni) in openNodes" :key="ni"
              class="of-node"
              :class="{ 'of-active': openSub >= ni, 'of-current': openSub === ni }"
            >
              <div class="ofn-fn">{{ node.fn }}</div>
              <div class="ofn-file">{{ node.file }}</div>
              <div class="ofn-detail" v-if="node.detail && openSub >= ni">{{ node.detail }}</div>
            </div>
          </div>
          <!-- fd 表变化 -->
          <div class="open-result" v-if="openSub >= openNodes.length - 1">
            <div class="or-title">返回：fd = 3</div>
            <div class="or-chain">
              <div class="or-box or-fd">filp[3]</div>
              <div class="or-arrow">→</div>
              <div class="or-box or-file">struct file<br/><small>f_pos=0, f_mode=O_RDONLY</small></div>
              <div class="or-arrow">→</div>
              <div class="or-box or-inode">inode #27<br/><small>/etc/passwd</small></div>
              <div class="or-arrow">→</div>
              <div class="or-box or-disk">磁盘块<br/><small>bmap(inode,0)</small></div>
            </div>
          </div>
        </template>

        <!-- sys-read -->
        <template v-else-if="currentStep.scene === 'sys-read'">
          <div class="scene-title">read(fd, buf, count) — 数据从磁盘到用户</div>
          <div class="read-flow">
            <div v-for="(node, ni) in readNodes" :key="ni"
              class="rf-node"
              :class="{ 'rf-active': readSub >= ni, 'rf-current': readSub === ni }"
            >
              <div class="rfn-label">{{ node.label }}</div>
              <div class="rfn-detail" v-if="node.detail">{{ node.detail }}</div>
              <div class="rfn-arrow" v-if="ni < readNodes.length - 1">↓</div>
            </div>
          </div>
          <!-- 数据流向图 -->
          <div class="data-flow" v-if="readSub >= 4">
            <div class="df-box df-disk">磁盘块<br/><small>ll_rw_block()</small></div>
            <div class="df-arrow">→ DMA →</div>
            <div class="df-box df-buf">buffer_head<br/><small>1024B 内核缓冲</small></div>
            <div class="df-arrow">→ memcpy →</div>
            <div class="df-box df-user">用户 buf<br/><small>f_pos 推进</small></div>
          </div>
        </template>

        <!-- buffer-cache -->
        <template v-else-if="currentStep.scene === 'buffer-cache'">
          <div class="scene-title">缓冲区高速缓存 — bread() 与 LRU</div>
          <div class="buf-cache">
            <!-- Hash 表 -->
            <div class="bc-hash">
              <div class="bc-hash-title">Hash 表（按 dev+blocknr 散列）</div>
              <div class="bc-hash-table">
                <div v-for="(slot, si) in hashSlots" :key="si" class="bc-slot">
                  <div class="bc-slot-idx">[{{ si }}]</div>
                  <div class="bc-chain">
                    <div v-for="(bh, bi) in slot.chain" :key="bi"
                      class="bc-bh"
                      :class="{
                        'bc-hit': bufHitIdx === bh.id,
                        'bc-miss': bufMissIdx === bh.id,
                        'bc-dirty': bh.dirty,
                      }"
                    >
                      <div class="bh-dev">dev={{ bh.dev }}</div>
                      <div class="bh-blk">blk={{ bh.blk }}</div>
                      <div class="bh-state">{{ bh.dirty ? '脏' : '干净' }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- bread 流程 -->
            <div class="bc-bread-flow">
              <div v-for="(node, ni) in breadNodes" :key="ni"
                class="bb-node"
                :class="{ 'bb-active': breadSub >= ni, 'bb-current': breadSub === ni }"
              >
                <div class="bbn-label">{{ node.label }}</div>
                <div class="bbn-result" v-if="node.result && breadSub >= ni">{{ node.result }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- file-ops -->
        <template v-else-if="currentStep.scene === 'file-ops'">
          <div class="scene-title">struct file_operations — VFS 多态分发</div>
          <div class="fops-demo">
            <div class="fops-call">
              <div class="fc-title">sys_read(fd, buf, count)</div>
              <div class="fc-dispatch">→ file-&gt;f_inode-&gt;i_op-&gt;file_op-&gt;read()</div>
            </div>
            <div class="fops-table">
              <div class="ft-header">
                <span>文件类型</span>
                <span>read</span>
                <span>write</span>
                <span>open</span>
              </div>
              <div v-for="(row, ri) in fopsRows" :key="ri"
                class="ft-row"
                :class="{ 'ft-active': fopsAnimIdx === ri }"
              >
                <span class="ft-type" :class="'ft-' + row.type">{{ row.label }}</span>
                <span class="ft-fn">{{ row.read }}</span>
                <span class="ft-fn">{{ row.write }}</span>
                <span class="ft-fn">{{ row.open }}</span>
              </div>
            </div>
            <div class="fops-note">
              VFS 通过函数指针实现多态：同一个 read() 调用，根据文件类型
              分发到 file_read / pipe_read / chr_read，对上层完全透明。
            </div>
          </div>
        </template>

        <!-- write-flow -->
        <template v-else-if="currentStep.scene === 'write-flow'">
          <div class="scene-title">write() 完整流程 — bmap() 块分配与写入</div>
          <div class="write-flow-demo">
            <div v-for="(node, ni) in writeFlowNodes" :key="ni"
              class="wf-node"
              :class="{ 'wf-active': writeFlowSub >= ni, 'wf-current': writeFlowSub === ni }"
            >
              <div class="wfn-label">{{ node.label }}</div>
              <div class="wfn-code" v-if="node.code">{{ node.code }}</div>
            </div>
            <!-- bmap 寻址示意 -->
            <div class="bmap-demo" v-if="writeFlowSub >= 4">
              <div class="bd-title">bmap(inode, block=2) 寻址</div>
              <div class="bd-steps">
                <div class="bd-step">
                  <div class="bds-label">block &lt; 7?</div>
                  <div class="bds-val bds-yes">是（直接块）</div>
                </div>
                <div class="bd-step">
                  <div class="bds-label">i_zone[2]</div>
                  <div class="bds-val">= 块 102</div>
                </div>
                <div class="bd-step">
                  <div class="bds-label">getblk(dev, 102)</div>
                  <div class="bds-val bds-result">→ buffer_head</div>
                </div>
              </div>
            </div>
          </div>
        </template>

      </div>

      <!-- 右：源码 -->
      <div class="right-panel">
        <div class="panel-title">{{ currentStep.srcRef }}</div>

        <template v-if="currentStep.scene === 'overview'">
          <div class="right-note">
            <div class="rn-title">Linux 0.11 文件系统特点</div>
            <div class="rn-item">• 使用 Minix 文件系统（简化版）</div>
            <div class="rn-item">• 块大小 1024 字节</div>
            <div class="rn-item">• 最大文件 ~256MB</div>
            <div class="rn-item">• 最大文件名 14 字节</div>
            <div class="rn-item">• 缓冲区缓存在内核堆</div>
          </div>
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ overviewCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'disk-layout'">
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ diskLayoutCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'inode-struct'">
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ inodeStructCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'dir-entry'">
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ dirEntryCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'namei'">
          <div class="src-snippet">
            <div class="ss-file">fs/namei.c</div>
            <pre>{{ nameiCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'sys-open'">
          <div class="src-snippet">
            <div class="ss-file">fs/open.c</div>
            <pre>{{ sysOpenCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'sys-read'">
          <div class="src-snippet">
            <div class="ss-file">fs/read_write.c</div>
            <pre>{{ sysReadCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'buffer-cache'">
          <div class="src-snippet">
            <div class="ss-file">fs/buffer.c</div>
            <pre>{{ bufferCacheCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'file-ops'">
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ fileOpsCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'write-flow'">
          <div class="src-snippet">
            <div class="ss-file">fs/inode.c: bmap()</div>
            <pre>{{ bmapCode }}</pre>
          </div>
        </template>
      </div>
    </div>

    <!-- 控制 -->
    <div class="controls">
      <el-button size="small" @click="prev" :disabled="currentIdx === 0">上一步</el-button>
      <el-button size="small" type="primary" @click="togglePlay">{{ isPlaying ? '暂停' : '自动播放' }}</el-button>
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

// ─── 步骤数据 ─────────────────────────────────────────────────
const steps = [
  {
    phaseIdx: 0, phase: '总览', title: 'Linux 0.11 文件系统分层架构',
    scene: 'overview',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:1',
    tagType: 'info',
    explain: '五层架构：用户API → VFS → Minix FS → 缓冲缓存 → 块设备驱动',
    detail: 'Linux 0.11 文件系统采用经典分层设计。最上层是用户熟悉的 POSIX API（open/read/write/close）；VFS 层通过 file_operations 函数指针表实现多态，将调用分发到具体文件系统；Minix FS 是 Linux 0.11 唯一支持的磁盘文件系统，源自 Andrew Tanenbaum 的 MINIX；缓冲区高速缓存（buffer cache）在内存中缓存磁盘块，避免频繁 I/O；最底层通过 ll_rw_block() 发起实际磁盘读写请求。',
    code: null,
  },
  {
    phaseIdx: 1, phase: '磁盘布局', title: 'Minix 磁盘分区结构',
    scene: 'disk-layout',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:85',
    tagType: 'success',
    explain: '磁盘从低到高：引导块→超级块→inode位图→块位图→inode表→数据块',
    detail: 'Minix 文件系统磁盘布局：块0是引导块（MBR/bootsect）；块1是超级块（super_block），记录文件系统尺寸、inode数量等元数据；接下来是 inode 位图（每位标识一个 inode 是否在用）和数据块位图（标识数据块空闲状态）；inode 表存放所有 inode 结构（每个 32 字节，每块可放 32 个 inode）；剩余所有块为数据区。超级块中的 s_firstdatazone 记录数据区起始块号。',
    code: '// 块大小 = 1024 字节 (BLOCK_SIZE)\n// 1.44MB 软盘 = 1440 块\n// s_ninodes = 184, s_nzones = 1440',
  },
  {
    phaseIdx: 1, phase: '磁盘布局', title: 'struct inode — i_zone[] 三级寻址',
    scene: 'inode-struct',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:130',
    tagType: 'success',
    explain: 'i_zone[0~6]直接块，[7]一级间接，[8]二级间接，最大文件256MB',
    detail: 'inode 用 i_zone[9] 数组记录文件数据的块号。前7项（[0]~[6]）直接存块号，每块1KB，最多7KB；第8项（[7]）存一级间接块号，该块中存512个块号，寻址 512KB；第9项（[8]）存二级间接块号，两层查表可寻址 512×512=262144 块，约256MB。bmap(inode, block) 函数根据逻辑块号计算物理块号，是文件系统寻址的核心。',
    code: '// bmap() 寻址逻辑\nif (block < 7)  → i_zone[block]\nif (block < 519) → i_zone[7]→表→block-7\nelse             → i_zone[8]→表→表→block',
  },
  {
    phaseIdx: 2, phase: '目录与路径', title: 'struct dir_entry — 目录即数据',
    scene: 'dir-entry',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:90',
    tagType: 'warning',
    explain: '目录文件的数据就是 dir_entry 数组：每项 16 字节（2B inode + 14B name）',
    detail: 'Minix 文件系统的目录文件本质上是一个 struct dir_entry 数组，顺序存储在数据块中。每个 dir_entry 16字节：2字节 inode 号 + 14字节文件名（以0填充）。查找文件时，就是线性扫描这个数组比较 name 字段。每1024字节块可容纳64个目录项。"." 指向自身 inode，".." 指向父目录 inode。inode号为0表示该项已删除。',
    code: 'struct dir_entry {\n  unsigned short inode; // 2字节\n  char name[NAME_LEN];  // 14字节\n}; // 共 16 字节，每块 64 项',
  },
  {
    phaseIdx: 2, phase: '目录与路径', title: 'namei() — 逐级路径解析',
    scene: 'namei',
    srcFile: 'fs/namei.c', srcRef: 'namei.c:70',
    tagType: 'warning',
    explain: 'namei 从根 inode 出发，逐个分量读目录块，线性扫描 dir_entry 找到 inode',
    detail: 'namei(pathname) 是 Linux 0.11 文件路径解析的核心函数。执行过程：从 current->root（根 inode，通常是#1）或 current->pwd（当前目录 inode）出发；分割路径字符串，按 "/" 分隔每个分量；对每个分量调用 dir_namei() + lookup()：读取当前目录的数据块，线性扫描 dir_entry 数组，找到匹配 name 的项，取出 inode 号；用 iget(dev, inodenum) 从磁盘（或 inode 缓存）加载该 inode；循环直到解析完最后一个分量，返回目标 inode。',
    code: 'struct inode * namei(const char * pathname)\n// 示例：namei("/etc/passwd")\n// 1. iget(root_dev, 1) → 根目录inode\n// 2. lookup(root_inode, "etc") → inode#14\n// 3. lookup(etc_inode, "passwd") → inode#27\n// 4. return inode#27',
  },
  {
    phaseIdx: 3, phase: '文件操作', title: 'sys_open() — 打开文件全过程',
    scene: 'sys-open',
    srcFile: 'fs/open.c', srcRef: 'open.c:160',
    tagType: 'danger',
    explain: 'sys_open 找空 filp[]、调用 namei 解析路径、建立 inode→file→fd 三层映射',
    detail: 'sys_open(filename, flags, mode) 的完整流程：① 在当前进程的 filp[] 数组中找最小空闲槽位作为 fd；② 在全局 file_table[] 中分配一个 struct file；③ 调用 open_namei(filename, flags, mode) 解析路径得到 inode（内部调用 namei()）；④ 根据文件类型设置 file->f_op 指向对应的 file_operations；⑤ 调用 f_op->open()；⑥ 设置 f_pos=0, f_mode, f_flags；⑦ 将 file 指针存入 filp[fd]；⑧ 返回 fd。',
    code: 'int sys_open(char *filename, int flags, int mode)\n// 返回值：fd（文件描述符）\n// 失败：返回负的错误码',
  },
  {
    phaseIdx: 3, phase: '文件操作', title: 'sys_read() — 从文件读数据',
    scene: 'sys-read',
    srcFile: 'fs/read_write.c', srcRef: 'read_write.c:85',
    tagType: 'danger',
    explain: 'sys_read → file_operations.read → bmap() 定位块 → bread() 读缓存 → copy 到用户',
    detail: 'sys_read(fd, buf, count)：① 验证 fd 合法，取 file = filp[fd]；② 调用 file->f_op->read(inode, file, buf, count)；③ 对于普通文件（file_read），循环：用 bmap(inode, f_pos/BLOCK_SIZE) 获取当前位置对应的物理块号；④ 调用 bread(inode->i_dev, block) 从缓冲区缓存获取块数据（未命中则从磁盘读入）；⑤ 从 buffer_head 复制数据到用户空间 buf（用 memcpy_tofs）；⑥ 更新 f_pos += 已读字节；⑦ 循环直到 count 满足或到达文件末尾（f_pos >= i_size）。',
    code: 'int sys_read(int fd, char *buf, int count)\n→ file->f_op->read(inode, filp, buf, count)\n→ file_read() (fs/file_dev.c)',
  },
  {
    phaseIdx: 3, phase: '文件操作', title: '缓冲区高速缓存 — bread() 与 LRU',
    scene: 'buffer-cache',
    srcFile: 'fs/buffer.c', srcRef: 'buffer.c:1',
    tagType: 'danger',
    explain: 'bread 先查 hash 表，命中返回，未命中找 LRU 空闲块，发起磁盘 I/O',
    detail: '缓冲区高速缓存（buffer cache）是 Linux 0.11 文件系统性能的关键。bread(dev, block) 执行：① 在 hash 表中查找 (dev, block)，命中则直接返回 buffer_head；② 未命中则调用 getblk() 找一个空闲或最久未使用（LRU）的 buffer；③ 发起 ll_rw_block(READ, bh) 从磁盘读入数据（进程 sleep_on 等待）；④ DMA 完成后唤醒进程，buffer_head 中的数据有效（b_uptodate=1）。写操作只修改缓冲区并标记 b_dirt=1，由 sync() 或延迟写逻辑刷回磁盘。',
    code: 'struct buffer_head {\n  char *b_data;        // 数据指针（1024B）\n  unsigned long b_blocknr; // 块号\n  unsigned short b_dev;   // 设备号\n  unsigned char b_uptodate; // 数据有效\n  unsigned char b_dirt;   // 已被修改\n  unsigned char b_count;  // 引用计数\n  unsigned char b_lock;   // I/O 锁\n  struct task_struct *b_wait;\n  struct buffer_head *b_prev, *b_next;      // LRU\n  struct buffer_head *b_prev_free, *b_next_free;\n  struct buffer_head *b_hash_prev, *b_hash_next;\n};',
  },
  {
    phaseIdx: 4, phase: 'VFS', title: 'struct file_operations — 函数指针多态',
    scene: 'file-ops',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:76',
    tagType: '',
    explain: 'VFS 通过 file_operations 函数指针表让同一 read() 分发到不同实现',
    detail: 'file_operations 是 Linux VFS 机制的核心：一个包含函数指针的结构体，不同类型的文件填充不同的函数。open() 时根据 inode 的类型（S_ISREG/S_ISCHR/S_ISBLK/S_ISFIFO）选择对应的 file_operations 并赋值给 file->f_op。之后 sys_read() 只需调用 file->f_op->read() 即可，无需关心底层是磁盘文件还是管道还是字符设备——这就是多态。Linux 0.11 支持的类型：普通文件（file_read/file_write）、字符设备（chr_read/chr_write）、管道（pipe_read/pipe_write）。',
    code: 'struct file_operations {\n  int (*lseek)(...);\n  int (*read)(...);\n  int (*write)(...);\n  int (*readdir)(...);\n  int (*select)(...);\n  int (*ioctl)(...);\n  int (*open)(...);\n  void (*release)(...);\n};',
  },
  {
    phaseIdx: 4, phase: 'VFS', title: 'write() + bmap() + new_block() — 写文件全流程',
    scene: 'write-flow',
    srcFile: 'fs/inode.c', srcRef: 'inode.c:45',
    tagType: '',
    explain: 'write 时 bmap(create=1) 按需分配新块，写入缓冲区并标 dirty，sync 时刷盘',
    detail: 'sys_write → file_write()：循环处理每个逻辑块。bmap(inode, block, create=1) 是关键——若 i_zone[block] 已有块号，直接返回；若为0（块未分配），调用 new_block(dev) 从数据块位图找空闲块，将块号写入 i_zone[block] 并标脏，返回新块号。然后 getblk(dev, blk) 获取对应 buffer_head，把用户数据 memcpy_fromfs 写入，标记 b_dirt=1。最后更新 inode->i_size 并标脏。缓冲区中的脏数据并不立即写磁盘，由 update 守护进程或 sync() 周期性 bwrite() 刷回，提升写入效率。',
    code: '// file_write() 核心\nblk = bmap(inode, (file->f_pos)/BLOCK_SIZE, 1);\nbh = getblk(inode->i_dev, blk);\nmemcpy_fromfs(bh->b_data + offset, buf, chars);\nbh->b_dirt = 1;\nbrelse(bh);\nfile->f_pos += chars;\nif (file->f_pos > inode->i_size)\n  inode->i_size = file->f_pos;',
  },
]

const phases = ['总览', '磁盘布局', '目录与路径', '文件操作', 'VFS']

// ─── 当前状态 ─────────────────────────────────────────────────
const currentIdx = ref(0)
const isPlaying  = ref(false)
let   playTimer  = null

const currentStep  = computed(() => steps[currentIdx.value])
const currentPhase = computed(() => steps[currentIdx.value].phaseIdx)

// ─── 左侧 inode 状态 ──────────────────────────────────────────
const curInodeNum   = ref(1)
const curInodeMode  = ref('040755')
const curInodeSize  = ref('1024 B')
const curInodeLinks = ref(3)
const curInodeZone  = ref(100)
const curInodeCount = ref(1)

const leftFdTable = ref([
  { label: 'stdin  (tty)', active: false },
  { label: 'stdout (tty)', active: false },
  { label: 'stderr (tty)', active: false },
  { label: '——', active: false },
])

const currentPath = ref('')
const pathSegs    = ref([])
const pathProgress = ref(-1)

// ─── 动画变量 ─────────────────────────────────────────────────
const diskAnimSub   = ref(0)
const diskActiveIdx = ref(-1)
const inodeAddrSub  = ref(0)
const dirAnimIdx    = ref(-1)
const nameiSub      = ref(-1)
const openSub       = ref(-1)
const readSub       = ref(-1)
const bufHitIdx     = ref(-1)
const bufMissIdx    = ref(-1)
const breadSub      = ref(-1)
const fopsAnimIdx   = ref(-1)
const writeFlowSub  = ref(-1)

let subTimer  = null
let scanTimer = null

function clearTimers() {
  clearTimeout(subTimer); clearInterval(scanTimer)
  subTimer = null; scanTimer = null
}

function ticker(animRef, max, interval, onDone) {
  animRef.value = 0
  scanTimer = setInterval(() => {
    animRef.value++
    if (animRef.value >= max) { clearInterval(scanTimer); if (onDone) onDone() }
  }, interval)
}

// ─── 磁盘块 ───────────────────────────────────────────────────
const diskBlocks = [
  { name: '引导块', range: '块 0',      detail: 'bootsect',    color: '#909399', flex: 1 },
  { name: '超级块', range: '块 1',      detail: 'super_block', color: '#9B59B6', flex: 1 },
  { name: 'inode位图', range: '块 2',   detail: '184 inodes',  color: '#409EFF', flex: 1 },
  { name: '块位图',  range: '块 3-4',   detail: '1440 zones',  color: '#67C23A', flex: 2 },
  { name: 'inode表', range: '块 5-10',  detail: '32B×184',     color: '#e6a23c', flex: 2 },
  { name: '数 据 区', range: '块 11-1439', detail: '目录/文件', color: '#F56C6C', flex: 8 },
]

const superFields = [
  { name: 's_ninodes',      val: '184',   desc: 'inode总数' },
  { name: 's_nzones',       val: '1440',  desc: '数据块总数' },
  { name: 's_imap_blocks',  val: '1',     desc: 'inode位图块数' },
  { name: 's_zmap_blocks',  val: '2',     desc: '数据块位图块数' },
  { name: 's_firstdatazone',val: '11',    desc: '第一个数据块号' },
  { name: 's_max_size',     val: '268966912', desc: '最大文件字节数' },
  { name: 's_magic',        val: '0x137F', desc: 'Minix 魔数' },
]

// ─── inode zone ───────────────────────────────────────────────
const inodeZones = [
  { type: '直接块', blk: 100 },
  { type: '直接块', blk: 101 },
  { type: '直接块', blk: 102 },
  { type: '直接块', blk: 103 },
  { type: '直接块', blk: 104 },
  { type: '直接块', blk: 105 },
  { type: '直接块', blk: 106 },
  { type: '一级间接', blk: 200 },
  { type: '二级间接', blk: 300 },
]

// ─── 目录项 ───────────────────────────────────────────────────
const dirEntries = [
  { inode: 1,  name: '.', type: 'dir', typeLabel: '目录' },
  { inode: 0,  name: '..', type: 'dir', typeLabel: '目录' },
  { inode: 2,  name: 'bin', type: 'dir', typeLabel: '目录' },
  { inode: 5,  name: 'dev', type: 'dir', typeLabel: '目录' },
  { inode: 14, name: 'etc', type: 'dir', typeLabel: '目录' },
  { inode: 20, name: 'lib', type: 'dir', typeLabel: '目录' },
  { inode: 25, name: 'usr', type: 'dir', typeLabel: '目录' },
]

// ─── namei 节点 ───────────────────────────────────────────────
const nameiNodes = [
  { label: '从根 inode 出发', detail: 'current->root 或 "/" → iget(dev, 1)', isDir: true, result: 'inode #1 (/)' },
  { label: '读取根目录数据块', detail: 'bread(dev, bmap(root_inode, 0))', isDir: true, result: '得到 dir_entry 数组' },
  { label: '扫描找 "etc"', detail: '线性比较 dir_entry.name == "etc"', isDir: true, result: 'dir_entry.inode = 14' },
  { label: 'iget(dev, 14) → etc 目录 inode', detail: '从 inode 表或缓存加载', isDir: true, result: 'inode #14 (/etc)' },
  { label: '读 /etc 目录块，扫描找 "passwd"', detail: 'bread + 线性扫描', isDir: false, result: 'dir_entry.inode = 27' },
  { label: 'iget(dev, 27) → passwd inode', detail: '返回最终目标 inode', isDir: false, result: 'inode #27 (/etc/passwd)' },
]

// ─── open 节点 ────────────────────────────────────────────────
const openNodes = [
  { fn: 'sys_open()',       file: 'fs/open.c:160',       detail: '在 filp[] 找空槽 fd=3' },
  { fn: 'open_namei()',     file: 'fs/namei.c:530',      detail: 'flags=O_RDONLY，调用 namei()' },
  { fn: 'namei()',          file: 'fs/namei.c:70',       detail: '逐级解析路径 → inode #27' },
  { fn: 'iget(dev, 27)',    file: 'fs/inode.c:98',       detail: '加载/命中 inode 缓存，i_count++' },
  { fn: 'file_table 分配',  file: 'fs/file_table.c:15',  detail: 'f_inode=inode#27, f_pos=0' },
  { fn: 'f_op = &file_operations', file: 'fs/open.c',   detail: '根据 i_mode 选 file_operations' },
  { fn: 'filp[3] = file',  file: 'fs/open.c:205',       detail: '返回 fd=3' },
]

// ─── read 节点 ────────────────────────────────────────────────
const readNodes = [
  { label: 'sys_read(fd=3, buf, 100)', detail: 'fs/read_write.c: 验证 fd，取 filp[3]' },
  { label: 'file->f_op->read(inode, file, buf, 100)', detail: '→ file_read() (fs/file_dev.c)' },
  { label: 'bmap(inode, f_pos/BLOCK_SIZE)', detail: '逻辑块0 → i_zone[0] = 物理块100' },
  { label: 'bread(dev, 100)', detail: '查 hash 表，命中返回 buffer_head' },
  { label: 'memcpy_tofs(buf, bh->b_data, 100)', detail: '从内核缓冲区复制到用户空间' },
  { label: 'f_pos += 100; return 100', detail: '推进文件指针，返回实际读取字节数' },
]

// ─── hash 槽 ──────────────────────────────────────────────────
const hashSlots = [
  {
    chain: [
      { id: 0, dev: 3, blk: 1, dirty: false },
      { id: 1, dev: 3, blk: 5, dirty: false },
    ]
  },
  {
    chain: [
      { id: 2, dev: 3, blk: 100, dirty: false },
    ]
  },
  {
    chain: [
      { id: 3, dev: 3, blk: 11, dirty: true },
      { id: 4, dev: 3, blk: 14, dirty: false },
    ]
  },
  {
    chain: [
      { id: 5, dev: 3, blk: 27, dirty: true },
    ]
  },
]

const breadNodes = [
  { label: 'bread(dev=3, block=100)', result: null },
  { label: 'getblk(3, 100)  → hash 查找', result: '在 hashSlots[1] 找到！' },
  { label: '缓存命中 (b_uptodate=1)', result: '直接返回 buffer_head' },
  { label: '调用方使用 bh->b_data', result: '无磁盘 I/O，性能极高' },
]

// ─── file_operations 表 ───────────────────────────────────────
const fopsRows = [
  { type: 'reg',  label: '普通文件',   read: 'file_read',  write: 'file_write',  open: 'open()' },
  { type: 'pipe', label: '管道',       read: 'pipe_read',  write: 'pipe_write',  open: 'pipe_open' },
  { type: 'chr',  label: '字符设备',   read: 'chr_read',   write: 'chr_write',   open: 'chr_open' },
  { type: 'blk',  label: '块设备',     read: 'blk_read',   write: 'blk_write',   open: 'blk_open' },
  { type: 'dir',  label: '目录',       read: 'NULL',       write: 'NULL',        open: 'open()' },
]

// ─── write_flow 节点 ──────────────────────────────────────────
const writeFlowNodes = [
  { label: 'sys_write(fd, buf, count)', code: 'fs/read_write.c → file->f_op->write()' },
  { label: 'file_write(inode, filp, buf, count)', code: 'fs/file_dev.c:76' },
  { label: '计算逻辑块号 block = f_pos / 1024', code: '' },
  { label: 'bmap(inode, block, create=1)', code: '按需分配新块 new_block()' },
  { label: 'getblk(dev, phys_block) → buffer_head', code: '从缓存或空闲池获取' },
  { label: 'memcpy_fromfs(bh->b_data, buf, chars)', code: '用户数据写入内核缓冲' },
  { label: 'bh->b_dirt = 1; brelse(bh)', code: '标脏，释放引用' },
  { label: 'f_pos += chars; 更新 i_size', code: '推进文件指针和大小' },
]

// ─── 源码片段 ─────────────────────────────────────────────────
const overviewCode = `/* include/linux/fs.h 关键结构 */
struct super_block { ... };   // 超级块
struct inode { ... };         // 文件元数据
struct file {                 // 打开的文件
  unsigned short f_mode;
  struct inode * f_inode;
  off_t f_pos;
  struct file_operations *f_op;
};
struct file_operations {      // 操作函数表
  int (*read)(...);
  int (*write)(...);
  int (*open)(...);
  ...
};`

const diskLayoutCode = `/* include/linux/fs.h */
struct d_super_block {
  unsigned short s_ninodes;      /* inode 总数 */
  unsigned short s_nzones;       /* 数据区块总数 */
  unsigned short s_imap_blocks;  /* inode 位图块数 */
  unsigned short s_zmap_blocks;  /* 数据块位图块数 */
  unsigned short s_firstdatazone;/* 第一个数据块号 */
  unsigned short s_log_zone_size;/* log2(块大小/1024) */
  unsigned long  s_max_size;     /* 最大文件字节数 */
  unsigned short s_magic;        /* 0x137F */
};

/* 磁盘分区计算 */
// inode表起始块 = 2 + s_imap_blocks + s_zmap_blocks
// 数据区起始块  = s_firstdatazone
// 物理块号      = 逻辑块号 + s_firstdatazone - 1`

const inodeStructCode = `/* include/linux/fs.h */
struct d_inode {            /* 磁盘上的 inode（32字节）*/
  unsigned short i_mode;    /* 类型+权限 */
  unsigned short i_uid;
  unsigned long  i_size;    /* 字节数 */
  unsigned long  i_time;    /* 修改时间 */
  unsigned char  i_gid;
  unsigned char  i_nlinks;  /* 硬链接数 */
  unsigned short i_zone[9]; /* 块号数组 */
};

/* fs/inode.c: bmap() */
int bmap(struct inode * inode, int block)
{
  if (block < 0) panic("bmap: block<0");
  if (block >= 7+512+512*512)
    panic("bmap: block>big");
  if (block < 7)
    return inode->i_zone[block];
  block -= 7;
  if (block < 512) {  /* 一级间接 */
    bh = bread(inode->i_dev, inode->i_zone[7]);
    return ((unsigned short *)bh->b_data)[block];
  }
  /* 二级间接 */
  block -= 512;
  bh = bread(inode->i_dev, inode->i_zone[8]);
  i = ((unsigned short *)bh->b_data)[block>>9];
  bh = bread(inode->i_dev, i);
  return ((unsigned short *)bh->b_data)[block & 511];
}`

const dirEntryCode = `/* include/linux/fs.h */
#define NAME_LEN  14
#define ROOT_INO   1   /* 根目录 inode 号 */

struct dir_entry {
  unsigned short inode; /* 2字节 inode 号 */
  char name[NAME_LEN];  /* 14字节文件名 */
};                      /* 共 16 字节 */

/* 每块 1024/16 = 64 个目录项 */
/* inode==0 表示该项已删除    */

/* fs/namei.c: find_entry() */
static struct buffer_head *
find_entry(struct inode **dir, ...)
{
  /* 逐块读取目录，线性扫描 dir_entry */
  for (int i = 0; i < entries; i++) {
    if (de->inode != 0 &&
        !strncmp(name, de->name, namelen))
      return bh;  /* 找到了 */
    de++;
  }
  return NULL;  /* 未找到 */
}`

const nameiCode = `/* fs/namei.c */
struct inode * namei(const char * pathname)
{
  struct inode * base;
  const char * thisname;
  int namelen, error;
  struct buffer_head * bh;
  struct dir_entry * de;

  /* 确定起始目录 */
  if (!pathname || !*pathname)
    return NULL;
  if (*pathname == '/') {
    base = current->root;  /* 绝对路径 */
    pathname++;
  } else
    base = current->pwd;   /* 相对路径 */
  iget(base->i_dev, base->i_num); /* i_count++ */

  /* 逐级解析 */
  while (1) {
    thisname = pathname;
    /* 取下一个路径分量 */
    for (namelen = 0; *pathname && *pathname != '/';
         pathname++, namelen++);
    if (!*pathname)
      break;  /* 最后一个分量 */
    /* lookup(): 在当前目录找分量名 */
    bh = find_entry(&base, thisname, namelen, &de);
    int inodenum = de->inode;
    brelse(bh);
    iput(base);              /* 释放旧目录 */
    base = iget(dev, inodenum); /* 进入下级 */
    if (!base) return NULL;
    pathname++;              /* 跳过 "/" */
  }
  return base;  /* 返回目标 inode */
}`

const sysOpenCode = `/* fs/open.c */
int sys_open(const char * filename,
             int flag, int mode)
{
  struct inode * inode;
  struct file * f;
  int i, fd;

  /* 1. 找最小空闲 fd */
  for (fd = 0; fd < NR_OPEN; fd++)
    if (!current->filp[fd]) break;
  if (fd >= NR_OPEN) return -EINVAL;
  current->close_on_exec &= ~(1<<fd);

  /* 2. 分配 file 结构 */
  f = get_empty_filp();  /* file_table[] */
  current->filp[fd] = f;
  f->f_flags = flag;

  /* 3. 路径解析 → inode */
  if ((i = open_namei(filename, flag,
                      mode, &inode)) < 0) {
    current->filp[fd] = NULL;
    f->f_count = 0;
    return i;
  }

  /* 4. 设置 file_operations */
  if (S_ISCHR(inode->i_mode))
    f->f_op = &chr_file_operations;
  else if (S_ISBLK(inode->i_mode))
    f->f_op = &blk_file_operations;
  else
    f->f_op = &file_operations;

  /* 5. 调用 open，初始化 f_pos */
  if (f->f_op && f->f_op->open)
    i = f->f_op->open(inode, f);
  f->f_inode = inode;
  f->f_pos = 0;
  f->f_reada = 0;

  return (fd);  /* 返回文件描述符 */
}`

const sysReadCode = `/* fs/read_write.c */
int sys_read(unsigned int fd,
             char * buf, int count)
{
  struct file * file;
  struct inode * inode;

  if (fd >= NR_OPEN || count < 0
      || !(file = current->filp[fd]))
    return -EBADF;
  if (!count) return 0;

  inode = file->f_inode;
  /* 通过 f_op 多态分发 */
  if (file->f_op && file->f_op->read)
    return file->f_op->read(
              inode, file, buf, count);
  return -EINVAL;
}

/* fs/file_dev.c: file_read() 核心 */
int file_read(struct inode *inode,
              struct file *filp,
              char *buf, int count)
{
  int read = 0;
  struct buffer_head * bh;
  char * p;
  int nr, chars;

  while (count > 0) {
    nr = bmap(inode, filp->f_pos / BLOCK_SIZE);
    bh = bread(inode->i_dev, nr);
    nr = filp->f_pos % BLOCK_SIZE;
    chars = MIN(BLOCK_SIZE-nr, count);
    filp->f_pos += chars;
    read += chars;
    p = nr + bh->b_data;
    memcpy_tofs(buf, p, chars);
    buf += chars; count -= chars;
    brelse(bh);
  }
  return read;
}`

const bufferCacheCode = `/* fs/buffer.c */
/* NR_BUFFERS 个 buffer_head，在启动时分配 */
struct buffer_head * bread(int dev, int block)
{
  struct buffer_head * bh;

  /* 1. 查 hash 表 */
  if (bh = get_hash_table(dev, block))
    return bh;  /* 缓存命中！*/

  /* 2. 缓存未命中，找空闲/LRU */
  bh = getblk(dev, block);
  if (bh->b_uptodate)
    return bh;

  /* 3. 从磁盘读入 */
  ll_rw_block(READ, bh);
  wait_on_buffer(bh); /* 睡眠等 DMA */
  if (bh->b_uptodate)
    return bh;
  brelse(bh);
  return NULL;
}

/* hash 函数 */
#define _hashfn(dev,block) \
  (((unsigned)(dev^block))%NR_HASH)
#define hash(dev,block) \
  hash_table[_hashfn(dev,block)]`

const fileOpsCode = `/* include/linux/fs.h */
struct file_operations {
  int (*lseek)(struct inode *, struct file *,
               off_t, int);
  int (*read)(struct inode *, struct file *,
              char *, int);
  int (*write)(struct inode *, struct file *,
               char *, int);
  int (*readdir)(struct inode *, struct file *,
                 struct dirent *, int);
  int (*select)(struct inode *, struct file *,
                int, select_table *);
  int (*ioctl)(struct inode *, struct file *,
               unsigned int, unsigned long);
  int (*open)(struct inode *, struct file *);
  void (*release)(struct inode *, struct file *);
};

/* fs/char_dev.c */
extern struct file_operations chr_file_operations;
/* fs/block_dev.c */
extern struct file_operations blk_file_operations;
/* 普通文件 (fs/file_dev.c) */
struct file_operations file_operations = {
  file_lseek, file_read, file_write,
  NULL, NULL, NULL, NULL, NULL
};`

const bmapCode = `/* fs/inode.c: bmap() 含块分配 */
int bmap(struct inode * inode,
         int block, int create)
{
  struct buffer_head * bh;
  unsigned short * i;

  if (block < 7) {
    /* 直接块 */
    if (create && !inode->i_zone[block])
      inode->i_zone[block] =
        new_block(inode->i_dev); /* 分配新块 */
    return inode->i_zone[block];
  }
  block -= 7;
  if (block < 512) {
    /* 一级间接 */
    if (create && !inode->i_zone[7])
      inode->i_zone[7] =
        new_block(inode->i_dev);
    bh = bread(inode->i_dev, inode->i_zone[7]);
    i = (unsigned short *)(bh->b_data) + block;
    if (create && !*i) {
      *i = new_block(inode->i_dev);
      bh->b_dirt = 1;
    }
    return *i;
  }
  /* 二级间接（类似，省略）*/
  ...
}

/* fs/bitmap.c: new_block() */
int new_block(int dev) {
  /* 扫描 s_zmap 找空闲位 */
  /* 置1，标脏，返回块号    */
}`

// ─── watch 驱动动画 ───────────────────────────────────────────
watch(currentIdx, (idx) => {
  clearTimers()

  // 重置
  diskAnimSub.value  = 0
  diskActiveIdx.value = -1
  inodeAddrSub.value = 0
  dirAnimIdx.value   = -1
  nameiSub.value     = -1
  openSub.value      = -1
  readSub.value      = -1
  bufHitIdx.value    = -1
  bufMissIdx.value   = -1
  breadSub.value     = -1
  fopsAnimIdx.value  = -1
  writeFlowSub.value = -1
  currentPath.value  = ''
  pathSegs.value     = []
  pathProgress.value = -1

  const scene = steps[idx].scene

  // 更新左侧 inode
  if (scene === 'overview') {
    curInodeNum.value = 1; curInodeMode.value = '040755'
    curInodeSize.value = '16 B'; curInodeLinks.value = 3; curInodeZone.value = 100
    curInodeCount.value = 1
  } else if (scene === 'disk-layout') {
    curInodeNum.value = 1
    let i = 0
    scanTimer = setInterval(() => {
      diskActiveIdx.value = i
      if (i === 1) diskAnimSub.value = 1
      i++
      if (i >= diskBlocks.length) clearInterval(scanTimer)
    }, 600)
  } else if (scene === 'inode-struct') {
    curInodeNum.value = 27; curInodeMode.value = '0100644'
    curInodeSize.value = '2048 B'; curInodeLinks.value = 1; curInodeZone.value = 100
    curInodeCount.value = 1
    ticker(inodeAddrSub, 9, 600)
  } else if (scene === 'dir-entry') {
    curInodeNum.value = 1; curInodeMode.value = '040755'
    curInodeSize.value = '112 B'
    ticker(dirAnimIdx, dirEntries.length, 400)
  } else if (scene === 'namei') {
    currentPath.value = '/etc/passwd'
    pathSegs.value = ['etc', 'passwd']
    curInodeNum.value = 1
    let i = -1
    scanTimer = setInterval(() => {
      i++
      nameiSub.value = i
      pathProgress.value = i >= 3 ? 0 : -1
      if (i >= 3) pathProgress.value = 0
      if (i >= 5) {
        pathProgress.value = 1
        curInodeNum.value = 27
        curInodeMode.value = '0100644'
        curInodeSize.value = '1234 B'
      }
      if (i >= nameiNodes.length - 1) clearInterval(scanTimer)
    }, 900)
  } else if (scene === 'sys-open') {
    curInodeNum.value = 27; curInodeMode.value = '0100644'
    leftFdTable.value[3] = { label: '——', active: false }
    ticker(openSub, openNodes.length - 1, 700, () => {
      leftFdTable.value[3] = { label: 'inode#27 (/etc/passwd)', active: true }
      curInodeCount.value = 2
    })
  } else if (scene === 'sys-read') {
    curInodeNum.value = 27
    leftFdTable.value[3] = { label: 'inode#27, f_pos=0', active: true }
    ticker(readSub, readNodes.length - 1, 800, () => {
      leftFdTable.value[3] = { label: 'inode#27, f_pos=100', active: true }
    })
  } else if (scene === 'buffer-cache') {
    bufHitIdx.value = -1
    subTimer = setTimeout(() => {
      bufHitIdx.value = 2 // blk=100 命中
      setTimeout(() => { bufHitIdx.value = -1 }, 800)
      ticker(breadSub, breadNodes.length - 1, 800)
    }, 400)
  } else if (scene === 'file-ops') {
    ticker(fopsAnimIdx, fopsRows.length - 1, 700)
  } else if (scene === 'write-flow') {
    curInodeNum.value = 27; curInodeSize.value = '2048 B'
    ticker(writeFlowSub, writeFlowNodes.length - 1, 700)
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
    }, 4500)
  } else { clearInterval(playTimer) }
}
onUnmounted(() => { clearTimers(); clearInterval(playTimer) })
</script>

<style scoped>
.fs-vis { max-width: 1100px; margin: 0 auto; }

/* ─── Phase bar ─── */
.phase-bar { display: flex; gap: 4px; margin-bottom: 12px; }
.phase-seg {
  flex: 1; padding: 6px 10px; border-radius: 6px; cursor: pointer;
  background: #f0f2f5; text-align: center; font-size: 12px; color: #909399; transition: all .2s;
}
.phase-seg.active { background: #409EFF; color: #fff; }
.phase-seg.done   { background: #67C23A; color: #fff; }

/* ─── Step dots ─── */
.step-row { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.step-dot {
  width: 10px; height: 10px; border-radius: 50%; background: #dcdfe6;
  cursor: pointer; transition: all .2s;
}
.step-dot.active { background: #409EFF; transform: scale(1.4); }
.step-dot.done   { background: #67C23A; }

/* ─── Main grid ─── */
.main-grid { display: grid; grid-template-columns: 220px 1fr 240px; gap: 12px; margin-bottom: 12px; align-items: start; }
.left-panel, .right-panel { background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; padding: 12px; }
.center-panel { background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; padding: 16px; min-height: 440px; }
.panel-title { font-size: 11px; font-weight: 600; color: #909399; margin-bottom: 8px; text-transform: uppercase; }
.scene-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 14px; text-align: center; }

/* ─── 左侧 ─── */
.cur-inode { margin-bottom: 10px; }
.ci-title { font-size: 11px; font-weight: 600; color: #409EFF; margin-bottom: 4px; }
.ci-row { display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0; }
.ci-k { color: #909399; }
.ci-v { color: #303133; font-family: monospace; font-weight: 600; }
.fd-section { margin-bottom: 10px; }
.lfd-row {
  display: flex; gap: 4px; font-size: 10px; padding: 2px 4px;
  border-radius: 3px; border-left: 2px solid #e4e7ed;
  background: #f5f7fa; margin-bottom: 2px; transition: all .3s;
}
.lfd-row.lfd-active { background: #f0f9eb; border-left-color: #67C23A; }
.lfd-num { color: #909399; width: 14px; flex-shrink: 0; }
.lfd-target { color: #303133; font-family: monospace; font-size: 10px; }
.path-state { margin-bottom: 8px; }
.ps-path { font-family: monospace; font-size: 11px; color: #409EFF; padding: 4px; background: #ecf5ff; border-radius: 3px; margin-bottom: 4px; }
.ps-seg { display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 4px; border-radius: 3px; opacity: .4; transition: all .4s; }
.ps-seg.ps-done { opacity: 1; background: #f0f9eb; }
.ps-seg.ps-current { opacity: 1; background: #ecf5ff; }
.pss-arrow { color: #909399; }
.pss-name  { font-weight: 600; color: #303133; }
.pss-inode { color: #67C23A; font-size: 9px; }
.left-explain { font-size: 11px; color: #606266; padding: 6px; background: #f5f7fa; border-radius: 4px; line-height: 1.5; }

/* ─── overview ─── */
.layer-stack { display: flex; flex-direction: column; gap: 4px; }
.ls-layer {
  padding: 10px 14px; border-radius: 6px; border: 1px solid transparent;
}
.ls-user  { background: #ecf5ff; border-color: #c6dbff; }
.ls-vfs   { background: #f9f0ff; border-color: #d3adf7; }
.ls-minix { background: #fff3e0; border-color: #f0d9a8; }
.ls-buf   { background: #f0f9eb; border-color: #b3e19d; }
.ls-disk  { background: #fef0f0; border-color: #f9c0c0; }
.ls-label { font-size: 12px; font-weight: 700; color: #303133; margin-bottom: 4px; }
.ls-items { display: flex; gap: 6px; flex-wrap: wrap; }
.ls-items span {
  background: #fff; border-radius: 4px; padding: 2px 6px;
  font-size: 11px; font-family: monospace; color: #606266; border: 1px solid #e4e7ed;
}
.ls-sub { font-size: 10px; color: #909399; margin-top: 3px; }
.ls-arrow { text-align: center; font-size: 11px; color: #c0c4cc; padding: 1px 0; }

/* ─── disk-layout ─── */
.disk-layout { display: flex; height: 60px; border-radius: 6px; overflow: hidden; border: 1px solid #e4e7ed; margin-bottom: 12px; }
.disk-blk {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 9px; color: #fff; font-weight: 600; transition: all .3s; cursor: default;
  border-right: 1px solid rgba(255,255,255,.3);
}
.disk-blk.disk-active { opacity: 1; box-shadow: inset 0 0 0 2px rgba(255,255,255,.8); }
.db-name   { font-size: 10px; font-weight: 700; }
.db-range  { font-size: 8px; opacity: .8; }
.db-detail { font-size: 8px; opacity: .7; }
.super-block-box { border: 1px solid #d3adf7; border-radius: 6px; padding: 8px; background: #f9f0ff; }
.sbb-title { font-size: 11px; font-weight: 600; color: #9B59B6; margin-bottom: 6px; }
.sbb-grid  { }
.sbb-row { display: grid; grid-template-columns: 120px 60px 1fr; gap: 4px; font-size: 10px; padding: 2px 0; }
.sbb-name { color: #9B59B6; font-family: monospace; }
.sbb-val  { color: #303133; font-weight: 600; font-family: monospace; }
.sbb-desc { color: #909399; }

/* ─── inode addr ─── */
.inode-addr { display: flex; gap: 12px; }
.ia-inode { width: 130px; flex-shrink: 0; }
.ia-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.ia-zone {
  display: flex; align-items: center; gap: 4px; padding: 3px 6px;
  border-radius: 3px; font-size: 10px; margin-bottom: 2px;
  border-left: 3px solid #dcdfe6; background: #f5f7fa; transition: all .3s;
}
.ia-zone.ia-direct   { border-left-color: #409EFF; }
.ia-zone.ia-indirect1{ border-left-color: #e6a23c; }
.ia-zone.ia-indirect2{ border-left-color: #F56C6C; }
.ia-zone.ia-active   { background: #ecf5ff; box-shadow: 0 0 0 1px #409EFF; }
.iaz-idx  { color: #909399; width: 20px; flex-shrink: 0; }
.iaz-type { color: #606266; flex: 1; font-size: 9px; }
.iaz-val  { color: #409EFF; font-family: monospace; font-size: 9px; }
.ia-zone.ia-indirect1 .iaz-val { color: #e6a23c; }
.ia-zone.ia-indirect2 .iaz-val { color: #F56C6C; }
.ia-blocks { flex: 1; }
.ia-area-title { font-size: 10px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.ia-direct-area, .ia-ind1-area, .ia-ind2-area { margin-bottom: 8px; }
.ia-blk-row { display: flex; gap: 3px; flex-wrap: wrap; }
.ia-blk {
  width: 44px; height: 40px; border-radius: 4px; border: 1px solid #c6dbff;
  background: #ecf5ff; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-size: 9px;
}
.ia-blk.ia-blk-active { background: #409EFF; color: #fff; }
.ia-blk.ia-blk-sm { width: 36px; height: 34px; }
.iabl-num  { color: #409EFF; font-weight: 600; font-size: 9px; }
.iabl-data { color: #c0c4cc; font-size: 8px; }
.ia-blk.ia-blk-active .iabl-num, .ia-blk.ia-blk-active .iabl-data { color: #fff; }
.ia-ind1-box { display: flex; gap: 8px; align-items: flex-start; }
.ia-ind1-table { background: #fff3e0; border: 1px solid #f0d9a8; border-radius: 4px; padding: 4px; }
.ia-ind1-entry { font-size: 9px; color: #e6a23c; font-family: monospace; padding: 1px 4px; }
.ia-ind1-dots { color: #c0c4cc; }
.ia-ind1-targets { display: flex; gap: 3px; align-items: center; }
.ia-ind2-note { font-size: 10px; color: #F56C6C; background: #fef0f0; border-radius: 4px; padding: 6px; }
.inode-size-note { margin-top: 8px; font-size: 12px; color: #606266; text-align: center; }

/* ─── dir-entry ─── */
.dir-demo { }
.dd-inode-box { padding: 8px 12px; background: #ecf5ff; border-radius: 6px; margin-bottom: 6px; }
.dd-inode-title { font-size: 12px; font-weight: 600; color: #409EFF; }
.dd-inode-info  { font-size: 10px; color: #909399; font-family: monospace; }
.dd-arrow { text-align: center; font-size: 12px; color: #909399; margin: 4px 0; }
.dd-entries { border: 1px solid #e4e7ed; border-radius: 6px; overflow: hidden; }
.dd-header {
  display: grid; grid-template-columns: 70px 1fr 60px; gap: 8px;
  padding: 5px 10px; background: #f5f7fa; font-size: 10px; font-weight: 600; color: #909399;
}
.dde-row {
  display: grid; grid-template-columns: 70px 1fr 60px; gap: 8px;
  padding: 5px 10px; font-size: 11px; border-top: 1px solid #f0f2f5;
  transition: all .3s; opacity: .4;
}
.dde-row.dde-active { background: #ecf5ff; opacity: 1; }
.dde-row.dde-done   { opacity: 1; }
.dde-inode { color: #909399; font-family: monospace; }
.dde-name  { color: #303133; font-family: monospace; font-weight: 600; }
.dde-type  { font-size: 10px; }
.dde-dir  { color: #409EFF; }
.dde-file { color: #67C23A; }
.dir-note { margin-top: 8px; font-size: 11px; color: #606266; padding: 8px; background: #f5f7fa; border-radius: 4px; line-height: 1.6; }

/* ─── namei ─── */
.namei-flow { display: flex; flex-direction: column; gap: 5px; }
.nf-node {
  display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px;
  border-radius: 6px; border-left: 3px solid #dcdfe6; background: #f5f7fa;
  opacity: .35; transition: all .4s;
}
.nf-node.nf-active { opacity: 1; }
.nf-node.nf-active.nf-dir  { border-left-color: #409EFF; background: #ecf5ff; }
.nf-node.nf-active.nf-file { border-left-color: #67C23A; background: #f0f9eb; }
.nf-node.nf-current { box-shadow: 0 0 0 2px #409EFF40; }
.nfn-step { width: 20px; height: 20px; border-radius: 50%; background: #dcdfe6; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; color: #fff; }
.nf-node.nf-active.nf-dir  .nfn-step { background: #409EFF; }
.nf-node.nf-active.nf-file .nfn-step { background: #67C23A; }
.nfn-body  { flex: 1; }
.nfn-label { font-size: 11px; font-weight: 600; color: #303133; }
.nfn-detail{ font-size: 10px; color: #909399; margin-top: 2px; }
.nfn-result{ font-size: 11px; font-weight: 600; color: #67C23A; font-family: monospace; flex-shrink: 0; }

/* ─── sys-open ─── */
.open-flow { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.of-node {
  padding: 6px 12px; border-radius: 5px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.of-node.of-active  { opacity: 1; border-left-color: #9B59B6; }
.of-node.of-current { background: #f9f0ff; }
.ofn-fn     { font-size: 12px; font-weight: 600; color: #303133; font-family: monospace; }
.ofn-file   { font-size: 10px; color: #909399; }
.ofn-detail { font-size: 10px; color: #67C23A; margin-top: 2px; }
.open-result { }
.or-title { font-size: 12px; font-weight: 600; color: #67C23A; margin-bottom: 6px; }
.or-chain { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.or-box { padding: 6px 10px; border-radius: 6px; font-size: 10px; text-align: center; font-family: monospace; }
.or-fd     { background: #ecf5ff; border: 1px solid #c6dbff; color: #409EFF; }
.or-file   { background: #f9f0ff; border: 1px solid #d3adf7; color: #9B59B6; }
.or-inode  { background: #fff3e0; border: 1px solid #f0d9a8; color: #e6a23c; }
.or-disk   { background: #f5f7fa; border: 1px solid #dcdfe6; color: #606266; }
.or-arrow  { color: #909399; font-size: 14px; }

/* ─── sys-read ─── */
.read-flow { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.rf-node {
  padding: 6px 12px; border-radius: 5px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.rf-node.rf-active  { opacity: 1; border-left-color: #F56C6C; }
.rf-node.rf-current { background: #fef0f0; }
.rfn-label  { font-size: 11px; font-weight: 600; color: #303133; }
.rfn-detail { font-size: 10px; color: #909399; margin-top: 2px; }
.rfn-arrow  { text-align: center; font-size: 10px; color: #c0c4cc; }
.data-flow { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.df-box { padding: 8px 12px; border-radius: 6px; font-size: 11px; text-align: center; font-weight: 600; }
.df-disk { background: #fef0f0; border: 1px solid #f9c0c0; color: #F56C6C; }
.df-buf  { background: #fff3e0; border: 1px solid #f0d9a8; color: #e6a23c; }
.df-user { background: #f0f9eb; border: 1px solid #b3e19d; color: #67C23A; }
.df-arrow { color: #909399; font-size: 12px; font-weight: 600; }

/* ─── buffer-cache ─── */
.buf-cache { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.bc-hash-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.bc-hash-table { display: flex; flex-direction: column; gap: 4px; }
.bc-slot { display: flex; align-items: center; gap: 6px; }
.bc-slot-idx { width: 24px; font-size: 10px; color: #909399; text-align: right; flex-shrink: 0; }
.bc-chain { display: flex; gap: 3px; }
.bc-bh {
  padding: 4px 6px; border-radius: 4px; font-size: 9px; background: #f5f7fa;
  border: 1px solid #e4e7ed; transition: all .4s; min-width: 50px;
}
.bc-bh.bc-hit   { background: #f0f9eb; border-color: #67C23A; box-shadow: 0 0 0 2px #67C23A40; animation: flash .4s; }
.bc-bh.bc-miss  { background: #fef0f0; border-color: #F56C6C; }
.bc-bh.bc-dirty { background: #fff3e0; border-color: #e6a23c; }
.bh-dev, .bh-blk { color: #606266; }
.bh-state { color: #909399; font-size: 8px; }
.bc-bread-flow { }
.bb-node {
  padding: 6px 10px; border-radius: 5px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s; margin-bottom: 4px;
}
.bb-node.bb-active  { opacity: 1; border-left-color: #409EFF; }
.bb-node.bb-current { background: #ecf5ff; }
.bbn-label  { font-size: 11px; font-weight: 600; color: #303133; }
.bbn-result { font-size: 10px; color: #67C23A; margin-top: 2px; }

/* ─── file-ops ─── */
.fops-demo { }
.fops-call { padding: 8px 12px; background: #f9f0ff; border-radius: 6px; margin-bottom: 10px; }
.fc-title    { font-size: 12px; font-weight: 600; color: #9B59B6; font-family: monospace; }
.fc-dispatch { font-size: 10px; color: #909399; margin-top: 2px; font-family: monospace; }
.fops-table { border: 1px solid #e4e7ed; border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.ft-header {
  display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 4px;
  padding: 6px 8px; background: #f5f7fa; font-size: 10px; font-weight: 600; color: #909399;
}
.ft-row {
  display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 4px;
  padding: 6px 8px; border-top: 1px solid #f0f2f5; font-size: 10px;
  transition: all .3s; opacity: .5;
}
.ft-row.ft-active { opacity: 1; background: #ecf5ff; }
.ft-type { font-weight: 600; padding: 1px 4px; border-radius: 3px; font-size: 9px; }
.ft-reg  { background: #ecf5ff; color: #409EFF; }
.ft-pipe { background: #f0f9eb; color: #67C23A; }
.ft-chr  { background: #fff3e0; color: #e6a23c; }
.ft-blk  { background: #fef0f0; color: #F56C6C; }
.ft-dir  { background: #f9f0ff; color: #9B59B6; }
.ft-fn { color: #606266; font-family: monospace; font-size: 9px; }
.fops-note { font-size: 11px; color: #606266; line-height: 1.6; padding: 8px; background: #f5f7fa; border-radius: 4px; }

/* ─── write-flow ─── */
.write-flow-demo { }
.wf-node {
  padding: 6px 12px; border-radius: 5px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s; margin-bottom: 4px;
}
.wf-node.wf-active  { opacity: 1; border-left-color: #e6a23c; }
.wf-node.wf-current { background: #fff3e0; }
.wfn-label { font-size: 11px; font-weight: 600; color: #303133; }
.wfn-code  { font-size: 10px; color: #909399; font-family: monospace; margin-top: 2px; }
.bmap-demo { margin-top: 10px; padding: 10px; background: #ecf5ff; border-radius: 6px; }
.bd-title  { font-size: 11px; font-weight: 600; color: #409EFF; margin-bottom: 6px; }
.bd-steps  { display: flex; gap: 8px; flex-wrap: wrap; }
.bd-step   { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.bds-label { font-size: 10px; color: #909399; }
.bds-val   { font-size: 11px; font-weight: 600; padding: 3px 6px; border-radius: 4px; background: #fff; border: 1px solid #c6dbff; color: #409EFF; }
.bds-yes   { background: #f0f9eb; border-color: #b3e19d; color: #67C23A; }
.bds-result{ background: #fff3e0; border-color: #f0d9a8; color: #e6a23c; }

/* ─── 右侧 ─── */
.right-note { margin-bottom: 8px; }
.rn-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.rn-item  { font-size: 11px; color: #606266; padding: 2px 0; line-height: 1.5; }
.src-snippet { background: #1a1a2e; border-radius: 6px; padding: 10px; overflow: auto; max-height: 440px; }
.ss-file { font-size: 10px; color: #67C23A; margin-bottom: 6px; font-family: monospace; }
.src-snippet pre { margin: 0; font-size: 10px; color: #a0aec0; font-family: monospace; line-height: 1.6; white-space: pre-wrap; }

/* ─── controls ─── */
.controls { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.step-counter { font-size: 12px; color: #909399; margin-left: 8px; }

/* ─── detail card ─── */
.detail-card { background: #fff; }
.dc-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dc-title  { font-size: 14px; font-weight: 600; color: #303133; }
.dc-src    { font-size: 11px; color: #909399; margin-left: auto; }
.dc-detail { font-size: 13px; color: #606266; line-height: 1.7; margin-bottom: 8px; }
.dc-code pre { background: #f5f7fa; padding: 10px; border-radius: 6px; font-size: 11px; font-family: monospace; white-space: pre-wrap; margin: 0; }

@keyframes flash { 0%,100%{opacity:1} 50%{opacity:.3} }
</style>
