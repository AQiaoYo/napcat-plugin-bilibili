# NapCat Bilibili 视频解析插件 (napcat-plugin-bilibili)

本项目是一个基于 [NapCat](https://github.com/NapNeko/NapCatQQ) 的插件，旨在自动解析聊天消息中的 Bilibili 视频链接，并获取视频详情（如标题、封面、简介、UP主等信息）发送到聊天中。

## 功能特性

- **自动解析**：识别消息中的 `b23.tv` 短链接和 `bilibili.com/video/BV...` 链接。
- **视频详情**：展示视频标题、封面图、播放量、弹幕数及 UP 主信息。
- **WebUI 配置**：集成 NapCat 管理界面，支持在线配置 B 站 Cookie（用于高清封面获取等）。
- **短链接还原**：自动还原 `b23.tv` 短链接并提取 BV 号。

## 安装方法

### 方式一：在线安装（推荐）

直接在 NapCat WebUI 的**插件商店**中搜索并安装。
> **注意**：此方式需要 NapCat 版本 >= 4.14.0。

### 方式二：离线安装

1. 前往 [Releases](https://github.com/AQiaoYo/napcat-plugin-bilibili/releases) 页面下载最新的 `napcat-plugin-bilibili.zip`。
2. 将压缩包解压至 NapCat 的 `plugins` 文件夹下。
3. 重启 NapCat，或者在 WebUI 的插件管理页面刷新并启用该插件。

### 方式三：源码构建

1. 克隆仓库：
   ```bash
   git clone https://github.com/AQiaoYo/napcat-plugin-bilibili.git
   cd napcat-plugin-bilibili
   ```
2. 安装依赖并进行构建：
   ```bash
   pnpm install
   pnpm run build
   ```
3. 构建完成后，将生成的 `dist/index.mjs`、`package.json` 以及 `src/webui` 目录手动复制到 NapCat 的插件目录下。

## 配置说明

在 NapCat WebUI 中找到本插件，可以配置：

- **Bilibili Cookie**：建议填入 SESSDATA，以获得更稳定的接口访问和更清晰的封面图。
- **解析开关**：启用或禁用自动解析功能。

## 开发与贡献

如果你有任何建议或发现了 Bug，欢迎提交 Issue 或 Pull Request。

## 鸣谢

本项目在开发过程中参考了以下优秀项目，排名不分先后：

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) - 详尽的 B 站 API 文档支持。
- [astrbot_plugin_link_resolver](https://github.com/vacacia/astrbot_plugin_link_resolver) - 链接解析逻辑改进参考。
- [bilibili-api](https://github.com/Nemo2011/bilibili-api) - B 站接口对接参考。
- [nonebot-plugin-bili-helper](https://github.com/krimeshu/nonebot-plugin-bili-helper) - 视频辅助解析逻辑参考。
- [napcat-plugin-auto-clear](https://github.com/AQiaoYo/napcat-plugin-auto-clear) - NapCat 插件结构与 WebUI 参考。

## 许可证

MIT License