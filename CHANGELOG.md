# Changelog

本專案版本遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/) 與 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

### Fixed

- 黑暗隧道（Map040／共用事件「地道劇情1」）對話結束後不再重跑，主角可恢復移動。CE7 將開關 132 設為 OFF（RMMZ：`121` 的 0=ON、1=OFF）；EV40 不再重開 132，改以自我開關 A 防止重入。
- 地道殭屍在開關 134 開啟前改為隱形、可穿越、不追逐；被抓住改傳回地道入口，不再瞬間 Game Over。
- 米勒逃跑的移動改為可略過並開啟穿透，避免卡在等待。

## [0.1.0] - 2026-10-05

### Added

- TSA Training RPG Maker MZ 網頁版初版（數學村、地道、霧光森林與後續地圖）。
