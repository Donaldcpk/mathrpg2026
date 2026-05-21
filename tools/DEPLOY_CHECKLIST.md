# 部署後仍轉圈？請照此檢查

## 與 Supabase 的關係

| 階段 | Supabase 是否參與 |
|------|-------------------|
| 黑屏只有轉圈、**沒有登入框** | 多半**不是** Supabase（設定檔 404 或沒載入 gate） |
| 有登入框，按登入後轉圈 | **是**，在驗證帳密或雲端同步 |
| 登入成功後載入遊戲轉圈 | **可能**，雲端存檔；遊戲本體載入題庫 2MB |

## 部署後必做（學生／教師）

1. 用**無痕視窗**開：https://donaldcpk.github.io/mathrpg2026/
2. **Cmd+Shift+R** 強制重新整理
3. 應看到**登入畫面**（不是只有右下角轉圈）
4. 登入後等 **30–90 秒**（題庫大）

## 勿覆蓋 index.html

`index.html` 必須包含：

```html
<script src="js/school-auth-config.js?..."></script>
<script src="js/school-auth-config.defaults.js?..."></script>
<script src="js/school-auth-gate.js?..."></script>
```

**不可**改成只載入 `defaults.js`（GitHub 上會 404）。

## Console 正常應為

- `school-auth-config.js` → 200
- `defaults.js` → 404（可忽略）
- `school-auth-gate.js` → 200
