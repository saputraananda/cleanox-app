import { useState, useEffect } from 'react';
import cleanoxLogo from '../assets/cleanox.png';
import team0 from '../assets/CleanoxTeam.webp';
import team1 from '../assets/CleanoxTeam1.webp';
import team2 from '../assets/CleanoxTeam2.webp';
import team3 from '../assets/CleanoxTeam3.webp';
import team4 from '../assets/CleanoxTeam4.webp';
import team5 from '../assets/CleanoxTeam5.webp';
import team6 from '../assets/CleanoxTeam6.webp';

const SLIDES = [
  { img: team0, caption: 'Tim profesional kami siap memberikan pelayanan terbaik' },
  { img: team1, caption: 'Kualitas premium, kepuasan pelanggan adalah prioritas kami' },
  { img: team2, caption: 'Solusi laundry modern dengan teknologi terkini' },
  { img: team3, caption: 'Melayani dengan sepenuh hati setiap hari' },
  { img: team4, caption: 'Standar kebersihan tertinggi untuk Anda' },
  { img: team5, caption: 'Dipercaya oleh ribuan pelanggan setia' },
  { img: team6, caption: 'Bersama kami, pakaian Anda selalu terjaga' },
];

export default function AuthHeroPanel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrent((c) => (c + 1) % SLIDES.length), 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden lg:flex relative w-[55%] flex-shrink-0 overflow-hidden bg-brand-900 select-none">
      {/* Background images — crossfade */}
      {SLIDES.map((slide, i) => (
        <img
          key={i}
          src={slide.img}
          alt=""
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1200ms] ${
            i === current ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-900/60 to-brand-900/10 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/10 to-brand-900/50 pointer-events-none" />

      {/* Decorative circle accents */}
      <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-white/[0.03] pointer-events-none" />
      <div className="absolute top-1/3 -right-16 w-48 h-48 rounded-full bg-white/[0.04] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between w-full h-full p-10">
        {/* Top: Logo */}
        <div className="flex items-center gap-3">
          <img
            src={cleanoxLogo}
            alt="Cleanox"
            className="h-10 object-contain drop-shadow-lg"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div>
            <p className="text-white font-bold text-xl tracking-tight leading-none">Aplikasi Tracking Produksi Cleanox</p>
            <p className="text-brand-200/50 text-[11px] font-medium tracking-wide mt-0.5">
              by Waschen Alora
            </p>
          </div>
        </div>

        {/* Bottom: Caption + dots */}
        <div className="space-y-5">
          <div>
            <span className="inline-block text-[10px] font-semibold text-white/40 uppercase tracking-[0.25em] mb-3">
              Foto-Foto Momen Tim Cleanox
            </span>
            <h2 className="text-white text-2xl xl:text-3xl font-bold leading-snug max-w-[300px] drop-shadow-sm">
              {SLIDES[current].caption}
            </h2>
          </div>

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-[3px] rounded-full transition-all duration-500 ${
                  i === current
                    ? 'bg-white w-8'
                    : 'bg-white/25 w-2 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
