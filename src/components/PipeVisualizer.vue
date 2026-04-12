<template>
  <div class="pipe-vis">
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

    <!-- 三栏主区域 -->
    <div class="main-grid">
      <!-- 左：管道状态 -->
      <div class="left-panel">
        <div class="panel-title">管道缓冲区状态</div>

        <!-- 环形缓冲区信息 -->
        <div class="buf-info">
          <div class="bi-row">
            <span class="bi-key">总容量</span>
            <span class="bi-val">4096 字节 (1 页)</span>
          </div>
          <div class="bi-row">
            <span class="bi-key">已使用</span>
            <span class="bi-val" :style="{ color: bufUsed >= 14 ? '#F56C6C' : '#67C23A' }">
              {{ bufUsed }}/16 块
            </span>
          </div>
          <div class="bi-row">
            <span class="bi-key">PIPE_HEAD</span>
            <span class="bi-val mono">{{ pipeHead.toString().padStart(2,'0') }}</span>
          </div>
          <div class="bi-row">
            <span class="bi-key">PIPE_TAIL</span>
            <span class="bi-val mono">{{ pipeTail.toString().padStart(2,'0') }}</span>
          </div>
        </div>

        <!-- 迷你缓冲区条 -->
        <div class="mini-buf">
          <div
            v-for="i in 16"
            :key="i"
            class="mb-cell"
            :class="{
              'mb-filled': isFilled(i - 1),
              'mb-head':   pipeHead % 16 === (i - 1) && currentStep.scene !== 'overview',
              'mb-tail':   pipeTail % 16 === (i - 1) && currentStep.scene !== 'overview',
            }"
          >
            <span v-if="pipeHead % 16 === (i-1) && currentStep.scene !== 'overview'" class="mb-ptr">W</span>
            <span v-else-if="pipeTail % 16 === (i-1) && currentStep.scene !== 'overview'" class="mb-ptr">R</span>
            <span v-else class="mb-idx">{{ i-1 }}</span>
          </div>
        </div>
        <div class="buf-legend">
          <span class="bl-item"><i class="bl-filled"></i>已填充</span>
          <span class="bl-item"><span class="bl-ptr-w">W</span>写指针</span>
          <span class="bl-item"><span class="bl-ptr-r">R</span>读指针</span>
        </div>

        <!-- 进程状态 -->
        <div class="proc-state">
          <div class="ps-title">进程状态</div>
          <div class="ps-row" :class="'ps-' + writerState">
            <span class="ps-name">写进程 (ls)</span>
            <span class="ps-badge">{{ writerStateLabel }}</span>
          </div>
          <div class="ps-row" :class="'ps-' + readerState">
            <span class="ps-name">读进程 (grep)</span>
            <span class="ps-badge">{{ readerStateLabel }}</span>
          </div>
        </div>

        <!-- 步骤说明 -->
        <div class="left-explain">{{ currentStep.explain }}</div>
      </div>

      <!-- 中：主可视化 -->
      <div class="center-panel">

        <!-- overview -->
        <template v-if="currentStep.scene === 'overview'">
          <div class="scene-title">管道：进程间单向数据通道</div>
          <div class="ov-pipeline">
            <div class="ov-proc ov-writer">
              <div class="ov-proc-name">进程 A (ls)</div>
              <div class="ov-proc-fd">fd[1] 写端</div>
              <div class="ov-proc-code">write(fd[1], buf, n)</div>
            </div>
            <div class="ov-pipe-box">
              <div class="ov-pipe-label">内核管道缓冲区</div>
              <div class="ov-pipe-inner">
                <div v-for="b in 8" :key="b"
                  class="ov-byte"
                  :style="{ animationDelay: (b * 0.15) + 's' }"
                >●</div>
              </div>
              <div class="ov-pipe-size">4096 字节 (环形)</div>
            </div>
            <div class="ov-proc ov-reader">
              <div class="ov-proc-name">进程 B (grep)</div>
              <div class="ov-proc-fd">fd[0] 读端</div>
              <div class="ov-proc-code">read(fd[0], buf, n)</div>
            </div>
          </div>
          <div class="ov-props">
            <div class="ov-prop">
              <span class="op-icon">→</span>
              <span class="op-text"><strong>单向</strong>：数据只能从 fd[1] 流向 fd[0]</span>
            </div>
            <div class="ov-prop">
              <span class="op-icon">🔄</span>
              <span class="op-text"><strong>环形缓冲</strong>：4096 字节，满则写阻塞，空则读阻塞</span>
            </div>
            <div class="ov-prop">
              <span class="op-icon">🔗</span>
              <span class="op-text"><strong>匿名</strong>：无文件名，只能在有亲缘关系的进程间使用</span>
            </div>
            <div class="ov-prop">
              <span class="op-icon">📋</span>
              <span class="op-text"><strong>EOF</strong>：写端全部关闭后，读端返回 0</span>
            </div>
          </div>
        </template>

        <!-- sys-pipe -->
        <template v-else-if="currentStep.scene === 'sys-pipe'">
          <div class="scene-title">sys_pipe() — 创建管道</div>
          <div class="pipe-create-flow">
            <div v-for="(node, ni) in pipeCreateNodes" :key="ni"
              class="pcf-node"
              :class="{ 'pcf-active': pipeCreateSub >= ni, 'pcf-current': pipeCreateSub === ni }"
            >
              <div class="pcf-label">{{ node.label }}</div>
              <div class="pcf-detail" v-if="node.detail">{{ node.detail }}</div>
            </div>
          </div>
          <!-- fd 表 -->
          <div class="fd-table" v-if="pipeCreateSub >= 3">
            <div class="fd-title">进程文件描述符表</div>
            <div class="fd-row" v-for="(fd, fi) in fdTable" :key="fi"
              :class="{ 'fd-new': fd.isNew && pipeCreateSub >= 4 }"
            >
              <span class="fd-num">fd[{{ fi }}]</span>
              <span class="fd-arrow">→</span>
              <span class="fd-target">{{ fd.target }}</span>
              <span class="fd-note" v-if="fd.note">{{ fd.note }}</span>
            </div>
          </div>
        </template>

        <!-- pipe-inode -->
        <template v-else-if="currentStep.scene === 'pipe-inode'">
          <div class="scene-title">管道 inode — 环形缓冲区结构</div>
          <div class="inode-diagram">
            <div class="id-title">struct inode (pipe 复用)</div>
            <div v-for="field in inodeFields" :key="field.name"
              class="id-row"
              :class="{ 'id-highlight': field.highlight }"
            >
              <span class="idf-type">{{ field.type }}</span>
              <span class="idf-name">{{ field.name }}</span>
              <span class="idf-val">{{ field.val }}</span>
              <span class="idf-desc">{{ field.desc }}</span>
            </div>
          </div>
          <!-- 环形缓冲区宏定义 -->
          <div class="macro-box">
            <div class="mb-title">关键宏 (include/linux/fs.h)</div>
            <div v-for="m in pipeMacros" :key="m.name" class="macro-row">
              <span class="macro-name">{{ m.name }}</span>
              <span class="macro-def">{{ m.def }}</span>
            </div>
          </div>
        </template>

        <!-- write-pipe -->
        <template v-else-if="currentStep.scene === 'write-pipe'">
          <div class="scene-title">pipe_write() — 写入环形缓冲区</div>
          <!-- 环形缓冲区动画 -->
          <div class="ring-vis">
            <div class="ring-buf">
              <div
                v-for="i in 16"
                :key="i"
                class="rb-cell"
                :class="{
                  'rb-filled': isFilled(i - 1),
                  'rb-writing': writeAnimPos === (i - 1),
                  'rb-head': pipeHead % 16 === (i - 1),
                }"
              >
                <span class="rbc-idx">{{ i - 1 }}</span>
                <span class="rbc-val" v-if="isFilled(i-1)">{{ bufData[i-1] || '·' }}</span>
                <span class="rbc-ptr" v-if="pipeHead % 16 === (i-1)">▲W</span>
              </div>
            </div>
            <div class="ring-tail-marker">
              <span v-for="i in 16" :key="i" class="rtm-slot">
                <span v-if="pipeTail % 16 === (i-1)" class="rtm-ptr">▲R</span>
                <span v-else class="rtm-empty"> </span>
              </span>
            </div>
          </div>
          <div class="write-code">
            <div v-for="(line, li) in writePipeCode" :key="li"
              class="wc-line"
              :class="{ 'wc-active': writeCodeLine === li }"
            >{{ line }}</div>
          </div>
          <div class="write-status">
            已写入 <strong>{{ pipeHead - pipeTail }}</strong> 块，
            剩余空间 <strong>{{ 15 - (pipeHead - pipeTail) }}</strong> 块
          </div>
        </template>

        <!-- read-pipe -->
        <template v-else-if="currentStep.scene === 'read-pipe'">
          <div class="scene-title">pipe_read() — 从环形缓冲区读出</div>
          <div class="ring-vis">
            <div class="ring-buf">
              <div
                v-for="i in 16"
                :key="i"
                class="rb-cell"
                :class="{
                  'rb-filled': isFilled(i - 1),
                  'rb-reading': readAnimPos === (i - 1),
                  'rb-tail': pipeTail % 16 === (i - 1),
                }"
              >
                <span class="rbc-idx">{{ i - 1 }}</span>
                <span class="rbc-val" v-if="isFilled(i-1)">{{ bufData[i-1] || '·' }}</span>
                <span class="rbc-ptr" v-if="pipeTail % 16 === (i-1)">▲R</span>
              </div>
            </div>
            <div class="ring-tail-marker">
              <span v-for="i in 16" :key="i" class="rtm-slot">
                <span v-if="pipeHead % 16 === (i-1)" class="rtm-ptr-w">▲W</span>
                <span v-else class="rtm-empty"> </span>
              </span>
            </div>
          </div>
          <div class="write-code">
            <div v-for="(line, li) in readPipeCode" :key="li"
              class="wc-line"
              :class="{ 'wc-active': readCodeLine === li }"
            >{{ line }}</div>
          </div>
          <div class="write-status">
            缓冲区剩余 <strong>{{ Math.max(0, pipeHead - pipeTail) }}</strong> 块，
            已读出 <strong>{{ readCount }}</strong> 块
          </div>
        </template>

        <!-- ring-wrap -->
        <template v-else-if="currentStep.scene === 'ring-wrap'">
          <div class="scene-title">环形缓冲区 — 循环写入（位掩码取模）</div>
          <div class="wrap-demo">
            <div class="wd-formula">
              <div class="wdf-title">指针推进方式</div>
              <div class="wdf-code">PIPE_HEAD(inode)++;<br/>/* 位与 (PAGE_SIZE-1) 取模，自动回绕 */<br/>((PIPE_HEAD) &amp; (PAGE_SIZE-1))</div>
            </div>
            <div class="ring-vis" style="margin-top:12px">
              <div class="ring-buf">
                <div
                  v-for="i in 16"
                  :key="i"
                  class="rb-cell"
                  :class="{
                    'rb-filled': wrapFilled(i - 1),
                    'rb-head': wrapHead % 16 === (i - 1),
                    'rb-tail': wrapTail % 16 === (i - 1),
                    'rb-writing': wrapAnimPos === (i - 1),
                  }"
                >
                  <span class="rbc-idx">{{ i - 1 }}</span>
                  <span class="rbc-val" v-if="wrapFilled(i-1)">●</span>
                  <span class="rbc-ptr" v-if="wrapHead % 16 === (i-1)">▲W</span>
                </div>
              </div>
              <div class="ring-tail-marker">
                <span v-for="i in 16" :key="i" class="rtm-slot">
                  <span v-if="wrapTail % 16 === (i-1)" class="rtm-ptr">▲R</span>
                  <span v-else class="rtm-empty"> </span>
                </span>
              </div>
            </div>
            <div class="wrap-info">
              <div>HEAD={{ wrapHead }} (HEAD%16={{ wrapHead % 16 }})</div>
              <div>TAIL={{ wrapTail }} (TAIL%16={{ wrapTail % 16 }})</div>
              <div>SIZE={{ wrapHead - wrapTail }} 块</div>
            </div>
          </div>
        </template>

        <!-- write-block -->
        <template v-else-if="currentStep.scene === 'write-block'">
          <div class="scene-title">缓冲区满 → 写进程阻塞</div>
          <div class="block-demo">
            <!-- 满缓冲区 -->
            <div class="bd-buf-full">
              <div class="bdf-label">管道缓冲区（已满 15/15）</div>
              <div class="bdf-cells">
                <div v-for="i in 15" :key="i" class="bdf-cell bdf-filled">●</div>
                <div class="bdf-cell bdf-reserved">×</div>
              </div>
              <div class="bdf-note">PIPE_FULL: SIZE == PAGE_SIZE-1（保留1字节区分满/空）</div>
            </div>
            <!-- 状态变化 -->
            <div class="block-states">
              <div v-for="(node, ni) in writeBlockNodes" :key="ni"
                class="bs-node"
                :class="{ 'bs-active': writeBlockSub >= ni, 'bs-current': writeBlockSub === ni }"
              >
                <div class="bsn-label">{{ node.label }}</div>
                <div class="bsn-code" v-if="node.code">{{ node.code }}</div>
              </div>
            </div>
          </div>
          <div class="block-wake" v-if="writeBlockSub >= writeBlockNodes.length - 1">
            <div class="bw-title">唤醒时机</div>
            <div class="bw-text">
              读进程执行 pipe_read() 消费数据后，调用 <code>wake_up(&amp;inode->i_wait)</code>，
              写进程从 sleep_on 返回，继续写入。
            </div>
          </div>
        </template>

        <!-- read-block -->
        <template v-else-if="currentStep.scene === 'read-block'">
          <div class="scene-title">缓冲区空 → 读进程阻塞（或 EOF）</div>
          <div class="empty-demo">
            <div class="ed-buf-empty">
              <div class="bdf-label">管道缓冲区（已空）</div>
              <div class="bdf-cells">
                <div v-for="i in 16" :key="i" class="bdf-cell bdf-empty">{{ i-1 }}</div>
              </div>
              <div class="bdf-note">PIPE_EMPTY: HEAD == TAIL</div>
            </div>
            <div class="read-decision">
              <div class="rd-title">pipe_read() 决策</div>
              <div class="rd-branch" :class="{ 'rd-active': readBlockSub >= 1 }">
                <div class="rd-cond">写端还开着 (inode->i_count > 1)</div>
                <div class="rd-action">sleep_on(&amp;inode->i_wait)  // 等待数据</div>
              </div>
              <div class="rd-branch rd-eof" :class="{ 'rd-active': readBlockSub >= 2 }">
                <div class="rd-cond">写端已全部关闭 (i_count == 1)</div>
                <div class="rd-action">return 0  // EOF，读到文件尾</div>
              </div>
            </div>
          </div>
          <div class="eof-note" v-if="readBlockSub >= 2">
            <strong>EOF 机制：</strong>写端关闭时 i_count 减为 1（只剩读端），
            读进程检测到这一条件，立即返回 0，不再阻塞。
            这是 shell 管道 "写完自动结束" 的根本原因。
          </div>
        </template>

        <!-- shell-pipe -->
        <template v-else-if="currentStep.scene === 'shell-pipe'">
          <div class="scene-title">Shell 管道实现：ls | grep foo</div>
          <div class="shell-flow">
            <div v-for="(node, ni) in shellNodes" :key="ni"
              class="sf-node"
              :class="{
                'sf-active': shellSub >= ni,
                'sf-current': shellSub === ni,
                'sf-shell':  node.actor === 'shell',
                'sf-ls':     node.actor === 'ls',
                'sf-grep':   node.actor === 'grep',
              }"
            >
              <div class="sfn-actor">{{ node.actorLabel }}</div>
              <div class="sfn-label">{{ node.label }}</div>
              <div class="sfn-code" v-if="node.code">{{ node.code }}</div>
            </div>
          </div>
          <!-- 进程树 -->
          <div class="proc-tree" v-if="shellSub >= 3">
            <div class="pt-shell">
              Shell (pid=1)<br/><small>fd[0], fd[1] 已关闭</small>
            </div>
            <div class="pt-children">
              <div class="pt-child pt-ls" v-if="shellSub >= 3">
                ls (pid=2)<br/>
                <small>stdout → fd[1]<br/>exec("ls")</small>
              </div>
              <div class="pt-pipe-arrow">→ pipe →</div>
              <div class="pt-child pt-grep" v-if="shellSub >= 5">
                grep (pid=3)<br/>
                <small>stdin ← fd[0]<br/>exec("grep foo")</small>
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
            <div class="rn-title">管道 vs 其他 IPC</div>
            <div class="rn-item">• 管道：简单、单向、亲缘进程</div>
            <div class="rn-item">• 信号：异步通知，无数据</div>
            <div class="rn-item">• socket：双向、网络</div>
          </div>
          <div class="src-snippet">
            <div class="ss-file">fs/pipe.c</div>
            <pre>{{ overviewCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'sys-pipe'">
          <div class="src-snippet">
            <div class="ss-file">fs/pipe.c</div>
            <pre>{{ sysPipeCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'pipe-inode'">
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ pipeInodeCode }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'write-pipe'">
          <div class="src-snippet">
            <div class="ss-file">fs/pipe.c</div>
            <pre>{{ writePipeSrc }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'read-pipe'">
          <div class="src-snippet">
            <div class="ss-file">fs/pipe.c</div>
            <pre>{{ readPipeSrc }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'ring-wrap'">
          <div class="src-snippet">
            <div class="ss-file">include/linux/fs.h</div>
            <pre>{{ ringWrapCode }}</pre>
          </div>
          <div class="right-note" style="margin-top:8px">
            <div class="rn-item">• PAGE_SIZE=4096=0x1000</div>
            <div class="rn-item">• HEAD &amp; 0xFFF 等价于 HEAD % 4096</div>
            <div class="rn-item">• 位运算比取模快，且2的幂自然对齐</div>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'write-block'">
          <div class="src-snippet">
            <div class="ss-file">fs/pipe.c: pipe_write()</div>
            <pre>{{ writeBlockSrc }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'read-block'">
          <div class="src-snippet">
            <div class="ss-file">fs/pipe.c: pipe_read()</div>
            <pre>{{ readBlockSrc }}</pre>
          </div>
        </template>

        <template v-else-if="currentStep.scene === 'shell-pipe'">
          <div class="src-snippet">
            <div class="ss-file">shell 伪代码</div>
            <pre>{{ shellPipeCode }}</pre>
          </div>
        </template>
      </div>
    </div>

    <!-- 控制 -->
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

// ─── 步骤数据 ─────────────────────────────────────────────────
const steps = [
  {
    phaseIdx: 0, phase: '总览', title: '管道：内核环形缓冲区连接两个进程',
    scene: 'overview',
    srcFile: 'fs/pipe.c', srcRef: 'pipe.c:1',
    tagType: 'info',
    explain: '管道是最古老的 IPC 机制，通过内核 4KB 环形缓冲区单向传输数据',
    detail: 'Linux 0.11 管道（pipe）是一个内核维护的单向数据通道：写进程向 fd[1] 写，读进程从 fd[0] 读，数据经过内核 4096 字节的环形缓冲区中转。管道没有文件名（匿名管道），只能在 fork() 产生的亲缘进程间共享。缓冲区满时写进程阻塞，缓冲区空时读进程阻塞，写端全关则读端得到 EOF。',
    code: null,
  },
  {
    phaseIdx: 1, phase: '创建', title: 'sys_pipe() — 创建管道并返回两个 fd',
    scene: 'sys-pipe',
    srcFile: 'fs/pipe.c', srcRef: 'pipe.c:60',
    tagType: 'success',
    explain: 'sys_pipe 分配 inode 和页面，在 fd 表中填入读/写两个文件描述符',
    detail: 'sys_pipe() 调用链：① get_pipe_inode() 分配一个 inode 并设 i_pipe=1，用 get_free_page() 分配 4096 字节缓冲区存入 i_size；② 打开两个文件项，一个 O_RDONLY（读端 fd[0]），一个 O_WRONLY（写端 fd[1]）；③ 将这两个 file 指针填入当前进程 task_struct.filp[] 的最小空闲槽位；④ 把两个 fd 编号写入用户栈（通过 put_fs_long）返回给用户程序。',
    code: 'int sys_pipe(unsigned long * fildes) {\n  // 返回 fd[0]=读端, fd[1]=写端\n}',
  },
  {
    phaseIdx: 1, phase: '创建', title: '管道 inode — 环形缓冲区的数据结构',
    scene: 'pipe-inode',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:110',
    tagType: 'success',
    explain: '管道复用 inode 结构，i_zone[0/1] 充当读写指针，i_size 存缓冲区地址',
    detail: '管道没有自己的专用数据结构，而是巧妙地复用了 struct inode。i_pipe=1 标识这是管道节点；i_size 存储 get_free_page() 返回的 4096 字节缓冲区基地址；i_zone[0] 宏定义为 PIPE_TAIL（读指针），i_zone[1] 为 PIPE_HEAD（写指针）。通过 PIPE_HEAD/PIPE_TAIL 两个宏操作这两个字段，(HEAD-TAIL)&0xFFF 得到当前数据量，HEAD==TAIL 表示空，SIZE==4095 表示满。',
    code: '#define PIPE_HEAD(inode) ((inode)->i_zone[1])\n#define PIPE_TAIL(inode) ((inode)->i_zone[0])\n#define PIPE_SIZE(inode) ((PIPE_HEAD(inode)-PIPE_TAIL(inode))&(PAGE_SIZE-1))',
  },
  {
    phaseIdx: 2, phase: '传输', title: 'pipe_write() — 向环形缓冲区写入数据',
    scene: 'write-pipe',
    srcFile: 'fs/pipe.c', srcRef: 'pipe.c:25',
    tagType: 'warning',
    explain: '写进程逐字节填入缓冲区，写指针 HEAD++ 前进，满则 sleep_on 等待',
    detail: 'pipe_write() 循环写入用户数据：每次把一个字节写入 buf[PIPE_HEAD & 0xFFF]（即环形缓冲区的 HEAD 位置），然后 PIPE_HEAD++ 推进写指针；若 PIPE_FULL（SIZE==4095）则调用 wake_up 唤醒可能在等待的读进程，再调用 sleep_on(&inode->i_wait) 让自己阻塞等待空间；若发现读端已关闭（i_count<=1），则给自己发送 SIGPIPE 信号并返回错误。',
    code: '// 每次写一个字节\nbuf[PIPE_HEAD & (PAGE_SIZE-1)] = get_fs_byte(buf++);\nPIPE_HEAD++;',
  },
  {
    phaseIdx: 2, phase: '传输', title: 'pipe_read() — 从环形缓冲区读出数据',
    scene: 'read-pipe',
    srcFile: 'fs/pipe.c', srcRef: 'pipe.c:1',
    tagType: 'warning',
    explain: '读进程逐字节从缓冲区取出，读指针 TAIL++ 前进，空则睡眠或返回 EOF',
    detail: 'pipe_read() 循环读出数据：每次从 buf[PIPE_TAIL & 0xFFF] 取一字节，PIPE_TAIL++ 推进读指针，唤醒可能在等待的写进程（wake_up）。若 PIPE_EMPTY 且写端仍开着（i_count>1），则 sleep_on(&inode->i_wait) 等待新数据；若 PIPE_EMPTY 且写端全关（i_count<=1），则 return 0 表示 EOF，这正是 shell 管道中 grep 得知 ls 输出完毕的信号。',
    code: 'c = buf[PIPE_TAIL & (PAGE_SIZE-1)];\nPIPE_TAIL++;\nput_fs_byte(c, buf++);\ncount--;',
  },
  {
    phaseIdx: 2, phase: '传输', title: '环形缓冲区 — 位掩码取模实现循环写入',
    scene: 'ring-wrap',
    srcFile: 'include/linux/fs.h', srcRef: 'fs.h:55',
    tagType: 'warning',
    explain: 'HEAD/TAIL 单调递增，用 & (PAGE_SIZE-1) 对 4096 取模，天然回绕',
    detail: 'HEAD 和 TAIL 是无符号整数，永远单调递增不回绕。访问缓冲区时用 HEAD & (PAGE_SIZE-1) = HEAD & 0xFFF 计算实际偏移，等效于 HEAD % 4096，但位运算更快。SIZE = (HEAD-TAIL) & 0xFFF，当 HEAD 超过 4096 后偏移自动从 0 开始，这就是环形的本质。PIPE_FULL 条件是 SIZE==4095（而非4096），保留1字节用于区分满与空（否则HEAD==TAIL既可表示空也可表示满）。',
    code: '#define PIPE_EMPTY(inode) \\\n  (PIPE_HEAD(inode)==PIPE_TAIL(inode))\n#define PIPE_FULL(inode) \\\n  (PIPE_SIZE(inode)==(PAGE_SIZE-1))',
  },
  {
    phaseIdx: 3, phase: '阻塞', title: '缓冲区满 → 写进程 sleep_on 阻塞',
    scene: 'write-block',
    srcFile: 'fs/pipe.c', srcRef: 'pipe.c:40',
    tagType: 'danger',
    explain: '写满时写进程进入 INTERRUPTIBLE 睡眠，读进程消费后将其唤醒',
    detail: '当 PIPE_FULL 时，pipe_write() 先调用 wake_up(&inode->i_wait) 唤醒可能正在等待的读进程（让它赶紧读），然后自己调用 sleep_on(&inode->i_wait) 进入 TASK_INTERRUPTIBLE 状态等待。读进程每读出一个字节后会调用 wake_up，写进程返回 sleep_on，检查缓冲区是否有空间，有则继续写，无则再次阻塞。注意：sleep_on 使用 wait_queue 链表，同一 inode->i_wait 可以挂多个进程。',
    code: 'if (PIPE_FULL(inode)) {\n  wake_up(&inode->i_wait);\n  if (current->signal & ~current->blocked)\n    return written;\n  interruptible_sleep_on(&inode->i_wait);\n}',
  },
  {
    phaseIdx: 3, phase: '阻塞', title: '缓冲区空 → 读进程阻塞或 EOF',
    scene: 'read-block',
    srcFile: 'fs/pipe.c', srcRef: 'pipe.c:15',
    tagType: 'danger',
    explain: '读空时检查写端是否关闭：未关则睡眠，已关则返回 0（EOF）',
    detail: '当 PIPE_EMPTY 时，pipe_read() 检查 inode->i_count：若 > 1 表示还有写端 fd 存在，则 sleep_on 等待；若 == 1 表示写端已全部 close()，则 return（已读字节数或 0），读进程得到 EOF。这个机制是 shell 管道正确工作的关键：ls 执行完 exit() 后写端 fd[1] 被关闭，grep 从 read() 返回 0，知道输入已结束，完成输出后也退出。',
    code: 'if (PIPE_EMPTY(inode)) {\n  if (!PIPE_WRITERS(inode))  // 写端已关闭\n    break;  // EOF\n  interruptible_sleep_on(&inode->i_wait);\n  continue;\n}',
  },
  {
    phaseIdx: 4, phase: 'Shell 管道', title: 'ls | grep foo — Shell 管道完整实现',
    scene: 'shell-pipe',
    srcFile: 'shell/pipe', srcRef: 'shell 内部实现',
    tagType: '',
    explain: 'Shell 用 pipe()+fork()+dup2()+exec() 四步组合实现管道',
    detail: 'Shell 执行 "ls | grep foo" 的完整过程：① 调用 pipe(pipefd) 得到 pipefd[0](读端) 和 pipefd[1](写端)；② fork() 产生 ls 子进程：dup2(pipefd[1], STDOUT_FILENO) 将标准输出重定向到写端，关闭 pipefd[0/1]，exec("ls")；③ fork() 产生 grep 子进程：dup2(pipefd[0], STDIN_FILENO) 将标准输入重定向到读端，关闭 pipefd[0/1]，exec("grep foo")；④ Shell 关闭自己的 pipefd[0/1]（很关键！否则写端不为0，grep 永远不会 EOF），等待两个子进程。',
    code: 'pipe(pipefd);\nif (fork() == 0) {        // ls 子进程\n  dup2(pipefd[1], 1);    // stdout → 写端\n  close(pipefd[0]); close(pipefd[1]);\n  exec("ls");\n}\nif (fork() == 0) {        // grep 子进程\n  dup2(pipefd[0], 0);    // stdin ← 读端\n  close(pipefd[0]); close(pipefd[1]);\n  exec("grep", "foo");\n}\nclose(pipefd[0]); close(pipefd[1]); // ★ 关键\nwait(); wait();',
  },
]

const phases = ['总览', '创建', '传输', '阻塞', 'Shell管道']

// ─── 当前状态 ─────────────────────────────────────────────────
const currentIdx  = ref(0)
const isPlaying   = ref(false)
let   playTimer   = null

const currentStep   = computed(() => steps[currentIdx.value])
const currentPhase  = computed(() => steps[currentIdx.value].phaseIdx)

// ─── 管道缓冲区状态 ───────────────────────────────────────────
const pipeHead   = ref(0)
const pipeTail   = ref(0)
const bufData    = ref(Array(16).fill(''))
const bufUsed    = computed(() => Math.max(0, pipeHead.value - pipeTail.value))

function isFilled(idx) {
  const h = pipeHead.value % 16
  const t = pipeTail.value % 16
  if (h === t && pipeHead.value === pipeTail.value) return false
  if (h > t) return idx >= t && idx < h
  return idx >= t || idx < h
}

// ─── 进程状态 ─────────────────────────────────────────────────
const writerState = ref('running')   // running / blocked / done
const readerState = ref('running')
const stateLabels = { running: '运行中', blocked: '阻塞中', done: '已结束', waiting: '等待中' }
const writerStateLabel = computed(() => stateLabels[writerState.value] || writerState.value)
const readerStateLabel = computed(() => stateLabels[readerState.value] || readerState.value)

// ─── 动画变量 ─────────────────────────────────────────────────
const pipeCreateSub  = ref(-1)
const writeAnimPos   = ref(-1)
const writeCodeLine  = ref(-1)
const readAnimPos    = ref(-1)
const readCodeLine   = ref(-1)
const readCount      = ref(0)
const wrapHead       = ref(12)
const wrapTail       = ref(5)
const wrapAnimPos    = ref(-1)
const writeBlockSub  = ref(-1)
const readBlockSub   = ref(-1)
const shellSub       = ref(-1)

let subTimer  = null
let scanTimer = null

function clearTimers() {
  clearTimeout(subTimer)
  clearInterval(scanTimer)
  subTimer = null
  scanTimer = null
}

// ─── sys_pipe 流程节点 ────────────────────────────────────────
const pipeCreateNodes = [
  { label: 'pipe(pipefd)', detail: '用户调用，int $0x80 → sys_pipe()' },
  { label: 'get_pipe_inode()', detail: 'i_pipe=1, i_count=2, i_nlink=0' },
  { label: 'get_free_page()', detail: '分配 4096 字节物理页，地址存入 i_size' },
  { label: '分配两个 file 结构', detail: 'f_mode: O_RDONLY / O_WRONLY' },
  { label: 'filp[fd[0]] = f_read, filp[fd[1]] = f_write', detail: '写入进程 fd 表' },
  { label: 'put_fs_long(fd[0], fildes), put_fs_long(fd[1], fildes+1)', detail: '返回给用户' },
]

const fdTable = [
  { target: 'stdin  (控制台)', note: '', isNew: false },
  { target: 'stdout (控制台)', note: '', isNew: false },
  { target: 'stderr (控制台)', note: '', isNew: false },
  { target: 'pipe_inode (O_RDONLY)', note: '← fd[0] 读端', isNew: true },
  { target: 'pipe_inode (O_WRONLY)', note: '← fd[1] 写端', isNew: true },
]

// ─── inode 字段 ───────────────────────────────────────────────
const inodeFields = [
  { type: 'unsigned short', name: 'i_mode',   val: '0010000',  desc: '管道特殊文件类型', highlight: false },
  { type: 'unsigned short', name: 'i_count',  val: '2',        desc: '引用计数（读+写各1）', highlight: true },
  { type: 'unsigned long',  name: 'i_size',   val: '0x3A000',  desc: '缓冲区页面地址 (get_free_page)', highlight: true },
  { type: 'char',           name: 'i_pipe',   val: '1',        desc: '管道标志位', highlight: true },
  { type: 'unsigned short', name: 'i_zone[0]',val: '0 (TAIL)', desc: 'PIPE_TAIL 读指针', highlight: true },
  { type: 'unsigned short', name: 'i_zone[1]',val: '0 (HEAD)', desc: 'PIPE_HEAD 写指针', highlight: true },
  { type: 'struct wait_queue*', name: 'i_wait', val: 'NULL',   desc: '阻塞进程等待队列', highlight: true },
]

const pipeMacros = [
  { name: 'PIPE_HEAD(inode)', def: '(inode)->i_zone[1]  // 写指针' },
  { name: 'PIPE_TAIL(inode)', def: '(inode)->i_zone[0]  // 读指针' },
  { name: 'PIPE_SIZE(inode)', def: '(HEAD-TAIL) & (PAGE_SIZE-1)' },
  { name: 'PIPE_EMPTY(inode)',def: '(HEAD == TAIL)' },
  { name: 'PIPE_FULL(inode)', def: '(SIZE == PAGE_SIZE-1)' },
]

// ─── write_pipe 代码行 ────────────────────────────────────────
const writePipeCode = [
  'while (count > 0) {',
  '  while (PIPE_FULL(inode)) {',
  '    wake_up(&inode->i_wait);',
  '    interruptible_sleep_on(&inode->i_wait);',
  '  }',
  '  buf[PIPE_HEAD & (PAGE_SIZE-1)]',
  '    = get_fs_byte(buf++);',
  '  PIPE_HEAD++;',
  '  count--;  written++;',
  '}',
  'wake_up(&inode->i_wait);',
]

// ─── read_pipe 代码行 ─────────────────────────────────────────
const readPipeCode = [
  'while (count > 0) {',
  '  while (PIPE_EMPTY(inode)) {',
  '    if (!PIPE_WRITERS(inode)) goto out; // EOF',
  '    interruptible_sleep_on(&inode->i_wait);',
  '  }',
  '  c = buf[PIPE_TAIL & (PAGE_SIZE-1)];',
  '  PIPE_TAIL++;',
  '  put_fs_byte(c, buf++);',
  '  count--;  chars++;',
  '}',
  'out: wake_up(&inode->i_wait);',
]

// ─── writeBlock 节点 ──────────────────────────────────────────
const writeBlockNodes = [
  { label: '检测 PIPE_FULL(inode)', code: 'SIZE == PAGE_SIZE - 1 (4095)' },
  { label: 'wake_up(&inode->i_wait)', code: '唤醒等待读的进程（如果有）' },
  { label: 'interruptible_sleep_on(&inode->i_wait)', code: '写进程进入 INTERRUPTIBLE 状态' },
  { label: '读进程消费数据后 wake_up', code: '写进程返回 sleep_on，继续循环' },
]

// ─── shell 节点 ───────────────────────────────────────────────
const shellNodes = [
  { actor: 'shell', actorLabel: 'Shell',   label: 'pipe(pipefd)', code: '→ fd[0]=读端, fd[1]=写端' },
  { actor: 'shell', actorLabel: 'Shell',   label: 'fork() → ls 子进程', code: '' },
  { actor: 'ls',    actorLabel: 'ls进程',  label: 'dup2(pipefd[1], STDOUT_FILENO)', code: 'stdout 重定向到管道写端' },
  { actor: 'ls',    actorLabel: 'ls进程',  label: 'close(pipefd[0/1]); exec("ls")', code: 'ls 输出直接写入管道' },
  { actor: 'shell', actorLabel: 'Shell',   label: 'fork() → grep 子进程', code: '' },
  { actor: 'grep',  actorLabel: 'grep进程',label: 'dup2(pipefd[0], STDIN_FILENO)', code: 'stdin 重定向到管道读端' },
  { actor: 'grep',  actorLabel: 'grep进程',label: 'close(pipefd[0/1]); exec("grep foo")', code: 'grep 从管道读取输入' },
  { actor: 'shell', actorLabel: 'Shell',   label: '★ close(pipefd[0]); close(pipefd[1])', code: '关键：Shell 关闭自己的端，写端引用归零' },
  { actor: 'shell', actorLabel: 'Shell',   label: 'wait(); wait()', code: '等待两个子进程结束' },
]

// ─── wrapFilled ───────────────────────────────────────────────
function wrapFilled(idx) {
  const h = wrapHead.value % 16
  const t = wrapTail.value % 16
  if (wrapHead.value === wrapTail.value) return false
  if (h > t) return idx >= t && idx < h
  return idx >= t || idx < h
}

// ─── watch 驱动动画 ───────────────────────────────────────────
watch(currentIdx, (idx) => {
  clearTimers()

  // 重置状态
  pipeCreateSub.value = -1
  writeAnimPos.value  = -1
  writeCodeLine.value = -1
  readAnimPos.value   = -1
  readCodeLine.value  = -1
  readCount.value     = 0
  wrapAnimPos.value   = -1
  writeBlockSub.value = -1
  readBlockSub.value  = -1
  shellSub.value      = -1
  writerState.value   = 'running'
  readerState.value   = 'running'

  const scene = steps[idx].scene

  if (scene === 'overview') {
    pipeHead.value = 0; pipeTail.value = 0
    bufData.value = Array(16).fill('')
  } else if (scene === 'sys-pipe') {
    pipeHead.value = 0; pipeTail.value = 0
    let i = -1
    scanTimer = setInterval(() => {
      i++
      pipeCreateSub.value = i
      if (i >= pipeCreateNodes.length - 1) clearInterval(scanTimer)
    }, 700)
  } else if (scene === 'pipe-inode') {
    pipeHead.value = 3; pipeTail.value = 0
    bufData.value = ['l','s','\n','','','','','','','','','','','','','']
  } else if (scene === 'write-pipe') {
    pipeHead.value = 0; pipeTail.value = 0
    bufData.value = Array(16).fill('')
    const chars = 'ls\nfoo\nbar\nbaz\n'.split('')
    let pos = 0
    scanTimer = setInterval(() => {
      if (pos >= 10) { clearInterval(scanTimer); writerState.value = 'done'; return }
      writeAnimPos.value = pos
      writeCodeLine.value = 5
      bufData.value[pos] = chars[pos] || '·'
      pipeHead.value = pos + 1
      subTimer = setTimeout(() => { writeCodeLine.value = 7 }, 200)
      pos++
    }, 500)
  } else if (scene === 'read-pipe') {
    // 先填满一半
    pipeHead.value = 8; pipeTail.value = 0
    bufData.value = 'ls\nfoo\nba'.split('')
    const startTail = 0
    let pos = 0
    scanTimer = setInterval(() => {
      if (pos >= 6) { clearInterval(scanTimer); readerState.value = 'done'; return }
      readAnimPos.value = startTail + pos
      readCodeLine.value = 5
      bufData.value[startTail + pos] = ''
      pipeTail.value = startTail + pos + 1
      readCount.value = pos + 1
      subTimer = setTimeout(() => { readCodeLine.value = 6 }, 200)
      pos++
    }, 500)
  } else if (scene === 'ring-wrap') {
    wrapHead.value = 12; wrapTail.value = 5
    // 动画：继续写入超过16，回绕
    let pos = 12
    scanTimer = setInterval(() => {
      if (pos >= 20) { clearInterval(scanTimer); return }
      wrapAnimPos.value = pos % 16
      wrapHead.value = pos + 1
      pos++
    }, 600)
  } else if (scene === 'write-block') {
    pipeHead.value = 15; pipeTail.value = 0
    bufData.value = Array(15).fill('●').concat([''])
    writerState.value = 'running'
    let i = -1
    scanTimer = setInterval(() => {
      i++
      writeBlockSub.value = i
      if (i === 2) writerState.value = 'blocked'
      if (i === 3) writerState.value = 'running'
      if (i >= writeBlockNodes.length - 1) clearInterval(scanTimer)
    }, 900)
  } else if (scene === 'read-block') {
    pipeHead.value = 0; pipeTail.value = 0
    bufData.value = Array(16).fill('')
    readerState.value = 'running'
    let i = -1
    scanTimer = setInterval(() => {
      i++
      readBlockSub.value = i
      if (i === 0) readerState.value = 'blocked'
      if (i === 1) readerState.value = 'blocked'
      if (i === 2) readerState.value = 'done'
      if (i >= 2) clearInterval(scanTimer)
    }, 1000)
  } else if (scene === 'shell-pipe') {
    pipeHead.value = 0; pipeTail.value = 0
    writerState.value = 'waiting'; readerState.value = 'waiting'
    let i = -1
    scanTimer = setInterval(() => {
      i++
      shellSub.value = i
      if (i === 2) { writerState.value = 'running' }
      if (i === 5) { readerState.value = 'running' }
      if (i === 7) { pipeHead.value = 8; pipeTail.value = 0 }
      if (i === 8) { writerState.value = 'done'; readerState.value = 'done' }
      if (i >= shellNodes.length - 1) clearInterval(scanTimer)
    }, 800)
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
  } else {
    clearInterval(playTimer)
  }
}
onUnmounted(() => { clearTimers(); clearInterval(playTimer) })

// ─── 源码片段 ─────────────────────────────────────────────────
const overviewCode = `/* fs/pipe.c */
static int pipe_read(struct inode *inode,
  struct file *filp,
  char *buf, int count);

static int pipe_write(struct inode *inode,
  struct file *filp,
  char *buf, int count);

int sys_pipe(unsigned long * fildes);`

const sysPipeCode = `int sys_pipe(unsigned long * fildes)
{
  struct inode * inode;
  struct file * f[2];
  int fd[2];
  int i,j;

  j=0;
  for(i=0;j<2&&i<NR_FILE;i++)
    if (!file_table[i].f_count)
      (f[j++]=i+file_table)->f_count++;
  if (j==1) f[0]->f_count=0;
  if (j<2) return -1;

  j=0;
  for(i=0;j<2&&i<NR_OPEN;i++)
    if (!current->filp[i]) {
      current->filp[fd[j++]=i] =f[j-1];
    }
  if (j==1) current->filp[fd[0]]=NULL;
  if (j<2) { ... return -1; }

  if (!(inode=get_pipe_inode())) {
    current->filp[fd[0]] =
    current->filp[fd[1]] = NULL;
    f[0]->f_count = f[1]->f_count = 0;
    return -1;
  }
  f[0]->f_inode = f[1]->f_inode = inode;
  f[0]->f_pos = f[1]->f_pos = 0;
  f[0]->f_mode = 1; f[1]->f_mode = 2;
  put_fs_long(fd[0],0+fildes);
  put_fs_long(fd[1],1+fildes);
  return 0;
}`

const pipeInodeCode = `/* include/linux/fs.h */
#define PIPE_HEAD(inode)   ((inode)->i_zone[1])
#define PIPE_TAIL(inode)   ((inode)->i_zone[0])
#define PIPE_SIZE(inode) \
  ((PIPE_HEAD(inode)-PIPE_TAIL(inode))&\
   (PAGE_SIZE-1))
#define PIPE_EMPTY(inode) \
  (PIPE_HEAD(inode)==PIPE_TAIL(inode))
#define PIPE_FULL(inode) \
  (PIPE_SIZE(inode)==(PAGE_SIZE-1))
#define PIPE_WRITERS(inode) \
  ((inode)->i_count-1)

/* get_pipe_inode() */
struct inode * get_pipe_inode(void) {
  struct inode * inode = get_empty_inode();
  if (!inode) return NULL;
  if (!(inode->i_size=get_free_page())) {
    iput(inode); return NULL;
  }
  inode->i_count = 2; /* 读+写 各1 */
  PIPE_HEAD(*inode) = PIPE_TAIL(*inode) = 0;
  inode->i_pipe = 1;
  return inode;
}`

const writePipeSrc = `static int pipe_write(struct inode * inode,
  struct file * filp,
  char * buf, int count)
{
  int chars=0, size=0, written=0;
  char *p;
  if (!PIPE_WRITERS(inode))  /* 读端关闭 */
    return -EPIPE;
  while (count>0) {
    while (PIPE_FULL(inode)) { /* 缓冲区满 */
      wake_up(&inode->i_wait);
      if (current->signal &~current->blocked)
        return written?written:-ERESTARTSYS;
      interruptible_sleep_on(&inode->i_wait);
    }
    /* 可写的连续空间 */
    size = PAGE_SIZE - PIPE_SIZE(inode);
    p = (char *)inode->i_size +
        PIPE_HEAD(inode);
    chars = PAGE_SIZE - PIPE_HEAD(inode);
    if (chars > count) chars = count;
    if (chars > size) chars = size;
    PIPE_HEAD(inode) += chars;
    PIPE_HEAD(inode) &= (PAGE_SIZE-1);
    written += chars; count -= chars;
    memcpy_fromfs(p, buf, chars);
    buf += chars;
  }
  wake_up(&inode->i_wait);
  return written;
}`

const readPipeSrc = `static int pipe_read(struct inode * inode,
  struct file * filp,
  char * buf, int count)
{
  int chars=0, size=0, read=0;
  char *p;
  while (count>0) {
    while (PIPE_EMPTY(inode)) { /* 缓冲区空 */
      if (!PIPE_WRITERS(inode))  /* EOF */
        return read;
      if (current->signal &~current->blocked)
        return read?read:-ERESTARTSYS;
      interruptible_sleep_on(&inode->i_wait);
    }
    /* 读取连续数据 */
    size = PIPE_SIZE(inode);
    p = (char *)inode->i_size +
        PIPE_TAIL(inode);
    chars = PAGE_SIZE - PIPE_TAIL(inode);
    if (chars > count) chars = count;
    if (chars > size) chars = size;
    PIPE_TAIL(inode) += chars;
    PIPE_TAIL(inode) &= (PAGE_SIZE-1);
    read += chars; count -= chars;
    memcpy_tofs(buf, p, chars);
    buf += chars;
  }
  wake_up(&inode->i_wait);
  return read;
}`

const ringWrapCode = `/* 环形缓冲区位运算取模 */
#define PAGE_SIZE  4096        /* 0x1000 */
#define PIPE_SIZE(inode) \
  ((PIPE_HEAD(inode) - PIPE_TAIL(inode)) \
   & (PAGE_SIZE-1))   /* & 0xFFF */

/* 访问示例 */
char *buf_base = (char*)inode->i_size;

/* 写入 */
buf_base[PIPE_HEAD & (PAGE_SIZE-1)] = byte;
PIPE_HEAD++;
PIPE_HEAD &= (PAGE_SIZE-1); /* 回绕 */

/* 读出 */
byte = buf_base[PIPE_TAIL & (PAGE_SIZE-1)];
PIPE_TAIL++;
PIPE_TAIL &= (PAGE_SIZE-1);

/* FULL 保留 1 字节：区分满和空 */
/* 满: SIZE==4095, 不能==4096 */
/* 因为 4096 & 0xFFF == 0 == EMPTY */`

const writeBlockSrc = `/* pipe_write() 满阻塞关键路径 */
while (PIPE_FULL(inode)) {
  /* 先唤醒读者让它赶快消费 */
  wake_up(&inode->i_wait);
  /* 检查是否被信号中断 */
  if (current->signal & ~current->blocked)
    return written ? written : -ERESTARTSYS;
  /* 阻塞自己，等读者唤醒 */
  interruptible_sleep_on(&inode->i_wait);
}
/* 读者在 pipe_read 末尾调用 */
/* wake_up(&inode->i_wait) 唤醒我们 */`

const readBlockSrc = `/* pipe_read() 空阻塞与 EOF */
while (PIPE_EMPTY(inode)) {
  /* 写端已全部关闭 → EOF */
  if (!PIPE_WRITERS(inode))
    return read;  /* read==0 即 EOF */
  /* 信号打断 */
  if (current->signal & ~current->blocked)
    return read ? read : -ERESTARTSYS;
  /* 阻塞自己，等写者填数据 */
  interruptible_sleep_on(&inode->i_wait);
}
/* PIPE_WRITERS(inode) = inode->i_count - 1 */
/* 写端每次 close() 减 inode->i_count     */
/* 全关后 i_count==1，WRITERS==0 → EOF    */`

const shellPipeCode = `/* shell 执行 "ls | grep foo" 的伪代码 */
int pipefd[2];
pipe(pipefd);       /* fd[0]=读, fd[1]=写 */

/* ── ls 子进程 ── */
if (fork() == 0) {
  dup2(pipefd[1], STDOUT_FILENO); /* stdout→写端 */
  close(pipefd[0]);
  close(pipefd[1]);
  execve("/bin/ls", ...);
}

/* ── grep 子进程 ── */
if (fork() == 0) {
  dup2(pipefd[0], STDIN_FILENO);  /* stdin→读端 */
  close(pipefd[0]);
  close(pipefd[1]);
  execve("/bin/grep", ["grep","foo",...]);
}

/* ★ 最关键：Shell 关闭自己的端 */
/* 否则写端 i_count 永远 > 1    */
/* grep 永远等不到 EOF！         */
close(pipefd[0]);
close(pipefd[1]);

/* 等待子进程 */
wait(NULL);
wait(NULL);`
</script>

<style scoped>
.pipe-vis { max-width: 1100px; margin: 0 auto; }

/* ─── Phase bar ─── */
.phase-bar { display: flex; gap: 4px; margin-bottom: 12px; }
.phase-seg {
  flex: 1; padding: 6px 10px; border-radius: 6px; cursor: pointer;
  background: #f0f2f5; text-align: center; font-size: 12px; color: #909399;
  transition: all .2s;
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
.main-grid {
  display: grid;
  grid-template-columns: 220px 1fr 240px;
  gap: 12px;
  margin-bottom: 12px;
  align-items: start;
}
.left-panel, .right-panel {
  background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; padding: 12px;
}
.center-panel {
  background: #fff; border: 1px solid #e4e7ed; border-radius: 8px;
  padding: 16px; min-height: 420px;
}
.panel-title { font-size: 11px; font-weight: 600; color: #909399; margin-bottom: 8px; text-transform: uppercase; }
.scene-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 14px; text-align: center; }

/* ─── 左侧 ─── */
.buf-info { margin-bottom: 10px; }
.bi-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.bi-key { color: #909399; }
.bi-val { color: #303133; font-weight: 600; }
.mono   { font-family: monospace; }

.mini-buf { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 4px; }
.mb-cell {
  width: 22px; height: 22px; border-radius: 3px; border: 1px solid #e4e7ed;
  background: #f5f7fa; display: flex; align-items: center; justify-content: center;
  font-size: 9px; transition: all .3s;
}
.mb-cell.mb-filled { background: #ecf5ff; border-color: #409EFF; }
.mb-cell.mb-head   { background: #409EFF; border-color: #409EFF; }
.mb-cell.mb-tail   { background: #F56C6C; border-color: #F56C6C; }
.mb-ptr { color: #fff; font-weight: 700; font-size: 8px; }
.mb-idx { color: #c0c4cc; font-size: 8px; }
.buf-legend { display: flex; gap: 6px; font-size: 9px; color: #909399; margin-bottom: 8px; flex-wrap: wrap; }
.bl-item  { display: flex; align-items: center; gap: 2px; }
.bl-filled { display: inline-block; width: 8px; height: 8px; background: #ecf5ff; border: 1px solid #409EFF; border-radius: 1px; }
.bl-ptr-w { background: #409EFF; color: #fff; border-radius: 2px; padding: 0 2px; font-size: 8px; }
.bl-ptr-r { background: #F56C6C; color: #fff; border-radius: 2px; padding: 0 2px; font-size: 8px; }

.proc-state { margin-bottom: 8px; }
.ps-title { font-size: 10px; font-weight: 600; color: #909399; margin-bottom: 4px; }
.ps-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; border-radius: 4px; margin-bottom: 2px; font-size: 11px; background: #f5f7fa; }
.ps-running .ps-badge { color: #67C23A; }
.ps-blocked .ps-badge { color: #F56C6C; }
.ps-done    .ps-badge { color: #909399; }
.ps-waiting .ps-badge { color: #e6a23c; }
.ps-name  { color: #606266; }
.ps-badge { font-size: 10px; font-weight: 600; }
.left-explain { font-size: 11px; color: #606266; padding: 6px; background: #f5f7fa; border-radius: 4px; line-height: 1.5; }

/* ─── overview ─── */
.ov-pipeline { display: flex; align-items: center; justify-content: center; gap: 0; margin-bottom: 16px; }
.ov-proc {
  padding: 12px 14px; border-radius: 8px; text-align: center; min-width: 110px;
}
.ov-writer { background: #ecf5ff; border: 1px solid #c6dbff; }
.ov-reader { background: #f0f9eb; border: 1px solid #b3e19d; }
.ov-proc-name { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 3px; }
.ov-proc-fd   { font-size: 10px; color: #909399; margin-bottom: 3px; }
.ov-proc-code { font-size: 10px; color: #409EFF; font-family: monospace; }
.ov-pipe-box {
  padding: 10px 14px; background: #fff3e0; border: 1px solid #f0d9a8;
  border-radius: 0; min-width: 120px; text-align: center;
}
.ov-pipe-label { font-size: 10px; color: #e6a23c; font-weight: 600; margin-bottom: 4px; }
.ov-pipe-inner { display: flex; gap: 3px; justify-content: center; flex-wrap: wrap; margin-bottom: 4px; }
.ov-byte { font-size: 14px; color: #e6a23c; animation: ov-flow 1.5s infinite; }
@keyframes ov-flow { 0%,100%{opacity:.3} 50%{opacity:1} }
.ov-pipe-size { font-size: 9px; color: #909399; }
.ov-props { display: flex; flex-direction: column; gap: 6px; }
.ov-prop { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #606266; line-height: 1.5; }
.op-icon { flex-shrink: 0; font-size: 14px; }

/* ─── sys-pipe ─── */
.pipe-create-flow { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.pcf-node {
  padding: 7px 12px; border-radius: 6px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.pcf-node.pcf-active  { opacity: 1; border-left-color: #67C23A; }
.pcf-node.pcf-current { background: #f0f9eb; }
.pcf-label  { font-size: 12px; font-weight: 600; color: #303133; }
.pcf-detail { font-size: 10px; color: #909399; margin-top: 2px; }

.fd-table { margin-top: 10px; }
.fd-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.fd-row {
  display: flex; align-items: center; gap: 6px; padding: 3px 6px;
  font-size: 11px; border-radius: 3px; border-left: 2px solid #e4e7ed;
  margin-bottom: 2px; background: #f5f7fa; font-family: monospace; transition: all .4s;
}
.fd-row.fd-new { background: #f0f9eb; border-left-color: #67C23A; animation: flash .5s; }
.fd-num   { color: #909399; width: 30px; flex-shrink: 0; }
.fd-arrow { color: #dcdfe6; }
.fd-target{ color: #303133; flex: 1; }
.fd-note  { color: #67C23A; font-size: 10px; flex-shrink: 0; }

/* ─── pipe-inode ─── */
.inode-diagram { margin-bottom: 10px; }
.id-title { font-size: 10px; color: #909399; margin-bottom: 4px; }
.id-row {
  display: grid; grid-template-columns: 100px 80px 60px 1fr;
  gap: 4px; padding: 3px 6px; font-size: 10px; border-radius: 3px;
  font-family: monospace;
}
.id-row.id-highlight { background: #ecf5ff; }
.idf-type { color: #9B59B6; }
.idf-name { color: #303133; font-weight: 600; }
.idf-val  { color: #409EFF; }
.idf-desc { color: #909399; }
.macro-box { background: #f5f7fa; border-radius: 6px; padding: 8px; }
.mb-title { font-size: 10px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.macro-row { display: flex; gap: 8px; font-size: 10px; font-family: monospace; padding: 2px 0; }
.macro-name { color: #409EFF; flex-shrink: 0; }
.macro-def  { color: #909399; }

/* ─── 环形缓冲区 ─── */
.ring-vis { }
.ring-buf { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 2px; }
.rb-cell {
  width: 42px; height: 48px; border-radius: 4px; border: 1px solid #e4e7ed;
  background: #f5f7fa; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-size: 9px; transition: all .3s;
  position: relative;
}
.rb-cell.rb-filled  { background: #ecf5ff; border-color: #409EFF; }
.rb-cell.rb-writing { background: #67C23A; border-color: #67C23A; animation: flash .3s; }
.rb-cell.rb-reading { background: #F56C6C; border-color: #F56C6C; animation: flash .3s; }
.rb-cell.rb-head    { box-shadow: 0 0 0 2px #409EFF; }
.rb-cell.rb-tail    { box-shadow: 0 0 0 2px #F56C6C; }
.rbc-idx { font-size: 8px; color: #c0c4cc; }
.rbc-val { font-size: 12px; color: #409EFF; font-weight: 600; }
.rbc-ptr { font-size: 8px; font-weight: 700; color: #409EFF; }
.rb-cell.rb-reading .rbc-ptr { color: #F56C6C; }

.ring-tail-marker { display: flex; margin-bottom: 8px; }
.rtm-slot { width: 44px; text-align: center; }
.rtm-ptr  { font-size: 9px; color: #F56C6C; font-weight: 700; }
.rtm-ptr-w{ font-size: 9px; color: #409EFF; font-weight: 700; }
.rtm-empty{ display: inline-block; width: 44px; }

.write-code {
  background: #1a1a2e; border-radius: 6px; padding: 8px;
  font-family: monospace; font-size: 10px; color: #a0aec0; margin-bottom: 6px;
}
.wc-line { padding: 1px 4px; border-radius: 2px; transition: all .3s; }
.wc-line.wc-active { background: #67C23A40; color: #fff; }
.write-status { font-size: 11px; color: #606266; }

/* ─── ring-wrap ─── */
.wrap-demo { }
.wd-formula { margin-bottom: 10px; }
.wdf-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.wdf-code  { font-family: monospace; font-size: 11px; color: #409EFF; background: #f0f9eb; padding: 6px 10px; border-radius: 4px; }
.wrap-info { margin-top: 6px; font-size: 10px; color: #909399; font-family: monospace; }

/* ─── write-block ─── */
.block-demo { }
.bd-buf-full, .ed-buf-empty { margin-bottom: 12px; }
.bdf-label { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 4px; }
.bdf-cells { display: flex; gap: 2px; flex-wrap: wrap; margin-bottom: 4px; }
.bdf-cell {
  width: 22px; height: 22px; border-radius: 3px; display: flex;
  align-items: center; justify-content: center; font-size: 10px; border: 1px solid #e4e7ed;
}
.bdf-filled   { background: #ecf5ff; border-color: #409EFF; color: #409EFF; }
.bdf-reserved { background: #fef0f0; border-color: #F56C6C; color: #F56C6C; }
.bdf-empty    { background: #f5f7fa; color: #c0c4cc; font-size: 8px; }
.bdf-note { font-size: 10px; color: #909399; }

.block-states { display: flex; flex-direction: column; gap: 5px; }
.bs-node {
  padding: 6px 10px; border-radius: 5px; background: #f5f7fa;
  border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.bs-node.bs-active  { opacity: 1; border-left-color: #F56C6C; }
.bs-node.bs-current { background: #fef0f0; }
.bsn-label { font-size: 11px; font-weight: 600; color: #303133; }
.bsn-code  { font-size: 10px; color: #909399; font-family: monospace; margin-top: 2px; }

.block-wake { margin-top: 10px; padding: 10px; background: #f0f9eb; border-radius: 6px; border: 1px solid #b3e19d; }
.bw-title { font-size: 11px; font-weight: 600; color: #67C23A; margin-bottom: 4px; }
.bw-text  { font-size: 11px; color: #606266; line-height: 1.6; }
.eof-note { margin-top: 10px; padding: 10px; background: #ecf5ff; border-radius: 6px; font-size: 11px; color: #606266; line-height: 1.6; }

/* ─── read-block ─── */
.read-decision { }
.rd-title { font-size: 11px; font-weight: 600; color: #606266; margin-bottom: 6px; }
.rd-branch {
  padding: 8px 10px; border-radius: 5px; margin-bottom: 6px;
  background: #f5f7fa; border-left: 3px solid #dcdfe6; opacity: .35; transition: all .4s;
}
.rd-branch.rd-active { opacity: 1; border-left-color: #e6a23c; }
.rd-branch.rd-eof.rd-active { border-left-color: #67C23A; background: #f0f9eb; }
.rd-cond   { font-size: 11px; font-weight: 600; color: #303133; }
.rd-action { font-size: 10px; color: #909399; font-family: monospace; margin-top: 2px; }

/* ─── shell-pipe ─── */
.shell-flow { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.sf-node {
  padding: 6px 12px; border-radius: 6px; background: #f5f7fa;
  border-left: 4px solid #dcdfe6; opacity: .35; transition: all .4s;
  display: flex; flex-direction: column;
}
.sf-node.sf-active { opacity: 1; }
.sf-node.sf-current { box-shadow: 0 0 0 2px #40a0ff30; }
.sf-node.sf-shell.sf-active  { border-left-color: #9B59B6; background: #f9f0ff; }
.sf-node.sf-ls.sf-active     { border-left-color: #409EFF; background: #ecf5ff; }
.sf-node.sf-grep.sf-active   { border-left-color: #67C23A; background: #f0f9eb; }
.sfn-actor { font-size: 9px; font-weight: 700; color: #909399; margin-bottom: 2px; }
.sf-node.sf-shell.sf-active .sfn-actor { color: #9B59B6; }
.sf-node.sf-ls.sf-active     .sfn-actor { color: #409EFF; }
.sf-node.sf-grep.sf-active   .sfn-actor { color: #67C23A; }
.sfn-label { font-size: 11px; font-weight: 600; color: #303133; }
.sfn-code  { font-size: 10px; color: #909399; font-family: monospace; margin-top: 2px; }

.proc-tree { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pt-shell {
  padding: 6px 16px; border-radius: 6px; background: #f9f0ff;
  border: 1px solid #d3adf7; font-size: 11px; text-align: center; color: #9B59B6;
}
.pt-children { display: flex; align-items: center; gap: 8px; }
.pt-child {
  padding: 6px 10px; border-radius: 6px; font-size: 10px; text-align: center; line-height: 1.5;
}
.pt-ls   { background: #ecf5ff; border: 1px solid #c6dbff; color: #409EFF; }
.pt-grep { background: #f0f9eb; border: 1px solid #b3e19d; color: #67C23A; }
.pt-pipe-arrow { font-size: 14px; color: #e6a23c; font-weight: 600; }

/* ─── 右侧 ─── */
.right-note { margin-bottom: 8px; }
.rn-title { font-size: 11px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.rn-item  { font-size: 11px; color: #606266; padding: 2px 0; line-height: 1.5; }
.src-snippet { background: #1a1a2e; border-radius: 6px; padding: 10px; overflow: auto; max-height: 420px; }
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
.dc-code pre {
  background: #f5f7fa; padding: 10px; border-radius: 6px;
  font-size: 11px; font-family: monospace; white-space: pre-wrap; margin: 0;
}

@keyframes flash { 0%,100%{opacity:1} 50%{opacity:.3} }
</style>
