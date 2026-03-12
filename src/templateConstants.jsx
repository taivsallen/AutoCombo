export const ATTRIBUTES = {
  WATER: "w",
  FIRE: "f",
  PLANT: "p",
  LIGHT: "l",
  DARK: "d",
};

export const RACES = {
  HUMAN: "human",
  GOD: "god",
  DEMON: "demon",
  BEAST: "beast",
  DRAGON: "dragon",
  MACHINA: "machina",
  ELF: "elf",
};

export const ATTRIBUTE_OPTIONS = [
  { value: "all", label: "全部屬性" },
  { value: ATTRIBUTES.WATER, label: "水" },
  { value: ATTRIBUTES.FIRE, label: "火" },
  { value: ATTRIBUTES.PLANT, label: "木" },
  { value: ATTRIBUTES.LIGHT, label: "光" },
  { value: ATTRIBUTES.DARK, label: "暗" },
];

export const RACE_OPTIONS = [
  { value: "all", label: "全部種族" },
  { value: RACES.HUMAN, label: "人" },
  { value: RACES.GOD, label: "神" },
  { value: RACES.DEMON, label: "魔" },
  { value: RACES.BEAST, label: "獸" },
  { value: RACES.DRAGON, label: "龍" },
  { value: RACES.MACHINA, label: "機械" },
  { value: RACES.ELF, label: "妖精" },
];

export const TEMPLATE_CHAR_TO_ORB_ID = {
  w: 0,
  f: 1,
  p: 2,
  l: 3,
  d: 4,
  h: 5,
};

export function convertTemplateBoardToEditorBoard(board) {
  if (!Array.isArray(board) || board.length !== 30) {
    throw new Error("template board 格式錯誤，必須是長度 30 的陣列");
  }

  return board.map((ch) => {
    const orbId = TEMPLATE_CHAR_TO_ORB_ID[ch];
    if (orbId === undefined) {
      throw new Error(`未知的模板符石字元: ${ch}`);
    }
    return orbId;
  });
}

export function convertTemplateBoardTo2D(board, rows = 5, cols = 6) {
  const flat = convertTemplateBoardToEditorBoard(board);

  const out = [];
  for (let r = 0; r < rows; r++) {
    out.push(flat.slice(r * cols, (r + 1) * cols));
  }
  return out;
}