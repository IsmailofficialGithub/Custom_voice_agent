'use client';

import React, { useEffect, useRef } from 'react';

import { VoiceState } from '../../lib/voice-client';

export type OrbTheme = 'emerald' | 'aurora';
export type OrbState = VoiceState;

interface AiOrbProps {
  audioLevel?: number; // 0 - 100
  state?: OrbState;
  theme?: OrbTheme;
  size?: number; // default 280
  onClick?: () => void;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
  angle: number;
  distance: number;
  orbitSpeed: number;
}

export function AiOrb({
  audioLevel = 0,
  state = 'idle',
  theme = 'emerald',
  size = 280,
  onClick,
  className = '',
}: AiOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioLevelRef = useRef(audioLevel);
  const stateRef = useRef(state);
  const themeRef = useRef(theme);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    // Initialize ambient particles
    const particleCount = 28;
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: 0,
        y: 0,
        radius: Math.random() * 1.6 + 0.6,
        alpha: Math.random() * 0.7 + 0.2,
        speed: Math.random() * 0.02 + 0.005,
        angle: Math.random() * Math.PI * 2,
        distance: Math.random() * (size * 0.45) + size * 0.2,
        orbitSpeed: (Math.random() - 0.5) * 0.015,
      });
    }

    const render = () => {
      time += 0.025;
      const currentLevel = audioLevelRef.current;
      const currentState = stateRef.current;
      const currentTheme = themeRef.current;

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const width = size;
      const height = size;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = size * 0.29;

      // Dynamic reactivity calculations
      let scale = 1;
      let energy = 0.2;
      let rotSpeed = 1;

      if (currentState === 'user_speaking') {
        energy = 0.8 + (currentLevel / 100) * 1.2;
        scale = 1 + (currentLevel / 100) * 0.16 + Math.sin(time * 8) * 0.03;
        rotSpeed = 2.2;
      } else if (currentState === 'speaking') {
        energy = 0.9 + Math.sin(time * 5) * 0.3;
        scale = 1.04 + Math.sin(time * 6) * 0.04;
        rotSpeed = 1.8;
      } else if (currentState === 'thinking' || currentState === 'transcribing' || currentState === 'silence_detected') {
        energy = 0.7;
        scale = 0.98 + Math.sin(time * 4) * 0.02;
        rotSpeed = 3.5;
      } else {
        // Idle / listening
        energy = 0.35;
        scale = 1 + Math.sin(time * 1.5) * 0.02;
        rotSpeed = 0.9;
      }

      const activeRadius = baseRadius * scale;

      // Color Palettes
      const isEmerald = currentTheme === 'emerald';
      const cPrimary = isEmerald ? 'rgba(16, 185, 129, ' : 'rgba(168, 85, 247, ';
      const cSecondary = isEmerald ? 'rgba(52, 211, 153, ' : 'rgba(236, 72, 153, ';
      const cAccent = isEmerald ? 'rgba(110, 231, 183, ' : 'rgba(56, 189, 248, ';
      const cDeep = isEmerald ? 'rgba(4, 120, 87, ' : 'rgba(126, 34, 206, ';
      const cHighlight = isEmerald ? 'rgba(209, 250, 229, ' : 'rgba(254, 240, 138, ';

      // 1. Outer Deep Atmospheric Glow
      const glowGrad = ctx.createRadialGradient(cx, cy, activeRadius * 0.3, cx, cy, activeRadius * 2.1);
      glowGrad.addColorStop(0, `${cPrimary}${0.28 * energy})`);
      glowGrad.addColorStop(0.5, `${cSecondary}${0.12 * energy})`);
      glowGrad.addColorStop(0.85, `${cDeep}${0.04 * energy})`);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius * 2.1, 0, Math.PI * 2);
      ctx.fill();

      // 2. Orbiting Stardust Particles
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.angle += p.orbitSpeed * rotSpeed;
        const pDist = p.distance * (1 + Math.sin(time * 2 + i) * 0.08 * energy);
        const px = cx + Math.cos(p.angle) * pDist;
        const py = cy + Math.sin(p.angle) * pDist;

        ctx.fillStyle = i % 2 === 0 ? `${cAccent}${p.alpha * energy})` : `${cHighlight}${p.alpha * energy * 0.8})`;
        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 3. Clip to Sphere Volume for Inner Caustics and Fluid
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius, 0, Math.PI * 2);
      ctx.clip();

      // Sphere base volume gradient
      const sphereBg = ctx.createRadialGradient(
        cx - activeRadius * 0.25,
        cy - activeRadius * 0.25,
        activeRadius * 0.1,
        cx,
        cy,
        activeRadius
      );
      sphereBg.addColorStop(0, isEmerald ? '#042f2e' : '#2e1065');
      sphereBg.addColorStop(0.4, isEmerald ? '#064e3b' : '#3b0764');
      sphereBg.addColorStop(0.75, isEmerald ? '#022c22' : '#1e1b4b');
      sphereBg.addColorStop(1, '#050505');

      ctx.fillStyle = sphereBg;
      ctx.fillRect(cx - activeRadius, cy - activeRadius, activeRadius * 2, activeRadius * 2);

      // Swirling internal caustic fluid ribbons
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const ribbonCount = 5;
      for (let r = 0; r < ribbonCount; r++) {
        const rAngle = time * (0.8 + r * 0.2) * rotSpeed + (r * Math.PI) / 2.5;
        const waveAmp = (activeRadius * 0.22 + (currentLevel / 100) * 14) * (0.7 + r * 0.15);
        const waveFreq = 2 + r;

        ctx.beginPath();
        const steps = 60;
        for (let s = 0; s <= steps; s++) {
          const t = (s / steps) * Math.PI * 2;
          // Elliptical ribbon projection tilted in 3D
          const rx = Math.cos(t) * (activeRadius * 0.78);
          const ry = Math.sin(t) * (activeRadius * 0.45);

          // Dynamic wave modulation
          const wave = Math.sin(t * waveFreq + rAngle * 1.5) * waveAmp;
          const tiltAngle = (r * 0.6) + time * 0.2;

          // 2D rotation of ellipse
          const rotX = rx * Math.cos(tiltAngle) - (ry + wave) * Math.sin(tiltAngle);
          const rotY = rx * Math.sin(tiltAngle) + (ry + wave) * Math.cos(tiltAngle);

          const px = cx + rotX;
          const py = cy + rotY;

          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();

        const ribbonGrad = ctx.createLinearGradient(
          cx - activeRadius,
          cy - activeRadius,
          cx + activeRadius,
          cy + activeRadius
        );
        const alpha = (0.28 + (r % 2) * 0.2) * energy;
        ribbonGrad.addColorStop(0, `${cPrimary}${alpha * 0.4})`);
        ribbonGrad.addColorStop(0.5, `${cSecondary}${alpha})`);
        ribbonGrad.addColorStop(1, `${cAccent}${alpha * 0.8})`);

        ctx.strokeStyle = ribbonGrad;
        ctx.lineWidth = 2.5 + (r % 3) * 1.5;
        ctx.stroke();

        if (r === 1 || r === 3) {
          ctx.fillStyle = `${cHighlight}${alpha * 0.25})`;
          ctx.fill();
        }
      }

      // Inner Core Specular Glow
      const coreGrad = ctx.createRadialGradient(
        cx - activeRadius * 0.15,
        cy - activeRadius * 0.15,
        2,
        cx,
        cy,
        activeRadius * 0.7
      );
      coreGrad.addColorStop(0, `${cHighlight}${0.85 * energy})`);
      coreGrad.addColorStop(0.35, `${cAccent}${0.55 * energy})`);
      coreGrad.addColorStop(0.7, `${cPrimary}${0.25 * energy})`);
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = coreGrad;
      ctx.fillRect(cx - activeRadius, cy - activeRadius, activeRadius * 2, activeRadius * 2);

      // Glass specular reflection highlight (curved top sheen)
      const sheenGrad = ctx.createRadialGradient(
        cx - activeRadius * 0.35,
        cy - activeRadius * 0.4,
        1,
        cx - activeRadius * 0.35,
        cy - activeRadius * 0.4,
        activeRadius * 0.5
      );
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = sheenGrad;
      ctx.beginPath();
      ctx.arc(cx - activeRadius * 0.35, cy - activeRadius * 0.4, activeRadius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // restore clipping
      ctx.restore();

      // 4. Luminous Fresnel Edge Ring (Corona / Rim Light)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const rimGrad = ctx.createRadialGradient(cx, cy, activeRadius * 0.85, cx, cy, activeRadius * 1.05);
      rimGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      rimGrad.addColorStop(0.8, `${cPrimary}${0.45 * energy})`);
      rimGrad.addColorStop(0.95, `${cHighlight}${0.75 * energy})`);
      rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // Delicate sharp edge line
      ctx.strokeStyle = `${cHighlight}${0.5 * energy})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Dynamic outer sonic wave ripples when speaking or listening
      if (currentState === 'user_speaking' || currentState === 'speaking') {
        const rippleCount = 2;
        for (let i = 0; i < rippleCount; i++) {
          const ripplePhase = (time * 1.5 + i * 0.5) % 1;
          const rippleRadius = activeRadius + ripplePhase * (size * 0.16);
          const rippleAlpha = (1 - ripplePhase) * 0.4 * energy;

          ctx.strokeStyle = `${cAccent}${rippleAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [size]);

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center justify-center cursor-pointer select-none transition-transform duration-300 active:scale-95 ${className}`}
      style={{ width: size, height: size }}
      role="button"
      tabIndex={0}
      title="Interactive AI Voice Core — tap to interact"
    >
      <canvas ref={canvasRef} className="block pointer-events-none" />
    </div>
  );
}
