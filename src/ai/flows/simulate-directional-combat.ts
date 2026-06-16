'use server';
/**
 * @fileOverview Simulates the directional combat phase of a Kung Fu Duel.
 *
 * - simulateDirectionalCombat: A flow that simulates the directional combat.
 * - SimulateDirectionalCombatInput: The input schema for the flow.
 * - SimulateDirectionalCombatOutput: The output schema for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SimulateDirectionalCombatInputSchema = z.object({
  isPlayerAttacker: z.boolean().describe('Whether the player is the attacker.'),
  playerEnergy: z.number().describe('The current energy of the player.'),
  aiEnergy: z.number().describe('The current energy of the AI.'),
  playerElement: z.string().describe('The element of the player.'),
  aiElement: z.string().describe('The element of the AI.'),
  playerHasEarthGuard: z.boolean().describe('Whether the player has Earth Guard active.'),
  aiHasEarthGuard: z.boolean().describe('Whether the AI has Earth Guard active.'),
  skipClash: z.boolean().describe('Whether to skip the move clash phase.'),
  playerComboHits: z.number().describe('Player current combo hits.'),
  aiComboHits: z.number().describe('AI current combo hits.'),
  playerEvadeStreak: z.number().describe('Player current evade streak.'),
  aiEvadeStreak: z.number().describe('AI current evade streak.'),
  isPlayerTurn: z.boolean().describe('Flag to indicate if it is player turn, used for elemental abilities.'),
});

export type SimulateDirectionalCombatInput = z.infer<typeof SimulateDirectionalCombatInputSchema>;

const SimulateDirectionalCombatOutputSchema = z.object({
  isHit: z.boolean().describe('Whether the attack hits.'),
  damage: z.number().describe('The amount of damage dealt.'),
  newPlayerEnergy: z.number().describe('The updated energy of the player.'),
  newAIEnergy: z.number().describe('The updated energy of the AI.'),
  newPlayerComboHits: z.number().describe('The updated combo hits of the player.'),
  newAIComboHits: z.number().describe('The updated combo hits of the AI.'),
  newPlayerEvadeStreak: z.number().describe('The updated evade streak of the player.'),
  newAIEvadeStreak: z.number().describe('The updated evade streak of the AI.'),
  guaranteedAttacker: z.string().nullable().describe('The attacker guaranteed for the next turn.'),
  guaranteedReason: z.string().nullable().describe('The reason for the guaranteed attacker.'),
  earthGuardUsed: z.boolean().describe('Whether Earth Guard was used in this turn.'),
  playerActionMessage: z.string().describe('A message describing the player\'s action.'),
  aiActionMessage: z.string().describe('A message describing the AI\'s action.'),
});

export type SimulateDirectionalCombatOutput = z.infer<typeof SimulateDirectionalCombatOutputSchema>;

const prompt = ai.definePrompt({
  name: 'simulateDirectionalCombatPrompt',
  input: {
    schema: SimulateDirectionalCombatInputSchema,
  },
  output: {
    schema: SimulateDirectionalCombatOutputSchema,
  },
  prompt: `You are simulating a directional combat phase in a Kung Fu Duel. Based on the input, determine the outcome of the attack and defense, including hit or miss, damage dealt, energy changes, combo/evade streak updates, and potential elemental ability activations. 

 Player Energy: {{{playerEnergy}}}, AI Energy: {{{aiEnergy}}}
 Player Element: {{{playerElement}}}, AI Element: {{{aiElement}}}
 Player has Earth Guard: {{{playerHasEarthGuard}}}, AI has Earth Guard: {{{aiHasEarthGuard}}}
 Skip Clash: {{{skipClash}}}
 Player Combo Hits: {{{playerComboHits}}}, AI Combo Hits: {{{aiComboHits}}}
 Player Evade Streak: {{{playerEvadeStreak}}}, AI Evade Streak: {{{aiEvadeStreak}}}
 Is Player Attacker: {{{isPlayerAttacker}}}

 Now, simulate the directional combat phase. Consider special abilities like the Fire Blader's 'Stone Shattering' (if player is attacker, has >= 2 energy, and not skipping clash) and Golden Monk's 'Golden Bell Shield' (if AI is defender, has >= 1 energy, and not skipping clash). Also consider Earth element's guard ability. Water element's energy steal on miss. Update combo and evade streaks. If a streak of 3 is reached, trigger special counter-attacks or guaranteed attacker status. Return a JSON object with the following fields:
 - isHit (boolean): true if the attack lands, false otherwise.
 - damage (number): The amount of damage dealt. Will be 0 if not hit or if Earth Guard negates it.
 - newPlayerEnergy (number): Updated player energy (0-3).
 - newAIEnergy (number): Updated AI energy (0-3).
 - newPlayerComboHits (number): Updated player combo hits.
 - newAIComboHits (number): Updated AI combo hits.
 - newPlayerEvadeStreak (number): Updated player evade streak.
 - newAIEvadeStreak (number): Updated AI evade streak.
 - guaranteedAttacker (string | null): 'Player' or 'AI' if a guaranteed attack is triggered, otherwise null.
 - guaranteedReason (string | null): The reason for the guaranteed attacker status.
 - earthGuardUsed (boolean): true if Earth Guard was used to negate damage.
 - playerActionMessage (string): A descriptive message about the player's actions/outcomes.
 - aiActionMessage (string): A descriptive message about the AI's actions/outcomes.
`,
});

export async function simulateDirectionalCombat(
  input: SimulateDirectionalCombatInput
): Promise<SimulateDirectionalCombatOutput> {
  const { output } = await prompt(input);
  // Ensure all fields are present and correctly typed, even if not explicitly returned by the model
  const result = {
    ...output,
    isHit: output?.isHit ?? false,
    damage: output?.damage ?? 0,
    newPlayerEnergy: output?.newPlayerEnergy ?? input.playerEnergy,
    newAIEnergy: output?.newAIEnergy ?? input.aiEnergy,
    newPlayerComboHits: output?.newPlayerComboHits ?? input.playerComboHits,
    newAIComboHits: output?.newAIComboHits ?? input.aiComboHits,
    newPlayerEvadeStreak: output?.newPlayerEvadeStreak ?? input.playerEvadeStreak,
    newAIEvadeStreak: output?.newAIEvadeStreak ?? input.aiEvadeStreak,
    guaranteedAttacker: output?.guaranteedAttacker ?? null,
    guaranteedReason: output?.guaranteedReason ?? null,
    earthGuardUsed: output?.earthGuardUsed ?? false,
    playerActionMessage: output?.playerActionMessage ?? 'No specific player action message.',
    aiActionMessage: output?.aiActionMessage ?? 'No specific AI action message.',
  };
  return result;
}
