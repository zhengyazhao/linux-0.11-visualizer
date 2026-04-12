# Linux 0.11 Visualizer

**用动画看懂操作系统底层——以 Linux 0.11 源码为蓝本的交互式可视化工具**

> 写了多年代码，却不知道 `printf` 怎么把字符显示出来、`fork()` 为什么快、断电为什么会丢数据？
> 这个项目把 Linux 0.11 的核心机制拆解成一帧一帧的动画，让你看清楚每一步在做什么。

---

## 预览

| 模块 | 描述 |
|------|------|
| BIOS 启动 | 上电 → BIOS自检 → MBR加载 → bootsect → setup → head.s |
| main() 初始化 | mem_init / trap_init / sched_init / buffer_init 全序列 |
| 内存布局 | 逻辑地址 → 线性地址 → 物理地址，分段 + 分页 + 缺页处理 |
| 系统调用 | INT 0x80 → sys_call_table → 内核态执行 → iret 返回 |
| 进程调度 | CFS 时间轮转，schedule() 选进程全流程 |
| fork / exec | copy_process 写时复制，execve 替换地址空间 |
| 信号机制 | signal() / kill() / do_signal() 投递与处理 |
| 管道 | pipe_read / pipe_write 环形缓冲区 |
| 文件系统 | VFS inode → 目录项 → 数据块读写链路 |
| 磁盘 I/O | ll_rw_block → 请求队列 → 电梯调度 → 中断回调 |
| task_struct | 进程控制块字段全景，状态机转换 |
| 内核态/用户态 | CPL/DPL 特权级切换，TSS 上下文保存 |

---

## 快速开始

```bash
git clone https://github.com/zhengyazhao/linux-0.11-visualizer.git
cd linux-0.11-visualizer
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`，按页面顶部建议顺序逐模块学习。

---

## 技术栈

- **Vue 3** (Composition API) + **Vue Router 4**
- **Element Plus** — UI 组件
- **Vite 8** — 构建工具
- 纯 CSS 动画（无 canvas / WebGL 依赖）

---

## 模块学习顺序

```
BIOS 启动
  └─ main() 初始化
       └─ 内核态 / 用户态（特权级）
            └─ 内存布局（地址翻译）
                 └─ 系统调用
                      └─ 进程调度
                           └─ fork / exec
                                └─ 信号
                                     └─ 管道
                                          └─ 文件系统
                                               └─ 磁盘 I/O
```

每个模块都包含：
- **逐步动画**：每帧对应源码中一个关键操作
- **源码定位**：每步显示对应的文件 + 行号（如 `mm/memory.c:250`）
- **代码片段**：直接展示 Linux 0.11 原始 C / 汇编代码
- **数据结构图**：段描述符、页表项、task_struct 等关键结构的位域可视化

---

## 项目结构

```
src/
├── components/
│   ├── BiosBootVisualizer.vue        # BIOS 启动流程
│   ├── MainInitVisualizer.vue        # main() 初始化序列
│   ├── MemLayoutVisualizer.vue       # 内存布局与地址翻译
│   ├── SyscallVisualizer.vue         # 系统调用机制
│   ├── ProcessScheduleVisualizer.vue # 进程调度
│   ├── ForkExecVisualizer.vue        # fork / exec
│   ├── SignalVisualizer.vue          # 信号机制
│   ├── PipeVisualizer.vue            # 管道
│   ├── FSVisualizer.vue              # 文件系统
│   ├── DiskIOVisualizer.vue          # 磁盘 I/O
│   ├── TaskStructVisualizer.vue      # task_struct 解析
│   └── KernelUserVisualizer.vue      # 内核态 / 用户态
├── router/index.js
└── views/Home.vue
```

---

## 参考资料

- [Linux 0.11 源码](https://github.com/karottc/linux-0.11) — 赵炯注释版
- 《Linux 内核完全注释》— 赵炯
- Intel IA-32 架构手册 Vol.3（保护模式 / 分段 / 分页章节）

---

## License

MIT
