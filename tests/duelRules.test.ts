import assert from "node:assert/strict";

import { chooseAiDecision } from "../src/core/aiStrategy";
import {
  MAX_ENERGY,
  TRIPLE_STRIKE_COST,
  canUseActiveSkill,
  canUseTripleStrike,
  createFighter,
  resolveRound,
  type Direction,
  type FighterState,
} from "../src/core/duelRules";
import { HEROES } from "../src/data/characters";
import { ELEMENTS } from "../src/data/elements";

function baseRound(overrides: Partial<Parameters<typeof resolveRound>[0]> = {}) {
  return {
    round: 4,
    player: createFighter("player", "blade_hamster", "steel"),
    ai: createFighter("ai", "flame_cat", "steel"),
    playerMove: "charge" as const,
    aiMove: "sidestep" as const,
    playerAttackDirection: "center" as Direction,
    playerSecondAttackDirection: "right" as Direction,
    playerThirdAttackDirection: "high" as Direction,
    playerDefenseDirection: "left" as Direction,
    aiAttackDirection: "high" as Direction,
    aiSecondAttackDirection: "low" as Direction,
    aiThirdAttackDirection: "right" as Direction,
    aiDefenseDirection: "high" as Direction,
    playerUseActive: false,
    aiUseActive: false,
    playerUseTriple: false,
    aiUseTriple: false,
    rng: () => 0.99,
    ...overrides,
  };
}

function withEnergy(fighter: FighterState, energy: number): FighterState {
  return { ...fighter, energy };
}

function withHp(fighter: FighterState, hp: number): FighterState {
  return { ...fighter, hp };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("UI data is English-only", () => {
  const allText = [
    ...HEROES.flatMap((hero) => [hero.displayName, hero.role, hero.activeName, hero.activeSummary]),
    ...ELEMENTS.flatMap((element) => [element.label, element.englishName, element.shortRule]),
  ].join("\n");

  assert.equal(/[\u4e00-\u9fff]/.test(allText), false);
});

test("Energy is capped at 3 and Fire starts with 2 EN", () => {
  const player = createFighter("player", "blade_hamster", "fire");
  const ai = withEnergy(createFighter("ai", "flame_cat", "steel"), 3);
  const result = resolveRound(
    baseRound({
      round: 1,
      player,
      ai,
      playerMove: "charge",
      aiMove: "charge",
    }),
  );

  assert.equal(MAX_ENERGY, 3);
  assert.equal(player.energy, 2);
  assert.equal(result.player.energy, 2);
  assert.equal(result.ai.energy, 3);
});

test("Normal attack hit gains 1 EN, but normal miss does not", () => {
  const hit = resolveRound(baseRound({ player: createFighter("player", "flame_cat", "steel"), aiDefenseDirection: "center" }));
  const miss = resolveRound(baseRound({ player: createFighter("player", "flame_cat", "steel"), aiDefenseDirection: "left" }));

  assert.equal(hit.isHit, true);
  assert.equal(hit.player.energy, 1);
  assert.equal(miss.isHit, false);
  assert.equal(miss.player.energy, 0);
});

test("Earth Guard reduces first real damage but never below 1 HP", () => {
  const ai = createFighter("ai", "flame_cat", "earth");
  const result = resolveRound(baseRound({ ai, aiDefenseDirection: "center" }));

  assert.equal(result.damage, 1);
  assert.equal(result.ai.hp, ai.hp - 1);
  assert.equal(result.ai.earthGuardAvailable, false);
});

test("Water Step steals 1 EN on normal evade when RNG passes", () => {
  const player = withEnergy(createFighter("player", "flame_cat", "steel"), 1);
  const ai = createFighter("ai", "blade_hamster", "water");
  const result = resolveRound(
    baseRound({
      player,
      ai,
      playerAttackDirection: "center",
      aiDefenseDirection: "left",
      rng: () => 0.1,
    }),
  );

  assert.equal(result.isHit, false);
  assert.equal(result.ai.energy, 1);
  assert.equal(result.player.energy, 0);
});

test("Blade Hamster active requires tie, spends 2 EN, and refunds 1 EN on hit", () => {
  const player = withEnergy(createFighter("player", "blade_hamster", "steel"), 2);
  const result = resolveRound(
    baseRound({
      player,
      playerMove: "charge",
      aiMove: "charge",
      playerUseActive: true,
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.attacker, "player");
  assert.equal(result.activeSkill.playerTriggered, true);
  assert.equal(result.player.energy, 1);
  assert.equal(result.player.activeUsesRemaining, Number.POSITIVE_INFINITY);
});

test("Blade Hamster tie active cannot be overridden by Triple Strike", () => {
  const player = withEnergy(createFighter("player", "blade_hamster", "steel"), 3);
  const result = resolveRound(
    baseRound({
      player,
      playerMove: "charge",
      aiMove: "charge",
      playerUseActive: true,
      playerUseTriple: true,
      playerAttackDirection: "center",
      playerSecondAttackDirection: "right",
      playerThirdAttackDirection: "high",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.attacker, "player");
  assert.equal(result.activeSkill.playerTriggered, true);
  assert.equal(result.tripleStrike.usedBy, null);
  assert.equal(result.tripleStrike.lanes.length, 0);
  assert.equal(result.player.energy, 2);
});

test("Blade Hamster active refund works for Fire during early rounds", () => {
  const player = createFighter("player", "blade_hamster", "fire");
  const result = resolveRound(
    baseRound({
      round: 1,
      player,
      playerMove: "charge",
      aiMove: "charge",
      playerUseActive: true,
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(player.energy, 2);
  assert.equal(result.activeSkill.playerTriggered, true);
  assert.equal(result.isHit, true);
  assert.equal(result.player.energy, 1);
});

test("Fire still blocks normal early EN gain", () => {
  const player = createFighter("player", "flame_cat", "fire");
  const result = resolveRound(
    baseRound({
      round: 1,
      player,
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.isHit, true);
  assert.equal(result.player.energy, 2);
});

test("Blade Hamster active is unavailable outside a tie", () => {
  const player = withEnergy(createFighter("player", "blade_hamster", "steel"), 2);
  const availability = canUseActiveSkill(player, "player", { attacker: "player", clash: "player" });

  assert.equal(availability.ready, false);
});

test("Flame Cat active costs 2 EN, strikes two lanes, and grants no EN on hit", () => {
  const player = withEnergy(createFighter("player", "flame_cat", "steel"), 2);
  const ai = createFighter("ai", "blade_hamster", "steel");
  const result = resolveRound(
    baseRound({
      player,
      ai,
      playerUseActive: true,
      playerAttackDirection: "center",
      playerSecondAttackDirection: "right",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.isHit, true);
  assert.equal(result.activeSkill.playerTriggered, true);
  assert.equal(result.ai.hp, ai.hp - 1);
  assert.equal(result.player.energy, 0);
  assert.equal(result.player.activeUsesRemaining, Number.POSITIVE_INFINITY);
});

test("Only Bulldog Monk has a per-duel active skill use limit", () => {
  const flameCat = withEnergy(createFighter("player", "flame_cat", "steel"), 2);
  const spentFlameCat = resolveRound(baseRound({ player: flameCat, playerUseActive: true, aiDefenseDirection: "center" })).player;

  assert.equal(spentFlameCat.activeUsesRemaining, Number.POSITIVE_INFINITY);
  assert.equal(canUseActiveSkill(withEnergy(spentFlameCat, 2), "player", { attacker: "player", clash: "player" }).ready, true);

  const bulldog = withEnergy(createFighter("player", "bulldog_monk", "steel"), 1);
  const spentBulldog = resolveRound(
    baseRound({
      player: createFighter("player", "flame_cat", "steel"),
      ai: bulldog,
      aiUseActive: true,
      playerAttackDirection: "center",
      aiDefenseDirection: "center",
    }),
  ).ai;

  assert.equal(createFighter("player", "bulldog_monk", "steel").activeUsesRemaining, 2);
  assert.equal(spentBulldog.activeUsesRemaining, 1);
});

test("Flame Cat active deals 2 HP during Duel Surge", () => {
  const player = withEnergy(createFighter("player", "flame_cat", "steel"), 2);
  const ai = createFighter("ai", "blade_hamster", "steel");
  const result = resolveRound(
    baseRound({
      round: 22,
      player,
      ai,
      playerUseActive: true,
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.damage, 2);
});

test("Normal hit deals 2 HP starting on the first Duel Surge round", () => {
  const beforeSurge = resolveRound(
    baseRound({
      round: 21,
      player: createFighter("player", "flame_cat", "steel"),
      aiDefenseDirection: "center",
      rng: () => 0.99,
    }),
  );
  const firstSurgeHit = resolveRound(
    baseRound({
      round: 22,
      player: createFighter("player", "flame_cat", "steel"),
      aiDefenseDirection: "center",
      rng: () => 0.99,
    }),
  );

  assert.equal(beforeSurge.damage, 1);
  assert.equal(firstSurgeHit.damage, 2);
});

test("Bulldog Monk active costs 1 EN and marks two evade lanes", () => {
  const player = createFighter("player", "flame_cat", "steel");
  const ai = withEnergy(createFighter("ai", "bulldog_monk", "steel"), 1);
  const result = resolveRound(
    baseRound({
      player,
      ai,
      aiUseActive: true,
      playerAttackDirection: "center",
      aiDefenseDirection: "center",
      rng: () => 0.99,
    }),
  );

  assert.equal(result.isHit, true);
  assert.equal(result.activeSkill.aiTriggered, true);
  assert.equal(result.ai.energy, 0);
  assert.equal(result.ai.activeUsesRemaining, 1);
});

test("Blue Needle active clears defender EN and jams next gain", () => {
  const player = withEnergy(createFighter("player", "blue_needle", "steel"), 1);
  const ai = withEnergy(createFighter("ai", "flame_cat", "steel"), 3);
  const result = resolveRound(
    baseRound({
      player,
      ai,
      playerUseActive: true,
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.isHit, true);
  assert.equal(result.damage, 1);
  assert.equal(result.player.energy, 0);
  assert.equal(result.ai.energy, 0);
  assert.equal(result.ai.needleJammed, true);
});

test("Blue Needle jam blocks exactly the next positive EN gain", () => {
  const ai = { ...createFighter("ai", "flame_cat", "steel"), needleJammed: true };
  const tied = resolveRound(baseRound({ ai, playerMove: "charge", aiMove: "charge" }));
  const cleared = resolveRound(baseRound({ ai: tied.ai, playerMove: "charge", aiMove: "charge" }));

  assert.equal(tied.ai.energy, 0);
  assert.equal(tied.ai.needleJammed, false);
  assert.equal(cleared.ai.energy, 1);
});

test("Blade Bunny active counters on correct read and does not grant initiative", () => {
  const player = createFighter("player", "flame_cat", "steel");
  const ai = withEnergy(createFighter("ai", "blade_bunny", "steel"), 2);
  const result = resolveRound(
    baseRound({
      player,
      ai,
      aiUseActive: true,
      playerAttackDirection: "center",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.isHit, false);
  assert.equal(result.player.hp, player.hp - 2);
  assert.equal(result.ai.hp, ai.hp - 1);
  assert.equal(result.nextGuaranteedAttacker, null);
  assert.equal(result.ai.energy, 0);
});

test("Blade Bunny active wrong read evades and refunds 1 EN", () => {
  const player = createFighter("player", "flame_cat", "steel");
  const ai = withEnergy(createFighter("ai", "blade_bunny", "steel"), 2);
  const result = resolveRound(
    baseRound({
      player,
      ai,
      aiUseActive: true,
      playerAttackDirection: "center",
      aiDefenseDirection: "left",
    }),
  );

  assert.equal(result.isHit, false);
  assert.equal(result.player.hp, player.hp);
  assert.equal(result.ai.hp, ai.hp);
  assert.equal(result.ai.energy, 1);
});

test("Blade Bunny active refund works for Fire during early rounds", () => {
  const player = createFighter("player", "flame_cat", "steel");
  const ai = withEnergy(createFighter("ai", "blade_bunny", "fire"), 2);
  const result = resolveRound(
    baseRound({
      round: 1,
      player,
      ai,
      aiUseActive: true,
      playerAttackDirection: "center",
      aiDefenseDirection: "left",
    }),
  );

  assert.equal(result.isHit, false);
  assert.equal(result.activeSkill.aiTriggered, true);
  assert.equal(result.ai.energy, 1);
});

test("Pig Spear active charges this round, then releases two-hit burst later", () => {
  const player = withEnergy(createFighter("player", "pig_spear", "steel"), 2);
  const ai = createFighter("ai", "flame_cat", "steel");
  const charged = resolveRound(
    baseRound({
      player,
      ai,
      playerUseActive: true,
      aiDefenseDirection: "center",
    }),
  );
  const released = resolveRound(
    baseRound({
      player: charged.player,
      ai: charged.ai,
      playerAttackDirection: "center",
      playerSecondAttackDirection: "right",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(charged.damage, 0);
  assert.equal(charged.player.energy, 0);
  assert.equal(charged.player.spearCharged, true);
  assert.equal(released.damage, 1);
  assert.equal(released.player.spearCharged, false);
  assert.equal(released.player.energy, 0);
});

test("Triple Strike costs 3 EN, attacks three lanes, and grants no EN", () => {
  const player = withEnergy(createFighter("player", "flame_cat", "steel"), 3);
  const ai = createFighter("ai", "blade_hamster", "steel");
  const result = resolveRound(
    baseRound({
      player,
      ai,
      playerUseTriple: true,
      playerAttackDirection: "center",
      playerSecondAttackDirection: "right",
      playerThirdAttackDirection: "high",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(TRIPLE_STRIKE_COST, 3);
  assert.equal(result.tripleStrike.usedBy, "player");
  assert.equal(result.tripleStrike.lanes.length, 3);
  assert.equal(result.damage, 1);
  assert.equal(result.player.energy, 0);
});

test("Triple Strike can only be used by the clash winner attacker", () => {
  const player = withEnergy(createFighter("player", "flame_cat", "steel"), 3);
  const ai = withEnergy(createFighter("ai", "blade_hamster", "steel"), 3);
  const result = resolveRound(
    baseRound({
      player,
      ai,
      playerMove: "counter",
      aiMove: "sidestep",
      playerUseTriple: true,
      aiUseTriple: false,
      aiAttackDirection: "center",
      aiDefenseDirection: "left",
      playerDefenseDirection: "left",
    }),
  );

  assert.equal(result.attacker, "ai");
  assert.equal(result.tripleStrike.usedBy, null);
  assert.equal(result.player.energy, 3);
});

test("Water compresses incoming Triple Strike to one lane", () => {
  const player = withEnergy(createFighter("player", "flame_cat", "steel"), 3);
  const ai = createFighter("ai", "blade_hamster", "water");
  const result = resolveRound(
    baseRound({
      player,
      ai,
      playerUseTriple: true,
      playerAttackDirection: "center",
      playerSecondAttackDirection: "right",
      playerThirdAttackDirection: "high",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.tripleStrike.lanes.length, 1);
  assert.equal(result.isHit, true);
});

test("Active Skill and Triple Strike are only ready when conditions and EN are met", () => {
  const attacker = withEnergy(createFighter("player", "flame_cat", "steel"), 2);
  const broke = withEnergy(createFighter("player", "flame_cat", "steel"), 1);
  const defender = withEnergy(createFighter("player", "bulldog_monk", "steel"), 1);

  assert.equal(canUseActiveSkill(attacker, "player", { attacker: "player", clash: "player" }).ready, true);
  assert.equal(canUseActiveSkill(broke, "player", { attacker: "player", clash: "player" }).ready, false);
  assert.equal(canUseActiveSkill(defender, "player", { attacker: "ai", clash: "ai" }).ready, true);
  assert.equal(canUseTripleStrike(withEnergy(attacker, 3), "player", { attacker: "player" }).ready, true);
  assert.equal(canUseTripleStrike(attacker, "player", { attacker: "player" }).ready, false);
});

test("Steel Edge can add 1 HP to a normal hit, and Nature can heal 1 HP on normal hit", () => {
  const steel = resolveRound(baseRound({ player: createFighter("player", "flame_cat", "steel"), aiDefenseDirection: "center", rng: () => 0.1 }));
  const naturePlayer = withHp(createFighter("player", "flame_cat", "nature"), 4);
  const nature = resolveRound(baseRound({ player: naturePlayer, aiDefenseDirection: "center", rng: () => 0.1 }));

  assert.equal(steel.damage, 2);
  assert.equal(nature.player.hp, 5);
});

test("Combo x3 clears defender EN, guarantees next attack, and resets chain counters", () => {
  const player = { ...createFighter("player", "flame_cat", "steel"), combo: 2 };
  const ai = withEnergy(createFighter("ai", "blade_hamster", "steel"), 3);
  const result = resolveRound(baseRound({ player, ai, aiDefenseDirection: "center" }));

  assert.equal(result.nextGuaranteedAttacker, "player");
  assert.equal(result.ai.energy, 0);
  assert.equal(result.player.combo, 0);
  assert.equal(result.ai.combo, 0);
  assert.equal(result.player.evade, 0);
  assert.equal(result.ai.evade, 0);
});

test("Guaranteed attack round locks Combo and Evade counters at zero", () => {
  const player = { ...createFighter("player", "flame_cat", "steel"), combo: 2, evade: 2 };
  const ai = { ...createFighter("ai", "blade_hamster", "steel"), combo: 2, evade: 2 };
  const result = resolveRound(
    baseRound({
      player,
      ai,
      guaranteedAttacker: "player",
      aiDefenseDirection: "center",
    }),
  );

  assert.equal(result.nextGuaranteedAttacker, null);
  assert.equal(result.player.combo, 0);
  assert.equal(result.player.evade, 0);
  assert.equal(result.ai.combo, 0);
  assert.equal(result.ai.evade, 0);
});

test("AI strategy can choose Triple Strike when EN is full", () => {
  const ai = withEnergy(createFighter("ai", "flame_cat", "steel"), 3);
  const player = createFighter("player", "blade_hamster", "fire");
  const decision = chooseAiDecision({
    ai,
    player,
    round: 20,
    rng: () => 0,
  });

  assert.equal(decision.useTriple, true);
  assert.equal(decision.useActive, false);
});

test("AI strategy avoids active skill when EN is insufficient", () => {
  const ai = withEnergy(createFighter("ai", "bulldog_monk", "earth"), 0);
  const player = createFighter("player", "blade_hamster", "fire");
  const decision = chooseAiDecision({
    ai,
    player,
    round: 6,
    rng: () => 0,
  });

  assert.equal(decision.useActive, false);
});

test("AI strategy never chooses duplicate attack lanes", () => {
  const ai = createFighter("ai", "pig_spear", "steel");
  const player = createFighter("player", "blade_hamster", "fire");
  const decision = chooseAiDecision({
    ai,
    player,
    round: 20,
    rng: () => 0,
  });

  assert.notEqual(decision.attackDirection, decision.secondAttackDirection);
  assert.notEqual(decision.attackDirection, decision.thirdAttackDirection);
  assert.notEqual(decision.secondAttackDirection, decision.thirdAttackDirection);
});
