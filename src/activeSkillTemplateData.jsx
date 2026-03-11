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
	note: "沒發動角色珠及回合結束時",
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
    id: "11117",
    characterName: "傳情玫瑰 ‧ 梅蘭妮",
	note: "開技時及回合結束時",
    characterImg: "./characters/11117.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.MACHINA,
	board:
			[
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h'
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
	note: "開技時及回合結束時",
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
	note: "【伊格利特】、開技時及回合結束時",
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
    id: "11093",
    characterName: "崔鐘仁",
	note: "",
    characterImg: "./characters/11093.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f'
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
	note: "技能關閉時",
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
	note: "開技時及回合結束時",
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
	note: "【命運迴響】",
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
	note: "開技時及回合結束時",
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
	note: "開技時及回合結束時",
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
    id: "11040_a",
    characterName: "巨鼠 ‧ 巴比倫",
	note: "開技時",
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
    id: "11040_b",
    characterName: "巨鼠 ‧ 巴比倫",
	note: "回合結束時",
    characterImg: "./characters/11040.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.HUMAN,
	board:
			[
				'p', 'h', 'h', 'h', 'h', 'h', 
				'p', 'h', 'p', 'p', 'p', 'h', 
				'p', 'h', 'p', 'h', 'p', 'h', 
				'p', 'h', 'h', 'h', 'p', 'h', 
				'p', 'p', 'p', 'p', 'p', 'h'
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
  {
  id: "10988",
    characterName: "夏陸陸 ‧ 吉 ‧ 不列顛尼亞與瑪莉安娜 ‧ 維 ‧ 不列顛尼亞",
	note: "",
    characterImg: "./characters/10988.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.GOD,
	board:
			[
				'd', 'w', 'f', 'p', 'l', 'd', 
				'd', 'w', 'f', 'p', 'l', 'd', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'd', 'w', 'f', 'p', 'l', 'd', 
				'd', 'w', 'f', 'p', 'l', 'd'
			],
  },
  {
  id: "10983",
    characterName: "黎星刻與神虎",
	note: "開技時及回合結束時",
    characterImg: "./characters/10983.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.MACHINA,
	board:
			[
				'l', 'w', 'w', 'w', 'w', 'l', 
				'w', 'l', 'w', 'w', 'l', 'w', 
				'w', 'w', 'l', 'l', 'w', 'w', 
				'w', 'l', 'w', 'w', 'l', 'w', 
				'l', 'w', 'w', 'w', 'w', 'l'
			],
  },
  {
  id: "10981",
    characterName: "紅月卡蓮與紅蓮聖天八極式",
	note: "",
    characterImg: "./characters/10981.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.MACHINA,
	board:
			[
				'f', 'l', 'f', 'l', 'f', 'l', 
				'f', 'l', 'f', 'l', 'f', 'l', 
				'f', 'l', 'f', 'l', 'f', 'l', 
				'f', 'l', 'f', 'l', 'f', 'l', 
				'f', 'l', 'f', 'l', 'f', 'l'
			],
  },
  {
  id: "10980_a",
    characterName: "魯路修 ‧ 維 ‧ 不列顛尼亞與海市蜃樓",
	note: "【戰鬥機】",
    characterImg: "./characters/10980.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.MACHINA,
	board:
			[
				'd', 'p', 'f', 'l', 'w', 'h', 
				'd', 'p', 'f', 'l', 'w', 'h', 
				'd', 'p', 'f', 'l', 'w', 'h', 
				'd', 'p', 'f', 'l', 'w', 'h', 
				'd', 'p', 'f', 'l', 'w', 'h'
			],
  },
  {
  id: "10980_b",
    characterName: "魯路修 ‧ 維 ‧ 不列顛尼亞與海市蜃樓",
	note: "【機甲】",
    characterImg: "./characters/10980.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.MACHINA,
	board:
			[
				'd', 'd', 'd', 'h', 'h', 'h', 
				'h', 'h', 'h', 'd', 'd', 'd', 
				'd', 'd', 'd', 'h', 'h', 'h', 
				'h', 'h', 'h', 'd', 'd', 'd', 
				'd', 'd', 'd', 'h', 'h', 'h'
			],
  },
  {
  id: "10979",
    characterName: "傑瑞米亞 ‧ 哥德巴爾德與齊格菲",
	note: "",
    characterImg: "./characters/10979.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.MACHINA,
	board:
			[
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'w', 'f', 'p', 'd', 'l', 
				'l', 'w', 'f', 'p', 'd', 'l', 
				'l', 'w', 'f', 'p', 'd', 'l', 
				'l', 'l', 'l', 'l', 'l', 'l'
			],
  },
  {
  id: "10977_a",
    characterName: "柯內莉亞 ‧ 利 ‧ 不列顛尼亞與格洛斯特 (柯內莉亞機)",
	note: "自身位於左方 3 直行",
    characterImg: "./characters/10977.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.MACHINA,
	board:
			[
				'p', 'p', 'p', 'p', 'p', 'p', 
				'p', 'f', 'f', 'f', 'f', 'p', 
				'p', 'f', 'w', 'w', 'f', 'p', 
				'p', 'f', 'w', 'w', 'f', 'p', 
				'p', 'f', 'w', 'w', 'f', 'p'
			],
  },
  {
  id: "10977_b",
    characterName: "柯內莉亞 ‧ 利 ‧ 不列顛尼亞與格洛斯特 (柯內莉亞機)",
	note: "自身位於右方 3 直行",
    characterImg: "./characters/10977.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.MACHINA,
	board:
			[
				'd', 'd', 'd', 'd', 'd', 'd', 
				'd', 'l', 'l', 'l', 'l', 'd', 
				'd', 'l', 'h', 'h', 'l', 'd', 
				'd', 'l', 'h', 'h', 'l', 'd', 
				'd', 'l', 'h', 'h', 'l', 'd'
			],
  },
  {
  id: "10969",
    characterName: "尤菲米亞 ‧ 利 ‧ 不列顛尼亞",
	note: "",
    characterImg: "./characters/10969.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'w', 'w', 'w', 'w', 'w', 'w', 
				'w', 'f', 'p', 'l', 'd', 'h', 
				'w', 'f', 'p', 'l', 'd', 'h', 
				'w', 'f', 'p', 'l', 'd', 'h', 
				'w', 'f', 'p', 'l', 'd', 'h'
			],
  },
  {
  id: "10962",
    characterName: "碧藍假期 ‧ 阿圖姆",
	note: "",
    characterImg: "./characters/10962.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.MACHINA,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'l', 'l', 'l', 'l', 'f', 
				'f', 'l', 'l', 'l', 'l', 'f', 
				'f', 'l', 'l', 'l', 'l', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f'
			],
  },
  {
  id: "10953",
    characterName: "妖精王 ‧ 奧伯隆",
	note: "【緹坦妮雅】",
    characterImg: "./characters/10953.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.ELF,
	board:
			[
				'l', 'l', 'l', 'w', 'w', 'w', 
				'l', 'f', 'f', 'f', 'f', 'w', 
				'l', 'p', 'p', 'p', 'p', 'w', 
				'l', 'd', 'd', 'd', 'd', 'w', 
				'l', 'l', 'l', 'w', 'w', 'w'
			],
  },
  {
  id: "10950",
    characterName: "五宿思慕 ‧ 緹坦妮雅",
	note: "開技時及每回合結束時",
    characterImg: "./characters/10950.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.ELF,
	board:
			[
				'w', 'w', 'w', 'w', 'w', 'w', 
				'f', 'p', 'l', 'd', 'h', 'w', 
				'f', 'p', 'l', 'd', 'h', 'w', 
				'f', 'p', 'l', 'd', 'h', 'w', 
				'f', 'p', 'l', 'd', 'h', 'w'
			],
  },
  {
  id: "10947",
    characterName: "鞘姬 (黑川茜)",
	note: "關閉技能時",
    characterImg: "./characters/10947.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.DEMON,
	board:
			[
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'h', 'h', 'h', 'h', 'h', 'h'
			],
  },
  {
  id: "10943",
    characterName: "刀 (姬川大輝)",
	note: "",
    characterImg: "./characters/10943.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.DEMON,
	board:
			[
				'w', 'f', 'f', 'f', 'f', 'w', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'w', 'f', 'f', 'f', 'f', 'w'
			],
  },
  {
  id: "10941",
    characterName: "皮耶勇酷雞",
	note: "",
    characterImg: "./characters/10941.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.HUMAN,
	board:
			[
				'h', 'h', 'l', 'l', 'h', 'h', 
				'h', 'l', 'l', 'l', 'l', 'h', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'h', 'l', 'l', 'l', 'l', 'h', 
				'h', 'h', 'l', 'l', 'h', 'h'
			],
  },
  {
  id: "10939",
    characterName: "B小町",
	note: "合體卡",
    characterImg: "./characters/10939.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'w', 'p', 'l', 'd', 'h', 
				'f', 'h', 'h', 'h', 'h', 'h'
			],
  },
  {
  id: "10938_a",
    characterName: "B小町 ‧ MEMcho",
	note: "",
    characterImg: "./characters/10938.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'l', 'l', 'l', 'l', 'f', 
				'f', 'f', 'l', 'l', 'f', 'f', 
				'f', 'l', 'f', 'f', 'l', 'f', 
				'f', 'l', 'l', 'l', 'l', 'f', 
				'f', 'l', 'l', 'l', 'l', 'f'
			],
  },
  {
  id: "10938_b",
    characterName: "B小町 ‧ MEMcho",
	note: "合體時",
    characterImg: "./characters/10938.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l'
			],
  },
  {
  id: "10936",
    characterName: "B小町 ‧ 有馬加奈",
	note: "合體時",
    characterImg: "./characters/10936.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l'
			],
  },
  {
  id: "10934",
    characterName: "MEMcho",
	note: "",
    characterImg: "./characters/10934.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.HUMAN,
	board:
			[
				'l', 'h', 'h', 'h', 'h', 'l', 
				'l', 'l', 'h', 'h', 'l', 'l', 
				'l', 'h', 'l', 'l', 'h', 'l', 
				'l', 'h', 'h', 'h', 'h', 'l', 
				'l', 'h', 'h', 'h', 'h', 'l'
			],
  },
  {
  id: "10932",
    characterName: "B小町 ‧ 露比",
	note: "合體時",
    characterImg: "./characters/10932.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l', 
				'f', 'h', 'l', 'f', 'h', 'l'
			],
  },
  {
  id: "10931_a",
    characterName: "最佳應援 ‧ 阿奎亞",
	note: "最上面",
    characterImg: "./characters/10931.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'w', 'f', 'p', 'w', 'f', 'p', 
				'w', 'f', 'p', 'w', 'f', 'p', 
				'w', 'f', 'p', 'w', 'f', 'p', 
				'w', 'f', 'p', 'w', 'f', 'p', 
				'w', 'f', 'p', 'w', 'f', 'p'
			],
  },
  {
  id: "10931_b",
    characterName: "最佳應援 ‧ 阿奎亞",
	note: "上往下第二",
    characterImg: "./characters/10931.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'w', 'w', 'w', 'h', 'h', 'h', 
				'h', 'h', 'h', 'w', 'w', 'w', 
				'w', 'w', 'w', 'h', 'h', 'h', 
				'h', 'h', 'h', 'w', 'w', 'w', 
				'w', 'w', 'w', 'h', 'h', 'h'
			],
  },
  {
  id: "10931_c",
    characterName: "最佳應援 ‧ 阿奎亞",
	note: "上往下第三",
    characterImg: "./characters/10931.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'l', 'd', 'h', 'l', 'd', 'h', 
				'l', 'd', 'h', 'l', 'd', 'h', 
				'l', 'd', 'h', 'l', 'd', 'h', 
				'l', 'd', 'h', 'l', 'd', 'h', 
				'l', 'd', 'h', 'l', 'd', 'h'
			],
  },
  {
  id: "10931_d",
    characterName: "最佳應援 ‧ 阿奎亞",
	note: "有小愛時，最下面",
    characterImg: "./characters/10931.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'w', 'w', 'w', 'd', 'd', 'd', 
				'h', 'f', 'p', 'w', 'l', 'h', 
				'h', 'f', 'p', 'w', 'l', 'h', 
				'h', 'f', 'p', 'w', 'l', 'h', 
				'd', 'd', 'd', 'f', 'f', 'f'
			],
  },
  {
  id: "10921_a",
    characterName: "侵掠效應 ‧ 麥科洛",
	note: "開技時",
    characterImg: "./characters/10921.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.DEMON,
	board:
			[
				'f', 'p', 'f', 'p', 'f', 'p', 
				'f', 'p', 'f', 'p', 'f', 'p', 
				'f', 'p', 'f', 'p', 'f', 'p', 
				'f', 'p', 'f', 'p', 'f', 'p', 
				'f', 'p', 'f', 'p', 'f', 'p'
			],
  },
  {
  id: "10921_b",
    characterName: "侵掠效應 ‧ 麥科洛",
	note: "回合結束時",
    characterImg: "./characters/10921.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.DEMON,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'f', 
				'p', 'p', 'p', 'p', 'p', 'p', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'p', 'p', 'p', 'p', 'p', 'p', 
				'f', 'f', 'f', 'f', 'f', 'f'
			],
  },
  {
  id: "10920",
    characterName: "無底之瓶 ‧ 克萊因",
	note: "",
    characterImg: "./characters/10920.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.DRAGON,
	board:
			[
				'w', 'w', 'w', 'f', 'f', 'f', 
				'w', 'p', 'p', 'p', 'h', 'f', 
				'w', 'p', 'd', 'l', 'h', 'f', 
				'h', 'p', 'd', 'l', 'h', 'h', 
				'd', 'd', 'd', 'l', 'l', 'l'
			],
  },
  {
  id: "10916",
    characterName: "空條承太郎與白金之星 ‧ 世界",
	note: "開技時及回合結束時",
    characterImg: "./characters/10916.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.HUMAN,
	board:
			[
				'd', 'h', 'h', 'h', 'h', 'd', 
				'd', 'l', 'w', 'f', 'p', 'd', 
				'd', 'l', 'w', 'f', 'p', 'd', 
				'd', 'l', 'w', 'f', 'p', 'd', 
				'd', 'h', 'h', 'h', 'h', 'd'
			],
  },
  {
  id: "10913",
    characterName: "天氣預報",
	note: "",
    characterImg: "./characters/10913.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'f', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'p', 'p', 'p', 'p', 'p', 'p', 
				'w', 'w', 'w', 'w', 'w', 'w', 
				'd', 'd', 'd', 'd', 'd', 'd'
			],
  },
  {
  id: "10912",
    characterName: "迪亞波羅與緋紅之王",
	note: "觸碰>=3數量及回合結束時",
    characterImg: "./characters/10912.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'h', 'f', 'f', 'h', 'f', 
				'h', 'h', 'f', 'f', 'h', 'h', 
				'f', 'p', 'h', 'h', 'p', 'f', 
				'h', 'h', 'f', 'f', 'h', 'h', 
				'f', 'h', 'f', 'f', 'h', 'f'
			],
  },
  {
  id: "10906",
    characterName: "吉良吉影與殺手皇后",
	note: "回合結束時",
    characterImg: "./characters/10906.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.HUMAN,
	board:
			[
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'f', 'f', 'f', 'f', 'f', 'f'
			],
  },
  {
  id: "10905",
    characterName: "岸邊露伴與天堂之門",
	note: "開技時及回合結束時",
    characterImg: "./characters/10905.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.HUMAN,
	board:
			[
				'p', 'p', 'p', 'l', 'l', 'l', 
				'p', 'h', 'h', 'h', 'h', 'l', 
				'p', 'h', 'h', 'h', 'h', 'l', 
				'p', 'h', 'h', 'h', 'h', 'l', 
				'p', 'p', 'p', 'l', 'l', 'l'
			],
  },
  {
  id: "10898",
    characterName: "喬魯諾 ‧ 喬巴拿與黃金體驗",
	note: "",
    characterImg: "./characters/10898.png",
    attribute: ATTRIBUTES.LIGHT,
    race: RACES.HUMAN,
	board:
			[
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'l', 'l', 'l', 'l', 'l', 'l'
			],
  },
  {
  id: "10897_a",
    characterName: "廣瀨康一與迴音三號",
	note: "開技時",
    characterImg: "./characters/10897.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.HUMAN,
	board:
			[
				'h', 'h', 'p', 'p', 'h', 'h', 
				'h', 'p', 'h', 'p', 'h', 'h', 
				'h', 'h', 'h', 'p', 'h', 'h', 
				'h', 'h', 'h', 'p', 'h', 'h', 
				'h', 'p', 'p', 'p', 'p', 'h'
			],
  },
  {
  id: "10897_b",
    characterName: "廣瀨康一與迴音三號",
	note: "回合結束時",
    characterImg: "./characters/10897.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.HUMAN,
	board:
			[
				'h', 'h', 'p', 'p', 'h', 'h', 
				'h', 'p', 'h', 'h', 'p', 'h', 
				'h', 'h', 'h', 'p', 'h', 'h', 
				'h', 'h', 'p', 'h', 'h', 'h', 
				'h', 'p', 'p', 'p', 'p', 'h'
			],
  },
  {
  id: "10897_c",
    characterName: "廣瀨康一與迴音三號",
	note: "【替身】模式、開技時及回合結束時",
    characterImg: "./characters/10897.png",
    attribute: ATTRIBUTES.PLANT,
    race: RACES.HUMAN,
	board:
			[
				'h', 'p', 'p', 'p', 'p', 'h', 
				'h', 'h', 'h', 'h', 'p', 'h', 
				'h', 'h', 'p', 'p', 'h', 'h', 
				'h', 'h', 'h', 'h', 'p', 'h', 
				'h', 'p', 'p', 'p', 'p', 'h'
			],
  },
  {
  id: "10895",
    characterName: "空條徐倫與石之海",
	note: "【替身】模式、開技時及回合結束時",
    characterImg: "./characters/10895.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.HUMAN,
	board:
			[
				'w', 'w', 'w', 'w', 'w', 'w', 
				'p', 'p', 'w', 'w', 'p', 'p', 
				'p', 'p', 'p', 'p', 'p', 'p', 
				'p', 'p', 'w', 'w', 'p', 'p', 
				'w', 'w', 'w', 'w', 'w', 'w'
			],
  },
  {
  id: "10892",
    characterName: "皓耀珀火 ‧ 刻琿",
	note: "技能關閉時",
    characterImg: "./characters/10892.png",
    attribute: ATTRIBUTES.FIRE,
    race: RACES.DRAGON,
	board:
			[
				'f', 'f', 'f', 'l', 'd', 'w', 
				'p', 'p', 'p', 'l', 'd', 'w', 
				'l', 'd', 'w', 'l', 'd', 'w', 
				'l', 'd', 'w', 'p', 'p', 'p', 
				'l', 'd', 'w', 'f', 'f', 'f'
			],
  },
  {
  id: "10887",
    characterName: "正道鐵律 ‧ 蓋倫",
	note: "",
    characterImg: "./characters/10887.png",
    attribute: ATTRIBUTES.DARK,
    race: RACES.HUMAN,
	board:
			[
				'd', 'd', 'l', 'l', 'd', 'd', 
				'd', 'd', 'l', 'l', 'd', 'd', 
				'h', 'h', 'h', 'h', 'h', 'h', 
				'd', 'd', 'l', 'l', 'd', 'd', 
				'd', 'd', 'l', 'l', 'd', 'd'
			],
  },
  {
  id: "10874",
    characterName: "命運歡樂頌 ‧ 貝多芬",
	note: "1技能",
    characterImg: "./characters/10874.png",
    attribute: ATTRIBUTES.WATER,
    race: RACES.GOD,
	board:
			[
				'w', 'w', 'w', 'w', 'w', 'w', 
				'f', 'f', 'f', 'f', 'f', 'f', 
				'p', 'p', 'p', 'p', 'p', 'p', 
				'l', 'l', 'l', 'l', 'l', 'l', 
				'd', 'd', 'd', 'd', 'd', 'd'
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