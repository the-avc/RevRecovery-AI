import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function Pagination({ page, totalPages, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;

  const btnBase =
    'p-2 rounded-lg border border-[rgba(139,92,246,0.15)] bg-transparent text-[#f0f0ff] hover:bg-violet-500/10 transition-colors';

  return (
    <div className="flex justify-center items-center gap-3 p-5 border-t border-[rgba(139,92,246,0.15)] rounded-b-2xl">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className={`${btnBase} ${page === 1 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="px-4 py-2 text-sm text-[#8b8baf]">
        Page <span className="text-[#f0f0ff] font-semibold">{page}</span> of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page === totalPages}
        className={`${btnBase} ${page === totalPages ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
