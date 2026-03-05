import fs from 'fs';

// ==========================================
// 1. 環境變數與假設定 (請依據你的真實環境調整)
// ==========================================
const TOTAL_ROWS = 5; 
const COLS = 6;
const PLAY_ROWS_START = 0; // 如果你的 row 0 是保留區，請改成 1

const cfg = { stepPenalty: 250, potentialWeight: 800, minSteps: 20, replaySpeed: 100, timeLimit: 5.0 };
const target = 6; 
const mode = 'combo'; 
const priority = 'combo';
const skyfall = false; 

// 處理你的 orbOf 邏輯 (這裡假設單純回傳 0~5 的數字)
const orbOf = (val) => val;

// ==========================================
// 2. 你的新版核心物理引擎 (從你剛剛的訊息複製過來)
// ==========================================
const applyGravity = (b, toClear) => {
  const next = b.map(row => [...row]);

  for (let c = 0; c < COLS; c++) {
    let writeRow = TOTAL_ROWS - 1;

    // 注意：你原本寫 r >= 1，如果全部都是遊戲區，這裡應該是 r >= PLAY_ROWS_START
    for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) {
      if (!toClear[r][c]) {
        next[writeRow][c] = b[r][c];
        writeRow--;
      }
    }
    for (let r = writeRow; r >= PLAY_ROWS_START; r--) next[r][c] = -1;
  }

  return next;
};

const potentialScore = (b, mode) => {
  let p = 0;
  const hWeight = mode === 'horizontal' ? 3 : 0.5;
  const vWeight = mode === 'vertical' ? 3 : 0.5;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    let a = orbOf(b[r][0]);
    let d = orbOf(b[r][1]);
    for (let c = 0; c < COLS - 2; c++) {
      const e = orbOf(b[r][c + 2]);
      if (a !== -1) {
        if ((a === d && a !== e) || (d === e && a !== d) || (a === e && a !== d)) p += hWeight;
      }
      a = d;
      d = e;
    }
  }

  for (let c = 0; c < COLS; c++) {
    let a = orbOf(b[PLAY_ROWS_START][c]);
    let d = orbOf(b[PLAY_ROWS_START + 1]?.[c]);
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const e = orbOf(b[r + 2][c]);
      if (a !== -1) {
        if ((a === d && a !== e) || (d === e && a !== d) || (a === e && a !== d)) p += vWeight;
      }
      a = d;
      d = e;
    }
  }

  return p;
};

const findMatches = (tempBoard) => {
  let combos = 0, clearedCount = 0, vC = 0, hC = 0;

  const isH = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(false));
  const isV = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(false));
  const toClear = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(false));

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2; ) {
      const v0 = orbOf(tempBoard[r][c]);
      if (v0 === -1) { c++; continue; }
      const v1 = orbOf(tempBoard[r][c + 1]);
      const v2 = orbOf(tempBoard[r][c + 2]);
      if (v0 !== v1 || v0 !== v2) { c++; continue; }

      let k = c + 3;
      while (k < COLS && orbOf(tempBoard[r][k]) === v0) k++;

      for (let x = c; x < k; x++) {
        toClear[r][x] = true;
        isH[r][x] = true;
      }
      c = k; 
    }
  }

  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; ) {
      const v0 = orbOf(tempBoard[r][c]);
      if (v0 === -1) { r++; continue; }
      const v1 = orbOf(tempBoard[r + 1][c]);
      const v2 = orbOf(tempBoard[r + 2][c]);
      if (v0 !== v1 || v0 !== v2) { r++; continue; }

      let k = r + 3;
      while (k < TOTAL_ROWS && orbOf(tempBoard[k][c]) === v0) k++;

      for (let y = r; y < k; y++) {
        toClear[y][c] = true;
        isV[y][c] = true;
      }
      r = k; 
    }
  }

  const visited = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(false));
  const drs = [0, 0, 1, -1];
  const dcs = [1, -1, 0, 0];

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!toClear[r][c] || visited[r][c]) continue;

      combos++;
      const type = orbOf(tempBoard[r][c]);
      let hasHM = false, hasVM = false;

      const q = [{ r, c }];
      visited[r][c] = true;
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi];
        clearedCount++;

        if (isH[cur.r][cur.c]) hasHM = true;
        if (isV[cur.r][cur.c]) hasVM = true;

        for (let i = 0; i < 4; i++) {
          const nr = cur.r + drs[i], nc = cur.c + dcs[i];
          if (
            nr >= PLAY_ROWS_START && nr < TOTAL_ROWS &&
            nc >= 0 && nc < COLS &&
            toClear[nr][nc] &&
            !visited[nr][nc] &&
            orbOf(tempBoard[nr][nc]) === type
          ) {
            visited[nr][nc] = true;
            q.push({ r: nr, c: nc });
          }
        }
      }

      if (hasHM) hC++;
      if (hasVM) vC++;
    }
  }

  return { combos, clearedCount, vC, hC, toClearMap: toClear };
};

const evaluateBoard = (tempBoard, skyfall) => {
  let result = findMatches(tempBoard);
  let initialCombos = result.combos;
  let initialH = result.hC;
  let initialV = result.vC;
  let initialCleared = result.clearedCount;
  if (!skyfall) return { combos: initialCombos, initialCombos, skyfallCombos: 0, clearedCount: initialCleared, verticalCombos: initialV, horizontalCombos: initialH };

  let currentBoard = tempBoard.map(r => [...r]);
  let totalCombos = initialCombos, totalV = initialV, totalH = initialH, totalCleared = initialCleared;
  let loopResult = result;
  while (loopResult.combos > 0) {
    currentBoard = applyGravity(currentBoard, loopResult.toClearMap);
    loopResult = findMatches(currentBoard);
    if (loopResult.combos > 0) {
      totalCombos += loopResult.combos;
      totalV += loopResult.vC;
      totalH += loopResult.hC;
      totalCleared += loopResult.clearedCount;
    }
  }
  return { combos: totalCombos, initialCombos, skyfallCombos: totalCombos - initialCombos, clearedCount: totalCleared, verticalCombos: totalV, horizontalCombos: totalH };
};

const calcScore = (ev, pot, pathLen, cfg, target, mode, priority) => {
  const cappedCombos = Math.min(ev.combos, target);
  const baseMajor = mode === 'vertical' ? ev.verticalCombos * 5000000 : ev.horizontalCombos * 5000000;
  const baseScore = baseMajor + cappedCombos * 1000000;

  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;
  const effectiveStepPenalty = priority === 'steps' ? cfg.stepPenalty * 4 : cfg.stepPenalty;
  const currentClearedWeight = priority === 'combo' ? 1000 : 200;

  if (ev.combos >= target) {
    const stepCost = pathLen * effectiveStepPenalty;
    return 5000000 - stepCost - overPenalty + ev.clearedCount * currentClearedWeight;
  } else {
    const miss = target - ev.combos;
    const targetPenalty = -(miss * miss * 8000);
    return baseScore + targetPenalty + pot * cfg.potentialWeight + ev.clearedCount * currentClearedWeight - pathLen * 20;
  }
};

// ==========================================
// 3. 隨機生成盤面與匯出 CSV 的邏輯
// ==========================================
const createRandomBoard = () => {
  let board = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    let row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(Math.floor(Math.random() * 6)); // 假設有 6 種符文
    }
    board.push(row);
  }
  return board;
};

async function generateDataset() {
  const TOTAL_SAMPLES = 300000; // ⚠️ 先跑 1000 筆測試
  const OUTPUT_FILE = 'training_data.csv';
  
  console.log(`開始生成題庫，目標數量: ${TOTAL_SAMPLES} 筆...`);
  const stream = fs.createWriteStream(OUTPUT_FILE);

  let header = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      header.push(`orb_${r}_${c}`);
    }
  }
  header.push('combos'); 
  header.push('score');  
  stream.write(header.join(',') + '\n');

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const board = createRandomBoard();
    
    // 讓你的新版引擎進行打分
    const ev = evaluateBoard(board, skyfall);
    const pot = potentialScore(board, mode);
    const finalScore = calcScore(ev, pot, 0, cfg, target, mode, priority);

    let rowData = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        rowData.push(board[r][c]);
      }
    }
    
    rowData.push(ev.combos);
    rowData.push(finalScore);
    
    const canWrite = stream.write(rowData.join(',') + '\n');
    if (!canWrite) {
      await new Promise(resolve => stream.once('drain', resolve));
    }

    if ((i + 1) % 100 === 0) {
      console.log(`已生成 ${i + 1} 筆...`);
    }
  }

  stream.end();
  console.log(`🎉 題庫生成完畢！請查看資料夾下的 ${OUTPUT_FILE}`);
}

generateDataset().catch(console.error);