import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import numpy as np
import os
import onnx
from onnx.external_data_helper import convert_model_from_external_data

# ==========================================
# 1. 資料處理 (Data Loading & Preprocessing)
# ==========================================
class PuzzleDataset(Dataset):
    def __init__(self, csv_file):
        print(f"📦 正在載入資料: {csv_file} ... (這可能需要幾秒鐘)")
        self.data = pd.read_csv(csv_file)
        
        # 前 30 個欄位是 5x6 的盤面
        self.x_data = self.data.iloc[:, :30].values
        
        # ⚠️ 現實面考量 (Normalization)：
        # 你原本的 score 隨便都高達 5,000,000。
        # 如果直接讓 AI 預測這麼巨大的數字，會導致「梯度爆炸 (Gradient Explosion)」，模型會直接壞掉變成 NaN。
        # 所以我們把它除以 1,000,000，把分數縮小到 AI 容易消化的範圍 (例如 5.0)。
        # 之後在 JS 端使用時，只要把預測出來的結果乘回 1,000,000 就可以了！
        self.y_data = self.data.iloc[:, -1].values.astype(np.float32) / 1000000.0

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        # 將一維 30 個數字，轉成 5x6 的二維網格
        board_2d = torch.tensor(self.x_data[idx], dtype=torch.long).view(5, 6)
        
        # ⭐ 關鍵特徵工程：One-Hot Encoding
        # 因為珠子代號 0(水) 跟 1(火) 只是類別，並不是水比火小。
        # 我們把它轉成 6 個「通道」，讓網路能正確辨識不同屬性的珠子。
        board_onehot = F.one_hot(board_2d, num_classes=6).float()
        
        # PyTorch 的 CNN 需要的形狀是 (Channels, Height, Width) => (6, 5, 6)
        board_tensor = board_onehot.permute(2, 0, 1)
        
        # 準備 Label
        label_tensor = torch.tensor([self.y_data[idx]])
        
        return board_tensor, label_tensor

# ==========================================
# 2. 定義黑箱模型 (CNN 神經網路架構)
# ==========================================
class BoardEvaluator(nn.Module):
    def __init__(self):
        super(BoardEvaluator, self).__init__()
        # 第 1 層卷積：找出簡單的相鄰特徵 (如兩顆相連)
        self.conv1 = nn.Conv2d(in_channels=6, out_channels=32, kernel_size=3, padding=1)
        
        # 第 2 層卷積：找出更複雜的形狀 (如 L 型或 T 型的潛力)
        self.conv2 = nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, padding=1)
        
        # 全連接層：把盤面特徵綜合起來打分數
        self.fc1 = nn.Linear(64 * 5 * 6, 128)
        self.fc2 = nn.Linear(128, 1) # 最終輸出 1 個數字 (Score)

    def forward(self, x):
        x = F.relu(self.conv1(x))
        x = F.relu(self.conv2(x))
        x = x.view(x.size(0), -1)    # 把網格攤平，準備進入全連接層
        x = F.relu(self.fc1(x))
        score = self.fc2(x)
        return score

# ==========================================
# 3. 訓練主迴圈 (Training Loop)
# ==========================================
def train_model():
    csv_path = 'training_data.csv'
    if not os.path.exists(csv_path):
        print(f"❌ 找不到 {csv_path}，請確認檔案是否在同一個資料夾。")
        return

    # 超參數設定
    BATCH_SIZE = 512    # 一次看 512 題
    EPOCHS = 10         # 把 30 萬題重複做 10 遍
    LEARNING_RATE = 0.001

    dataset = PuzzleDataset(csv_path)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    # 檢查是否有 GPU 加速 (有顯卡會快很多，沒有的話 CPU 也能跑)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🚀 使用運算設備: {device}")

    model = BoardEvaluator().to(device)
    criterion = nn.MSELoss() # 均方誤差 (用來訓練預測分數的標準函數)
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    print("🧠 開始訓練 AI 徒弟...")
    for epoch in range(EPOCHS):
        total_loss = 0
        model.train()
        
        for batch_idx, (boards, labels) in enumerate(dataloader):
            boards, labels = boards.to(device), labels.to(device)
            
            # 1. 歸零梯度
            optimizer.zero_grad()
            # 2. AI 預測分數
            predictions = model(boards)
            # 3. 計算預測分數與你寫的標準答案之間的誤差
            loss = criterion(predictions, labels)
            # 4. 反向傳播 (自我修正)
            loss.backward()
            # 5. 更新大腦權重
            optimizer.step()
            
            total_loss += loss.item()
            
        avg_loss = total_loss / len(dataloader)
        print(f"🔄 Epoch [{epoch+1}/{EPOCHS}] - 平均誤差 (Loss): {avg_loss:.4f}")

    print("🎉 訓練完成！徒弟出師了！")
    
    model.eval()
    model.to("cpu")
    
    dummy_input = torch.randn(1, 6, 5, 6)
    
    onnx_filename = "board_evaluator.onnx"
    torch.onnx.export(
        model,
        dummy_input,
        onnx_filename,
        input_names=["input_board"],
        output_names=["output_score"],
        dynamic_axes={"input_board": {0: "batch_size"}, "output_score": {0: "batch_size"}},
        opset_version=17,              # ✅ 建議固定（web 端比較穩）
        do_constant_folding=True,       # ✅ 建議開
    )
    
    # ✅ 關鍵：把 external data（如果有）合併回單檔
    m = onnx.load(onnx_filename)
    # 如果它是 external data，這行會把權重併回 model proto 內
    convert_model_from_external_data(m)
    
    onnx.save(m, onnx_filename)
    print(f"💾 已輸出單檔 ONNX：{onnx_filename}")

if __name__ == '__main__':
    train_model()