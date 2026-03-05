import subprocess
import json
import os
import optuna

def create_tuner_script():
    # 1. 讀取原始的 benchmark.js
    try:
        with open('benchmark.js', 'r', encoding='utf-8') as f:
            original_code = f.read()
    except FileNotFoundError:
        print("❌ 找不到 benchmark.js，請確定檔案在同一個目錄。")
        return False

    # 2. 移除原本底部的測試區塊，換成可接收命令列參數的 JSON 輸出版本
    split_marker = "// --- 開始執行測試 ---"
    if split_marker not in original_code:
        print("❌ 找不到分割標記 '// --- 開始執行測試 ---'，請確認 benchmark.js 未被修改過。")
        return False
        
    base_code = original_code.split(split_marker)[0]

    # 加入動態接收參數的程式碼
    tuner_code = base_code + """
// === 以下為 Python 動態加入的自動化調參區塊 ===
import fs from 'fs'; 

const TARGET_COMBO = 8;

// 🛑 讀取固定的測試題庫
const testSuite = JSON.parse(fs.readFileSync('fixed_test_suite.json', 'utf8'));

const args = process.argv.slice(2);
const configTest = {
    maxSteps: 70, // 固定
    beamWidth: parseInt(args[0], 10),
    maxNodes: parseInt(args[1], 10),
    stepPenalty: parseInt(args[2], 10),
    potentialWeight: parseInt(args[3], 10)
};

const report = runBenchmark("Tuning", beamSolve, testSuite, TARGET_COMBO, configTest);
console.log(JSON.stringify({
    config: configTest,
    metrics: report.metrics,
    finalScore: report.finalScore
}));
"""
    # 存成 .mjs 確保 Node.js 以 ES Module 模式執行
    with open('temp_tuner.mjs', 'w', encoding='utf-8') as f:
        f.write(tuner_code)
    
    return True

def objective(trial):
    """
    Optuna 的目標函數，每一次 trial 都會執行這裡
    """
    bw = trial.suggest_int('beamWidth', 10, 40, step=10)
    mn = trial.suggest_int('maxNodes', 50000, 200000, step=10000)
    sp = trial.suggest_int('stepPenalty', 100, 1000, step=100)
    pw = trial.suggest_int('potentialWeight', 10, 50, step=5)

    # 👇 1. 每次開始前先印出提示，證明 Python 沒死當
    print(f"⏳ 啟動 Trial {trial.number}: 測試 BW={bw:<3} | Nodes={mn:<6} ...", end="", flush=True)

    cmd = ['node', 'temp_tuner.mjs', str(bw), str(mn), str(sp), str(pw)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # 👇 2. 捕捉並印出 Node.js 的潛在錯誤 (例如找不到 JSON 題庫)
    if result.stderr:
        print(f"\n❌ Node.js 發生錯誤:\n{result.stderr}")
        return -float('inf')

    try:
        data = json.loads(result.stdout.strip())
        score = data['finalScore']
        print(f" ✅ 完成！得分: {score}") # 成功跑完印出這行
        return score
    except Exception as e:
        print(f"\n❌ JSON 解析失敗，Node.js 輸出內容為:\n{result.stdout}")
        return -float('inf')
    
# 👇 新增：自訂進度與突破紀錄的通知函數
def champion_callback(study, frozen_trial):
    """
    這個函數會在每一個 Trial 結束時被呼叫。
    我們只在「創造新高分」時印出特別提示，避免平行運算時終端機訊息太雜亂。
    """
    # 確保這個 trial 沒有發生錯誤且有分數
    if frozen_trial.value is not None:
        # 如果剛結束的這個 trial 是目前的歷史最佳解
        if study.best_trial.number == frozen_trial.number:
            print(f"\n🔥 [進度更新] 突破紀錄！Trial {frozen_trial.number} 跑出新高分: {frozen_trial.value}")
            print(f"   👉 當前最佳參數: {frozen_trial.params}\n")

def main():
    if not create_tuner_script():
        return

    print("🚀 啟動 Optuna 貝氏最佳化調參...")
    print("將從過去的測試經驗中學習，自動尋找最高分的參數組合！\n")

    # 建立 Optuna Study (我們希望 finalScore 越高越好，所以 direction 是 'maximize')
    study = optuna.create_study(direction='maximize')

    # 👇 新增：設定 logging 層級，隱藏預設的每一步 log，讓畫面更乾淨地專注在進度條和新紀錄
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    # 開始最佳化！
    # 👇 新增：show_progress_bar=True (顯示進度條) 與 callbacks=[champion_callback] (破紀錄通知)
    study.optimize(
        objective, 
        n_trials=150, 
        n_jobs=1, 
        show_progress_bar=True,       # 開啟底部進度條
        callbacks=[champion_callback] # 加入自訂的破紀錄通知
    )

    print("\n===========================================")
    print("🏆 最佳參數組合出爐！")
    print("===========================================")
    print(f"⭐️ 最佳 Final Score: {study.best_value}")
    print("\n📍 最佳參數 (Config):")
    for key, value in study.best_params.items():
        print(f"   - {key}: {value}")
    print("===========================================")

    # 測試完畢，清理暫存檔
    if os.path.exists('temp_tuner.mjs'):
        os.remove('temp_tuner.mjs')

if __name__ == '__main__':
    main()