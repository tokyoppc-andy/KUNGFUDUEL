'use server';

/**
 * @fileOverview Deterministic move clash flow for the legacy AI sandbox.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const MoveSchema = z.enum(['Charge', 'Sidestep', 'Counter']);
export type Move = z.infer<typeof MoveSchema>;

const MoveClashInputSchema = z.object({
  playerMove: MoveSchema.describe("The player's chosen move."),
  aiMove: MoveSchema.describe("The AI's chosen move."),
  playerEnergy: z.number().describe('Current energy of the player.'),
  aiEnergy: z.number().describe('Current energy of the AI.'),
});
export type MoveClashInput = z.infer<typeof MoveClashInputSchema>;

const MoveClashOutputSchema = z.object({
  isPlayerAttacker: z.boolean().describe('Whether the player won the clash and gets to attack.'),
  playerEnergyDelta: z.number().describe('Change in player energy.'),
  aiEnergyDelta: z.number().describe('Change in AI energy.'),
  clashResult: z.enum(['PlayerWins', 'AIWins', 'Draw']),
  guaranteedAttacker: z.optional(z.enum(['Player', 'AI'])),
  guaranteedReason: z.optional(z.string()),
  skipClash: z.boolean(),
});
export type MoveClashOutput = z.infer<typeof MoveClashOutputSchema>;

export async function simulateMoveClash(input: MoveClashInput): Promise<MoveClashOutput> {
  return simulateMoveClashFlow(input);
}

const simulateMoveClashFlow = ai.defineFlow(
  {
    name: 'simulateMoveClashFlow',
    inputSchema: MoveClashInputSchema,
    outputSchema: MoveClashOutputSchema,
  },
  async (input): Promise<MoveClashOutput> => {
    const result = resolveLegacyMoveClash(input.playerMove, input.aiMove);

    return {
      isPlayerAttacker: result === 'PlayerWins',
      playerEnergyDelta: result === 'Draw' ? 1 : 0,
      aiEnergyDelta: result === 'Draw' ? 1 : 0,
      clashResult: result,
      skipClash: false,
    };
  },
);

function resolveLegacyMoveClash(playerMove: Move, aiMove: Move): MoveClashOutput['clashResult'] {
  if (playerMove === aiMove) {
    return 'Draw';
  }

  const winsAgainst: Record<Move, Move> = {
    Charge: 'Sidestep',
    Sidestep: 'Counter',
    Counter: 'Charge',
  };

  return winsAgainst[playerMove] === aiMove ? 'PlayerWins' : 'AIWins';
}
