'use server';
/**
 * @fileOverview Generates a post-game analysis based on combat statistics.
 *
 * - generatePostGameAnalysis - A function that generates the analysis.
 * - PostGameAnalysisInput - The input type for the analysis generation.
 * - PostGameAnalysisOutput - The return type for the analysis generation.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PostGameAnalysisInputSchema = z.object({
  totalClashWins: z.number().describe('Total number of wins in the move clash phase.'),
  totalStrikes: z.number().describe('Total number of strikes attempted.'),
  totalHits: z.number().describe('Total number of successful hits.'),
  totalDodges: z.number().describe('Total number of successful dodges.'),
  currentRound: z.number().describe('The total number of rounds played.'),
  playerEnergy: z.number().describe('The player\'s final energy level.'),
  aiEnergy: z.number().describe('The AI\'s final energy level.'),
  playerHP: z.number().describe('The player\'s final HP.'),
  aiHP: z.number().describe('The AI\'s final HP.'),
  playerElement: z.string().describe('The player\'s chosen element.'),
  aiElement: z.string().describe('The AI\'s chosen element.'),
  playerName: z.string().describe('The player\'s chosen name.'),
  aiName: z.string().describe('The AI\'s chosen name.'),
});
export type PostGameAnalysisInput = z.infer<typeof PostGameAnalysisInputSchema>;

const PostGameAnalysisOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the player\'s performance.'),
  strengths: z.string().describe('Key strengths demonstrated by the player.'),
  weaknesses: z.string().describe('Areas where the player could improve.'),
  radarChartData: z.object({
    insight: z.number().describe('Score for move clash prediction.'),
    psychology: z.number().describe('Score for directional combat accuracy.'),
    intuition: z.number().describe('Score for successful dodges and counter-attacks.'),
    aura: z.number().describe('Score for energy management and ability usage.'),
    zen: z.number().describe('Score for overall stability and composure.'),
  }),
  imageUrl: z.string().describe('A data URI for the generated radar chart image.'),
});
export type PostGameAnalysisOutput = z.infer<typeof PostGameAnalysisOutputSchema>;

export async function generatePostGameAnalysis(input: PostGameAnalysisInput): Promise<PostGameAnalysisOutput> {
  return generatePostGameAnalysisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generatePostGameAnalysisPrompt',
  input: {schema: PostGameAnalysisInputSchema},
  output: {schema: PostGameAnalysisOutputSchema},
  prompt: `You are an expert Kung Fu combat analyst. Analyze the following combat statistics from a match and provide a detailed performance breakdown. 

Combat Statistics:
- Player Name: {{playerName}}
- Player Element: {{playerElement}}
- Player HP: {{playerHP}} / {{playerHP}}
- Player Energy: {{playerEnergy}}
- AI Name: {{aiName}}
- AI Element: {{aiElement}}
- AI HP: {{aiHP}} / {{aiHP}}
- AI Energy: {{aiEnergy}}
- Total Rounds: {{currentRound}}
- Clash Wins: {{totalClashWins}}
- Strikes: {{totalStrikes}}
- Hits: {{totalHits}}
- Dodges: {{totalDodges}}

Calculate the following scores for the radar chart:
- Insight: Score for move clash prediction (based on totalClashWins / currentRound).
- Psychology: Score for directional combat accuracy (based on totalHits / totalStrikes).
- Intuition: Score for successful dodges and counter-attacks (based on totalDodges).
- Aura: Score for energy management and ability usage (based on playerEnergy).
- Zen: Score for overall stability and composure (based on currentRound and HP).

Generate a concise summary, identify key strengths and weaknesses, and provide the calculated radar chart scores. Additionally, generate a visually appealing radar chart image representing these scores using the provided data. The image should be in a data URI format (e.g., 'data:image/png;base64,...').

Output your analysis in the following JSON format:
{{{json}}}
`,
});

const generatePostGameAnalysisFlow = ai.defineFlow(
  {
    name: 'generatePostGameAnalysisFlow',
    inputSchema: PostGameAnalysisInputSchema,
    outputSchema: PostGameAnalysisOutputSchema,
  },
  async input => {
    // Calculate radar chart scores based on input statistics
    const insightScore = Math.min(100, (input.totalClashWins / Math.max(1, input.currentRound)) * 200);
    const psychologyScore = Math.min(100, (input.totalHits / Math.max(1, input.totalStrikes)) * 100);
    const intuitionScore = Math.min(100, input.totalDodges * 25);
    const auraScore = Math.min(100, input.playerEnergy * 33);
    const zenScore = Math.min(100, Math.max(10, 100 - (input.currentRound * 2)));

    const analysisInput = {
      ...input,
      radarChartData: {
        insight: insightScore,
        psychology: psychologyScore,
        intuition: intuitionScore,
        aura: auraScore,
        zen: zenScore,
      },
    };

    // Generate analysis and image using the prompt
    const { output } = await prompt(analysisInput);

    // Extract the image URL from the generated output
    const imageUrl = output?.imageUrl;

    return {
        summary: output?.summary || '',
        strengths: output?.strengths || '',
        weaknesses: output?.weaknesses || '',
        radarChartData: {
            insight: insightScore,
            psychology: psychologyScore,
            intuition: intuitionScore,
            aura: auraScore,
            zen: zenScore,
        },
        imageUrl: imageUrl || '',
    };
  }
);
