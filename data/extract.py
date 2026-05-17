import json
import os
import glob

# 設定：只提取以下代碼的內容
# 401: 對話文字 (Show Text)
# 405: 滾動文字 (Scroll Text)
# 102: 選項 (Show Choices)
# 402: 選項分歧 (When [Choice] is selected) - 額外加入這條讓你更好讀
TARGET_CODES = [401, 405, 102, 402]

def extract_from_list(event_list, source_name, output_file):
    """讀取事件指令列表並提取文字"""
    current_speaker = "旁白/未命名"
    
    for command in event_list:
        if not command: continue
        
        code = command.get("code")
        params = command.get("parameters")
        
        # 捕捉說話者 (代碼 101: Show Text 設定)
        if code == 101:
            # params[0] 是頭像圖檔名, params[4] 是名字 (如果有的話)
            if len(params) > 4 and params[4]:
                current_speaker = params[4]
            else:
                current_speaker = "???"
        
        # 捕捉對話內容 (代碼 401) 或 滾動文字 (代碼 405)
        elif code in [401, 405]:
            text = params[0]
            # 寫入格式： [地圖/事件來源] 名字: 內容
            line = f"[{source_name}] {current_speaker}: {text}\n"
            output_file.write(line)
            
        # 捕捉選項 (代碼 102)
        elif code == 102:
            choices = params[0]
            line = f"\n[{source_name}] --- 出現選項: {choices} ---\n"
            output_file.write(line)
            current_speaker = "系統" # 選項後重置說話者

        # 捕捉選項分歧 (代碼 402) - 讓你知道選了哪個選項後的劇情
        elif code == 402:
            choice_index = params[0]
            choice_text = params[1]
            line = f"[{source_name}] (若玩家選擇: {choice_text}) >>>\n"
            output_file.write(line)

def process_map_file(filepath, output_file):
    filename = os.path.basename(filepath)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        map_name = data.get("displayName", "未命名地圖")
        if not map_name: map_name = filename
        
        events = data.get("events", [])
        
        for event in events:
            if event is None: continue
            event_name = event.get("name", "未命名事件")
            pages = event.get("pages", [])
            
            for i, page in enumerate(pages):
                list_cmds = page.get("list", [])
                # 為了避免每個事件頁都跑出來，只抓有內容的
                if list_cmds: 
                    source_info = f"{filename}({map_name}) | {event_name}-頁{i+1}"
                    extract_from_list(list_cmds, source_info, output_file)
                
    except Exception as e:
        print(f"略過 {filename} (可能格式錯誤): {e}")

def process_common_events(filepath, output_file):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        for event in data:
            if event is None: continue
            name = event.get("name", "未命名公共事件")
            list_cmds = event.get("list", [])
            source_info = f"公共事件 | {name}"
            extract_from_list(list_cmds, source_info, output_file)
            
    except Exception as e:
        print(f"略過 CommonEvents.json: {e}")

def main():
    output_filename = "劇本提取結果.txt"
    print("正在開始提取劇本...")
    
    with open(output_filename, "w", encoding="utf-8") as out:
        # 1. 處理公共事件
        if os.path.exists("CommonEvents.json"):
            print("- 正在讀取公共事件...")
            process_common_events("CommonEvents.json", out)
            out.write("\n" + "="*50 + "\n\n")
        
        # 2. 處理所有 MapJSON 檔案
        map_files = sorted(glob.glob("Map*.json"))
        for map_file in map_files:
            # 略過 MapInfos (它不是地圖檔)
            if "MapInfos" in map_file: continue
            
            print(f"- 正在讀取 {map_file}...")
            process_map_file(map_file, out)
    
    print(f"\n✅ 完成！所有對話已存入「{output_filename}」")
    input("按 Enter 鍵關閉視窗...")

if __name__ == "__main__":
    main()