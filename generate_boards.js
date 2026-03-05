// generate_boards.js
import fs from 'fs';

const COLS = 6;
const TOTAL_ROWS = 6; // 根據你的盤面邏輯，包含預備區
const PLAY_ROWS_START = 1;

const generateRandomBoard = () => {
  const board = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(Math.floor(Math.random() * 6)); 
    }
    board.push(row);
  }
  return board;
};
const NUM_TESTS = 4000;
const testSuite = Array.from({ length: NUM_TESTS }, () => generateRandomBoard());

fs.writeFileSync('fixed_test_suite.json', JSON.stringify(testSuite));
console.log(`✅ 成功產出 ${NUM_TESTS} 局固定測試盤面！`);