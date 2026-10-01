# Changelog

本專案遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 與 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Fixed

- 登入閘門偵測 Supabase 後端無法連線（DNS／網路失敗）並顯示明確紅字，避免無聲卡住
- 還原名冊預檢與 400／422 友善錯誤說明（先前被還原提交沖掉）
- GitHub Pages 不再請求已 gitignore 的 `school-auth-config.defaults.js`（消除 404 紅字）

### Changed

- README 補上「登入不了」三點速查，並連結本文件與 Auth 根因說明

## [0.1.0] - 2026-08-27

### Added

- GitHub Pages 部署與學校電郵登入閘門
- 學生 Auth 批次 provision 腳本與題庫答案同步
