import { getHero, type HeroId } from "@/data/characters";
import type { ElementId } from "@/data/elements";

export type ClashMove = "charge" | "sidestep" | "counter";
export type Direction = "high" | "low" | "left" | "right" | "center";
export type FighterSide = "player" | "ai";

export type FighterState = {
  side: FighterSide;
  heroId: HeroId;
  elementId: ElementId;
  hp: number;
  maxHp: number;
  energy: number;
  combo: number;
  evade: number;
  earthGuardAvailable: boolean;
  activeUsesRemaining: number;
  needleJammed: boolean;
  spearCharged: boolean;
};

export type RoundInput = {
  round: number;
  player: FighterState;
  ai: FighterState;
  playerMove: ClashMove;
  aiMove: ClashMove;
  playerAttackDirection: Direction;
  playerSecondAttackDirection: Direction;
  playerThirdAttackDirection?: Direction;
  playerDefenseDirection: Direction;
  aiAttackDirection: Direction;
  aiSecondAttackDirection: Direction;
  aiThirdAttackDirection?: Direction;
  aiDefenseDirection: Direction;
  playerUseActive: boolean;
  aiUseActive: boolean;
  playerUseTriple?: boolean;
  aiUseTriple?: boolean;
  guaranteedAttacker?: FighterSide | null;
  rng?: () => number;
};

export type ActiveSkillOutcome = {
  playerRequested: boolean;
  aiRequested: boolean;
  playerTriggered: boolean;
  aiTriggered: boolean;
  playerReason: string;
  aiReason: string;
};

export type RoundResult = {
  player: FighterState;
  ai: FighterState;
  attacker: FighterSide | null;
  clash: "player" | "ai" | "tie" | "guaranteed";
  isHit: boolean;
  damage: number;
  nextGuaranteedAttacker: FighterSide | null;
  status: "attack" | "tie" | "defend" | "game_over";
  activeSkill: ActiveSkillOutcome;
  tripleStrike: { usedBy: FighterSide | null; lanes: Direction[] };
  logs: string[];
};

type ChainBonus = {
  side: FighterSide;
  kind: "combo" | "evade";
};

export const CLASH_MOVES: { id: ClashMove; label: string; beats: ClashMove }[] = [
  { id: "charge", label: "CHARGE", beats: "sidestep" },
  { id: "sidestep", label: "SIDESTEP", beats: "counter" },
  { id: "counter", label: "COUNTER", beats: "charge" },
];

export const DIRECTIONS: { id: Direction; label: string; shortLabel: string }[] = [
  { id: "high", label: "HIGH", shortLabel: "UP" },
  { id: "left", label: "LEFT", shortLabel: "LEFT" },
  { id: "center", label: "CENTER", shortLabel: "CENTER" },
  { id: "right", label: "RIGHT", shortLabel: "RIGHT" },
  { id: "low", label: "LOW", shortLabel: "DOWN" },
];

export const MAX_ENERGY = 3;
export const TRIPLE_STRIKE_COST = 3;

export function createFighter(side: FighterSide, heroId: HeroId, elementId: ElementId): FighterState {
  const hero = getHero(heroId);

  return {
    side,
    heroId,
    elementId,
    hp: hero.hp,
    maxHp: hero.hp,
    energy: elementId === "fire" ? 2 : 0,
    combo: 0,
    evade: 0,
    earthGuardAvailable: elementId === "earth",
    activeUsesRemaining: hero.maxActiveUses ?? Number.POSITIVE_INFINITY,
    needleJammed: false,
    spearCharged: false,
  };
}

export function resolveClash(playerMove: ClashMove, aiMove: ClashMove): "player" | "ai" | "tie" {
  if (playerMove === aiMove) {
    return "tie";
  }

  const playerRule = CLASH_MOVES.find((move) => move.id === playerMove);
  return playerRule?.beats === aiMove ? "player" : "ai";
}

export function canUseActiveSkill(
  fighter: FighterState,
  side: FighterSide,
  context: { attacker: FighterSide | null; clash: "player" | "ai" | "tie" | "guaranteed" },
): { ready: boolean; reason: string } {
  const hero = getHero(fighter.heroId);

  if (hero.maxActiveUses !== undefined && fighter.activeUsesRemaining <= 0) {
    return { ready: false, reason: "No uses left" };
  }

  if (fighter.energy < hero.activeCost) {
    return { ready: false, reason: `Needs ${hero.activeCost} EN` };
  }

  if (hero.activeTrigger === "tie") {
    return context.clash === "tie"
      ? { ready: true, reason: "Ready on tie" }
      : { ready: false, reason: "Requires tie" };
  }

  if (hero.activeTrigger === "defense") {
    return context.attacker && context.attacker !== side
      ? { ready: true, reason: "Ready on defense" }
      : { ready: false, reason: "Requires defense" };
  }

  return context.attacker === side
    ? { ready: true, reason: "Ready on attack" }
    : { ready: false, reason: "Requires attack" };
}

export function canUseTripleStrike(
  fighter: FighterState,
  side: FighterSide,
  context: { attacker: FighterSide | null },
): { ready: boolean; reason: string } {
  if (context.attacker !== side) {
    return { ready: false, reason: "Requires attack" };
  }

  if (fighter.energy < TRIPLE_STRIKE_COST) {
    return { ready: false, reason: "Needs 3 EN" };
  }

  return { ready: true, reason: "Ready" };
}

export function resolveRound(input: RoundInput): RoundResult {
  const logs: string[] = [];
  const rng = input.rng ?? Math.random;
  let player = { ...input.player };
  let ai = { ...input.ai };
  let clash: RoundResult["clash"] = "tie";
  let attacker: FighterSide | null = null;
  let nextGuaranteedAttacker: FighterSide | null = null;
  const activeSkill: ActiveSkillOutcome = {
    playerRequested: input.playerUseActive,
    aiRequested: input.aiUseActive,
    playerTriggered: false,
    aiTriggered: false,
    playerReason: "Not requested",
    aiReason: "Not requested",
  };

  if (input.guaranteedAttacker) {
    clash = "guaranteed";
    attacker = input.guaranteedAttacker;
    player.combo = 0;
    player.evade = 0;
    ai.combo = 0;
    ai.evade = 0;
    logs.push(`${sideLabel(attacker)} has initiative from the previous chain.`);
  } else {
    const clashWinner = resolveClash(input.playerMove, input.aiMove);
    clash = clashWinner;

    if (clashWinner === "tie") {
      const playerTie = input.playerUseActive
        ? canUseActiveSkill(player, "player", { attacker: null, clash: "tie" })
        : { ready: false, reason: "Not requested" };
      const aiTie = input.aiUseActive
        ? canUseActiveSkill(ai, "ai", { attacker: null, clash: "tie" })
        : { ready: false, reason: "Not requested" };

      if (input.playerUseActive) {
        activeSkill.playerReason = playerTie.reason;
      }
      if (input.aiUseActive) {
        activeSkill.aiReason = aiTie.reason;
      }

      if (playerTie.ready && !aiTie.ready) {
        attacker = "player";
        clash = "player";
        player = spendActive(player);
        activeSkill.playerTriggered = true;
        activeSkill.playerReason = "Triggered";
        logs.push("Blade Hamster turns the tie into an attack with Flying Swallow Return.");
      } else if (aiTie.ready && !playerTie.ready) {
        attacker = "ai";
        clash = "ai";
        ai = spendActive(ai);
        activeSkill.aiTriggered = true;
        activeSkill.aiReason = "Triggered";
        logs.push("AI Blade Hamster turns the tie into an attack with Flying Swallow Return.");
      } else {
        player = gainEnergy(player, 1, input.round);
        ai = gainEnergy(ai, 1, input.round);
        logs.push("Clash tie. Both fighters gain 1 EN unless blocked by element or jam.");

        return {
          player,
          ai,
          attacker: null,
          clash,
          isHit: false,
          damage: 0,
          nextGuaranteedAttacker: null,
          status: "tie",
          activeSkill,
          tripleStrike: { usedBy: null, lanes: [] },
          logs,
        };
      }
    } else {
      attacker = clashWinner;
      logs.push(`${sideLabel(attacker)} wins the clash and attacks.`);
    }
  }

  const defender: FighterSide = attacker === "player" ? "ai" : "player";
  const attackerState = attacker === "player" ? player : ai;
  const defenderState = defender === "player" ? player : ai;
  const attackerActiveRequested = attacker === "player" ? input.playerUseActive : input.aiUseActive;
  const defenderActiveRequested = defender === "player" ? input.playerUseActive : input.aiUseActive;
  const tripleRequested = attacker === "player" ? Boolean(input.playerUseTriple) : Boolean(input.aiUseTriple);
  const attackerActiveCheck = attackerActiveRequested
    ? canUseActiveSkill(attackerState, attacker, { attacker, clash })
    : { ready: false, reason: "Not requested" };
  const defenderActiveCheck = defenderActiveRequested
    ? canUseActiveSkill(defenderState, defender, { attacker, clash })
    : { ready: false, reason: "Not requested" };
  const tripleCheck = tripleRequested
    ? canUseTripleStrike(attackerState, attacker, { attacker })
    : { ready: false, reason: "Not requested" };
  const attackerActive = attackerActiveCheck.ready && !activeSkill[`${attacker}Triggered`];
  const defenderActive = defenderActiveCheck.ready;
  const useTriple = tripleCheck.ready;

  if (attacker === "player") {
    activeSkill.playerReason = attackerActiveRequested ? attackerActiveCheck.reason : activeSkill.playerReason;
    activeSkill.aiReason = defenderActiveRequested ? defenderActiveCheck.reason : activeSkill.aiReason;
  } else {
    activeSkill.aiReason = attackerActiveRequested ? attackerActiveCheck.reason : activeSkill.aiReason;
    activeSkill.playerReason = defenderActiveRequested ? defenderActiveCheck.reason : activeSkill.playerReason;
  }

  let actionKind: "normal" | "active" | "triple" | "spear_release" | "spear_charge" = "normal";
  let attackDirections = [attacker === "player" ? input.playerAttackDirection : input.aiAttackDirection];
  let defenseDirections = [defender === "player" ? input.playerDefenseDirection : input.aiDefenseDirection];
  const tripleStrike = { usedBy: null as FighterSide | null, lanes: [] as Direction[] };

  if (attackerState.heroId === "pig_spear" && attackerState.spearCharged) {
    actionKind = "spear_release";
    attackDirections = uniqueDirections(
      attacker === "player" ? input.playerAttackDirection : input.aiAttackDirection,
      attacker === "player" ? input.playerSecondAttackDirection : input.aiSecondAttackDirection,
    );
    logs.push(`${sideLabel(attacker)} releases Shadow Twin Thrust.`);
  } else if (useTriple) {
    actionKind = "triple";
    attackDirections = uniqueMany([
      attacker === "player" ? input.playerAttackDirection : input.aiAttackDirection,
      attacker === "player" ? input.playerSecondAttackDirection : input.aiSecondAttackDirection,
      attacker === "player" ? input.playerThirdAttackDirection ?? input.playerDefenseDirection : input.aiThirdAttackDirection ?? input.aiDefenseDirection,
    ]);
    if (defenderState.elementId === "water" && attackDirections.length > 1) {
      attackDirections = [attackDirections[0]];
      logs.push("Water Step compresses Triple Strike to one lane.");
    }
    tripleStrike.usedBy = attacker;
    tripleStrike.lanes = attackDirections;
    if (attacker === "player") {
      player = spendEnergy(player, TRIPLE_STRIKE_COST);
    } else {
      ai = spendEnergy(ai, TRIPLE_STRIKE_COST);
    }
    logs.push(`${sideLabel(attacker)} spends 3 EN for Triple Strike.`);
  } else if (attackerActive || activeSkill[`${attacker}Triggered`]) {
    actionKind = getHero(attackerState.heroId).activeTrigger === "charge_attack" ? "spear_charge" : "active";
    if (!activeSkill[`${attacker}Triggered`]) {
      if (attacker === "player") {
        player = spendActive(player);
        activeSkill.playerTriggered = true;
        activeSkill.playerReason = "Triggered";
      } else {
        ai = spendActive(ai);
        activeSkill.aiTriggered = true;
        activeSkill.aiReason = "Triggered";
      }
    }

    attackDirections = getActiveAttackDirections(
      attackerState.heroId,
      attacker === "player" ? input.playerAttackDirection : input.aiAttackDirection,
      attacker === "player" ? input.playerSecondAttackDirection : input.aiSecondAttackDirection,
    );
  }

  if (defenderActive) {
    if (defender === "player") {
      player = spendActive(player);
      activeSkill.playerTriggered = true;
      activeSkill.playerReason = "Triggered";
    } else {
      ai = spendActive(ai);
      activeSkill.aiTriggered = true;
      activeSkill.aiReason = "Triggered";
    }
    defenseDirections = getActiveDefenseDirections(defenderState.heroId, defenseDirections[0], rng);
  }

  if (actionKind === "spear_charge") {
    if (attacker === "player") {
      player.spearCharged = true;
      player.combo = 0;
    } else {
      ai.spearCharged = true;
      ai.combo = 0;
    }
    logs.push(`${sideLabel(attacker)} charges Shadow Twin Thrust and gives up this attack.`);
    return finishResult({
      player,
      ai,
      attacker,
      clash,
      isHit: false,
      damage: 0,
      nextGuaranteedAttacker: null,
      activeSkill,
      tripleStrike,
      logs,
    });
  }

  const bunnyCounter = defenderActive && defenderState.heroId === "blade_bunny";
  const hitCount = attackDirections.filter((direction) => !defenseDirections.includes(direction)).length;
  let isHit = hitCount > 0;
  let damage = 0;

  if (bunnyCounter) {
    const correctRead = defenseDirections.some((direction) => attackDirections.includes(direction));
    isHit = false;

    if (correctRead) {
      if (defender === "player") {
        ai.hp = Math.max(0, ai.hp - 2);
        player.hp = Math.max(0, player.hp - 1);
      } else {
        player.hp = Math.max(0, player.hp - 2);
        ai.hp = Math.max(0, ai.hp - 1);
      }
      logs.push("Eight-Cut Counter reads the lane: attacker takes 2 HP, defender pays 1 HP.");
    } else {
      if (defender === "player") {
          player = gainEnergy(player, 1, input.round, { ignoreFireLock: true });
        } else {
          ai = gainEnergy(ai, 1, input.round, { ignoreFireLock: true });
        }
        logs.push("Eight-Cut Counter misses the read, evades, and refunds 1 EN.");
    }
  } else if (isHit) {
    damage = getBaseDamage(actionKind, attackerState.heroId, hitCount, input.round);

    if (actionKind === "normal" && attackerState.elementId === "steel" && rng() < 0.2) {
      damage += 1;
      logs.push("Steel Edge adds 1 HP to the normal hit.");
    }

    if (defenderState.elementId === "earth" && defenderState.earthGuardAvailable) {
      damage = Math.max(1, damage - 1);
      if (defender === "player") {
        player.earthGuardAvailable = false;
      } else {
        ai.earthGuardAvailable = false;
      }
      logs.push("Earth Guard reduces the first real damage by 1.");
    }

    if (defender === "player") {
      player.hp = Math.max(0, player.hp - damage);
      player.evade = 0;
      ai.evade = 0;
    } else {
      ai.hp = Math.max(0, ai.hp - damage);
      ai.evade = 0;
      player.evade = 0;
    }

    if (actionKind === "normal") {
      if (attacker === "player") {
        player.combo += 1;
        player = gainEnergy(player, 1, input.round);
        player = maybeNatureHeal(player, rng, logs);
      } else {
        ai.combo += 1;
        ai = gainEnergy(ai, 1, input.round);
        ai = maybeNatureHeal(ai, rng, logs);
      }
    } else if (attackerState.heroId === "blade_hamster" && actionKind === "active") {
      if (attacker === "player") {
        player = gainEnergy(player, 1, input.round, { ignoreFireLock: true });
      } else {
        ai = gainEnergy(ai, 1, input.round, { ignoreFireLock: true });
      }
      logs.push("Flying Swallow Return refunds 1 EN on hit.");
    }

    if (attackerState.heroId === "blue_needle" && actionKind === "active") {
      if (defender === "player") {
        player.energy = 0;
        player.needleJammed = true;
      } else {
        ai.energy = 0;
        ai.needleJammed = true;
      }
      logs.push("Energy-Sealing Needles clears defender EN and jams the next EN gain.");
    }

    logs.push(`${sideLabel(attacker)} hits ${attackDirections.map(directionLabel).join(" / ")} for ${damage} HP.`);
  } else {
    if (defender === "player") {
      player.evade += 1;
      player.combo = 0;
      ai.combo = 0;
      [player, ai] = maybeWaterSteal(player, ai, input.round, actionKind, rng, logs);
    } else {
      ai.evade += 1;
      player.combo = 0;
      ai.combo = 0;
      [ai, player] = maybeWaterSteal(ai, player, input.round, actionKind, rng, logs);
    }

    logs.push(`${sideLabel(defender)} blocks ${attackDirections.map(directionLabel).join(" / ")}.`);
  }

  if (actionKind === "spear_release") {
    if (attacker === "player") {
      player.spearCharged = false;
    } else {
      ai.spearCharged = false;
    }
  }

  if (input.guaranteedAttacker) {
    player.combo = 0;
    player.evade = 0;
    ai.combo = 0;
    ai.evade = 0;
    logs.push("Guaranteed attack round locks Combo / Evade counters at 0.");
  } else {
    const chainBonus = resolveChainBonus(player, ai, logs);
    nextGuaranteedAttacker = chainBonus?.side ?? null;

    if (chainBonus) {
      if (chainBonus.kind === "combo") {
        if (chainBonus.side === "player") {
          ai.energy = 0;
        } else {
          player.energy = 0;
        }
        logs.push(`${sideLabel(chainBonus.side === "player" ? "ai" : "player")} EN is cleared by Combo x3 control.`);
      }

      player.combo = 0;
      player.evade = 0;
      ai.combo = 0;
      ai.evade = 0;
    }
  }

  return finishResult({
    player,
    ai,
    attacker,
    clash,
    isHit,
    damage,
    nextGuaranteedAttacker,
    activeSkill,
    tripleStrike,
    logs,
  });
}

function finishResult({
  player,
  ai,
  attacker,
  clash,
  isHit,
  damage,
  nextGuaranteedAttacker,
  activeSkill,
  tripleStrike,
  logs,
}: Omit<RoundResult, "status">): RoundResult {
  const gameOver = player.hp <= 0 || ai.hp <= 0;

  return {
    player,
    ai,
    attacker,
    clash,
    isHit,
    damage,
    nextGuaranteedAttacker,
    status: gameOver ? "game_over" : attacker === "player" ? "attack" : "defend",
    activeSkill,
    tripleStrike,
    logs,
  };
}

function spendActive(fighter: FighterState): FighterState {
  const hero = getHero(fighter.heroId);
  return {
    ...fighter,
    energy: clampEnergy(fighter.energy - hero.activeCost),
    activeUsesRemaining:
      hero.maxActiveUses === undefined ? fighter.activeUsesRemaining : Math.max(0, fighter.activeUsesRemaining - 1),
  };
}

function spendEnergy(fighter: FighterState, amount: number): FighterState {
  return {
    ...fighter,
    energy: clampEnergy(fighter.energy - amount),
  };
}

function gainEnergy(
  fighter: FighterState,
  amount: number,
  round: number,
  options: { ignoreFireLock?: boolean } = {},
): FighterState {
  if (amount <= 0) {
    return fighter;
  }

  if (!options.ignoreFireLock && fighter.elementId === "fire" && round <= 3) {
    return fighter;
  }

  if (fighter.needleJammed) {
    return {
      ...fighter,
      needleJammed: false,
    };
  }

  return {
    ...fighter,
    energy: clampEnergy(fighter.energy + amount),
  };
}

function maybeWaterSteal(
  defender: FighterState,
  attacker: FighterState,
  round: number,
  actionKind: "normal" | "active" | "triple" | "spear_release" | "spear_charge",
  rng: () => number,
  logs: string[],
): [FighterState, FighterState] {
  if (actionKind !== "normal" || defender.elementId !== "water" || attacker.energy <= 0 || rng() >= 0.3) {
    return [defender, attacker];
  }

  logs.push(`${sideLabel(defender.side)} steals 1 EN with Water Step.`);

  return [
    gainEnergy(defender, 1, round),
    {
      ...attacker,
      energy: clampEnergy(attacker.energy - 1),
    },
  ];
}

function maybeNatureHeal(fighter: FighterState, rng: () => number, logs: string[]): FighterState {
  if (fighter.elementId !== "nature" || fighter.hp >= fighter.maxHp || rng() >= 0.3) {
    return fighter;
  }

  logs.push(`${sideLabel(fighter.side)} heals 1 HP with Nature Pulse.`);
  return {
    ...fighter,
    hp: Math.min(fighter.maxHp, fighter.hp + 1),
  };
}

function clampEnergy(value: number): number {
  return Math.max(0, Math.min(MAX_ENERGY, value));
}

function sideLabel(side: FighterSide): string {
  return side === "player" ? "Player" : "AI";
}

function directionLabel(direction: Direction): string {
  return direction.toUpperCase();
}

function getActiveAttackDirections(heroId: HeroId, primary: Direction, secondary: Direction): Direction[] {
  if (heroId === "blade_hamster" || heroId === "flame_cat") {
    return uniqueDirections(primary, secondary);
  }

  return [primary];
}

function getActiveDefenseDirections(heroId: HeroId, primary: Direction, rng: () => number): Direction[] {
  if (heroId === "bulldog_monk") {
    const options = DIRECTIONS.map((item) => item.id).filter((direction) => direction !== primary);
    return uniqueDirections(primary, options[Math.floor(rng() * options.length)]);
  }

  return [primary];
}

function getBaseDamage(
  actionKind: "normal" | "active" | "triple" | "spear_release" | "spear_charge",
  heroId: HeroId,
  hitCount: number,
  round: number,
): number {
  if (actionKind === "spear_release") {
    return hitCount >= 2 ? 3 : 1;
  }

  if (actionKind === "triple") {
    return 1;
  }

  if (heroId === "blue_needle" && actionKind === "active") {
    return 1;
  }

  if (heroId === "flame_cat" && actionKind === "active") {
    return round >= 22 ? 2 : 1;
  }

  return round >= 22 ? 2 : 1;
}

function uniqueDirections(primary: Direction, secondary: Direction): Direction[] {
  return primary === secondary ? [primary] : [primary, secondary];
}

function uniqueMany(directions: Direction[]): Direction[] {
  return directions.filter((direction, index) => directions.indexOf(direction) === index);
}

function resolveChainBonus(player: FighterState, ai: FighterState, logs: string[]): ChainBonus | null {
  if (player.combo >= 3) {
    logs.push("Player Combo x3 grants next attack initiative.");
    return { side: "player", kind: "combo" };
  }

  if (ai.combo >= 3) {
    logs.push("AI Combo x3 grants next attack initiative.");
    return { side: "ai", kind: "combo" };
  }

  if (player.evade >= 3) {
    logs.push("Player Evade x3 grants next attack initiative.");
    return { side: "player", kind: "evade" };
  }

  if (ai.evade >= 3) {
    logs.push("AI Evade x3 grants next attack initiative.");
    return { side: "ai", kind: "evade" };
  }

  return null;
}
