export type ElementId = "fire" | "water" | "nature" | "earth" | "steel";

export type Element = {
  id: ElementId;
  label: string;
  englishName: string;
  icon: string;
  imageSrc: string;
  colorClass: string;
  shortRule: string;
};

export const ELEMENTS: Element[] = [
  {
    id: "fire",
    label: "FIRE",
    englishName: "Fire Surge",
    icon: "F",
    imageSrc: "/elements/fire.png",
    colorClass: "border-red-400 bg-red-500/20 text-red-100",
    shortRule: "Start with +2 EN. No extra EN gain during rounds 1-3.",
  },
  {
    id: "water",
    label: "WATER",
    englishName: "Water Step",
    icon: "W",
    imageSrc: "/elements/water.png",
    colorClass: "border-sky-300 bg-sky-500/20 text-sky-100",
    shortRule: "Successful normal evade has a 30% chance to steal 1 EN. Triple Strike compresses to one lane.",
  },
  {
    id: "nature",
    label: "NATURE",
    englishName: "Nature Pulse",
    icon: "N",
    imageSrc: "/elements/nature.png",
    colorClass: "border-emerald-300 bg-emerald-500/20 text-emerald-100",
    shortRule: "Normal attack hit has a 30% chance to heal 1 HP.",
  },
  {
    id: "earth",
    label: "EARTH",
    englishName: "Earth Guard",
    icon: "E",
    imageSrc: "/elements/earth.png",
    colorClass: "border-amber-300 bg-amber-500/20 text-amber-100",
    shortRule: "First real damage taken is reduced by 1, minimum 1 HP.",
  },
  {
    id: "steel",
    label: "STEEL",
    englishName: "Steel Edge",
    icon: "S",
    imageSrc: "/elements/steel.png",
    colorClass: "border-zinc-200 bg-zinc-300/20 text-zinc-50",
    shortRule: "Normal attack hit has a 20% chance to deal +1 HP.",
  },
];

export function getElement(elementId: ElementId): Element {
  const element = ELEMENTS.find((item) => item.id === elementId);

  if (!element) {
    throw new Error(`Unknown element: ${elementId}`);
  }

  return element;
}
