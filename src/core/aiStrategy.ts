import {
  CLASH_MOVES,
  DIRECTIONS,
  TRIPLE_STRIKE_COST,
  type ClashMove,
  type Direction,
  type FighterState,
} from "@/core/duelRules";
import { getHero } from "@/data/characters";

export type AiDecision = {
  move: ClashMove;
  attackDirection: Direction;
  secondAttackDirection: Direction;
  thirdAttackDirection: Direction;
  defenseDirection: Direction;
  useActive: boolean;
  useTriple: boolean;
};

type AiContext = {
  ai: FighterState;
  player: FighterState;
  round: number;
  playerLastAttackDirection?: Direction | null;
  playerLastDefenseDirection?: Direction | null;
  rng?: () => number;
};

export function chooseAiDecision({
  ai,
  player,
  round,
  playerLastAttackDirection,
  playerLastDefenseDirection,
  rng = Math.random,
}: AiContext): AiDecision {
  const pressure = ai.hp <= 2 || player.hp <= 2 || round >= 18;
  const move = chooseMove(ai, player, pressure, rng);
  const attackDirection = chooseAttackDirection(ai, playerLastDefenseDirection, rng);
  const secondAttackDirection = chooseDifferentDirection(attackDirection, rng);
  const thirdAttackDirection = chooseThirdDirection(attackDirection, secondAttackDirection, rng);
  const defenseDirection = chooseDefenseDirection(ai, playerLastAttackDirection, rng);
  const useTriple = shouldUseTriple(ai, player, pressure, rng);

  return {
    move,
    attackDirection,
    secondAttackDirection,
    thirdAttackDirection,
    defenseDirection,
    useActive: !useTriple && shouldUseActive(ai, player, pressure, rng),
    useTriple,
  };
}

function chooseMove(ai: FighterState, player: FighterState, pressure: boolean, rng: () => number): ClashMove {
  if (ai.heroId === "flame_cat" || ai.heroId === "pig_spear") {
    return weightedPick(
      [
        ["charge", pressure ? 0.52 : 0.42],
        ["sidestep", 0.26],
        ["counter", pressure ? 0.22 : 0.32],
      ],
      rng,
    );
  }

  if (ai.heroId === "bulldog_monk" || ai.heroId === "blue_needle") {
    return weightedPick(
      [
        ["charge", 0.25],
        ["sidestep", pressure ? 0.45 : 0.38],
        ["counter", pressure ? 0.3 : 0.37],
      ],
      rng,
    );
  }

  if (player.combo >= 2) {
    return "counter";
  }

  return weightedPick(
    [
      ["charge", 0.34],
      ["sidestep", 0.33],
      ["counter", 0.33],
    ],
    rng,
  );
}

function shouldUseTriple(ai: FighterState, player: FighterState, pressure: boolean, rng: () => number): boolean {
  if (ai.energy < TRIPLE_STRIKE_COST) {
    return false;
  }

  if (player.elementId === "water") {
    return false;
  }

  return pressure || rng() < 0.42;
}

function shouldUseActive(ai: FighterState, player: FighterState, pressure: boolean, rng: () => number): boolean {
  const hero = getHero(ai.heroId);

  if (ai.activeUsesRemaining <= 0 || ai.energy < hero.activeCost) {
    return false;
  }

  if (ai.heroId === "bulldog_monk") {
    return player.combo >= 1 || ai.hp <= 3 || rng() < 0.25;
  }

  if (ai.heroId === "blade_bunny") {
    return ai.hp <= 3 || rng() < 0.28;
  }

  if (ai.heroId === "blue_needle") {
    return player.energy >= 2 || rng() < 0.34;
  }

  if (ai.heroId === "pig_spear") {
    return !ai.spearCharged && (pressure || ai.energy >= 2 || rng() < 0.3);
  }

  if (ai.heroId === "flame_cat") {
    return pressure || rng() < 0.38;
  }

  return rng() < 0.32;
}

function chooseAttackDirection(
  ai: FighterState,
  playerLastDefenseDirection: Direction | null | undefined,
  rng: () => number,
): Direction {
  if (ai.heroId === "blue_needle" && playerLastDefenseDirection) {
    return chooseDifferentDirection(playerLastDefenseDirection, rng);
  }

  if ((ai.heroId === "flame_cat" || ai.heroId === "pig_spear") && rng() < 0.45) {
    return "center";
  }

  return randomDirection(rng);
}

function chooseDefenseDirection(
  ai: FighterState,
  playerLastAttackDirection: Direction | null | undefined,
  rng: () => number,
): Direction {
  if ((ai.heroId === "bulldog_monk" || ai.heroId === "blade_bunny") && playerLastAttackDirection && rng() < 0.58) {
    return playerLastAttackDirection;
  }

  return randomDirection(rng);
}

function chooseDifferentDirection(direction: Direction, rng: () => number): Direction {
  const options = DIRECTIONS.map((item) => item.id).filter((item) => item !== direction);
  return options[Math.floor(rng() * options.length)];
}

function chooseThirdDirection(first: Direction, second: Direction, rng: () => number): Direction {
  const options = DIRECTIONS.map((item) => item.id).filter((item) => item !== first && item !== second);
  return options[Math.floor(rng() * options.length)];
}

function randomDirection(rng: () => number): Direction {
  return DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)].id;
}

function weightedPick<T extends string>(entries: [T, number][], rng: () => number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;

  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return value;
    }
  }

  return entries[entries.length - 1][0];
}
