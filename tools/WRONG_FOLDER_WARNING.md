# ⚠️ 請用正確資料夾與遠端

## 兩個專案不要搞混

| 路徑 | GitHub 遠端 | 用途 |
|------|-------------|------|
| **`/Users/cdlanod/Documents/OutputJS/testingX26`** | `Donaldcpk/mathrpg2026` | **網頁版 TSA（要 push 這個）** |
| `/Users/cdlanod/Documents/testingX26` | `math-rpg-maker/project0625` | 另一個舊專案 |

終端機若在 `testingX26/js/plugins`，改到 **OutputJS/testingX26** 再操作。

## index.html 勿改壞

**必須**包含（順序固定）：

```html
<script src="js/school-auth-config.js?..."></script>
<script src="js/school-auth-gate.js?..."></script>
```

**不可**改成只載入 `school-auth-config.defaults.js`（GitHub 上沒有這檔 → 404 → 無法登入）。

RPG Maker 重新部署網頁時，請只覆蓋 `data/`、`img/`，**不要覆蓋整個 index.html**。

## 重新部署

```bash
cd /Users/cdlanod/Documents/OutputJS/testingX26
git add -A   # 確認沒把 index 改壞
git push origin main
```

或 GitHub → Actions → **Deploy GitHub Pages** → **Run workflow**
