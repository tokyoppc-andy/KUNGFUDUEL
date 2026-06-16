export type HeroId =
  | "blade_hamster"
  | "flame_cat"
  | "bulldog_monk"
  | "blue_needle"
  | "blade_bunny"
  | "pig_spear";

export type AnimalKey = "hamster" | "cat" | "bulldog" | "blue_chick" | "bunny" | "pig";

export type ActiveTrigger = "tie" | "attack" | "defense" | "charge_attack";

export type Hero = {
  id: HeroId;
  displayName: string;
  animal: AnimalKey;
  gender: "female" | "male";
  hp: number;
  role: string;
  activeName: string;
  activeCost: number;
  activeTrigger: ActiveTrigger;
  activeSummary: string;
  unlockCost: number;
  initialUnlocked: boolean;
  maxActiveUses?: number;
  artKey: string;
  portraitSrc?: string;
};

export const HEROES: Hero[] = [
  {
    id: "blade_hamster",
    displayName: "Blade Hamster",
    animal: "hamster",
    gender: "female",
    hp: 5,
    role: "Tie breaker and pressure finisher.",
    activeName: "Flying Swallow Return",
    activeCost: 2,
    activeTrigger: "tie",
    activeSummary:
      "Only after a clash tie. Turns the tie into your attack, strikes two lanes, and refunds 1 EN on hit.",
    unlockCost: 0,
    initialUnlocked: true,
    artKey: "blade-hamster",
    portraitSrc: "/characters/blade-hamster.png",
  },
  {
    id: "flame_cat",
    displayName: "Flame Cat",
    animal: "cat",
    gender: "male",
    hp: 5,
    role: "Aggressive two-lane attacker.",
    activeName: "Stonebreaker Slash",
    activeCost: 2,
    activeTrigger: "attack",
    activeSummary:
      "Only when attacking after a clash win. Strikes two lanes for 1 HP, or 2 HP during Duel Surge.",
    unlockCost: 0,
    initialUnlocked: true,
    artKey: "flame-cat",
    portraitSrc: "/characters/flame-cat.png",
  },
  {
    id: "bulldog_monk",
    displayName: "Bulldog Monk",
    animal: "bulldog",
    gender: "male",
    hp: 6,
    role: "Durable defensive specialist.",
    activeName: "Golden Bell Guard",
    activeCost: 1,
    activeTrigger: "defense",
    activeSummary:
      "Only when defending after a clash loss. Covers your selected lane plus one extra lane. Max two uses.",
    unlockCost: 0,
    initialUnlocked: true,
    maxActiveUses: 2,
    artKey: "bulldog-monk",
    portraitSrc: "/characters/bulldog-monk.png",
  },
  {
    id: "blue_needle",
    displayName: "Blue Needle",
    animal: "blue_chick",
    gender: "male",
    hp: 5,
    role: "Energy denial striker.",
    activeName: "Energy-Sealing Needles",
    activeCost: 1,
    activeTrigger: "attack",
    activeSummary:
      "Only when attacking after a clash win. Deals fixed 1 HP, clears defender EN on hit, and jams their next EN gain.",
    unlockCost: 120,
    initialUnlocked: false,
    artKey: "blue-needle",
    portraitSrc: "/characters/blue-needle.png",
  },
  {
    id: "blade_bunny",
    displayName: "Blade Bunny",
    animal: "bunny",
    gender: "female",
    hp: 5,
    role: "High-risk counter defender.",
    activeName: "Eight-Cut Counter",
    activeCost: 2,
    activeTrigger: "defense",
    activeSummary:
      "Only when defending after a clash loss. A correct read counters for 2 HP and costs you 1 HP; a wrong read evades and refunds 1 EN.",
    unlockCost: 180,
    initialUnlocked: false,
    artKey: "blade-bunny",
    portraitSrc: "/characters/blade-bunny.png",
  },
  {
    id: "pig_spear",
    displayName: "Pig Spear",
    animal: "pig",
    gender: "male",
    hp: 5,
    role: "Delayed burst attacker.",
    activeName: "Shadow Twin Thrust",
    activeCost: 2,
    activeTrigger: "charge_attack",
    activeSummary:
      "Only when attacking after a clash win. Charges this round, then the next attack releases two thrusts: two hits deal 3 HP, one hit deals 1 HP.",
    unlockCost: 240,
    initialUnlocked: false,
    artKey: "pig-spear",
    portraitSrc: "/characters/pig-spear.png",
  },
];

export const INITIAL_HEROES = HEROES.filter((hero) => hero.initialUnlocked);

export function getHero(heroId: HeroId): Hero {
  const hero = HEROES.find((item) => item.id === heroId);

  if (!hero) {
    throw new Error(`Unknown hero: ${heroId}`);
  }

  return hero;
}
