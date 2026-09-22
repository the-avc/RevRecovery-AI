import { useEffect, useRef } from 'react';
import './Aurora.css';

// OGL Aurora — adapted from React Bits (reactbits.dev)
// Requires: npm install ogl

interface AuroraProps {
  colorStops?: [string, string, string];
  amplitude?: number;
  blend?: number;
  speed?: number;
}

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x,289.0); }
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz;
  x12.xy-=i1;
  i=mod(i,289.0);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}

struct ColorStop { vec3 color; float position; };

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  float noiseVal = snoise(vec2(uv.x * 2.0 + uTime * 0.3, uv.y * 2.0 + uTime * 0.2)) * uAmplitude;
  float t = clamp(uv.y + noiseVal, 0.0, 1.0);

  vec3 finalColor = colors[0].color;
  for (int i = 0; i < 2; i++) {
    if (t >= colors[i].position) {
      float range = colors[i+1].position - colors[i].position;
      float factor = (t - colors[i].position) / range;
      finalColor = mix(colors[i].color, colors[i+1].color, factor);
    }
  }

  float alpha = uBlend * smoothstep(0.0, 0.3, uv.y) * (1.0 - smoothstep(0.7, 1.0, uv.y));
  fragColor = vec4(finalColor, alpha);
}
`;

function hexToVec3(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return [r, g, b];
}

export default function Aurora({
  colorStops = ['#7c3aed', '#ec4899', '#f59e0b'],
  amplitude = 0.4,
  blend = 0.6,
  speed = 0.5,
}: AuroraProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let canvas: HTMLCanvasElement | null = null;

    const init = async () => {
      // Dynamic import to avoid SSR issues
      const { Renderer, Program, Mesh, Triangle } = await import('ogl');

      const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
      canvas = renderer.gl.canvas as HTMLCanvasElement;
      gl = renderer.gl as unknown as WebGL2RenderingContext;
      container.appendChild(canvas);

      const geometry = new Triangle(renderer.gl);
      program = new Program(renderer.gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uAmplitude: { value: amplitude },
          uBlend: { value: blend },
          uResolution: { value: [container.clientWidth, container.clientHeight] },
          uColorStops: { value: colorStops.map(hexToVec3).flat() },
        },
        transparent: true,
      }) as unknown as WebGLProgram;

      const mesh = new Mesh(renderer.gl, { geometry, program: program as any });

      const resize = () => {
        if (!canvas || !container) return;
        renderer.setSize(container.clientWidth, container.clientHeight);
        (program as any).uniforms.uResolution.value = [container.clientWidth, container.clientHeight];
      };
      window.addEventListener('resize', resize);
      resize();

      startRef.current = performance.now();

      const animate = (ts: number) => {
        animRef.current = requestAnimationFrame(animate);
        (program as any).uniforms.uTime.value = (ts - startRef.current) / 1000 * speed;
        renderer.render({ scene: mesh as any });
      };
      animRef.current = requestAnimationFrame(animate);

      return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(animRef.current);
        if (canvas && container.contains(canvas)) container.removeChild(canvas);
        renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    };

    let cleanup: (() => void) | undefined;
    init().then(c => { cleanup = c; });

    return () => {
      cancelAnimationFrame(animRef.current);
      cleanup?.();
    };
  }, [amplitude, blend, speed, colorStops]);

  return <div ref={containerRef} className="aurora-container" />;
}
