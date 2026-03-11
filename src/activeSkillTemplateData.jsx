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

export const ACTIVE_SKILL_TEMPLATE_DATA = [
  {
    id: "11134",
    characterName: "心庭暖芽 ‧ 曼陀羅",
	note: "",
    characterImg: "./characters/11134.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.ELF,
	board:
			[
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h'
			],
  },
  {
    id: "11131",
    characterName: "開運祝舞 ‧ 夏彥",
	note: "",
    characterImg: "./characters/11131.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.DEMON,
	board:
			[
				'w', 'w', 'w', 'w', 'w', 'w', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'w', 'w', 'w', 'w', 'w', 'w', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'w', 'w', 'w', 'w', 'w', 'w'
			],
  },
  {
    id: "11130",
    characterName: "悠久繽紛 ‧ 烏瑞亞",
	note: "(回合結束時)",
    characterImg: "./characters/11130.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.GOD,
	board:
			[
				'p', 'p', 'p', 'p', 'p', 'p', 
				'p', 'w', 'f', 'l', 'd', 'h', 
				'p', 'w', 'f', 'l', 'd', 'h', 
				'p', 'w', 'f', 'l', 'd', 'h', 
				'p', 'p', 'p', 'p', 'p', 'p'
			],
  },
  {
    id: "11129",
    characterName: "最勝龍雷 ‧ 帝釋天",
	note: "",
    characterImg: "./characters/11129.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.DRAGON,
	board:
			[
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'f', 'w', 'p', 'd', 'h', 
				'l', 'f', 'w', 'p', 'd', 'h', 
				'l', 'f', 'w', 'p', 'd', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h'
			],
  },
  {
    id: "11125",
    characterName: "絞斷腐障 ‧ 安息",
	note: "",
    characterImg: "./characters/11125.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.BEAST,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'f', 
				'w', 'w', 'w', 'w', 'w', 'w', 
				'p', 'p', 'p', 'p', 'p', 'p', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'd', 'd', 'd', 'd', 'd', 'd'
			],
  },
  {
    id: "11120",
    characterName: "神創耀 ‧ 零覓",
	note: "",
    characterImg: "./characters/11120.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.GOD,
	board:
			[
				'd', 'h', 'w', 'w', 'w', 'd', 
				'd', 'h', 'f', 'p', 'h', 'd', 
				'd', 'h', 'f', 'p', 'h', 'd', 
				'd', 'h', 'f', 'p', 'h', 'd', 
				'd', 'l', 'l', 'l', 'h', 'd'
			],
  },
  {
    id: "11113",
    characterName: "蟻王",
	note: "",
    characterImg: "./characters/11113.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.DEMON,
	board:
			[
				'd', 'h', 'd', 'h', 'd', 'h', 
				'd', 'h', 'd', 'h', 'd', 'h', 
				'd', 'h', 'd', 'h', 'd', 'h', 
				'd', 'h', 'd', 'h', 'd', 'h', 
				'd', 'h', 'd', 'h', 'd', 'h'
			],
  },
  {
    id: "11108",
    characterName: "血腥伊格利特",
	note: "",
    characterImg: "./characters/11108.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.DEMON,
	board:
			[
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h'
			],
  },
  {
    id: "11096",
    characterName: "闇影君主 ‧ 成振宇",
	note: "",
    characterImg: "./characters/11096.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.HUMAN,
	board:
			[
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h', 
				'd', 'f', 'w', 'p', 'l', 'h'
			],
  },
  {
    id: "11094",
    characterName: "白允浩",
	note: "",
    characterImg: "./characters/11094.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.BEAST,
	board:
			[
				'p', 'p', 'p', 'h', 'h', 'h', 
				'h', 'h', 'h', 'f', 'f', 'f', 
				'w', 'w', 'w', 'h', 'h', 'h', 
				'h', 'h', 'h', 'l', 'l', 'l', 
				'd', 'd', 'd', 'h', 'h', 'h'
			],
  },
  {
    id: "11080",
    characterName: "肌肉咖波",
	note: "",
    characterImg: "./characters/11080.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.BEAST,
	board:
			[
				'h', 'w', 'h', 'h', 'w', 'h', 
				'h', 'w', 'w', 'w', 'w', 'h', 
				'w', 'w', 'w', 'w', 'w', 'w', 
				'w', 'w', 'w', 'w', 'w', 'w', 
				'h', 'w', 'w', 'w', 'w', 'h'
			],
  },
  {
    id: "11079",
    characterName: "狗狗",
	note: "(技能關閉時)",
    characterImg: "./characters/11079.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.BEAST,
	board:
			[
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'w', 'f', 'p', 'd', 'l', 
				'l', 'w', 'f', 'p', 'd', 'l', 
				'l', 'w', 'f', 'p', 'd', 'l', 
				'l', 'h', 'h', 'h', 'h', 'l'
			],
  },
  {
    id: "11070",
    characterName: "日墜月落 ‧ 咖波",
	note: "",
    characterImg: "./characters/11070.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.BEAST,
	board:
			[
				'w', 'w', 'w', 'w', 'w', 'w', 
				'w', 'f', 'p', 'l', 'd', 'h', 
				'w', 'f', 'p', 'l', 'd', 'h', 
				'w', 'f', 'p', 'l', 'd', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h'
			],
  },
  {
    id: "11066",
    characterName: "百計不休 ‧ 菅原道真",
	note: "",
    characterImg: "./characters/11066.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.DEMON,
	board:
			[
				'h', 'w', 'h', 'h', 'w', 'h', 
				'h', 'w', 'h', 'h', 'w', 'h', 
				'h', 'w', 'h', 'h', 'w', 'h', 
				'h', 'w', 'h', 'h', 'w', 'h', 
				'h', 'w', 'h', 'h', 'w', 'h'
			],
  },
  {
    id: "11055",
    characterName: "凜潔心界 ‧ 曼陀羅",
	note: "(【命運迴響】)",
    characterImg: "./characters/11055.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.ELF,
	board:
			[
				'h', 'f', 'f', 'h', 'h', 'h', 
				'h', 'f', 'f', 'f', 'f', 'f', 
				'h', 'f', 'f', 'f', 'f', 'h', 
				'f', 'f', 'f', 'f', 'f', 'h', 
				'h', 'h', 'h', 'f', 'f', 'h'
			],
  },
  {
    id: "11047",
    characterName: "神的信使 ‧ 吉列爾",
	note: "",
    characterImg: "./characters/11047.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.GOD,
	board:
			[
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h'
			],
  },
  {
    id: "11044",
    characterName: "銀色劍姬 ‧ 希露法",
	note: "",
    characterImg: "./characters/11044.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.HUMAN,
	board:
			[
				'd', 'd', 'd', 'f', 'f', 'w', 
				'd', 'f', 'f', 'p', 'p', 'w', 
				'd', 'p', 'p', 'l', 'l', 'w', 
				'd', 'l', 'l', 'h', 'h', 'w', 
				'd', 'h', 'h', 'w', 'w', 'w'
			],
  },
  {
    id: "11043",
    characterName: "三重詠唱 ‧ 洛伊德",
	note: "",
    characterImg: "./characters/11043.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.HUMAN,
	board:
			[
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h', 
				'l', 'w', 'f', 'p', 'd', 'h'
			],
  },
  {
    id: "11040",
    characterName: "巨鼠 ‧ 巴比倫",
	note: "",
    characterImg: "./characters/11040.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.HUMAN,
	board:
			[
				'h', 'p', 'p', 'p', 'p', 'p', 
				'h', 'p', 'h', 'h', 'h', 'p', 
				'h', 'p', 'h', 'p', 'h', 'p', 
				'h', 'p', 'p', 'p', 'h', 'p', 
				'h', 'h', 'h', 'h', 'h', 'p'
			],
  },
  {
  id: "11028",
    characterName: "武術家 ‧ 桃",
	note: "",
    characterImg: "./characters/11028.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'h', 'f', 'h', 'f', 'h', 
				'h', 'f', 'h', 'f', 'h', 'f', 
				'f', 'h', 'f', 'h', 'f', 'h', 
				'h', 'f', 'h', 'f', 'h', 'f', 
				'f', 'h', 'f', 'h', 'f', 'h'
			],
  },
  {
  id: "11025",
    characterName: "血線雙偶 ‧ 麗塔與曼蒂",
	note: "",
    characterImg: "./characters/11025.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.DEMON,
	board:
			[
				'p', 'p', 'p', 'h', 'h', 'h', 
				'p', 'p', 'p', 'h', 'h', 'h', 
				'p', 'p', 'p', 'h', 'h', 'h', 
				'p', 'p', 'p', 'h', 'h', 'h', 
				'p', 'p', 'p', 'h', 'h', 'h'
			],
  },
  {
  id: "10991",
    characterName: "諾蘭德 ‧ 馮 ‧ 呂訥堡與弗爾伯特 ‧ 泰坦模式",
	note: "關閉技能時",
    characterImg: "./characters/10991.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.MACHINA,
	board:
			[
				'l', 'l', 'l', 'l', 'l', 'l', 
				'h', 'w', 'f', 'p', 'd', 'h', 
				'h', 'w', 'f', 'p', 'd', 'h', 
				'h', 'w', 'f', 'p', 'd', 'h', 
				'l', 'l', 'l', 'l', 'l', 'l'
			],
  },
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