import React from 'react';
import { Menu, Zap } from 'lucide-react';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-[#050510]/90 backdrop-blur-xl border-b border-violet-500/15">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-lg text-[#8b8baf] hover:text-white hover:bg-violet-500/10 transition-colors"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-gradient-to-br from-violet-600 to-pink-500 rounded-lg flex items-center justify-center">
          <Zap size={14} className="text-white fill-white" />
        </div>
        <span className="text-sm font-bold font-space text-white">RevRecovery</span>
      </div>
    </header>
  );
}
