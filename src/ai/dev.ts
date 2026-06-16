import { config } from 'dotenv';
config();

import '@/ai/flows/generate-post-game-analysis.ts';
import '@/ai/flows/simulate-directional-combat.ts';
import '@/ai/flows/simulate-move-clash.ts';