import React from 'react'

export default function SigFleetLogo({ className = '', textClassName = 'text-white' }) {
  return (
    <div className={`flex items-center gap-3 font-display select-none ${className}`}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes sigfleet-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sigfleet-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-0.8px); }
        }
        @keyframes sigfleet-wind {
          0% { stroke-dashoffset: 0; opacity: 0; }
          30% { opacity: 0.8; }
          70% { opacity: 0.8; }
          100% { stroke-dashoffset: -12; opacity: 0; }
        }
        .animate-car-body {
          animation: sigfleet-bounce 0.15s ease-in-out infinite;
        }
        .animate-wheel-left {
          animation: sigfleet-spin 0.5s linear infinite;
          transform-origin: 16px 23px;
        }
        .animate-wheel-right {
          animation: sigfleet-spin 0.5s linear infinite;
          transform-origin: 42px 23px;
        }
        .animate-wind-line {
          animation: sigfleet-wind 1s linear infinite;
          stroke-dasharray: 6 6;
        }
      `}} />
      <svg
        viewBox="0 0 60 30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-12 shrink-0 overflow-visible"
      >
        {/* Speed / Wind lines behind/above the car */}
        <line
          x1="-8"
          y1="9"
          x2="10"
          y2="9"
          stroke="#9CA3AF"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="animate-wind-line"
        />
        <line
          x1="-12"
          y1="16"
          x2="6"
          y2="16"
          stroke="#E31837"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="animate-wind-line"
          style={{ animationDelay: '0.3s' }}
        />
        <line
          x1="-6"
          y1="21"
          x2="8"
          y2="21"
          stroke="#9CA3AF"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="animate-wind-line"
          style={{ animationDelay: '0.6s' }}
        />

        {/* Car Group with engine vibration */}
        <g className="animate-car-body">
          {/* Spoiler */}
          <path d="M47 11 L52 11 L51 14 Z" fill="#4B5563" />

          {/* Sleek Sports Car Body */}
          <path
            d="M 6,21 L 11,14 Q 17,7 27,7 L 40,7 Q 46,11 48,15 L 53,16 Q 55,17 55,19 L 55,22 Q 55,23 53,23 L 47,23 Q 46,19 42,19 Q 38,19 37,23 L 21,23 Q 20,19 16,19 Q 12,19 11,23 L 8,23 Q 6,23 6,21 Z"
            fill="#E31837"
          />

          {/* Cabin Window Glass */}
          <path d="M 18,13 L 23,9 L 34,9 L 38,13 Z" fill="#1F2937" opacity="0.85" />
          <path d="M 28,9 L 28,13" stroke="#4B5563" strokeWidth="1" />

          {/* Front Light */}
          <path d="M 6,18 L 8,18 L 8,20 Z" fill="#FDE047" />

          {/* Rear Light */}
          <path d="M 54,18 L 55,18 L 55,19 Z" fill="#EF4444" />
        </g>

        {/* Left Wheel */}
        <g className="animate-wheel-left">
          {/* Tire */}
          <circle cx="16" cy="23" r="4.5" fill="#1F2937" />
          {/* Rim */}
          <circle cx="16" cy="23" r="2.5" fill="#9CA3AF" />
          {/* Spokes */}
          <line x1="16" y1="20.5" x2="16" y2="25.5" stroke="#FFFFFF" strokeWidth="0.8" />
          <line x1="13.5" y1="23" x2="18.5" y2="23" stroke="#FFFFFF" strokeWidth="0.8" />
        </g>

        {/* Right Wheel */}
        <g className="animate-wheel-right">
          {/* Tire */}
          <circle cx="42" cy="23" r="4.5" fill="#1F2937" />
          {/* Rim */}
          <circle cx="42" cy="23" r="2.5" fill="#9CA3AF" />
          {/* Spokes */}
          <line x1="42" y1="20.5" x2="42" y2="25.5" stroke="#FFFFFF" strokeWidth="0.8" />
          <line x1="39.5" y1="23" x2="44.5" y2="23" stroke="#FFFFFF" strokeWidth="0.8" />
        </g>
      </svg>
      <span className={`text-xl font-black tracking-tight ${textClassName}`}>
        <span className="text-[#E31837]">Sig</span>
        <span className="text-zinc-400">Fleet</span>
      </span>
    </div>
  )
}
