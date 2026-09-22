import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, List, ScrollText, Activity, Zap, X } from 'lucide-react';
import Particles from '../bits/Particles';
import ShinyText from '../bits/ShinyText';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/transactions', icon: List, label: 'Transactions' },
  { to: '/audit', icon: ScrollText, label: 'Audit Trail' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col
          bg-[#0a0a1a]/95 backdrop-blur-xl border-r border-violet-500/15
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Particles ambient background */}
        <div className="absolute inset-0 overflow-hidden rounded-r-none pointer-events-none">
          <Particles
            particleCount={60}
            particleSpread={6}
            speed={0.04}
            alphaParticles
            particleColors={['#7c3aed', '#8b5cf6', '#a78bfa', '#ec4899']}
            sizeRange={[0.8, 1.8]}
          />
        </div>

        {/* Close button (mobile only) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 lg:hidden p-1.5 rounded-lg text-[#8b8baf] hover:text-white hover:bg-violet-500/10 transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-6">
          {/* Logo */}
          <div className="mb-10 pl-1">
            <div className="flex items-center gap-3 mb-0.5">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Zap size={20} className="text-white fill-white" />
              </div>
              <div>
                <div className="text-base font-bold font-space text-white">RevRecovery</div>
                <div className="text-[10px] tracking-widest uppercase">
                  <ShinyText text="AI ENGINE" speed={2} color="#8b5cf6" shineColor="#e0cfff" className="text-[10px] font-semibold tracking-widest uppercase" />
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-1 flex-1">
            <div className="text-[10px] text-[#8b8baf] uppercase tracking-widest px-3 mb-3 font-semibold">
              Navigation
            </div>
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-violet-300 bg-violet-500/20 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.25)]'
                      : 'text-[#8b8baf] hover:text-[#f0f0ff] hover:bg-violet-500/10'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={17} className={isActive ? 'text-violet-400' : ''} />
                    {isActive ? (
                      <ShinyText text={label} speed={2} color="#c4b5fd" shineColor="#ffffff" />
                    ) : (
                      label
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer AI status */}
          <div className="p-4 bg-violet-500/10 rounded-xl border border-violet-500/20 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Activity size={13} className="text-violet-400" />
              <span className="text-xs text-violet-300 font-semibold">AI Engine Active</span>
            </div>
            <div className="text-[11px] text-[#8b8baf] leading-relaxed">
              Gemini 1.5 Flash + Math Model
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
