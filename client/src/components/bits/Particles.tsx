import { useEffect, useRef } from 'react';
import './Particles.css';

// OGL Particles — adapted from React Bits (reactbits.dev)
// Requires: npm install ogl

interface ParticlesProps {
  particleCount?: number;
  particleSpread?: number;
  speed?: number;
  particleColors?: string[];
  alphaParticles?: boolean;
  sizeRange?: [number, number];
  className?: string;
}

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;

  varying vec4 vRandom;
  varying vec3 vColor;

  void main() {
    vRandom = random;
    vColor = color;

    vec3 pos = position * uSpread;
    pos.z *= 10.0;

    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);

    vec4 mvPos = viewMatrix * mPos;
    gl_PointSize = (uBaseSize + uSizeRandomness * (random.x - 0.5)) / length(mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform float uAlphaParticles;
  varying vec4 vRandom;
  varying vec3 vColor;
  uniform float uTime;

  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));

    if (uAlphaParticles < 0.5) {
      if (d > 0.5) discard;
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 0.7);
    } else {
      float circle = smoothstep(0.5, 0.4, d) * 0.6;
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
    }
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const int = parseInt(hex.slice(0, 6), 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

const defaultColors = ['#8b5cf6', '#7c3aed', '#a78bfa'];

export default function Particles({
  particleCount = 120,
  particleSpread = 8,
  speed = 0.06,
  particleColors = defaultColors,
  alphaParticles = true,
  sizeRange = [1.5, 3],
  className = '',
}: ParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let canvas: HTMLCanvasElement | null = null;
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { Renderer, Camera, Geometry, Program, Mesh } = await import('ogl');

      const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
      canvas = renderer.gl.canvas as HTMLCanvasElement;
      container.appendChild(canvas);

      const camera = new Camera(renderer.gl, { fov: 15 });
      camera.position.set(0, 0, 20);

      const resize = () => {
        if (!container) return;
        renderer.setSize(container.clientWidth, container.clientHeight);
        camera.perspective({ aspect: container.clientWidth / container.clientHeight });
      };
      window.addEventListener('resize', resize);
      resize();

      const count = particleCount;
      const positions = new Float32Array(count * 3);
      const randoms = new Float32Array(count * 4);
      const colors = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], i * 3);
        randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
        const col = hexToRgb(particleColors[Math.floor(Math.random() * particleColors.length)]);
        colors.set(col, i * 3);
      }

      const geometry = new Geometry(renderer.gl, {
        position: { size: 3, data: positions },
        random: { size: 4, data: randoms },
        color: { size: 3, data: colors },
      });

      const program = new Program(renderer.gl, {
        vertex,
        fragment,
        uniforms: {
          uTime: { value: 0 },
          uSpread: { value: particleSpread },
          uBaseSize: { value: sizeRange[0] * 100 },
          uSizeRandomness: { value: (sizeRange[1] - sizeRange[0]) * 100 },
          uAlphaParticles: { value: alphaParticles ? 1 : 0 },
        },
        transparent: true,
        depthTest: false,
      });

      const mesh = new Mesh(renderer.gl, { mode: renderer.gl.POINTS, geometry, program });
      let t = 0;

      const animate = () => {
        animRef.current = requestAnimationFrame(animate);
        t += speed * 0.01;
        (program as any).uniforms.uTime.value = t;
        renderer.render({ scene: mesh as any, camera });
      };
      animRef.current = requestAnimationFrame(animate);

      return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(animRef.current);
        if (canvas && container.contains(canvas)) container.removeChild(canvas);
        renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    };

    init().then(c => { cleanup = c; });
    return () => {
      cancelAnimationFrame(animRef.current);
      cleanup?.();
    };
  }, [particleCount, particleSpread, speed, alphaParticles, particleColors, sizeRange]);

  return <div ref={containerRef} className={`particles-container ${className}`} />;
}
