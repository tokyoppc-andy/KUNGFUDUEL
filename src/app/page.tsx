"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Hourglass,
  RotateCcw,
  Shield,
  Swords,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import {
  CLASH_MOVES,
  DIRECTIONS,
  MAX_ENERGY,
  TRIPLE_STRIKE_COST,
  canUseActiveSkill,
  canUseTripleStrike,
  createFighter,
  resolveClash,
  resolveRound,
  type ClashMove,
  type Direction,
  type FighterSide,
  type FighterState,
} from "@/core/duelRules";
import { chooseAiDecision, type AiDecision } from "@/core/aiStrategy";
import { HEROES, INITIAL_HEROES, getHero, type Hero, type HeroId } from "@/data/characters";
import { ELEMENTS, getElement, type ElementId } from "@/data/elements";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type BattlePhase = "setup" | "clash" | "tie_break" | "lanes" | "lane_result" | "game_over";
type BattleStatus = "attack" | "tie" | "defend" | "game_over";
type FighterStance = "attack" | "defend" | "tie";
type BattleStageEffectKind = "none" | "tie" | "hit" | "evade";
type BattleSpriteMotion = "idle" | "attack" | "hit" | "block" | "evade" | "clash";
type BattleSpriteAssetState = "idle" | "attack" | "defend" | "hit";
type BattleStageVisualState = {
  playerMotion: BattleSpriteMotion;
  aiMotion: BattleSpriteMotion;
  effect: BattleStageEffectKind;
  effectSide: FighterSide | null;
  attacker: FighterSide | null;
  caption: string;
};

type PendingClash = {
  aiDecision: AiDecision;
  playerMove: ClashMove | null;
  attacker: FighterSide | null;
  clash: "player" | "ai" | "tie" | "guaranteed";
  aiUseActive: boolean;
  aiUseTriple: boolean;
  playerTieActive: boolean;
};

type BattleLog = {
  round: number;
  text: string;
  tone?: "player" | "ai" | "system";
};

type RoundBanner = {
  title: string;
  detail: string;
  delta: string;
  tone: "player" | "ai" | "system";
};

type ClashReveal = {
  round: number;
  playerMove: ClashMove;
  aiMove: ClashMove;
  clash: PendingClash["clash"];
  attacker: FighterSide | null;
  expiresAt: number;
};

type LaneReveal = {
  round: number;
  attacker: FighterSide | null;
  playerDirections: Direction[];
  aiDirections: Direction[];
  result: "hit" | "miss";
  damage: number;
  expiresAt: number;
};

type StatPulse = {
  hpDelta: number;
  energyDelta: number;
  comboDelta: number;
  evadeDelta: number;
  expiresAt: number;
};

type SideBattleStats = {
  clashWins: number;
  clashLosses: number;
  clashTies: number;
  attacks: number;
  hits: number;
  defenses: number;
  blocks: number;
  evades: number;
  damageDealt: number;
  damageTaken: number;
  energyGained: number;
  energySpent: number;
  activeUses: number;
  tripleUses: number;
};

type BattleStats = {
  roundsCompleted: number;
  player: SideBattleStats;
  ai: SideBattleStats;
};

type RadarMetric = {
  id: "clash" | "strike" | "guard" | "energy" | "skill";
  label: string;
  detail: string;
  value: number;
};

type PlayerLaneSelection = {
  attack: Direction;
  second: Direction;
  third: Direction;
  defense: Direction;
  autoFilled: boolean;
};

type BattleState = {
  phase: BattlePhase;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  phaseDuration: number;
  bulletTime: boolean;
  playerHero: HeroId;
  aiHero: HeroId;
  playerElement: ElementId;
  aiElement: ElementId;
  player: FighterState;
  ai: FighterState;
  round: number;
  status: BattleStatus;
  guaranteedAttacker: FighterSide | null;
  pending: PendingClash | null;
  logs: BattleLog[];
  roundBanner: RoundBanner | null;
  clashReveal: ClashReveal | null;
  laneReveal: LaneReveal | null;
  statPulse: Record<FighterSide, StatPulse | null>;
  stats: BattleStats;
};

const CLASH_SECONDS = 5;
const TIE_BREAK_SECONDS = 3;
const LANE_SECONDS = 5;
const LANE_RESULT_SECONDS = 3;
const BULLET_SECONDS = 10;
const BATTLE_FRAME_WIDTH = 430;
const BATTLE_FRAME_HEIGHT = 764;
const BATTLE_CONTROLS_HEIGHT = 374;
const SETUP_MUSIC_SRC = "/audio/level-zero-dash.mp3";
const BATTLE_MUSIC_SRC = "/audio/iron-lotus-duel.mp3";
const MUSIC_VOLUME = 0.42;

const HERO_MARKS: Record<HeroId, string> = {
  blade_hamster: "BH",
  flame_cat: "FC",
  bulldog_monk: "BM",
  blue_needle: "BN",
  blade_bunny: "BB",
  pig_spear: "PS",
};

const BATTLE_SPRITE_STATES: BattleSpriteAssetState[] = ["idle", "attack", "defend", "hit"];

const BATTLE_3D_SPRITE_SRC: Record<HeroId, string> = {
  blade_hamster: "/assets/characters/blade_hamster_3d_test/blade_hamster_3d_test.png",
  flame_cat: "/assets/characters_3d/flame_cat/flame_cat_3d.png",
  bulldog_monk: "/assets/characters_3d/bulldog_monk/bulldog_monk_3d.png",
  blue_needle: "/assets/characters_3d/blue_needle/blue_needle_3d.png",
  blade_bunny: "/assets/characters_3d/blade_bunny/blade_bunny_3d.png",
  pig_spear: "/assets/characters_3d/pig_spear/pig_spear_3d.png",
};

const BATTLE_SPRITES: Record<HeroId, Record<BattleSpriteAssetState, string>> = {
  blade_hamster: createStaticBattleSpriteSet(BATTLE_3D_SPRITE_SRC.blade_hamster),
  flame_cat: createStaticBattleSpriteSet(BATTLE_3D_SPRITE_SRC.flame_cat),
  bulldog_monk: createStaticBattleSpriteSet(BATTLE_3D_SPRITE_SRC.bulldog_monk),
  blue_needle: createStaticBattleSpriteSet(BATTLE_3D_SPRITE_SRC.blue_needle),
  blade_bunny: createStaticBattleSpriteSet(BATTLE_3D_SPRITE_SRC.blade_bunny),
  pig_spear: createStaticBattleSpriteSet(BATTLE_3D_SPRITE_SRC.pig_spear),
};

export default function KungFuDuelPrototype() {
  const setupMusicRef = useRef<HTMLAudioElement | null>(null);
  const battleMusicRef = useRef<HTMLAudioElement | null>(null);
  const [selectedHero, setSelectedHero] = useState<HeroId>("blade_hamster");
  const [focusedHeroId, setFocusedHeroId] = useState<HeroId>("blade_hamster");
  const [selectedElement, setSelectedElement] = useState<ElementId>("fire");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [playerMove, setPlayerMove] = useState<ClashMove | null>(null);
  const [playerLaneDirections, setPlayerLaneDirections] = useState<Direction[]>([]);
  const [playerUseActive, setPlayerUseActive] = useState(false);
  const [playerUseTriple, setPlayerUseTriple] = useState(false);
  const [lastPlayerAttackDirection, setLastPlayerAttackDirection] = useState<Direction | null>(null);
  const [lastPlayerDefenseDirection, setLastPlayerDefenseDirection] = useState<Direction | null>(null);
  const [battleFrameScale, setBattleFrameScale] = useState(1);
  const [battleFrameHeight, setBattleFrameHeight] = useState(BATTLE_FRAME_HEIGHT);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicUnlocked, setMusicUnlocked] = useState(false);

  const winner = useMemo(() => {
    if (!battle || (battle.player.hp > 0 && battle.ai.hp > 0)) {
      return null;
    }

    return battle.player.hp > 0 ? "Player" : "AI";
  }, [battle]);

  const playerContext = useMemo(() => {
    if (!battle?.pending) {
      return { attacker: null as FighterSide | null, clash: "tie" as const };
    }

    return { attacker: battle.pending.attacker, clash: battle.pending.clash };
  }, [battle?.pending]);

  const activeAvailability = battle
    ? canUseActiveSkill(battle.player, "player", playerContext)
    : { ready: false, reason: "Start a duel" };
  const tripleBlockedByTieActive = Boolean(battle?.pending?.playerTieActive);
  const baseTripleAvailability = battle
    ? canUseTripleStrike(battle.player, "player", playerContext)
    : { ready: false, reason: "Start a duel" };
  const tripleAvailability = tripleBlockedByTieActive
    ? { ready: false, reason: "Active skill in use" }
    : baseTripleAvailability;
  const secondsLeft = battle?.phaseEndsAt ? Math.min(battle.phaseDuration, Math.max(0, Math.ceil((battle.phaseEndsAt - now) / 1000))) : 0;
  const timerPercent = battle?.phaseEndsAt
    ? Math.max(0, Math.min(100, ((battle.phaseEndsAt - now) / (battle.phaseDuration * 1000)) * 100))
    : 0;
  const playerMaxLanes = battle?.phase === "lanes" ? playerLaneCount(battle, playerUseActive, playerUseTriple) : 1;
  const laneBaseTitle = battle?.pending?.attacker === "ai" ? "Evade Lane" : playerMaxLanes > 1 ? "Choose Lanes" : "Choose Lane";
  const laneTitle =
    battle?.phase === "lanes"
      ? `${laneBaseTitle} (${playerLaneDirections.length}/${playerMaxLanes} selected)`
      : `${laneBaseTitle} (opens after clash)`;
  const activeMusicTrack = battle ? "battle" : "setup";
  const focusedHero = getHero(focusedHeroId);
  const focusedHeroLocked = !focusedHero.initialUnlocked;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function resizeBattleFrame() {
      const safeWidth = Math.max(280, window.innerWidth - 16);
      const safeHeight = Math.max(500, window.innerHeight - 16);
      const scale = Math.min(safeWidth / BATTLE_FRAME_WIDTH, safeHeight / BATTLE_FRAME_HEIGHT, 1);
      setBattleFrameScale(scale);
      setBattleFrameHeight(Math.max(BATTLE_FRAME_HEIGHT, Math.floor(safeHeight / scale)));
    }

    resizeBattleFrame();
    window.addEventListener("resize", resizeBattleFrame);
    return () => window.removeEventListener("resize", resizeBattleFrame);
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.scrollTo(0, 0);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const unlockMusic = () => setMusicUnlocked(true);

    window.addEventListener("pointerdown", unlockMusic, { once: true });
    window.addEventListener("keydown", unlockMusic, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockMusic);
      window.removeEventListener("keydown", unlockMusic);
    };
  }, []);

  useEffect(() => {
    const setupAudio = setupMusicRef.current;
    const battleAudio = battleMusicRef.current;

    if (setupAudio) {
      setupAudio.volume = MUSIC_VOLUME;
      setupAudio.loop = true;
    }

    if (battleAudio) {
      battleAudio.volume = MUSIC_VOLUME;
      battleAudio.loop = true;
    }

    if (!musicEnabled || !musicUnlocked) {
      setupAudio?.pause();
      battleAudio?.pause();
      return;
    }

    const activeAudio = activeMusicTrack === "setup" ? setupAudio : battleAudio;
    const inactiveAudio = activeMusicTrack === "setup" ? battleAudio : setupAudio;

    inactiveAudio?.pause();
    if (inactiveAudio) {
      inactiveAudio.currentTime = 0;
    }

    void activeAudio?.play().catch(() => {
      setMusicUnlocked(false);
    });
  }, [activeMusicTrack, musicEnabled, musicUnlocked]);

  useEffect(() => {
    if (!battle || battle.phase !== "lanes") {
      return;
    }

    const maxLanes = playerLaneCount(battle, playerUseActive, playerUseTriple);
    setPlayerLaneDirections((directions) => (directions.length > maxLanes ? directions.slice(-maxLanes) : directions));
  }, [battle, playerUseActive, playerUseTriple]);

  useEffect(() => {
    if (!battle || !battle.phaseEndsAt || battle.phase === "game_over") {
      return;
    }

    const delay = Math.max(0, battle.phaseEndsAt - Date.now() + 20);
    const timeoutId = window.setTimeout(() => {
      if (battle.phase === "clash") {
        finishClash(playerMove ?? randomClashMove(), !playerMove);
      } else if (battle.phase === "tie_break") {
        finishTieBreak(false);
      } else if (battle.phase === "lanes") {
        resolveLanePhase();
      } else if (battle.phase === "lane_result") {
        finishLaneResult();
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [
    battle,
    playerMove,
    playerLaneDirections,
    playerUseActive,
    playerUseTriple,
  ]);

  function startDuel() {
    const aiHero = randomItem(HEROES).id;
    const aiElement = randomItem(ELEMENTS).id;
    const player = createFighter("player", selectedHero, selectedElement);
    const ai = createFighter("ai", aiHero, aiElement);

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setBattle(makeBattleState(selectedHero, selectedElement, aiHero, aiElement, player, ai));
    resetRoundControls();
  }

  function resetDuel() {
    setBattle(null);
    resetRoundControls();
  }

  function chooseClashMove(move: ClashMove) {
    if (!battle || battle.phase !== "clash") {
      return;
    }

    setPlayerMove(move);
  }

  function finishClash(move: ClashMove, autoPicked: boolean, lockedIn = false) {
    if (!battle || battle.phase !== "clash" || !battle.pending) {
      return;
    }

    const clash: PendingClash["clash"] = battle.guaranteedAttacker
      ? "guaranteed"
      : resolveClash(move, battle.pending.aiDecision.move);
    const attacker: FighterSide | null = battle.guaranteedAttacker ?? (clash === "player" || clash === "ai" ? clash : null);
    const status = attacker === "player" ? "attack" : attacker === "ai" ? "defend" : "tie";
    const baseLog = autoPicked
      ? `Time expired. Player had no clash move, so AI auto-picked ${move.toUpperCase()}.`
      : lockedIn
        ? `Player locked in ${move.toUpperCase()}.`
        : `Time expired. Player final clash move is ${move.toUpperCase()}.`;
    const clashReveal = createClashReveal(battle.round, move, battle.pending.aiDecision.move, clash, attacker);

    if (clash === "tie") {
      setBattle({
        ...battle,
        phase: "tie_break",
        phaseStartedAt: Date.now(),
        phaseEndsAt: Date.now() + TIE_BREAK_SECONDS * 1000,
        phaseDuration: TIE_BREAK_SECONDS,
        bulletTime: false,
        status: "tie",
        pending: {
          ...battle.pending,
          playerMove: move,
          attacker: null,
          clash,
          aiUseActive: false,
          aiUseTriple: false,
          playerTieActive: false,
        },
        roundBanner: null,
        clashReveal,
        logs: [
          ...battle.logs,
          { round: battle.round, text: baseLog, tone: "player" },
          {
            round: battle.round,
            text: `Clash: Player ${move.toUpperCase()} vs AI ${battle.pending.aiDecision.move.toUpperCase()}. Tie window opens for Flying Swallow Return.`,
            tone: "system",
          },
        ],
      });
      return;
    }

    enterLanePhase({
      current: battle,
      move,
      clash,
      attacker,
      status,
      extraLogs: [
        { round: battle.round, text: baseLog, tone: "player" },
        {
          round: battle.round,
          text:
            clash === "guaranteed"
              ? `${sideLabel(attacker)} has chain initiative.`
              : `Clash: Player ${move.toUpperCase()} vs AI ${battle.pending.aiDecision.move.toUpperCase()}. ${sideLabel(attacker)} attacks.`,
          tone: "system",
        },
      ],
      clashReveal,
    });
  }

  function finishTieBreak(playerActivates: boolean) {
    if (!battle || battle.phase !== "tie_break" || !battle.pending || !battle.pending.playerMove) {
      return;
    }

    const playerReady = playerActivates && activeAvailability.ready;
    const aiReady =
      battle.pending.aiDecision.useActive &&
      canUseActiveSkill(battle.ai, "ai", { attacker: null, clash: "tie" }).ready;

    if (playerReady && !aiReady) {
      enterLanePhase({
        current: battle,
        move: battle.pending.playerMove,
        clash: "player",
        attacker: "player",
        status: "attack",
        playerTieActive: true,
        forceBulletTime: true,
        extraLogs: [
          {
            round: battle.round,
            text: "Player triggers Flying Swallow Return and turns the tie into an attack.",
            tone: "player",
          },
        ],
      });
      return;
    }

    if (aiReady && !playerReady) {
      enterLanePhase({
        current: battle,
        move: battle.pending.playerMove,
        clash: "ai",
        attacker: "ai",
        status: "defend",
        aiUseActive: true,
        forceBulletTime: true,
        extraLogs: [
          {
            round: battle.round,
            text: "AI triggers Flying Swallow Return and turns the tie into an attack.",
            tone: "ai",
          },
        ],
      });
      return;
    }

    const tieSelections = resolvePlayerLaneSelections(battle, playerLaneDirections, false, false);
    const result = resolveRound({
      round: battle.round,
      player: battle.player,
      ai: battle.ai,
      playerMove: battle.pending.playerMove,
      aiMove: battle.pending.aiDecision.move,
      playerAttackDirection: tieSelections.attack,
      playerSecondAttackDirection: tieSelections.second,
      playerThirdAttackDirection: tieSelections.third,
      playerDefenseDirection: tieSelections.defense,
      aiAttackDirection: battle.pending.aiDecision.attackDirection,
      aiSecondAttackDirection: battle.pending.aiDecision.secondAttackDirection,
      aiThirdAttackDirection: battle.pending.aiDecision.thirdAttackDirection,
      aiDefenseDirection: battle.pending.aiDecision.defenseDirection,
      playerUseActive: false,
      aiUseActive: false,
      playerUseTriple: false,
      aiUseTriple: false,
      guaranteedAttacker: null,
    });

    completeTieRound(result, [
      {
        round: battle.round,
        text: playerReady && aiReady ? "Both Flying Swallow Returns cancel. The clash remains tied." : "No Flying Swallow Return. The clash remains tied.",
        tone: "system",
      },
    ]);
  }

  function enterLanePhase({
    current,
    move,
    clash,
    attacker,
    status,
    extraLogs,
    forceBulletTime = false,
    playerTieActive = false,
    aiUseActive,
    clashReveal,
  }: {
    current: BattleState;
    move: ClashMove;
    clash: PendingClash["clash"];
    attacker: FighterSide | null;
    status: BattleStatus;
    extraLogs: BattleLog[];
    forceBulletTime?: boolean;
    playerTieActive?: boolean;
    aiUseActive?: boolean;
    clashReveal?: ClashReveal;
  }) {
    if (!current.pending || !attacker) {
      return;
    }

    const aiTriple =
      current.pending.aiDecision.useTriple &&
      canUseTripleStrike(current.ai, "ai", { attacker }).ready;
    const aiActive =
      aiUseActive ??
      (!aiTriple &&
        current.pending.aiDecision.useActive &&
        canUseActiveSkill(current.ai, "ai", { attacker, clash }).ready);
    const bulletTime = forceBulletTime || aiTriple || aiActive;

    setBattle({
      ...current,
      phase: "lanes",
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now() + (bulletTime ? BULLET_SECONDS : LANE_SECONDS) * 1000,
      phaseDuration: bulletTime ? BULLET_SECONDS : LANE_SECONDS,
      bulletTime,
      status,
      pending: {
        ...current.pending,
        playerMove: move,
        attacker,
        clash,
        aiUseActive: aiActive,
        aiUseTriple: aiTriple,
        playerTieActive,
      },
      roundBanner: null,
      clashReveal: clashReveal ?? current.clashReveal,
      logs: [
        ...current.logs,
        ...extraLogs,
        {
          round: current.round,
          text: bulletTime ? "Bullet Time: lane selection extends to 10 seconds." : "Lane selection: 5 seconds.",
          tone: "system",
        },
      ],
    });
  }

  function armPlayerActive() {
    if (!battle || battle.phase !== "lanes" || !activeAvailability.ready) {
      return;
    }

    setPlayerUseActive((value) => !value);
    setPlayerUseTriple(false);
    extendBulletTime();
  }

  function armPlayerTriple() {
    if (!battle || battle.phase !== "lanes" || tripleBlockedByTieActive || !tripleAvailability.ready) {
      return;
    }

    setPlayerUseTriple((value) => !value);
    setPlayerUseActive(false);
    extendBulletTime();
  }

  function extendBulletTime() {
    if (!battle || battle.phase !== "lanes") {
      return;
    }

    const phaseStartedAt = battle.phaseStartedAt ?? Date.now();
    const nextEndsAt = phaseStartedAt + BULLET_SECONDS * 1000;

    setBattle({
      ...battle,
      phaseEndsAt: Math.max(battle.phaseEndsAt ?? 0, nextEndsAt),
      phaseDuration: BULLET_SECONDS,
      bulletTime: true,
      logs: battle.bulletTime
        ? battle.logs
        : [
            ...battle.logs,
            {
              round: battle.round,
              text: "Bullet Time triggered. Lane selection phase now lasts 10 seconds total.",
              tone: "system",
            },
          ],
    });
  }

  function resolveLanePhase() {
    if (!battle || battle.phase !== "lanes" || !battle.pending || !battle.pending.playerMove) {
      return;
    }

    const playerSelections = resolvePlayerLaneSelections(battle, playerLaneDirections, playerUseActive, playerUseTriple);
    const result = resolveRound({
      round: battle.round,
      player: battle.player,
      ai: battle.ai,
      playerMove: battle.pending.playerMove,
      aiMove: battle.pending.aiDecision.move,
      playerAttackDirection: playerSelections.attack,
      playerSecondAttackDirection: playerSelections.second,
      playerThirdAttackDirection: playerSelections.third,
      playerDefenseDirection: playerSelections.defense,
      aiAttackDirection: battle.pending.aiDecision.attackDirection,
      aiSecondAttackDirection: battle.pending.aiDecision.secondAttackDirection,
      aiThirdAttackDirection: battle.pending.aiDecision.thirdAttackDirection,
      aiDefenseDirection: battle.pending.aiDecision.defenseDirection,
      playerUseActive: battle.pending.playerTieActive || (playerUseActive && activeAvailability.ready),
      aiUseActive: battle.pending.aiUseActive,
      playerUseTriple: playerUseTriple && tripleAvailability.ready,
      aiUseTriple: battle.pending.aiUseTriple,
      guaranteedAttacker: battle.guaranteedAttacker,
    });

    completeRound(
      result,
      [
        {
          round: battle.round,
          text: `${playerLaneLog("Player", battle.pending.attacker, playerSelections, playerLaneCount(battle, playerUseActive, playerUseTriple))}${
            playerSelections.autoFilled ? " Missing choices were auto-picked." : ""
          }`,
          tone: "player",
        },
        {
          round: battle.round,
          text: aiLaneLog(battle.pending.attacker, battle.pending.aiDecision),
          tone: "ai",
        },
      ],
      playerSelections,
    );
  }

  function completeRound(result: ReturnType<typeof resolveRound>, extraLogs: BattleLog[], playerSelections?: PlayerLaneSelection) {
    if (!battle) {
      return;
    }

    const gameOver = result.player.hp <= 0 || result.ai.hp <= 0;
    const nextLogs = result.logs.map((text) => ({
      round: battle.round,
      text,
      tone: text.startsWith("AI") ? ("ai" as const) : text.startsWith("Player") ? ("player" as const) : ("system" as const),
    }));
    const nextAiDecision = chooseAiDecision({
      ai: result.ai,
      player: result.player,
      round: battle.round + 1,
      playerLastAttackDirection: playerSelections?.attack ?? lastPlayerAttackDirection,
      playerLastDefenseDirection: playerSelections?.defense ?? lastPlayerDefenseDirection,
    });
    const nextStats = updateBattleStats(battle, result);
    const now = Date.now();

    setBattle({
      ...battle,
      phase: "lane_result",
      phaseStartedAt: now,
      phaseEndsAt: now + LANE_RESULT_SECONDS * 1000,
      phaseDuration: LANE_RESULT_SECONDS,
      bulletTime: false,
      player: result.player,
      ai: result.ai,
      round: battle.round,
      status: gameOver ? "game_over" : result.status,
      guaranteedAttacker: result.nextGuaranteedAttacker,
      roundBanner: createRoundBanner(battle, result),
      clashReveal: null,
      laneReveal: createLaneReveal(battle, result, playerSelections),
      statPulse: createStatPulse(battle, result),
      stats: nextStats,
      pending: gameOver
        ? null
        : {
            aiDecision: nextAiDecision,
            playerMove: null,
            attacker: null,
            clash: "tie",
            aiUseActive: false,
            aiUseTriple: false,
            playerTieActive: false,
          },
      logs: [
        ...battle.logs,
        ...extraLogs,
        ...nextLogs,
        ...(gameOver
          ? [
              {
                round: battle.round,
                text: `${result.player.hp <= 0 ? "AI" : "Player"} wins the duel.`,
                tone: result.player.hp <= 0 ? ("ai" as const) : ("player" as const),
              },
            ]
          : []),
      ],
    });
    setLastPlayerAttackDirection(playerSelections?.attack ?? lastPlayerAttackDirection);
    setLastPlayerDefenseDirection(playerSelections?.defense ?? lastPlayerDefenseDirection);
    resetRoundControls();
  }

  function completeTieRound(result: ReturnType<typeof resolveRound>, extraLogs: BattleLog[]) {
    if (!battle) {
      return;
    }

    const nextRound = battle.round + 1;
    const nextAiDecision = chooseAiDecision({
      ai: result.ai,
      player: result.player,
      round: nextRound,
      playerLastAttackDirection: lastPlayerAttackDirection,
      playerLastDefenseDirection: lastPlayerDefenseDirection,
    });
    const nextLogs = result.logs.map((text) => ({
      round: battle.round,
      text,
      tone: text.startsWith("AI") ? ("ai" as const) : text.startsWith("Player") ? ("player" as const) : ("system" as const),
    }));
    const now = Date.now();

    setBattle({
      ...battle,
      phase: "clash",
      phaseStartedAt: now,
      phaseEndsAt: now + CLASH_SECONDS * 1000,
      phaseDuration: CLASH_SECONDS,
      bulletTime: false,
      player: result.player,
      ai: result.ai,
      round: nextRound,
      status: "tie",
      guaranteedAttacker: null,
      roundBanner: null,
      clashReveal: null,
      laneReveal: null,
      statPulse: {
        player: null,
        ai: null,
      },
      stats: updateBattleStats(battle, result),
      pending: {
        aiDecision: nextAiDecision,
        playerMove: null,
        attacker: null,
        clash: "tie",
        aiUseActive: false,
        aiUseTriple: false,
        playerTieActive: false,
      },
      logs: [
        ...battle.logs,
        ...extraLogs,
        ...nextLogs,
        {
          round: nextRound,
          text: `Next round starts. Choose a clash move within ${CLASH_SECONDS} seconds.`,
          tone: "system" as const,
        },
      ],
    });
    resetRoundControls();
  }

  function finishLaneResult() {
    if (!battle || battle.phase !== "lane_result") {
      return;
    }

    const gameOver = battle.player.hp <= 0 || battle.ai.hp <= 0;
    const now = Date.now();

    setBattle({
      ...battle,
      phase: gameOver ? "game_over" : "clash",
      phaseStartedAt: gameOver ? null : now,
      phaseEndsAt: gameOver ? null : now + CLASH_SECONDS * 1000,
      phaseDuration: gameOver ? 0 : CLASH_SECONDS,
      round: gameOver ? battle.round : battle.round + 1,
      status: gameOver ? "game_over" : battle.status,
      roundBanner: gameOver ? battle.roundBanner : null,
      laneReveal: null,
      statPulse: {
        player: null,
        ai: null,
      },
      logs: gameOver
        ? battle.logs
        : [
            ...battle.logs,
            {
              round: battle.round + 1,
              text: `Next round starts. Choose a clash move within ${CLASH_SECONDS} seconds.`,
              tone: "system" as const,
            },
          ],
    });
  }

  function togglePlayerLaneDirection(direction: Direction) {
    if (!battle || battle.phase !== "lanes") {
      return;
    }

    setPlayerLaneDirections((directions) => {
      if (directions.includes(direction)) {
        return directions.filter((item) => item !== direction);
      }

      if (playerMaxLanes <= 1) {
        return [direction];
      }

      return [...directions, direction].slice(-playerMaxLanes);
    });
  }

  function toggleMusic() {
    setMusicUnlocked(true);
    setMusicEnabled((enabled) => !enabled);
  }

  function renderMusicDeck() {
    return (
      <>
        <audio ref={setupMusicRef} src={SETUP_MUSIC_SRC} preload="auto" />
        <audio ref={battleMusicRef} src={BATTLE_MUSIC_SRC} preload="auto" />
      </>
    );
  }

  if (!battle || battle.phase === "setup") {
    return (
      <main className="fixed inset-0 grid justify-items-center overflow-hidden bg-[#110f0d] p-2 text-stone-50">
        {renderMusicDeck()}
        <div className="flex h-[calc(100svh-16px)] w-full max-w-[520px] flex-col overflow-hidden border-x border-amber-200/15 bg-[#17130f]">
          <HeaderBar />
          <section className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-black uppercase leading-none text-amber-50">Choose Fighter</h1>
                <p className="mt-1 text-[11px] font-bold leading-snug text-amber-100/70">Tap any portrait to view details. Only the starting three can duel.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <MusicToggle enabled={musicEnabled} onToggle={toggleMusic} />
                <Button aria-label="Start duel" onClick={startDuel} disabled={focusedHeroLocked} className="h-10 rounded-md px-4 font-black">
                  {focusedHeroLocked ? "Locked" : "Start"}
                </Button>
              </div>
            </div>

            <HowToPlay />

            <div>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100/55">Fighters</div>
              <HeroPicker
                focusedHeroId={focusedHeroId}
                selectedHero={selectedHero}
                elementId={selectedElement}
                onFocus={(hero) => {
                  setFocusedHeroId(hero.id);
                  if (hero.initialUnlocked) {
                    setSelectedHero(hero.id);
                  }
                }}
              />
            </div>

            <HeroDetailCard hero={focusedHero} elementId={selectedElement} selected={selectedHero === focusedHero.id} locked={focusedHeroLocked} />

            <div>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100/55">Element</div>
              <ElementGrid selectedElement={selectedElement} onSelect={setSelectedElement} />
            </div>
            <ElementRuleCard elementId={selectedElement} />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 grid items-start justify-items-center overflow-hidden bg-[#0f1210] px-2 pb-2 pt-3 text-stone-50">
      {renderMusicDeck()}
      <div
        className="overflow-hidden"
        style={{
          width: BATTLE_FRAME_WIDTH * battleFrameScale,
          height: battleFrameHeight * battleFrameScale,
        }}
      >
        <div
        className="relative flex flex-col overflow-hidden border border-amber-200/15 bg-[#17130f] shadow-2xl shadow-black/40"
        style={{
          width: BATTLE_FRAME_WIDTH,
          height: battleFrameHeight,
          transform: `scale(${battleFrameScale})`,
          transformOrigin: "top left",
        }}
      >
        <div className="sr-only">FINAL v7.6 Duel Prototype</div>
        <section className="relative min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-2">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,196,86,0.22),transparent_26%),linear-gradient(180deg,rgba(44,33,22,0.86),rgba(18,15,12,0.98))]" />
          <div className="relative z-10 h-full">
            <BattleStage battle={battle} winner={winner} now={now} playerPreviewDirections={playerLaneDirections} />
          </div>
        </section>

        <section className="shrink-0 border-t border-amber-200/15 bg-[#120f0d] px-2.5 py-1.5" style={{ height: BATTLE_CONTROLS_HEIGHT }}>
          {battle.phase === "game_over" ? (
            <DuelAnalysisPanel battle={battle} winner={winner} onRematch={startDuel} onBack={resetDuel} />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <TimerPanel battle={battle} secondsLeft={secondsLeft} timerPercent={timerPercent} />

              <div className="grid grid-cols-[96px_1fr_96px] items-center gap-1.5">
                <TacticButton
                  label={getHero(battle.playerHero).activeName}
                  title="Active Skill"
                  cost={`${getHero(battle.playerHero).activeCost} EN`}
                  active={playerUseActive || Boolean(battle.pending?.playerTieActive)}
                  ready={(battle.phase === "lanes" || battle.phase === "tie_break") && activeAvailability.ready}
                  reason={activeAvailability.reason}
                  onClick={() => {
                    if (battle.phase === "tie_break") {
                      finishTieBreak(true);
                    } else {
                      armPlayerActive();
                    }
                  }}
                />
                <ControlGroup title="Clash" icon={<Zap className="h-3.5 w-3.5" />}>
                  <SegmentedButtons
                    value={playerMove}
                    disabled={battle.phase !== "clash"}
                    items={CLASH_MOVES.map((move) => ({ id: move.id, label: move.label }))}
                    onChange={(value) => chooseClashMove(value as ClashMove)}
                  />
                </ControlGroup>
                <TacticButton
                  label="Triple Strike"
                  title="Triple Strike"
                  cost={`${TRIPLE_STRIKE_COST} EN`}
                  active={playerUseTriple}
                  ready={battle.phase === "lanes" && tripleAvailability.ready}
                  reason={tripleAvailability.reason}
                  onClick={armPlayerTriple}
                />
              </div>

              <div className="mt-1.5">
                <ControlGroup title={laneTitle} icon={<Crosshair className="h-4 w-4" />}>
                  <div className="grid grid-cols-[50px_1fr_50px] items-center gap-1.5">
                    <LanternStack label="PLAYER" side="player" status={battle.status} phase={battle.phase} compact />
                    <DirectionPad
                      values={playerLaneDirections}
                      maxSelections={playerMaxLanes}
                      onToggle={togglePlayerLaneDirection}
                      disabled={battle.phase !== "lanes"}
                    />
                    <LanternStack label="AI" side="ai" status={battle.status} phase={battle.phase} compact />
                  </div>
                </ControlGroup>
              </div>

              <div className="mt-auto grid grid-cols-[1fr_auto_auto] gap-2 pt-1.5">
                <Button
                  onClick={() => {
                    if (battle.phase === "clash" && playerMove) {
                      finishClash(playerMove, false, true);
                    } else if (battle.phase === "tie_break") {
                      finishTieBreak(false);
                    } else if (battle.phase === "lanes") {
                      resolveLanePhase();
                    }
                  }}
                  disabled={Boolean(winner) || battle.phase === "lane_result" || (battle.phase === "clash" && !playerMove)}
                  className="h-10 rounded-md text-xs font-black"
                >
                  <Swords className="h-5 w-5" />
                  {battle.phase === "clash"
                    ? playerMove
                      ? "Lock Clash"
                      : "Choose Move"
                      : battle.phase === "tie_break"
                        ? "Skip Window"
                        : battle.phase === "lanes"
                          ? "Lock Lanes"
                          : battle.phase === "lane_result"
                            ? "Result"
                            : "Timer Running"}
                </Button>
                <MusicToggle enabled={musicEnabled} onToggle={toggleMusic} className="h-10 w-10" />
                <Button
                  aria-label="Reset duel"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 border-amber-200/30 bg-transparent text-amber-100 hover:bg-amber-100/10"
                  onClick={resetDuel}
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}
        </section>

        </div>
      </div>
    </main>
  );

  function resetRoundControls() {
    setPlayerMove(null);
    setPlayerLaneDirections([]);
    resetTacticToggles();
  }

  function resetTacticToggles() {
    setPlayerUseActive(false);
    setPlayerUseTriple(false);
  }
}

function makeBattleState(
  playerHero: HeroId,
  playerElement: ElementId,
  aiHero: HeroId,
  aiElement: ElementId,
  player: FighterState,
  ai: FighterState,
): BattleState {
  const aiDecision = chooseAiDecision({
    ai,
    player,
    round: 1,
  });

  return {
    phase: "clash",
    phaseStartedAt: Date.now(),
    phaseEndsAt: Date.now() + CLASH_SECONDS * 1000,
    phaseDuration: CLASH_SECONDS,
    bulletTime: false,
    playerHero,
    aiHero,
    playerElement,
    aiElement,
    player,
    ai,
    round: 1,
    status: "tie",
    guaranteedAttacker: null,
    roundBanner: null,
    clashReveal: null,
    laneReveal: null,
    statPulse: {
      player: null,
      ai: null,
    },
    stats: createBattleStats(),
    pending: {
      aiDecision,
      playerMove: null,
      attacker: null,
      clash: "tie",
      aiUseActive: false,
      aiUseTriple: false,
      playerTieActive: false,
    },
    logs: [
      {
        round: 0,
        text: `Round starts. Choose a clash move within ${CLASH_SECONDS} seconds.`,
        tone: "system",
      },
    ],
  };
}

function createBattleStats(): BattleStats {
  return {
    roundsCompleted: 0,
    player: createSideBattleStats(),
    ai: createSideBattleStats(),
  };
}

function createSideBattleStats(): SideBattleStats {
  return {
    clashWins: 0,
    clashLosses: 0,
    clashTies: 0,
    attacks: 0,
    hits: 0,
    defenses: 0,
    blocks: 0,
    evades: 0,
    damageDealt: 0,
    damageTaken: 0,
    energyGained: 0,
    energySpent: 0,
    activeUses: 0,
    tripleUses: 0,
  };
}

function updateBattleStats(previous: BattleState, result: ReturnType<typeof resolveRound>): BattleStats {
  const next: BattleStats = {
    roundsCompleted: previous.stats.roundsCompleted + 1,
    player: { ...previous.stats.player },
    ai: { ...previous.stats.ai },
  };

  if (result.clash === "player") {
    next.player.clashWins += 1;
    next.ai.clashLosses += 1;
  } else if (result.clash === "ai") {
    next.ai.clashWins += 1;
    next.player.clashLosses += 1;
  } else if (result.clash === "tie") {
    next.player.clashTies += 1;
    next.ai.clashTies += 1;
  }

  if (result.attacker) {
    const attacker = result.attacker;
    const defender = attacker === "player" ? "ai" : "player";
    next[attacker].attacks += 1;
    next[defender].defenses += 1;

    if (result.isHit) {
      next[attacker].hits += 1;
      next[attacker].damageDealt += result.damage;
      next[defender].damageTaken += result.damage;
    } else if (result.logs.some((log) => log.toLowerCase().includes("evade"))) {
      next[defender].evades += 1;
    } else {
      next[defender].blocks += 1;
    }
  }

  addEnergyDelta(next.player, previous.player.energy, result.player.energy);
  addEnergyDelta(next.ai, previous.ai.energy, result.ai.energy);

  if (result.activeSkill.playerTriggered) {
    next.player.activeUses += 1;
  }
  if (result.activeSkill.aiTriggered) {
    next.ai.activeUses += 1;
  }
  if (result.tripleStrike.usedBy) {
    next[result.tripleStrike.usedBy].tripleUses += 1;
  }

  return next;
}

function addEnergyDelta(stats: SideBattleStats, before: number, after: number) {
  const delta = after - before;

  if (delta > 0) {
    stats.energyGained += delta;
  } else if (delta < 0) {
    stats.energySpent += Math.abs(delta);
  }
}

function createRadarMetrics(stats: SideBattleStats, roundsCompleted: number): RadarMetric[] {
  const decisiveClashes = stats.clashWins + stats.clashLosses;
  const totalClashes = decisiveClashes + stats.clashTies;
  const clashScore = totalClashes
    ? percentage((stats.clashWins + stats.clashTies * 0.5) / totalClashes)
    : 50;
  const strikeScore = stats.attacks ? percentage(stats.hits / stats.attacks) : 50;
  const guardScore = stats.defenses ? percentage((stats.blocks + stats.evades) / stats.defenses) : 50;
  const energyScore = clampPercent(((stats.energyGained + stats.energySpent) / Math.max(1, roundsCompleted * 1.25)) * 100);
  const skillScore = clampPercent(((stats.activeUses + stats.tripleUses) / Math.max(1, roundsCompleted / 4)) * 100);

  return [
    { id: "clash", label: "Clash", detail: "Clash control", value: clashScore },
    { id: "strike", label: "Strike", detail: "Hit pressure", value: strikeScore },
    { id: "guard", label: "Evade", detail: "Lane reads", value: guardScore },
    { id: "energy", label: "Energy", detail: "EN flow", value: energyScore },
    { id: "skill", label: "Skill", detail: "Arts used", value: skillScore },
  ];
}

function createDuelTitle(metrics: RadarMetric[], stats: SideBattleStats): string {
  const topMetric = [...metrics].sort((a, b) => b.value - a.value)[0];

  if (stats.evades >= 2 || topMetric.id === "guard") {
    return "Phantom Riposte";
  }
  if (topMetric.id === "clash") {
    return "Clash Dominator";
  }
  if (topMetric.id === "strike") {
    return "Precision Striker";
  }
  if (topMetric.id === "energy") {
    return "Flow State";
  }

  return "Secret Art Specialist";
}

function percentage(value: number): number {
  return clampPercent(value * 100);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function radarPoint(
  center: { x: number; y: number },
  radius: number,
  index: number,
  total: number,
  scale: number,
): { x: number; y: number } {
  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);

  return {
    x: center.x + Math.cos(angle) * radius * scale,
    y: center.y + Math.sin(angle) * radius * scale,
  };
}

function pointString(point: { x: number; y: number }): string {
  return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

function createClashReveal(
  round: number,
  playerMove: ClashMove,
  aiMove: ClashMove,
  clash: PendingClash["clash"],
  attacker: FighterSide | null,
): ClashReveal {
  return {
    round,
    playerMove,
    aiMove,
    clash,
    attacker,
    expiresAt: Date.now() + 2600,
  };
}

function HeaderBar() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-center border-b border-amber-200/15 bg-black px-3 text-center text-[10px] font-black uppercase leading-none tracking-[0.16em] text-amber-100/80">
      FINAL v7.6 Duel Prototype
    </div>
  );
}

function MusicToggle({
  enabled,
  onToggle,
  compact = false,
  className,
}: {
  enabled: boolean;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
}) {
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      aria-label={enabled ? "Turn music off" : "Turn music on"}
      title={enabled ? "Music on" : "Music off"}
      onClick={onToggle}
      className={cn(
        "grid place-items-center rounded-md border border-amber-200/30 bg-black/45 font-black uppercase text-amber-100 shadow-[0_0_18px_rgba(0,0,0,0.28)] transition hover:bg-amber-100/10",
        compact ? "h-8 w-8" : "h-10 w-10",
        enabled && "border-amber-100/55 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)]",
        className,
      )}
    >
      <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
    </button>
  );
}

function TimerPanel({
  battle,
  secondsLeft,
  timerPercent,
}: {
  battle: BattleState;
  secondsLeft: number;
  timerPercent: number;
}) {
  const isResultHold = battle.phase === "tie_break" || battle.phase === "lane_result";
  const isBulletTime = battle.phase === "lanes" && battle.bulletTime;
  const criticalClashCountdown = !isResultHold && battle.phase === "clash" && secondsLeft <= 1;
  const progressValue = isResultHold ? 100 : timerPercent;
  const phaseText =
    battle.phase === "clash"
      ? "Choose clash move"
      : battle.phase === "tie_break"
        ? "Flying Swallow window"
        : battle.phase === "lanes"
          ? battle.bulletTime
            ? "Bullet Time lanes"
            : "Choose lanes"
          : battle.phase === "lane_result"
            ? "Lane result"
            : "Duel finished";

  return (
    <div
      className={cn(
        "mb-1.5 rounded-md border bg-black/30 px-2 py-1.5 transition",
        isResultHold
          ? "animate-pulse border-yellow-200/80 shadow-[0_0_22px_rgba(253,224,71,0.48)]"
          : criticalClashCountdown
            ? "animate-pulse border-red-300/80 shadow-[0_0_22px_rgba(248,113,113,0.5)]"
            : isBulletTime
              ? "border-red-300/65 shadow-[0_0_18px_rgba(248,113,113,0.34)]"
              : "border-amber-200/15",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase text-amber-100">
        <span className="flex items-center gap-2">
          <Hourglass className="h-3.5 w-3.5" />
          {phaseText}
        </span>
        <span className="flex items-center gap-2">
          <RoundPill round={battle.round} />
          <span>{secondsLeft}s</span>
        </span>
      </div>
      <Progress
        value={progressValue}
        className={cn(
          "h-2 bg-stone-900 transition [&>div]:bg-orange-500",
          isResultHold && "[&>div]:bg-yellow-300 ring-1 ring-yellow-200/70 shadow-[0_0_18px_rgba(253,224,71,0.55)]",
          isBulletTime && "[&>div]:bg-red-500 ring-1 ring-red-300/80 shadow-[0_0_18px_rgba(248,113,113,0.7)]",
          criticalClashCountdown && "ring-1 ring-red-300/80 shadow-[0_0_18px_rgba(248,113,113,0.7)]",
        )}
      />
    </div>
  );
}

function RoundPill({ round }: { round: number }) {
  const duelSurge = round >= 22;
  const surgeWarning = round >= 20 && round < 22;

  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-black uppercase",
        duelSurge
          ? "border-red-200 bg-red-600 text-white"
          : surgeWarning
            ? "animate-pulse border-amber-100 bg-amber-300 text-stone-950"
            : "border-amber-200/30 bg-black/30 text-amber-100",
      )}
    >
      {duelSurge ? `R${round} Duel Surge` : surgeWarning ? `R${round} Surge Soon` : `R${round}`}
    </span>
  );
}

function DuelAnalysisPanel({
  battle,
  winner,
  onRematch,
  onBack,
}: {
  battle: BattleState;
  winner: string | null;
  onRematch: () => void;
  onBack: () => void;
}) {
  const playerStats = battle.stats.player;
  const metrics = createRadarMetrics(playerStats, battle.stats.roundsCompleted);
  const title = winner === "Player" ? "Victory!" : "Defeat";
  const badge = createDuelTitle(metrics, playerStats);
  const summary = winner === "Player" ? "Your instincts controlled the duel." : "Review the pattern, then challenge again.";
  const clash = metrics.find((metric) => metric.id === "clash")?.value ?? 0;
  const strike = metrics.find((metric) => metric.id === "strike")?.value ?? 0;
  const guard = metrics.find((metric) => metric.id === "guard")?.value ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-amber-200/18 bg-[radial-gradient(circle_at_50%_10%,rgba(251,191,36,0.18),transparent_34%),linear-gradient(180deg,rgba(21,17,13,0.98),rgba(7,6,5,0.98))] px-3 py-2 shadow-[inset_0_0_28px_rgba(251,191,36,0.08)]">
      <div className="text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/58">Duel Analysis</div>
        <div className="mt-0.5 text-3xl font-black uppercase leading-none text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.52)]">{title}</div>
        <div className="mt-1 text-lg font-black uppercase leading-none text-amber-50">{badge}</div>
        <div className="mt-1 text-[10px] font-bold uppercase text-amber-100/68">{summary}</div>
      </div>

      <div className="mt-2 grid min-h-0 flex-1 grid-cols-[1fr_132px] items-center gap-2">
        <RadarChart metrics={metrics} />
        <div className="grid gap-1">
          <AnalysisMetric label="Clash" value={clash} detail="Control" />
          <AnalysisMetric label="Strike" value={strike} detail="Hit Rate" />
          <AnalysisMetric label="Evade" value={guard} detail="Lane Reads" />
          <AnalysisMetric label="Damage" value={playerStats.damageDealt} detail="Dealt" suffix="" />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button onClick={onRematch} className="h-10 rounded-md text-xs font-black uppercase">
          Rematch
        </Button>
        <Button
          onClick={onBack}
          variant="outline"
          className="h-10 rounded-md border-amber-200/30 bg-transparent text-xs font-black uppercase text-amber-100 hover:bg-amber-100/10"
        >
          Back to Select
        </Button>
      </div>
    </div>
  );
}

function RadarChart({ metrics }: { metrics: RadarMetric[] }) {
  const center = { x: 108, y: 82 };
  const radius = 48;
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const axisPoints = metrics.map((_, index) => radarPoint(center, radius, index, metrics.length, 1));
  const dataPoints = metrics.map((metric, index) => radarPoint(center, radius, index, metrics.length, metric.value / 100));

  return (
    <svg viewBox="0 0 216 164" className="h-full min-h-0 w-full overflow-visible drop-shadow-[0_0_16px_rgba(251,191,36,0.24)]" role="img" aria-label="Duel performance radar chart">
      <defs>
        <radialGradient id="radarGlow" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="rgba(251,191,36,0.48)" />
          <stop offset="100%" stopColor="rgba(251,191,36,0.04)" />
        </radialGradient>
      </defs>
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={metrics.map((_, index) => pointString(radarPoint(center, radius, index, metrics.length, level))).join(" ")}
          fill="none"
          stroke="rgba(251,191,36,0.22)"
          strokeWidth="1"
        />
      ))}
      {axisPoints.map((point, index) => (
        <line key={metrics[index].id} x1={center.x} y1={center.y} x2={point.x} y2={point.y} stroke="rgba(251,191,36,0.24)" strokeWidth="1" />
      ))}
      <polygon points={dataPoints.map(pointString).join(" ")} fill="url(#radarGlow)" stroke="rgba(255,225,150,0.92)" strokeWidth="3" />
      {dataPoints.map((point, index) => (
        <circle key={metrics[index].id} cx={point.x} cy={point.y} r="4" fill="#ffe49a" stroke="#fff7d1" strokeWidth="1.5" />
      ))}
      {metrics.map((metric, index) => {
        const point = radarPoint(center, radius + 18, index, metrics.length, 1);
        return (
          <g key={metric.id}>
            <text x={point.x} y={point.y - 3} textAnchor="middle" className="fill-amber-100 text-[9px] font-black uppercase">
              {metric.label}
            </text>
            <text x={point.x} y={point.y + 10} textAnchor="middle" className="fill-amber-100/70 text-[8px] font-black">
              {metric.value}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AnalysisMetric({
  label,
  value,
  detail,
  suffix = "%",
}: {
  label: string;
  value: number;
  detail: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-md border border-amber-200/14 bg-black/28 px-2 py-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[8px] font-black uppercase leading-none text-amber-100/50">{label}</div>
        <div className="text-base font-black leading-none text-amber-100">
          {value}
          {suffix}
        </div>
      </div>
      <div className="mt-0.5 text-[7px] font-black uppercase leading-none text-amber-50/54">{detail}</div>
    </div>
  );
}

function BottomAnalysisStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 text-amber-100">
      {icon}
      <span className="text-[10px] font-black uppercase text-amber-100/68">{label}</span>
      <span className="text-xs font-black">{value}</span>
    </div>
  );
}

function RoundResultBanner({ banner, status }: { banner: RoundBanner | null; status: string }) {
  if (!banner) {
    return (
      <div className="mx-auto mt-2 min-h-16 max-w-sm rounded-md border border-amber-200/15 bg-black/25 px-3 py-2 text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-100/45">Arena Result</div>
        <div className="mt-1 text-base font-black uppercase text-amber-50">{status}</div>
        <div className="text-[11px] text-amber-100/60">Round outcome appears here.</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto mt-2 min-h-16 max-w-sm rounded-md border px-3 py-2 text-center shadow-[0_0_28px_rgba(251,191,36,0.18)]",
        banner.tone === "player"
          ? "border-sky-200/50 bg-sky-950/55 text-sky-50"
          : banner.tone === "ai"
            ? "border-red-200/50 bg-red-950/55 text-red-50"
            : "border-amber-200/35 bg-black/40 text-amber-50",
      )}
    >
      <div className="text-xl font-black uppercase leading-none">{banner.title}</div>
      <div className="mt-1 text-[11px] font-bold uppercase text-current/80">{banner.detail}</div>
      <div className="text-[10px] font-black uppercase text-amber-100 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]">{banner.delta}</div>
    </div>
  );
}

function BattleStage({
  battle,
  winner,
  now,
  playerPreviewDirections,
}: {
  battle: BattleState;
  winner: string | null;
  now: number;
  playerPreviewDirections: Direction[];
}) {
  const stageState = getBattleStageState(battle, now);
  const status = statusLabel(battle.status, winner);
  const banner = battle.roundBanner;
  const activeLaneReveal = battle.laneReveal && now <= battle.laneReveal.expiresAt ? battle.laneReveal : null;
  const showLaneGrid = battle.phase === "lanes" || Boolean(activeLaneReveal);

  return (
    <div className="relative h-full overflow-hidden rounded-md shadow-[0_0_28px_rgba(0,0,0,0.42)]">
      <img
        src="/backgrounds/arena-wide-lake.png"
        alt=""
        className="absolute inset-0 h-full w-full scale-[1.08] object-cover object-[50%_54%]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,4,0.05),rgba(8,6,4,0.01)_42%,rgba(8,6,4,0.18)),radial-gradient(circle_at_50%_62%,rgba(251,191,36,0.1),transparent_42%)]" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/30 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/18 to-transparent" />

      {showLaneGrid && <BattleStageLaneGrid battle={battle} reveal={activeLaneReveal} playerPreviewDirections={playerPreviewDirections} />}
      <BattleStageSprite side="player" heroId={battle.playerHero} motion={stageState.playerMotion} reveal={activeLaneReveal} />
      <BattleStageSprite side="ai" heroId={battle.aiHero} motion={stageState.aiMotion} reveal={activeLaneReveal} />
      <SlashTrail attacker={stageState.attacker} />
      <BattleStageEffect state={stageState} />

      <div className="absolute left-2 top-2 z-30 w-[138px]">
        <StageFighterHud label="PLAYER" fighter={battle.player} heroId={battle.playerHero} effect={battle.statPulse.player} now={now} align="left" />
      </div>
      <div className="absolute right-2 top-2 z-30 w-[138px]">
        <StageFighterHud label="AI" fighter={battle.ai} heroId={battle.aiHero} effect={battle.statPulse.ai} now={now} align="right" />
      </div>
      <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2">
        <RoundStatusBadge round={battle.round} status={status} />
      </div>

      <StageBattleReport battle={battle} now={now} banner={banner} status={status} caption={stageState.caption} />
    </div>
  );
}

function BattleStageSprite({
  side,
  heroId,
  motion,
  reveal,
}: {
  side: FighterSide;
  heroId: HeroId;
  motion: BattleSpriteMotion;
  reveal: LaneReveal | null;
}) {
  const hero = getHero(heroId);
  const motionClass = battleSpriteMotionClass(side, motion);
  const spriteState = battleSpriteStateForMotion(motion);
  const spriteSrc = BATTLE_SPRITES[heroId]?.[spriteState];
  const fallbackSrc = hero.portraitSrc;
  const { style, jump } = battleStageSpritePlacement(side, reveal);
  const depthTestSprite = Boolean(BATTLE_3D_SPRITE_SRC[heroId]);

  return (
    <div
      className={cn(
        "absolute z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center transition",
        side === "player"
          ? depthTestSprite
            ? "h-[10.9rem] w-[10.9rem]"
            : "h-[7.25rem] w-[7.25rem]"
          : depthTestSprite
            ? "h-[6.3rem] w-[6.3rem]"
            : "h-[4.05rem] w-[4.05rem]",
        motionClass,
        jump && "battle-lane-jump",
      )}
      style={style}
    >
      <span
        className={cn(
              "absolute left-1/2 top-[74%] -z-10 h-4 -translate-x-1/2 rounded-full bg-black/45 blur-[6px]",
          side === "player" ? (depthTestSprite ? "w-32" : "w-[4.85rem]") : (depthTestSprite ? "w-14" : "w-11"),
        )}
      />
      <span
        className={cn(
          "absolute inset-4 -z-10 rounded-full bg-sky-200/20 blur-xl",
          depthTestSprite && "opacity-80",
        )}
      />
      {motion === "evade" && spriteSrc ? (
          <img
            src={spriteSrc}
            alt=""
            className={cn(
              "absolute h-full w-full object-contain opacity-25 blur-[1px]",
              side === "ai" && "scale-x-[-1]",
            )}
          />
      ) : null}
      {spriteSrc ? (
        <img
          src={spriteSrc}
          alt={hero.displayName}
          className={cn(
            "h-full w-full object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.55)]",
            depthTestSprite && "drop-shadow-[0_20px_18px_rgba(0,0,0,0.62)]",
            side === "ai" && "scale-x-[-1]",
          )}
        />
      ) : fallbackSrc ? (
        <img
          src={fallbackSrc}
          alt={hero.displayName}
          className={cn(
            "h-full w-full rounded-full border-2 border-amber-100/25 bg-black/45 object-cover shadow-[0_12px_24px_rgba(0,0,0,0.38)]",
            side === "ai" && "scale-x-[-1]",
          )}
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-full border-2 border-amber-100/25 bg-black/45 text-xl font-black text-amber-50 shadow-[0_12px_24px_rgba(0,0,0,0.38)]">
          {HERO_MARKS[heroId]}
        </div>
      )}
    </div>
  );
}

function StageBattleReport({
  battle,
  now,
  banner,
  status,
  caption,
}: {
  battle: BattleState;
  now: number;
  banner: RoundBanner | null;
  status: string;
  caption: string;
}) {
  const activeClashReveal = battle.clashReveal && now <= battle.clashReveal.expiresAt ? battle.clashReveal : null;
  const activeLaneReveal = battle.laneReveal && now <= battle.laneReveal.expiresAt ? battle.laneReveal : null;

  if (activeClashReveal) {
    const operator = activeClashReveal.clash === "tie" ? "=" : activeClashReveal.attacker === "player" ? ">" : "<";
    const resultText =
      activeClashReveal.clash === "tie"
        ? "TIE"
        : activeClashReveal.attacker === "player"
          ? "PLAYER ATK"
          : "AI ATK";
    const clashTone =
      activeClashReveal.clash === "tie"
        ? "border-amber-100/60 text-amber-50 shadow-[0_0_24px_rgba(251,191,36,0.38)]"
        : activeClashReveal.attacker === "player"
          ? "border-red-100/70 text-red-50 shadow-[0_0_28px_rgba(248,113,113,0.42)]"
          : "border-sky-100/70 text-sky-50 shadow-[0_0_28px_rgba(56,189,248,0.42)]";

    return (
      <div className="absolute left-2 top-[136px] z-30">
        <div className={cn("w-[138px] rounded-md border bg-black/95 px-2 py-1.5 text-center ring-1 ring-black/80", clashTone)}>
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 text-left">
              <div className="text-[7px] font-black uppercase leading-none tracking-[0.16em] text-amber-100/78">Clash</div>
              <div className="mt-1 text-[10px] font-black uppercase leading-none tracking-[0.08em] text-white">{resultText}</div>
            </div>
            <div className="flex shrink-0 items-center justify-center gap-1">
              <ClashMoveBadge move={activeClashReveal.playerMove} size="sm" selected />
              <span className="min-w-3 text-lg font-black leading-none text-current drop-shadow-[0_0_8px_rgba(255,255,255,0.45)]">{operator}</span>
              <ClashMoveBadge move={activeClashReveal.aiMove} size="sm" selected />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const title = activeLaneReveal ? laneResultLabel(activeLaneReveal.result) : banner?.title ?? status;
  const detail = activeLaneReveal ? stageLaneCaption(activeLaneReveal) : caption;
  const isHit = activeLaneReveal?.result === "hit";
  const reportTone = activeLaneReveal
    ? isHit
      ? "border-red-100/70 text-red-50 shadow-[0_0_28px_rgba(248,113,113,0.46)]"
      : "border-sky-100/70 text-sky-50 shadow-[0_0_28px_rgba(56,189,248,0.42)]"
    : "border-amber-100/50 text-amber-50 shadow-[0_0_22px_rgba(251,191,36,0.28)]";

  return (
    <div className="absolute left-2 top-[136px] z-30">
      <div className={cn("w-[138px] rounded-md border bg-black/95 px-2 py-1.5 text-center ring-1 ring-black/80", reportTone)}>
        <div className="flex items-center justify-center gap-1.5">
          {activeLaneReveal ? (
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border bg-black text-current",
                isHit ? "border-red-100/70 shadow-[0_0_16px_rgba(248,113,113,0.5)]" : "border-sky-100/70 shadow-[0_0_16px_rgba(56,189,248,0.45)]",
              )}
            >
              {isHit ? <Swords className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
            </span>
          ) : null}
          <div className="text-lg font-black uppercase leading-none text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.38)]">{title}</div>
        </div>
        <div className="mx-auto mt-1 line-clamp-2 max-w-[124px] text-[7px] font-black uppercase leading-tight tracking-[0.03em] text-amber-50/86">{detail}</div>
        {banner?.delta && <div className="mt-0.5 text-[8px] font-black uppercase leading-none text-amber-100">{banner.delta}</div>}
      </div>
    </div>
  );
}

function BattleStageLaneGrid({
  battle,
  reveal,
  playerPreviewDirections,
}: {
  battle: BattleState;
  reveal: LaneReveal | null;
  playerPreviewDirections: Direction[];
}) {
  const attacker = reveal?.attacker ?? battle.pending?.attacker ?? null;
  const defender = attacker === "player" ? "ai" : attacker === "ai" ? "player" : null;
  const playerAttackDirections =
    reveal?.attacker === "ai"
      ? reveal.aiDirections
      : [];
  const playerEvadeDirections =
    reveal?.attacker === "ai"
      ? reveal.playerDirections
      : !reveal && battle.phase === "lanes" && battle.pending?.attacker === "ai"
        ? playerPreviewDirections
        : [];
  const aiAttackDirections =
    reveal?.attacker === "player"
      ? reveal.playerDirections
      : !reveal && battle.phase === "lanes" && battle.pending?.attacker === "player"
        ? playerPreviewDirections
        : [];
  const aiEvadeDirections = reveal?.attacker === "player" ? reveal.aiDirections : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-[12]">
      <LaneGridSet
        side="player"
        attackDirections={playerAttackDirections}
        evadeDirections={playerEvadeDirections}
        active={defender === "player"}
        reveal={reveal}
      />
      <LaneGridSet
        side="ai"
        attackDirections={aiAttackDirections}
        evadeDirections={aiEvadeDirections}
        active={defender === "ai"}
        reveal={reveal}
      />
    </div>
  );
}

function LaneGridSet({
  side,
  attackDirections,
  evadeDirections,
  active,
  reveal,
}: {
  side: FighterSide;
  attackDirections: Direction[];
  evadeDirections: Direction[];
  active: boolean;
  reveal: LaneReveal | null;
}) {
  const cellSizeClass = side === "player" ? "h-9 w-9" : "h-8 w-8";

  return (
    <>
      {DIRECTIONS.map((direction) => {
        const attackSelected = attackDirections.includes(direction.id);
        const evadeSelected = evadeDirections.includes(direction.id);
        const overlap = Boolean(reveal && attackSelected && evadeSelected);
        const selected = attackSelected || evadeSelected;
        const point = laneStagePoint(side, direction.id);

        return (
          <div
            key={`${side}-${direction.id}`}
            className={cn(
              "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border text-[8px] font-black uppercase transition",
              cellSizeClass,
              active
                ? "border-amber-100/40 bg-black/24 text-amber-50/66"
                : side === "player"
                  ? "border-sky-100/18 bg-sky-500/5 text-sky-50/25"
                  : "border-red-100/18 bg-red-500/5 text-red-50/25",
              attackSelected && "lane-cell-selected scale-115 border-white bg-black text-white shadow-[0_0_26px_rgba(255,255,255,0.58)]",
              evadeSelected && "lane-cell-selected scale-115 border-red-100 bg-red-600 text-white shadow-[0_0_28px_rgba(248,113,113,0.82)]",
              overlap && "scale-125 border-amber-100 bg-red-500 text-white shadow-[0_0_34px_rgba(251,191,36,0.92),0_0_24px_rgba(248,113,113,0.86)]",
              selected && "z-20",
            )}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            {overlap ? "HIT" : shortDirectionLabel(direction.id)}
          </div>
        );
      })}
    </>
  );
}

function battleStageSpritePlacement(side: FighterSide, reveal: LaneReveal | null): { style: CSSProperties; jump: boolean } {
  if (!reveal) {
    const point = side === "player" ? { x: 31, y: 72 } : { x: 69, y: 52 };
    return { style: { left: `${point.x}%`, top: `${point.y}%` }, jump: false };
  }

  const primary = primaryRevealDirection(side, reveal);
  const from = laneStagePoint(side, primary);
  const jump = reveal.attacker === side;

  if (!jump) {
    return { style: { left: `${from.x}%`, top: `${from.y}%` }, jump: false };
  }

  const targetSide = side === "player" ? "ai" : "player";
  const to = laneStagePoint(targetSide, primary);
  return {
    style: {
      left: `${from.x}%`,
      top: `${from.y}%`,
      "--lane-from-x": `${from.x}%`,
      "--lane-from-y": `${from.y}%`,
      "--lane-to-x": `${to.x}%`,
      "--lane-to-y": `${to.y}%`,
    } as CSSProperties,
    jump: true,
  };
}

function primaryRevealDirection(side: FighterSide, reveal: LaneReveal): Direction {
  const directions = side === "player" ? reveal.playerDirections : reveal.aiDirections;

  if (reveal.result === "hit" && reveal.attacker) {
    const attackerDirections = reveal.attacker === "player" ? reveal.playerDirections : reveal.aiDirections;
    const defenderDirections = reveal.attacker === "player" ? reveal.aiDirections : reveal.playerDirections;
    const hitDirection = attackerDirections.find((direction) => defenderDirections.includes(direction));

    if (hitDirection) {
      return hitDirection;
    }
  }

  return directions[0] ?? "center";
}

function laneStagePoint(side: FighterSide, direction: Direction): { x: number; y: number } {
  const center = side === "player" ? { x: 31, y: 72 } : { x: 69, y: 52 };
  const offset: Record<Direction, { x: number; y: number }> =
    side === "player"
      ? {
          high: { x: 2, y: -11 },
          low: { x: -2, y: 12 },
          left: { x: -13, y: 1 },
          right: { x: 13, y: -2 },
          center: { x: 0, y: 0 },
        }
      : {
          high: { x: 2, y: -9 },
          low: { x: -2, y: 10 },
          left: { x: -11, y: 1 },
          right: { x: 11, y: -2 },
          center: { x: 0, y: 0 },
        };
  const delta = offset[direction];

  return { x: center.x + delta.x, y: center.y + delta.y };
}

function BattleStageEffect({ state }: { state: BattleStageVisualState }) {
  if (state.effect === "none") {
    return null;
  }

  if (state.effect === "tie") {
    return (
      <div className="battle-impact-pop absolute left-1/2 top-[58%] z-20 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-100/85 bg-amber-200/20 shadow-[0_0_34px_rgba(251,191,36,0.75)]" />
    );
  }

  const targetSide = state.effectSide === "player" ? "left-[28%]" : "right-[28%]";

  if (state.effect === "hit") {
    return (
      <div className={cn("battle-impact-pop absolute top-[56%] z-20 h-14 w-14 -translate-y-1/2 rounded-full border-4 border-red-100/85 bg-red-500/30 shadow-[0_0_32px_rgba(248,113,113,0.78)]", targetSide)} />
    );
  }

  return (
    <div className={cn("battle-impact-pop absolute top-[57%] z-20 h-14 w-24 -translate-y-1/2 rounded-full border-2 border-sky-100/70 bg-sky-300/16 shadow-[0_0_28px_rgba(125,211,252,0.65)]", targetSide)} />
  );
}

function SlashTrail({ attacker }: { attacker: FighterSide | null }) {
  if (!attacker) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-12 top-[56%] z-20 h-12 -translate-y-1/2 overflow-hidden">
      <div
        className={cn(
          "absolute left-1/2 top-1/2 h-2 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-amber-100 to-transparent opacity-0 shadow-[0_0_20px_rgba(251,191,36,0.9)]",
          attacker === "player" ? "slash-left-to-right" : "slash-right-to-left",
        )}
      />
      <div
        className={cn(
          "absolute left-1/2 top-1/2 h-px w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_16px_rgba(255,255,255,0.85)]",
          attacker === "player" ? "slash-left-to-right" : "slash-right-to-left",
        )}
      />
    </div>
  );
}

function getBattleStageState(battle: BattleState, now: number): BattleStageVisualState {
  const activeLaneReveal = battle.laneReveal && now <= battle.laneReveal.expiresAt ? battle.laneReveal : null;
  const activeClashReveal = battle.clashReveal && now <= battle.clashReveal.expiresAt ? battle.clashReveal : null;

  if (activeLaneReveal?.attacker) {
    const defender = activeLaneReveal.attacker === "player" ? "ai" : "player";
    const defenderMotion: BattleSpriteMotion =
      activeLaneReveal.result === "hit"
        ? "hit"
        : "evade";

    return {
      playerMotion: activeLaneReveal.attacker === "player" ? "attack" : defender === "player" ? defenderMotion : "idle",
      aiMotion: activeLaneReveal.attacker === "ai" ? "attack" : defender === "ai" ? defenderMotion : "idle",
      effect: activeLaneReveal.result === "hit" ? "hit" : "evade",
      effectSide: defender,
      attacker: activeLaneReveal.attacker,
      caption: stageLaneCaption(activeLaneReveal),
    };
  }

  if (activeClashReveal?.clash === "tie") {
    return {
      playerMotion: "clash",
      aiMotion: "clash",
      effect: "tie",
      effectSide: null,
      attacker: null,
      caption: "Both fighters collide at center.",
    };
  }

  if (activeClashReveal?.attacker) {
    return {
      playerMotion: activeClashReveal.attacker === "player" ? "attack" : "evade",
      aiMotion: activeClashReveal.attacker === "ai" ? "attack" : "evade",
      effect: "none",
      effectSide: null,
      attacker: activeClashReveal.attacker,
      caption: `${sideLabel(activeClashReveal.attacker)} wins the clash.`,
    };
  }

  return {
    playerMotion: fighterStance("player", battle.status) === "attack" ? "attack" : fighterStance("player", battle.status) === "defend" ? "evade" : "idle",
    aiMotion: fighterStance("ai", battle.status) === "attack" ? "attack" : fighterStance("ai", battle.status) === "defend" ? "evade" : "idle",
    effect: "none",
    effectSide: null,
    attacker: battle.status === "attack" ? "player" : battle.status === "defend" ? "ai" : null,
    caption: "Fighters are waiting for the next result.",
  };
}

function battleSpriteMotionClass(side: FighterSide, motion: BattleSpriteMotion): string {
  if (motion === "attack") {
    return side === "player" ? "battle-attack-right" : "battle-attack-left";
  }

  if (motion === "hit") {
    return "battle-hit-shake";
  }

  if (motion === "block") {
    return side === "player" ? "battle-block-brace" : "battle-block-brace-left";
  }

  if (motion === "evade") {
    return side === "player" ? "battle-evade-right" : "battle-evade-left";
  }

  if (motion === "clash") {
    return side === "player" ? "battle-clash-bump" : "battle-clash-bump-left";
  }

  return "battle-idle-float";
}

function battleSpriteStateForMotion(motion: BattleSpriteMotion): BattleSpriteAssetState {
  if (motion === "attack" || motion === "clash") {
    return "attack";
  }

  if (motion === "hit") {
    return "hit";
  }

  if (motion === "block" || motion === "evade") {
    return "defend";
  }

  return "idle";
}

function createBattleSpriteSet(heroId: HeroId): Record<BattleSpriteAssetState, string> {
  return BATTLE_SPRITE_STATES.reduce(
    (sprites, state) => ({
      ...sprites,
      [state]: `/assets/characters/${heroId}/${heroId}_${state}.png`,
    }),
    {} as Record<BattleSpriteAssetState, string>,
  );
}

function createStaticBattleSpriteSet(src: string): Record<BattleSpriteAssetState, string> {
  return BATTLE_SPRITE_STATES.reduce(
    (sprites, state) => ({
      ...sprites,
      [state]: src,
    }),
    {} as Record<BattleSpriteAssetState, string>,
  );
}

function stageLaneCaption(reveal: LaneReveal): string {
  if (!reveal.attacker) {
    return "The exchange resolves at center stage.";
  }

  const defender = reveal.attacker === "player" ? "ai" : "player";

  if (reveal.result === "hit") {
    return `${sideLabel(reveal.attacker)} attacks. ${sideLabel(defender)} takes ${reveal.damage} HP.`;
  }

  return `${sideLabel(defender)} evades. The attack misses.`;
}

function HowToPlay() {
  const [open, setOpen] = useState(false);
  const clashRules = [
    { from: "CHARGE", to: "SIDESTEP" },
    { from: "SIDESTEP", to: "COUNTER" },
    { from: "COUNTER", to: "CHARGE" },
  ];
  const steps = [
    { title: "WIN CLASH", detail: "Win Charge, Sidestep, or Counter to become the attacker." },
    { title: "BECOME ATTACKER", detail: "The clash winner controls the strike for this round." },
    { title: "CHOOSE LANE", detail: "Pick your lane before the timer ends." },
    { title: "HIT OR MISS", detail: "Matched attack and evade lanes hit. Different lanes miss." },
    { title: "GAIN EN", detail: "Build Energy through duel actions." },
    { title: "USE SKILLS", detail: "Spend EN when Active Skill or Triple Strike lights up." },
    { title: "WIN THE DUEL", detail: "Reduce the opponent's HP to 0." },
  ];

  return (
    <div className="rounded-md border border-amber-200/15 bg-black/25 px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-amber-100/50">How to Play</span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase text-amber-50/82">
            Win clash, choose lane, build EN, use skills.
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-amber-100/70" /> : <ChevronDown className="h-4 w-4 text-amber-100/70" />}
      </button>

      {open && (
        <div className="mt-2 border-t border-amber-200/12 pt-2">
          <div className="rounded border border-amber-200/15 bg-stone-950/50 px-2 py-1.5">
            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100/55">Clash Rules</div>
            <div className="grid gap-1">
              {clashRules.map((rule) => (
                <div key={`${rule.from}-${rule.to}`} className="flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-50">
                  <span className="min-w-16 rounded border border-amber-200/20 bg-black/35 px-1.5 py-0.5 text-center">{rule.from}</span>
                  <span className="text-amber-100/70">beats</span>
                  <span className="min-w-16 rounded border border-amber-200/20 bg-black/35 px-1.5 py-0.5 text-center">{rule.to}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {steps.map((step, index) => (
              <div key={step.title} className={cn("rounded border border-amber-200/12 bg-black/20 px-2 py-1", index === steps.length - 1 && "col-span-2")}>
                <div className="text-[9px] font-black uppercase text-amber-50">
                  {index + 1}. {step.title}
                </div>
                <div className="mt-0.5 text-[9px] font-bold leading-snug text-amber-100/68">{step.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroPicker({
  focusedHeroId,
  selectedHero,
  elementId,
  onFocus,
}: {
  focusedHeroId: HeroId;
  selectedHero: HeroId;
  elementId: ElementId;
  onFocus: (hero: Hero) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {HEROES.map((hero) => {
        const focused = focusedHeroId === hero.id;
        const selected = selectedHero === hero.id;
        const locked = !hero.initialUnlocked;

        return (
          <button
            key={hero.id}
            type="button"
            onClick={() => onFocus(hero)}
            className={cn(
              "relative grid h-20 place-items-center rounded-md border bg-black/25 transition",
              focused
                ? "hero-selected-glow border-amber-200 bg-amber-300/15"
                : "border-amber-200/15 hover:bg-amber-100/10",
              locked && "opacity-55",
            )}
          >
            <HeroToken heroId={hero.id} elementId={elementId} size="pick" showElementBadge={false} />
            {selected && <span className="absolute bottom-1 h-1 w-5 rounded-full bg-amber-200" />}
            {locked && (
              <span className="absolute right-1 top-1 rounded bg-black/75 px-1 text-[7px] font-black uppercase text-amber-100/70">
                Lock
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function HeroDetailCard({ hero, elementId, selected, locked }: { hero: Hero; elementId: ElementId; selected: boolean; locked: boolean }) {
  return (
    <div
      className={cn(
        "min-h-0 rounded-md border bg-black/25 p-2.5",
        locked ? "border-amber-200/12 opacity-75" : selected ? "border-amber-200/55 bg-amber-300/10" : "border-amber-200/15",
      )}
    >
      <div className="flex items-center gap-3">
        <HeroToken heroId={hero.id} elementId={elementId} size="pick" showElementBadge={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-lg font-black text-amber-50">{hero.displayName}</div>
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em]",
                locked ? "border-amber-200/20 bg-black/35 text-amber-100/60" : "border-emerald-200/25 bg-emerald-500/15 text-emerald-50",
              )}
            >
              {locked ? "Locked" : "Demo"}
            </span>
          </div>
          <div className="mt-0.5 text-xs font-bold text-amber-100/70">{hero.role}</div>
          <div className="mt-1 text-xs font-black text-sky-100">
            {hero.activeName} / {hero.activeCost} EN
          </div>
          <div className="mt-1 text-[11px] font-bold leading-snug text-amber-50/72">{hero.activeSummary}</div>
        </div>
      </div>
    </div>
  );
}

function ElementGrid({ selectedElement, onSelect }: { selectedElement: ElementId; onSelect: (elementId: ElementId) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {ELEMENTS.map((element) => (
        <button
          key={element.id}
          type="button"
          onClick={() => onSelect(element.id)}
          title={element.shortRule}
          className={cn(
            "grid h-16 place-items-center rounded-md border text-[11px] font-black transition",
            element.colorClass,
            selectedElement === element.id ? "scale-[1.03] ring-2 ring-amber-200" : "opacity-75",
          )}
        >
          <ElementIcon elementId={element.id} size="lg" />
          <span>{element.label}</span>
        </button>
      ))}
    </div>
  );
}

function ElementRuleCard({ elementId }: { elementId: ElementId }) {
  const element = getElement(elementId);

  return (
    <div className="mt-2 rounded-md border border-amber-200/15 bg-black/25 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md border", element.colorClass)}>
          <ElementIcon elementId={element.id} size="md" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-100/50">Element Ability</div>
          <div className="truncate text-sm font-black text-amber-50">{element.englishName}</div>
        </div>
      </div>
      <div className="mt-1.5 text-[11px] font-bold leading-snug text-amber-50/80">{element.shortRule}</div>
    </div>
  );
}

function RoundStatusBadge({ round, status }: { round: number; status: string }) {
  const duelSurge = round >= 22;
  const surgeWarning = round >= 20 && round < 22;

  return (
    <div
      className={cn(
        "grid h-12 w-20 shrink-0 place-items-center rounded-md border text-center shadow-[0_0_32px_rgba(251,191,36,0.2)]",
        duelSurge
          ? "border-red-300 bg-red-600/35 text-red-50 shadow-red-950"
          : surgeWarning
            ? "animate-pulse border-amber-200 bg-amber-300/20 text-amber-50"
            : "border-amber-300/40 bg-black/40 text-amber-50",
      )}
    >
      <span className="text-sm font-black uppercase leading-none">R{round}</span>
      <span className="text-[9px] font-black uppercase">{duelSurge ? "Duel Surge" : surgeWarning ? "Surge Soon" : status}</span>
    </div>
  );
}

function StageFighterHud({
  label,
  fighter,
  heroId,
  effect,
  now,
  align,
}: {
  label: string;
  fighter: FighterState;
  heroId: HeroId;
  effect?: StatPulse | null;
  now: number;
  align: "left" | "right";
}) {
  const hero = getHero(heroId);
  const activeEffect = effect && now <= effect.expiresAt ? effect : null;
  const pulseTone = activeEffect?.hpDelta && activeEffect.hpDelta < 0 ? "hp" : activeEffect?.energyDelta && activeEffect.energyDelta > 0 ? "energy" : null;

  return (
    <div
      className={cn(
        "rounded-md border border-amber-200/26 bg-black p-1 shadow-[0_0_20px_rgba(0,0,0,0.72)]",
        align === "right" && "text-right",
      )}
    >
      <div className={cn("flex items-start gap-1", align === "right" && "flex-row-reverse")}>
        <HeroToken heroId={heroId} elementId={fighter.elementId} size="md" pulseTone={pulseTone} />
        <div className="min-w-0 flex-1">
          <div className="text-[7px] font-black uppercase tracking-[0.1em] text-sky-100/75">{label}</div>
          <div className="truncate text-[11px] font-black leading-tight text-amber-50">{hero.displayName}</div>
          <div className="truncate text-[8px] font-bold leading-tight text-amber-100/68">{hero.activeName}</div>
        </div>
      </div>
      <div className="mt-0.5 space-y-0.5">
        <Meter label="HP" value={fighter.hp} max={fighter.maxHp} />
        <Meter label="EN" value={fighter.energy} max={MAX_ENERGY} />
      </div>
      <div className="mt-0.5 grid grid-cols-2 gap-1">
        <StageHudStat icon={<Swords className="h-3 w-3" />} value={`${fighter.combo}/3`} />
        <StageHudStat icon={<Shield className="h-3 w-3" />} value={`${fighter.evade}/3`} />
        {fighter.spearCharged && <span>Charged</span>}
        {fighter.needleJammed && <span>Jam</span>}
      </div>
    </div>
  );
}

function StageHudStat({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex h-6 items-center justify-center gap-1 rounded-md border border-amber-200/18 bg-black/35 text-[8px] font-black text-amber-50 shadow-inner">
      <span className="text-amber-100/78">{icon}</span>
      <span>{value}</span>
    </div>
  );
}

function ClashRevealPanel({ reveal, now }: { reveal: ClashReveal | null; now: number }) {
  if (!reveal || now > reveal.expiresAt) {
    return null;
  }

  const resultText =
    reveal.clash === "tie"
      ? "Tie"
      : reveal.clash === "guaranteed"
        ? `${sideLabel(reveal.attacker)} Chain`
        : `${sideLabel(reveal.attacker)} Attacks`;

  return (
    <div className="mx-auto mt-1.5 grid max-w-sm grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-amber-200/30 bg-black/45 px-2 py-1.5 text-center shadow-[0_0_24px_rgba(251,191,36,0.22)] animate-in fade-in zoom-in-95 duration-300">
      <RevealMove label="Player" move={reveal.playerMove} tone="player" />
      <div className="min-w-14 rounded border border-amber-200/25 bg-amber-300/10 px-2 py-1">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-100/55">Vs</div>
        <div className="text-[10px] font-black uppercase leading-tight text-amber-50">{resultText}</div>
      </div>
      <RevealMove label="AI" move={reveal.aiMove} tone="ai" />
    </div>
  );
}

function RevealMove({ label, move, tone }: { label: string; move: ClashMove; tone: "player" | "ai" }) {
  return (
    <div
      className={cn(
        "rounded border px-2 py-1 text-left",
        tone === "player" ? "border-sky-200/35 bg-sky-950/35" : "border-red-200/35 bg-red-950/35",
      )}
    >
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-100/50">{label}</div>
      <div className="truncate text-[12px] font-black uppercase text-amber-50">{clashMoveLabel(move)}</div>
    </div>
  );
}

function FighterHud({
  label,
  fighter,
  heroId,
  align,
}: {
  label: string;
  fighter: FighterState;
  heroId: HeroId;
  align: "left" | "right";
}) {
  const hero = getHero(heroId);
  const element = getElement(fighter.elementId);

  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-100/50">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        {align === "left" && <ElementBadge elementId={fighter.elementId} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-black text-amber-50">{hero.displayName}</div>
          <div className="truncate text-[10px] text-amber-100/65">{element.englishName}</div>
        </div>
        {align === "right" && <ElementBadge elementId={fighter.elementId} />}
      </div>
      <div className="mt-1 space-y-0.5">
        <Meter label="HP" value={fighter.hp} max={fighter.maxHp} />
        <Meter label="EN" value={fighter.energy} max={MAX_ENERGY} />
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] text-amber-100/70">
        <span>Combo {fighter.combo}</span>
        <span>Evade {fighter.evade}</span>
        <span>Skill {fighter.activeUsesRemaining}</span>
        {fighter.spearCharged && <span>Charged</span>}
        {fighter.needleJammed && <span>Jam</span>}
      </div>
    </div>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="grid grid-cols-[20px_1fr_22px] items-center gap-1 text-[9px]">
      <span className="font-bold text-amber-100/70">{label}</span>
      <Progress value={(value / max) * 100} className="h-1.5 bg-stone-900" />
      <span className="text-right font-bold text-amber-50">{value}</span>
    </div>
  );
}

function ElementBadge({ elementId }: { elementId: ElementId }) {
  const element = getElement(elementId);

  return (
    <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs font-black", element.colorClass)}>
      <ElementIcon elementId={elementId} size="sm" />
    </div>
  );
}

function ElementIcon({ elementId, size = "md" }: { elementId: ElementId; size?: "sm" | "md" | "lg" }) {
  const element = getElement(elementId);

  return (
    <img
      src={element.imageSrc}
      alt={element.label}
      className={cn("rounded-full object-cover", size === "lg" ? "h-8 w-8" : size === "sm" ? "h-5 w-5" : "h-6 w-6")}
    />
  );
}

function HeroStand({
  fighter,
  heroId,
  facing,
  tokenSize = "lg",
  effect,
  now,
  stance,
}: {
  fighter: FighterState;
  heroId: HeroId;
  facing: "left" | "right";
  tokenSize?: "md" | "lg";
  effect?: StatPulse | null;
  now?: number;
  stance: FighterStance;
}) {
  const hero = getHero(heroId);
  const activeEffect = effect && now && now <= effect.expiresAt ? effect : null;
  const pulseTone = activeEffect?.hpDelta && activeEffect.hpDelta < 0 ? "hp" : activeEffect?.energyDelta && activeEffect.energyDelta > 0 ? "energy" : null;
  const stanceClass =
    stance === "tie"
      ? "hero-tie-waver"
      : stance === "attack"
        ? facing === "right"
          ? "hero-attack-right"
          : "hero-attack-left"
        : facing === "right"
          ? "hero-defend-left"
          : "hero-defend-right";

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-start gap-2 transition duration-200",
        facing === "left" ? "flex-row-reverse text-right" : "flex-row",
        stanceClass,
        activeEffect?.hpDelta && activeEffect.hpDelta < 0 && "animate-pulse",
      )}
    >
      <HeroToken heroId={heroId} elementId={fighter.elementId} size={tokenSize} pulseTone={pulseTone} />
      <div className="min-w-0">
        <div className="max-w-20 truncate text-[11px] font-bold text-amber-50">{hero.displayName}</div>
        <div className="max-w-20 truncate text-[9px] text-amber-100/65">{hero.activeName}</div>
        <div className="mt-1 w-20 space-y-0.5">
          <MiniMeter label="HP" value={fighter.hp} max={fighter.maxHp} delta={activeEffect?.hpDelta ?? 0} />
          <MiniMeter label="EN" value={fighter.energy} max={MAX_ENERGY} delta={activeEffect?.energyDelta ?? 0} />
        </div>
        <ComboEvadeMarks fighter={fighter} comboDelta={activeEffect?.comboDelta ?? 0} evadeDelta={activeEffect?.evadeDelta ?? 0} />
      </div>
    </div>
  );
}

function ComboEvadeMarks({ fighter, comboDelta = 0, evadeDelta = 0 }: { fighter: FighterState; comboDelta?: number; evadeDelta?: number }) {
  return (
    <div className="mt-1 grid w-20 grid-cols-2 gap-1 text-[8px] font-black uppercase">
      <div
        title="Combo hits"
        className={cn(
          "flex items-center justify-center gap-1 rounded border px-1 py-0.5 transition",
          fighter.combo > 0 ? "border-red-200/60 bg-red-500/25 text-red-50" : "border-amber-200/15 bg-black/25 text-amber-100/45",
          comboDelta > 0 && "scale-[1.08] bg-red-400/35 shadow-[0_0_16px_rgba(248,113,113,0.45)]",
          comboDelta < 0 && "border-amber-200/30 bg-black/40",
        )}
      >
        <Swords className="h-3 w-3" />
        <span>{fighter.combo}</span>
      </div>
      <div
        title="Evade streak"
        className={cn(
          "flex items-center justify-center gap-1 rounded border px-1 py-0.5 transition",
          fighter.evade > 0 ? "border-sky-200/60 bg-sky-500/25 text-sky-50" : "border-amber-200/15 bg-black/25 text-amber-100/45",
          evadeDelta > 0 && "scale-[1.08] bg-sky-400/35 shadow-[0_0_16px_rgba(125,211,252,0.45)]",
          evadeDelta < 0 && "border-amber-200/30 bg-black/40",
        )}
      >
        <Shield className="h-3 w-3" />
        <span>{fighter.evade}</span>
      </div>
    </div>
  );
}

function MiniMeter({ label, value, max, delta = 0 }: { label: string; value: number; max: number; delta?: number }) {
  const hpLoss = label === "HP" && delta < 0;
  const energyGain = label === "EN" && delta > 0;
  const energySpend = label === "EN" && delta < 0;

  return (
    <div
      className={cn(
        "grid grid-cols-[16px_1fr_16px] items-center gap-1 rounded-sm text-[8px] transition",
        hpLoss && "bg-red-500/15 text-red-50",
        energyGain && "bg-sky-400/10 text-sky-50",
        energySpend && "bg-amber-300/10 text-amber-50",
      )}
    >
      <span className="font-black text-amber-100/65">{label}</span>
      <Progress
        value={(value / max) * 100}
        className={cn(
          "h-1 bg-stone-950 transition",
          hpLoss && "ring-1 ring-red-300/80 shadow-[0_0_12px_rgba(248,113,113,0.55)]",
          energyGain && "ring-1 ring-sky-200/80 shadow-[0_0_12px_rgba(125,211,252,0.55)]",
          energySpend && "ring-1 ring-amber-200/70 shadow-[0_0_12px_rgba(251,191,36,0.35)]",
        )}
      />
      <span className={cn("text-right font-black text-amber-50", delta !== 0 && "scale-[1.12]")}>{value}</span>
    </div>
  );
}

function HeroToken({
  heroId,
  elementId,
  size = "md",
  showElementBadge = true,
  pulseTone = null,
}: {
  heroId: HeroId;
  elementId: ElementId;
  size?: "md" | "pick" | "card" | "lg";
  showElementBadge?: boolean;
  pulseTone?: "hp" | "energy" | null;
}) {
  const hero = getHero(heroId);
  const element = getElement(elementId);
  const tokenSize = size === "lg" ? "h-24 w-24 text-2xl" : size === "card" ? "h-20 w-20 text-xl" : size === "pick" ? "h-16 w-16 text-base" : "h-12 w-12 text-sm";

  return (
    <div
      className={cn(
        "hero-idle-breath relative grid place-items-center rounded-full font-black",
        tokenSize,
        pulseTone === "hp" && "hero-hp-flash",
        pulseTone === "energy" && "hero-energy-flash",
      )}
    >
      <div
        className={cn(
          "relative grid h-full w-full place-items-center overflow-hidden rounded-full border-2 bg-black/45 shadow-xl",
        element.colorClass,
      )}
      >
        {hero.portraitSrc ? (
          <img src={hero.portraitSrc} alt={hero.displayName} className="absolute inset-0 h-full w-full object-cover object-center" />
        ) : (
          HERO_MARKS[heroId]
        )}
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,transparent_46%,rgba(0,0,0,0.4)_78%)]" />
      </div>
      {showElementBadge && (
        <span
          className={cn(
            "absolute grid place-items-center rounded-full border border-amber-100/50 bg-black",
            size === "lg" || size === "card" ? "-right-1 -top-1 h-7 w-7 text-xs" : "right-0 top-0 h-5 w-5 text-[10px]",
          )}
        >
          <ElementIcon elementId={elementId} size={size === "md" ? "sm" : "md"} />
        </span>
      )}
    </div>
  );
}

function LanternStack({
  label,
  side,
  status,
  phase,
  compact = false,
}: {
  label: string;
  side: FighterSide;
  status: BattleStatus;
  phase: BattlePhase;
  compact?: boolean;
}) {
  const sideStatus =
    phase === "clash" || status === "game_over"
      ? null
      : phase === "tie_break"
        ? "tie"
      : side === "player"
        ? status === "defend"
          ? "evade"
          : status
        : status === "attack"
          ? "evade"
          : status === "defend"
            ? "attack"
            : "tie";
  const items = [
    { id: "attack", label: "ATTACK" },
    { id: "tie", label: "TIE" },
    { id: "evade", label: "EVADE" },
  ] as const;

  return (
    <div className="grid gap-1">
      <div className="text-center text-[9px] font-black uppercase tracking-[0.08em] text-amber-100/70">{label}</div>
      {items.map((item) => {
        const active = item.id === sideStatus;

        return (
          <div
            key={item.id}
            className={cn(
              "relative grid place-items-center overflow-hidden rounded-full border font-black uppercase shadow-inner transition duration-200",
              compact ? "h-9 text-[8px]" : "h-14 text-[11px]",
              active
                ? side === "player"
                  ? "lantern-active-glow scale-[1.04] border-red-200 bg-red-500/70 text-white shadow-[0_0_20px_rgba(248,113,113,0.65)]"
                  : "lantern-active-glow scale-[1.04] border-amber-100 bg-amber-300/80 text-stone-950 shadow-[0_0_20px_rgba(251,191,36,0.65)]"
                : "border-amber-200/15 bg-black/30 text-amber-100/32 opacity-70",
            )}
          >
            {active && <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/70 blur-sm animate-pulse" />}
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

function ControlGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-100">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SegmentedButtons({
  value,
  items,
  onChange,
  disabled,
}: {
  value: string | null;
  items: { id: ClashMove; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const positionClass: Record<string, string> = {
    charge: "col-start-2 row-start-1",
    sidestep: "col-start-1 row-start-2",
    counter: "col-start-3 row-start-2",
  };

  return (
    <div className="relative mx-auto grid max-w-40 grid-cols-3 grid-rows-2 gap-x-1.5 gap-y-1">
      <svg
        aria-hidden="true"
        viewBox="0 0 160 84"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
      >
        <defs>
          <marker id="clash-arrowhead" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(253, 230, 138, 0.78)" />
          </marker>
        </defs>
        <path
          d="M68 34 L43 52"
          fill="none"
          stroke="rgba(253, 230, 138, 0.64)"
          strokeWidth="2"
          strokeLinecap="round"
          markerEnd="url(#clash-arrowhead)"
        />
        <path
          d="M51 64 L110 64"
          fill="none"
          stroke="rgba(253, 230, 138, 0.64)"
          strokeWidth="2"
          strokeLinecap="round"
          markerEnd="url(#clash-arrowhead)"
        />
        <path
          d="M116 52 L92 34"
          fill="none"
          stroke="rgba(253, 230, 138, 0.64)"
          strokeWidth="2"
          strokeLinecap="round"
          markerEnd="url(#clash-arrowhead)"
        />
      </svg>
      {items.map((item) => {
        const selected = value === item.id;

        return (
        <button
          key={item.id}
          type="button"
          title={item.label}
          disabled={disabled}
          onClick={() => onChange(item.id)}
          className={cn(
            "relative z-10 grid h-11 w-full place-items-center rounded-full border leading-none transition duration-150 disabled:cursor-not-allowed disabled:opacity-45",
            positionClass[item.id] ?? "",
            selected
              ? "clash-choice-selected scale-[1.08] border-amber-100 bg-amber-300 text-stone-950 shadow-[0_0_24px_rgba(251,191,36,0.65)] brightness-125"
              : "border-amber-200/20 bg-black/25 text-amber-100 hover:bg-amber-100/10",
          )}
        >
          {!disabled && !selected && <span className="clash-choice-ring absolute inset-0 rounded-full border border-amber-100/65" />}
          {selected && <span className="absolute inset-0 rounded-full bg-amber-100/20 blur-sm" />}
          <ClashMoveBadge move={item.id} size="sm" selected={selected} />
        </button>
        );
      })}
    </div>
  );
}

function ClashMoveBadge({
  move,
  size = "sm",
  selected = false,
}: {
  move: ClashMove;
  size?: "sm" | "md";
  selected?: boolean;
}) {
  const tone = {
    charge: "border-amber-100/80 bg-[radial-gradient(circle_at_50%_42%,rgba(253,230,138,0.88),rgba(180,83,9,0.88)_58%,rgba(24,20,14,0.94))] text-stone-950 shadow-[0_0_18px_rgba(251,191,36,0.58)]",
    sidestep: "border-sky-100/80 bg-[radial-gradient(circle_at_50%_42%,rgba(125,211,252,0.88),rgba(2,132,199,0.84)_58%,rgba(8,18,30,0.95))] text-sky-50 shadow-[0_0_18px_rgba(56,189,248,0.5)]",
    counter: "border-red-100/80 bg-[radial-gradient(circle_at_50%_42%,rgba(252,165,165,0.9),rgba(185,28,28,0.86)_58%,rgba(28,10,10,0.96))] text-red-50 shadow-[0_0_18px_rgba(248,113,113,0.5)]",
  }[move];
  const iconClass = size === "md" ? "h-10 w-10" : "h-8 w-8";

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border bg-black",
        iconClass,
        tone,
        selected && "ring-1 ring-white/70",
      )}
    >
      <img src={CLASH_ICON_SRC[move]} alt="" className="absolute inset-0 h-full w-full rounded-full object-cover" />
      <span className="absolute inset-0 rounded-full border border-white/28 shadow-[inset_0_0_10px_rgba(0,0,0,0.45)]" />
      <span className="sr-only">{clashMoveLabel(move)}</span>
    </span>
  );
}

const CLASH_ICON_SRC: Record<ClashMove, string> = {
  charge: "/clash-icons/charge.png",
  sidestep: "/clash-icons/sidestep.png",
  counter: "/clash-icons/counter.png",
};

function ClashMoveGlyph({ move }: { move: ClashMove }) {
  if (move === "charge") {
    return (
      <svg viewBox="0 0 32 32" className="relative h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]" aria-hidden="true">
        <path d="M5 20h11l-3 5 13-12H15l3-6L5 20Z" fill="currentColor" />
      </svg>
    );
  }

  if (move === "sidestep") {
    return (
      <svg viewBox="0 0 32 32" className="relative h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]" aria-hidden="true">
        <path d="M8 11c5-5 13-4 16 1l-3 1 7 4 1-8-3 2C22 4 11 4 5 10l3 1Z" fill="currentColor" />
        <path d="M24 21c-5 5-13 4-16-1l3-1-7-4-1 8 3-2c4 7 15 7 21 1l-3-1Z" fill="currentColor" opacity="0.82" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className="relative h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]" aria-hidden="true">
      <path d="M7 22c6-1 10-4 12-10l-4 1 7-8 3 10-3-2c-3 8-8 12-15 13v-4Z" fill="currentColor" />
      <path d="M8 8l16 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.86" />
    </svg>
  );
}

function TacticButton({
  title,
  label,
  cost,
  reason,
  active,
  ready,
  onClick,
}: {
  title: string;
  label: string;
  cost: string;
  reason: string;
  active: boolean;
  ready: boolean;
  onClick: () => void;
}) {
  const status = active ? "ARMED" : ready ? "READY" : reason;

  return (
    <button
      type="button"
      disabled={!ready}
      title={ready ? label : reason}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-md border px-2 py-1 text-left transition disabled:cursor-not-allowed",
        ready
          ? active
            ? "border-sky-100 bg-sky-300 text-stone-950 shadow-[0_0_24px_rgba(125,211,252,0.48)]"
            : "skill-ready-pulse border-emerald-100 bg-emerald-300 text-stone-950 shadow-[0_0_26px_rgba(110,231,183,0.45)] hover:bg-emerald-200"
          : "border-amber-200/15 bg-black/25 text-amber-100/35",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] font-black uppercase leading-none">{title}</span>
        <span className="rounded border border-current px-1 py-0.5 text-[8px] font-black leading-none">{cost}</span>
      </div>
      <div className="mt-0.5 line-clamp-1 text-[10px] font-black leading-tight">{label}</div>
      <div className="mt-0.5 line-clamp-1 text-[8px] font-black uppercase leading-none opacity-80">{status}</div>
    </button>
  );
}

function DirectionPad({
  values,
  maxSelections,
  onToggle,
  disabled,
}: {
  values: Direction[];
  maxSelections: number;
  onToggle: (value: Direction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto grid w-full max-w-52 grid-cols-3 gap-1">
      <span />
      <DirectionButton direction="high" values={values} onToggle={onToggle} icon={<ArrowUp className="h-4 w-4" />} disabled={disabled} maxSelections={maxSelections} wide />
      <span />
      <DirectionButton direction="left" values={values} onToggle={onToggle} icon={<ArrowLeft className="h-4 w-4" />} disabled={disabled} maxSelections={maxSelections} />
      <DirectionButton direction="center" values={values} onToggle={onToggle} icon={<Crosshair className="h-4 w-4" />} disabled={disabled} maxSelections={maxSelections} />
      <DirectionButton direction="right" values={values} onToggle={onToggle} icon={<ArrowRight className="h-4 w-4" />} disabled={disabled} maxSelections={maxSelections} />
      <span />
      <DirectionButton direction="low" values={values} onToggle={onToggle} icon={<ArrowDown className="h-4 w-4" />} disabled={disabled} maxSelections={maxSelections} wide />
      <span />
    </div>
  );
}

function DirectionButton({
  direction,
  values,
  onToggle,
  icon,
  disabled,
  maxSelections,
  wide,
}: {
  direction: Direction;
  values: Direction[];
  onToggle: (value: Direction) => void;
  icon: ReactNode;
  disabled?: boolean;
  maxSelections: number;
  wide?: boolean;
}) {
  const selectedIndex = values.indexOf(direction);
  const selected = selectedIndex >= 0;

  return (
    <button
      type="button"
      title={maxSelections > 1 ? `${directionLabel(direction)} (${values.length}/${maxSelections})` : directionLabel(direction)}
      disabled={disabled}
      onClick={() => onToggle(direction)}
      className={cn(
        "relative flex h-9 items-center justify-center gap-1 rounded-full border px-1 text-[9px] font-black uppercase leading-none transition disabled:cursor-not-allowed disabled:opacity-40",
        wide && "min-w-16",
        selected
          ? "command-confirm-pulse scale-[1.08] border-amber-100 bg-amber-300 text-stone-950 shadow-[0_0_22px_rgba(251,191,36,0.65)] brightness-125"
          : "border-amber-200/20 bg-black/25 text-amber-100 hover:bg-amber-100/10",
      )}
    >
      {selected && <span className="absolute inset-0 rounded-full border border-amber-100/70 animate-ping" />}
      {selected && maxSelections > 1 && (
        <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-stone-950 text-[9px] text-amber-100">
          {selectedIndex + 1}
        </span>
      )}
      {icon}
      <span>{shortDirectionLabel(direction)}</span>
    </button>
  );
}

function LaneRevealPanel({ reveal, now }: { reveal: LaneReveal | null; now: number }) {
  if (!reveal || now > reveal.expiresAt) {
    return null;
  }

  const resultLabel = laneResultLabel(reveal.result);
  const resultTone =
    reveal.result === "hit"
      ? "border-red-200/55 bg-red-600/20 text-red-50 shadow-[0_0_20px_rgba(248,113,113,0.4)]"
      : "border-sky-200/55 bg-sky-500/20 text-sky-50 shadow-[0_0_20px_rgba(125,211,252,0.35)]";

  return (
    <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 rounded-md border border-amber-200/15 bg-black/35 px-2 py-1.5 animate-in fade-in zoom-in-95 duration-300">
      <RevealLaneSide label="Player" directions={reveal.playerDirections} active={reveal.attacker === "player"} />
      <div className={cn("min-w-16 rounded border px-2 py-1 text-center", resultTone)}>
        <div className="text-sm font-black uppercase leading-none">{resultLabel}</div>
        <div className="mt-0.5 text-[9px] font-black uppercase opacity-80">{reveal.damage > 0 ? `-${reveal.damage} HP` : "No damage"}</div>
      </div>
      <RevealLaneSide label="AI" directions={reveal.aiDirections} active={reveal.attacker === "ai"} align="right" />
    </div>
  );
}

function RevealLaneSide({
  label,
  directions,
  active,
  align = "left",
}: {
  label: string;
  directions: Direction[];
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-100/45">{active ? `${label} Attack` : `${label} Evade`}</div>
      <div className={cn("truncate text-[10px] font-black uppercase text-amber-50", active && "text-red-100")}>
        {directions.length ? formatDirectionList(directions) : "-"}
      </div>
    </div>
  );
}

function playerLaneCount(battle: BattleState, useActive: boolean, useTriple: boolean): number {
  if (battle.pending?.attacker !== "player") {
    return 1;
  }

  if (useTriple) {
    return 3;
  }

  if (useActive || battle.pending.playerTieActive) {
    const heroId = battle.player.heroId;
    if (heroId === "blade_hamster" || heroId === "flame_cat") {
      return 2;
    }
  }

  return 1;
}

function resolvePlayerLaneSelections(
  battle: BattleState,
  lanes: Direction[],
  useActive: boolean,
  useTriple: boolean,
): PlayerLaneSelection {
  const laneCount = playerLaneCount(battle, useActive, useTriple);
  const needsAttack = battle.pending?.attacker === "player";
  const needsDefense = battle.pending?.attacker === "ai";
  const selected = lanes.slice(0, laneCount);
  const resolvedAttack = selected[0] ?? randomDirection();
  const resolvedSecond = selected[1] ?? randomDifferentDirection([resolvedAttack]);
  const resolvedThird = selected[2] ?? randomDifferentDirection([resolvedAttack, resolvedSecond]);
  const resolvedDefense = selected[0] ?? randomDirection();

  return {
    attack: resolvedAttack,
    second: resolvedSecond,
    third: resolvedThird,
    defense: resolvedDefense,
    autoFilled:
      (needsAttack && selected.length < laneCount) ||
      (needsDefense && selected.length < 1),
  };
}

function playerLaneLog(label: string, attacker: FighterSide | null, selections: PlayerLaneSelection, laneCount: number): string {
  if (attacker === "player") {
    return `${label} lanes: ${formatDirectionList([selections.attack, selections.second, selections.third].slice(0, laneCount))}.`;
  }

  if (attacker === "ai") {
    return `${label} evade lane: ${directionLabel(selections.defense)}.`;
  }

  return `${label} lanes: ${directionLabel(selections.attack)}.`;
}

function aiLaneLog(attacker: FighterSide | null, decision: AiDecision): string {
  if (attacker === "ai") {
    return `AI lanes: ${formatDirectionList([decision.attackDirection, decision.secondAttackDirection, decision.thirdAttackDirection])}.`;
  }

  if (attacker === "player") {
    return `AI evade lane: ${directionLabel(decision.defenseDirection)}.`;
  }

  return `AI lanes: ${directionLabel(decision.attackDirection)}.`;
}

function createStatPulse(previous: BattleState, result: ReturnType<typeof resolveRound>): Record<FighterSide, StatPulse | null> {
  return {
    player: createFighterStatPulse(previous.player, result.player),
    ai: createFighterStatPulse(previous.ai, result.ai),
  };
}

function createFighterStatPulse(before: FighterState, after: FighterState): StatPulse | null {
  const pulse = {
    hpDelta: after.hp - before.hp,
    energyDelta: after.energy - before.energy,
    comboDelta: after.combo - before.combo,
    evadeDelta: after.evade - before.evade,
    expiresAt: Date.now() + 2600,
  };

  return pulse.hpDelta || pulse.energyDelta || pulse.comboDelta || pulse.evadeDelta ? pulse : null;
}

function createLaneReveal(
  previous: BattleState,
  result: ReturnType<typeof resolveRound>,
  playerSelections?: PlayerLaneSelection,
): LaneReveal | null {
  const decision = previous.pending?.aiDecision;

  if (!decision || !result.attacker) {
    return null;
  }

  const playerDirections = revealDirectionsForSide("player", previous, result, playerSelections);
  const aiDirections = revealDirectionsForSide("ai", previous, result, playerSelections);
  const resultType = result.isHit ? "hit" : "miss";

  return {
    round: previous.round,
    attacker: result.attacker,
    playerDirections,
    aiDirections,
    result: resultType,
    damage: result.damage,
    expiresAt: Date.now() + 3000,
  };
}

function revealDirectionsForSide(
  side: FighterSide,
  previous: BattleState,
  result: ReturnType<typeof resolveRound>,
  playerSelections?: PlayerLaneSelection,
): Direction[] {
  const decision = previous.pending?.aiDecision;

  if (!decision) {
    return [];
  }

  if (side === "player") {
    if (!playerSelections) {
      return [];
    }

    if (result.attacker === "player") {
      if (result.tripleStrike.usedBy === "player") {
        return result.tripleStrike.lanes;
      }

      if (result.activeSkill.playerTriggered || previous.pending?.playerTieActive) {
        return uniqueRevealDirections([playerSelections.attack, playerSelections.second]);
      }

      return [playerSelections.attack];
    }

    return [playerSelections.defense];
  }

  if (result.attacker === "ai") {
    if (result.tripleStrike.usedBy === "ai") {
      return result.tripleStrike.lanes;
    }

    if (result.activeSkill.aiTriggered) {
      return uniqueRevealDirections([decision.attackDirection, decision.secondAttackDirection]);
    }

    return [decision.attackDirection];
  }

  return [decision.defenseDirection];
}

function createRoundBanner(previous: BattleState, result: ReturnType<typeof resolveRound>): RoundBanner {
  const counter = result.logs.some((log) => log.includes("Eight-Cut Counter reads"));
  const active = result.activeSkill.playerTriggered || result.activeSkill.aiTriggered;
  const triple = Boolean(result.tripleStrike.usedBy);
  const winner = result.player.hp <= 0 ? "AI" : result.ai.hp <= 0 ? "Player" : null;
  const defender = result.attacker === "player" ? "AI" : result.attacker === "ai" ? "Player" : null;

  let title = "NO DAMAGE";
  if (winner) {
    title = "K.O.";
  } else if (triple) {
    title = "TRIPLE STRIKE!";
  } else if (counter) {
    title = "COUNTER!";
  } else if (active) {
    title = "ACTIVE SKILL!";
  } else if (result.isHit) {
    title = "HIT!";
  } else if (result.attacker) {
    title = "MISS!";
  }

  const detail = winner
    ? `${winner} wins the duel.`
    : result.attacker
      ? result.isHit
        ? `${sideLabel(result.attacker)} attacks. ${defender} takes ${result.damage} HP.`
        : `${defender} evades. The attack misses.`
      : "The clash remains tied.";
  const delta = formatBattleDelta(previous.player, result.player, previous.ai, result.ai);
  const tone = winner === "Player" || result.attacker === "player" ? "player" : winner === "AI" || result.attacker === "ai" ? "ai" : "system";

  return { title, detail, delta, tone };
}

function formatBattleDelta(beforePlayer: FighterState, afterPlayer: FighterState, beforeAi: FighterState, afterAi: FighterState): string {
  const player = formatFighterDelta("Player", beforePlayer, afterPlayer);
  const ai = formatFighterDelta("AI", beforeAi, afterAi);
  const parts = [player, ai].filter(Boolean);
  return parts.length ? parts.join(" | ") : "No HP / EN change";
}

function formatFighterDelta(label: string, before: FighterState, after: FighterState): string {
  const hp = after.hp - before.hp;
  const en = after.energy - before.energy;
  const changes = [];

  if (hp !== 0) {
    changes.push(`${formatSigned(hp)} HP`);
  }

  if (en !== 0) {
    changes.push(`${formatSigned(en)} EN`);
  }

  return changes.length ? `${label} ${changes.join(", ")}` : "";
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function laneResultLabel(result: LaneReveal["result"]): string {
  if (result === "hit") {
    return "HIT!";
  }

  return "MISS!";
}

function uniqueRevealDirections(directions: Direction[]): Direction[] {
  return directions.filter((direction, index) => directions.indexOf(direction) === index);
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomClashMove(): ClashMove {
  return randomItem(CLASH_MOVES).id;
}

function clashMoveLabel(move: ClashMove): string {
  return CLASH_MOVES.find((item) => item.id === move)?.label ?? move.toUpperCase();
}

function randomDirection(): Direction {
  return randomItem(DIRECTIONS).id;
}

function randomDifferentDirection(excluded: Direction[]): Direction {
  const options = DIRECTIONS.map((direction) => direction.id).filter((direction) => !excluded.includes(direction));
  return randomItem(options.length ? options : DIRECTIONS.map((direction) => direction.id));
}

function sideLabel(side: FighterSide | null): string {
  return side === "player" ? "Player" : side === "ai" ? "AI" : "No one";
}

function statusLabel(status: BattleStatus, winner: string | null): string {
  if (winner) {
    return `${winner} wins`;
  }

  if (status === "attack") {
    return "Attack";
  }

  if (status === "defend") {
    return "Evade";
  }

  if (status === "game_over") {
    return "Finish";
  }

  return "Tie";
}

function fighterStance(side: FighterSide, status: BattleStatus): FighterStance {
  if (status === "game_over" || status === "tie") {
    return "tie";
  }

  if (side === "player") {
    return status === "attack" ? "attack" : "defend";
  }

  return status === "attack" ? "defend" : "attack";
}

function formatDirectionList(directions: Direction[]): string {
  return directions.map(directionLabel).join(" / ");
}

function directionLabel(direction: Direction): string {
  return DIRECTIONS.find((item) => item.id === direction)?.label ?? direction.toUpperCase();
}

function shortDirectionLabel(direction: Direction): string {
  return DIRECTIONS.find((item) => item.id === direction)?.shortLabel ?? direction.toUpperCase();
}
