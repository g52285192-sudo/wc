/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Rocket, Trophy, RefreshCw, AlertTriangle, Info } from 'lucide-react';

// --- Types & Constants ---

type GameStatus = 'START' | 'PLAYING' | 'GAMEOVER' | 'WIN';

interface Point {
  x: number;
  y: number;
}

interface Entity extends Point {
  id: string;
}

interface Enemy extends Entity {
  targetX: number;
  targetY: number;
  speed: number;
  progress: number; // 0 to 1
}

interface Interceptor extends Entity {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  progress: number;
}

interface Explosion extends Entity {
  radius: number;
  maxRadius: number;
  growthRate: number;
  phase: 'GROWING' | 'SHRINKING';
}

interface Turret extends Point {
  id: number;
  ammo: number;
  maxAmmo: number;
  isDestroyed: boolean;
}

interface City extends Point {
  id: number;
  isDestroyed: boolean;
}

const WIN_SCORE = 1000;
const ENEMY_POINTS = 20;
const EXPLOSION_MAX_RADIUS = 40;
const EXPLOSION_GROWTH = 1.5;
const INTERCEPTOR_SPEED = 0.02;
const ENEMY_SPEED_BASE = 0.001;

// --- Translations ---

const TRANSLATIONS = {
  zh: {
    title: "2260星际大战防御塔",
    start: "开始游戏",
    restart: "再玩一次",
    gameOver: "任务失败",
    win: "任务成功",
    score: "得分",
    ammo: "弹药",
    objective: "保卫未来城市和炮台",
    controls: "点击屏幕发射拦截导弹",
    winCondition: "达到 1000 分获胜",
    loseCondition: "三座炮台全部被毁则失败",
    remainingAmmo: "剩余弹药奖励",
  },
  en: {
    title: "2260 Star Wars Defense",
    start: "Start Game",
    restart: "Play Again",
    gameOver: "Mission Failed",
    win: "Mission Success",
    score: "Score",
    ammo: "Ammo",
    objective: "Defend future cities and turrets",
    controls: "Click screen to fire interceptors",
    winCondition: "Reach 1000 points to win",
    loseCondition: "Game over if all 3 turrets are destroyed",
    remainingAmmo: "Ammo Bonus",
  }
};

export default function App() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const t = TRANSLATIONS[lang];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<GameStatus>('START');
  const [score, setScore] = useState(0);
  
  // Game State Refs (to avoid re-renders during loop)
  const gameState = useRef({
    enemies: [] as Enemy[],
    interceptors: [] as Interceptor[],
    explosions: [] as Explosion[],
    turrets: [] as Turret[],
    cities: [] as City[],
    lastEnemySpawn: 0,
    spawnRate: 2000,
    dimensions: { width: 0, height: 0 },
    score: 0,
  });

  // --- Initialization ---

  const initGame = useCallback(() => {
    const { width, height } = gameState.current.dimensions;
    
    // 3 Turrets
    gameState.current.turrets = [
      { id: 0, x: width * 0.1, y: height - 40, ammo: 20, maxAmmo: 20, isDestroyed: false },
      { id: 1, x: width * 0.5, y: height - 40, ammo: 40, maxAmmo: 40, isDestroyed: false },
      { id: 2, x: width * 0.9, y: height - 40, ammo: 20, maxAmmo: 20, isDestroyed: false },
    ];

    // 6 Cities
    gameState.current.cities = [
      { id: 0, x: width * 0.22, y: height - 30, isDestroyed: false },
      { id: 1, x: width * 0.32, y: height - 30, isDestroyed: false },
      { id: 2, x: width * 0.42, y: height - 30, isDestroyed: false },
      { id: 3, x: width * 0.58, y: height - 30, isDestroyed: false },
      { id: 4, x: width * 0.68, y: height - 30, isDestroyed: false },
      { id: 5, x: width * 0.78, y: height - 30, isDestroyed: false },
    ];

    gameState.current.enemies = [];
    gameState.current.interceptors = [];
    gameState.current.explosions = [];
    gameState.current.score = 0;
    setScore(0);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        gameState.current.dimensions = { width: clientWidth, height: clientHeight };
        if (status === 'START') initGame();
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [initGame, status]);

  // --- Game Loop ---

  useEffect(() => {
    if (status !== 'PLAYING') return;

    let animationFrameId: number;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const loop = (time: number) => {
      update(time);
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    const update = (time: number) => {
      const { width, height } = gameState.current.dimensions;
      const state = gameState.current;

      // Spawn Enemies
      if (time - state.lastEnemySpawn > state.spawnRate) {
        const targets = [...state.cities, ...state.turrets].filter(t => !t.isDestroyed);
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          state.enemies.push({
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * width,
            y: 0,
            targetX: target.x,
            targetY: target.y,
            speed: ENEMY_SPEED_BASE + Math.random() * 0.001 + (state.score / 5000) * 0.001,
            progress: 0,
          });
          state.lastEnemySpawn = time;
          state.spawnRate = Math.max(500, 2000 - (state.score / 100) * 100);
        }
      }

      // Update Enemies
      state.enemies = state.enemies.filter(enemy => {
        enemy.progress += enemy.speed;
        enemy.x = enemy.x + (enemy.targetX - enemy.x) * enemy.speed / (1 - enemy.progress + 0.001); // Simple linear interpolation
        // Better linear path:
        // Actually, let's use a more stable linear interpolation:
        // startX + (targetX - startX) * progress
        // But we didn't store startX. Let's fix that or just use the progress.
        // For now, let's stick to a simpler approach:
        const dx = enemy.targetX - enemy.x;
        const dy = enemy.targetY - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          // Hit target
          const cityHit = state.cities.find(c => Math.abs(c.x - enemy.targetX) < 5 && Math.abs(c.y - enemy.targetY) < 5);
          if (cityHit) cityHit.isDestroyed = true;
          const turretHit = state.turrets.find(t => Math.abs(t.x - enemy.targetX) < 5 && Math.abs(t.y - enemy.targetY) < 5);
          if (turretHit) turretHit.isDestroyed = true;

          // Check Game Over
          if (state.turrets.every(t => t.isDestroyed)) {
            setStatus('GAMEOVER');
          }
          return false;
        }
        
        const moveX = (dx / dist) * 2;
        const moveY = (dy / dist) * 2;
        enemy.x += moveX;
        enemy.y += moveY;

        return enemy.y < height;
      });

      // Update Interceptors
      state.interceptors = state.interceptors.filter(inter => {
        const dx = inter.targetX - inter.x;
        const dy = inter.targetY - inter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 5) {
          // Create explosion
          state.explosions.push({
            id: Math.random().toString(36).substr(2, 9),
            x: inter.targetX,
            y: inter.targetY,
            radius: 2,
            maxRadius: EXPLOSION_MAX_RADIUS,
            growthRate: EXPLOSION_GROWTH,
            phase: 'GROWING'
          });
          return false;
        }

        const moveX = (dx / dist) * 8;
        const moveY = (dy / dist) * 8;
        inter.x += moveX;
        inter.y += moveY;
        return true;
      });

      // Update Explosions
      state.explosions = state.explosions.filter(exp => {
        if (exp.phase === 'GROWING') {
          exp.radius += exp.growthRate;
          if (exp.radius >= exp.maxRadius) exp.phase = 'SHRINKING';
        } else {
          exp.radius -= exp.growthRate * 0.5;
        }

        // Collision with enemies
        state.enemies = state.enemies.filter(enemy => {
          const dx = enemy.x - exp.x;
          const dy = enemy.y - exp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < exp.radius) {
            state.score += ENEMY_POINTS;
            setScore(state.score);
            if (state.score >= WIN_SCORE) {
              setStatus('WIN');
            }
            return false;
          }
          return true;
        });

        return exp.radius > 0;
      });
    };

    const draw = () => {
      const { width, height } = gameState.current.dimensions;
      const state = gameState.current;
      ctx.clearRect(0, 0, width, height);

      // Background - Dark Space
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, width, height);

      // Draw Cities
      state.cities.forEach(city => {
        if (city.isDestroyed) return;
        ctx.fillStyle = '#4ade80'; // Emerald/Green
        ctx.beginPath();
        ctx.rect(city.x - 15, city.y - 10, 30, 10);
        ctx.rect(city.x - 10, city.y - 20, 20, 10);
        ctx.fill();
      });

      // Draw Turrets
      state.turrets.forEach(turret => {
        if (turret.isDestroyed) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(turret.x, turret.y, 5, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        ctx.fillStyle = '#3b82f6'; // Blue
        ctx.beginPath();
        ctx.moveTo(turret.x - 20, turret.y);
        ctx.lineTo(turret.x + 20, turret.y);
        ctx.lineTo(turret.x, turret.y - 25);
        ctx.closePath();
        ctx.fill();

        // Ammo count text
        ctx.fillStyle = 'white';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(turret.ammo.toString(), turret.x, turret.y + 15);
      });

      // Draw Enemies
      state.enemies.forEach(enemy => {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        // Draw a tail
        const dx = enemy.targetX - enemy.x;
        const dy = enemy.targetY - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        ctx.lineTo(enemy.x - (dx/dist)*20, enemy.y - (dy/dist)*20);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Interceptors
      state.interceptors.forEach(inter => {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(inter.x, inter.y);
        const dx = inter.targetX - inter.x;
        const dy = inter.targetY - inter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        ctx.lineTo(inter.x - (dx/dist)*15, inter.y - (dy/dist)*15);
        ctx.stroke();

        // Target X
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(inter.targetX - 5, inter.targetY - 5);
        ctx.lineTo(inter.targetX + 5, inter.targetY + 5);
        ctx.moveTo(inter.targetX + 5, inter.targetY - 5);
        ctx.lineTo(inter.targetX - 5, inter.targetY + 5);
        ctx.stroke();
      });

      // Draw Explosions
      state.explosions.forEach(exp => {
        const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(0.4, '#fbbf24'); // Yellow
        gradient.addColorStop(0.8, '#f97316'); // Orange
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [status]);

  // --- Interaction ---

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== 'PLAYING') return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Find closest turret with ammo
    const state = gameState.current;
    let bestTurret: Turret | null = null;
    let minDist = Infinity;

    state.turrets.forEach(t => {
      if (t.isDestroyed || t.ammo <= 0) return;
      const d = Math.abs(t.x - x);
      if (d < minDist) {
        minDist = d;
        bestTurret = t;
      }
    });

    if (bestTurret) {
      (bestTurret as Turret).ammo -= 1;
      state.interceptors.push({
        id: Math.random().toString(36).substr(2, 9),
        x: (bestTurret as Turret).x,
        y: (bestTurret as Turret).y,
        startX: (bestTurret as Turret).x,
        startY: (bestTurret as Turret).y,
        targetX: x,
        targetY: y,
        speed: INTERCEPTOR_SPEED,
        progress: 0,
      });
    }
  };

  const startGame = () => {
    initGame();
    setStatus('PLAYING');
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden font-sans text-white select-none"
    >
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        className="block w-full h-full cursor-crosshair"
      />

      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        <div className="bg-black/50 backdrop-blur-md border border-white/10 p-3 rounded-xl flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider opacity-50 font-mono">{t.score}</span>
            <span className="text-2xl font-bold tabular-nums">{score}</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider opacity-50 font-mono">Target</span>
            <span className="text-2xl font-bold tabular-nums text-emerald-400">{WIN_SCORE}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="pointer-events-auto bg-black/50 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-xs hover:bg-white/10 transition-colors"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </div>

      {/* Ammo Indicators (Visual) */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-12 pointer-events-none opacity-30">
        {gameState.current.turrets.map((t, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-1 h-12 bg-white/20 rounded-full overflow-hidden flex flex-col justify-end">
              <div 
                className="w-full bg-blue-500 transition-all duration-300" 
                style={{ height: `${(t.ammo / t.maxAmmo) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {status === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-center justify-center items-center z-50 p-6"
          >
            <div className="max-w-md w-full text-center space-y-8">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="space-y-2"
              >
                <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic">
                  {t.title}
                </h1>
                <p className="text-emerald-400 font-mono text-sm tracking-widest uppercase">Year 2260 Galactic Defense</p>
              </motion.div>

              <div className="grid grid-cols-1 gap-4 text-left bg-white/5 p-6 rounded-2xl border border-white/10">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
                  <p className="text-sm opacity-80">{t.objective}</p>
                </div>
                <div className="flex gap-3">
                  <Target className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-sm opacity-80">{t.controls}</p>
                </div>
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm opacity-80">{t.winCondition}</p>
                    <p className="text-sm opacity-80">{t.loseCondition}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={startGame}
                className="group relative w-full py-4 bg-white text-black font-bold rounded-xl overflow-hidden transition-transform active:scale-95"
              >
                <div className="absolute inset-0 bg-emerald-400 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Rocket className="w-5 h-5" />
                  {t.start}
                </span>
              </button>
            </div>
          </motion.div>
        )}

        {(status === 'GAMEOVER' || status === 'WIN') && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-50 p-6"
          >
            <div className="max-w-md w-full text-center space-y-8">
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="space-y-4"
              >
                {status === 'WIN' ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Trophy className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h2 className="text-5xl font-black text-emerald-400 uppercase italic">{t.win}</h2>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-10 h-10 text-red-400" />
                    </div>
                    <h2 className="text-5xl font-black text-red-400 uppercase italic">{t.gameOver}</h2>
                  </div>
                )}
                
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <p className="text-sm uppercase tracking-widest opacity-50 mb-1">{t.score}</p>
                  <p className="text-6xl font-black tabular-nums">{score}</p>
                </div>
              </motion.div>

              <button
                onClick={startGame}
                className="group relative w-full py-4 bg-white text-black font-bold rounded-xl overflow-hidden transition-transform active:scale-95"
              >
                <div className="absolute inset-0 bg-blue-400 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  {t.restart}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.2em] opacity-20 pointer-events-none md:hidden">
        Tap to fire
      </div>
    </div>
  );
}
