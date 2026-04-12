<template>
  <el-container style="min-height: 100vh">
    <el-header
      style="
        background: #fff;
        border-bottom: 1px solid #e4e7ed;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 24px;
        height: 56px;
      "
    >
      <router-link
        to="/"
        style="text-decoration: none; color: #303133; font-weight: 600; font-size: 15px; white-space: nowrap"
      >
        OS Visualizer
      </router-link>
      <el-menu
        mode="horizontal"
        :ellipsis="false"
        :router="true"
        style="border: none; flex: 1; height: 56px; line-height: 56px"
      >
        <el-menu-item index="/">首页</el-menu-item>
        <el-menu-item index="/bios">BIOS 启动流程</el-menu-item>
        <el-menu-item index="/main-init">main() 初始化</el-menu-item>
        <el-menu-item index="/mem-layout">内存布局</el-menu-item>
        <el-menu-item index="/process-schedule">进程调度</el-menu-item>
        <el-menu-item index="/syscall">系统调用</el-menu-item>
        <el-menu-item index="/fork-exec">fork/exec</el-menu-item>
        <el-menu-item index="/signal">信号机制</el-menu-item>
        <el-menu-item index="/pipe">管道</el-menu-item>
        <el-menu-item index="/fs">文件系统</el-menu-item>
      </el-menu>
    </el-header>
    <el-main style="background: #f5f7fa; padding: 24px">
      <router-view />
    </el-main>
  </el-container>
</template>
