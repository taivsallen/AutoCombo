import {
  ATTRIBUTES,
  RACES,
  ATTRIBUTE_OPTIONS,
  RACE_OPTIONS,
  TEMPLATE_CHAR_TO_ORB_ID,
  convertTemplateBoardToEditorBoard,
  convertTemplateBoardTo2D,
  templateBoardHasX,
} from "./templateConstants";
import { ACTIVE_SKILL_TEMPLATE_DATA_ENCODED } from "./activeSkillTemplateData.enc";

const ATTRIBUTE_MAP = {
  w: ATTRIBUTES.WATER,
  f: ATTRIBUTES.FIRE,
  p: ATTRIBUTES.PLANT,
  l: ATTRIBUTES.LIGHT,
  d: ATTRIBUTES.DARK,
};

const RACE_MAP = {
  human: RACES.HUMAN,
  god: RACES.GOD,
  demon: RACES.DEMON,
  beast: RACES.BEAST,
  dragon: RACES.DRAGON,
  machina: RACES.MACHINA,
  elf: RACES.ELF,
};

function decodeBase64Unicode(str) {
  const binary = atob(str);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function restoreData(compactList) {
  return compactList.map((item) => ({
    type: item.t,
    id: item.i,
    characterName: item.n,
    note: item.o,
    characterImg: item.g,
    attribute: ATTRIBUTE_MAP[item.a],
    race: RACE_MAP[item.r],

    // 新增 follow
    follow: item.fw || null,

    board: item.b.split(""),
  }));
}

let cachedData = null;

export function getActiveSkillTemplateData() {
  if (cachedData) return cachedData;

  const json = decodeBase64Unicode(ACTIVE_SKILL_TEMPLATE_DATA_ENCODED);
  const compactList = JSON.parse(json);
  cachedData = restoreData(compactList);

  return cachedData;
}

export const ACTIVE_SKILL_TEMPLATE_DATA = getActiveSkillTemplateData();

export {
  ATTRIBUTES,
  RACES,
  ATTRIBUTE_OPTIONS,
  RACE_OPTIONS,
  TEMPLATE_CHAR_TO_ORB_ID,
  convertTemplateBoardToEditorBoard,
  convertTemplateBoardTo2D,
  templateBoardHasX,
};