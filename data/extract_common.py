
import json
import os

def extract_common_events():
    source_file = "CommonEvents.json"
    output_file = "CommonEvents_Script.txt"
    
    # 檢查檔案是否存在
    if not os.path.exists(source_file):
        print(f"❌ 錯誤：找不到 {source_file}")
        print("請確定你把這個腳本放在遊戲的 data 資料夾內！")
        return

    print(f"正在讀取 {source_file}...")
    
    try:
        with open(source_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        with open(output_file, 'w', encoding='utf-8') as out:
            out.write(f"=== {source_file} 劇情提取結果 ===\n\n")
            
            # CommonEvents 是一個列表，第一個元素通常是 null
            for index, event in enumerate(data):
                if event is None: continue
                
                name = event.get("name", f"事件 ID {index}")
                list_cmds = event.get("list", [])
                
                if not list_cmds: continue
                
                # 寫入事件標題
                header = f"--- [ID:{index}] {name} ---"
                out.write(header + "\n")
                print(header) # 同時顯示在螢幕上
                
                current_speaker = "旁白/未命名"
                has_content = False
                
                for command in list_cmds:
                    code = command.get("code")
                    params = command.get("parameters")
                    
                    # 101: 設定對話框 (捕捉名字)
                    if code == 101:
                        if len(params) > 4 and params[4]:
                            current_speaker = params[4]
                        else:
                            current_speaker = "???"
                            
                    # 401: 顯示文字 (Show Text)
                    elif code == 401:
                        text = params[0]
                        line = f"{current_speaker}: {text}\n"
                        out.write(line)
                        has_content = True
                        
                    # 405: 滾動文字 (Scroll Text - 常用於序章)
                    elif code == 405:
                        text = params[0]
                        line = f"(滾動字幕): {text}\n"
                        out.write(line)
                        has_content = True
                        
                    # 102: 選項 (Show Choices)
                    elif code == 102:
                        choices = params[0]
                        line = f"\n[出現選項]: {choices}\n"
                        out.write(line)
                        current_speaker = "系統" # 選項後重置說話者
                
                if has_content:
                    out.write("\n")
                else:
                    out.write("(此事件無對話內容)\n\n")

        print(f"\n✅ 成功！所有劇情已存入「{output_file}」")
        
    except Exception as e:
        print(f"發生錯誤: {e}")

if __name__ == "__main__":
    extract_common_events()
    input("按 Enter 鍵結束...")