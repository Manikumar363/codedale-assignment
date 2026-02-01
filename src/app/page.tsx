"use client";
import { motion } from "framer-motion";
import { useRef, useEffect, useState, useCallback } from "react";
import NextImage from "next/image";

const PRELOAD_AHEAD = 90;
const PARALLEL_LOADS = 40;
const CACHE_SIZE = 120;
const SCROLL_DAMPING = 0.15; // Increased for faster response (0.05-0.25 range)
const PRELOAD_THROTTLE = 5; // Only preload every N frames

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCount = 281;
  
  // React state for UI only
  const [navVisible, setNavVisible] = useState(true);
  
  // Refs for smooth scroll tracking (no re-renders)
  const scrollRef = useRef(0);
  const targetScrollRef = useRef(0);
  const viewportHeightRef = useRef(1);
  const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const preloadQueueRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(-1);
  const frameCountRef = useRef(0);
  const lastDrawnImageRef = useRef<HTMLImageElement | null>(null);

  const preloadImages = useCallback((imagesToLoad: number[]) => {
    const uniqueIndices = [...new Set(imagesToLoad)].sort((a, b) => a - b);
    
    uniqueIndices.forEach((index, idx) => {
      if (index < 0 || index >= imageCount) return;
      if (imagesRef.current.has(index)) return;
      if (preloadQueueRef.current.has(index)) return;

      preloadQueueRef.current.add(index);
      const batchDelay = Math.floor(idx / PARALLEL_LOADS) * 2;
      
      setTimeout(() => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async"; // Enable async decoding for smoother performance
        
        img.onload = () => {
          imagesRef.current.set(index, img);
          preloadQueueRef.current.delete(index);

          // LRU cache eviction
          if (imagesRef.current.size > CACHE_SIZE) {
            const entries = Array.from(imagesRef.current.entries());
            const oldestEntry = entries[0];
            if (oldestEntry) {
              imagesRef.current.delete(oldestEntry[0]);
            }
          }
        };
        
        img.onerror = () => {
          preloadQueueRef.current.delete(index);
        };
        
        const num = String(index + 1).padStart(3, "0");
        img.src = `/images/${num}.jpg`;
      }, batchDelay);
    });
  }, [imageCount]);

  // Canvas setup with proper DPR scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext("2d", { 
        alpha: false,
        desynchronized: true,
        willReadFrequently: false 
      });
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  // Smooth interpolation loop - decoupled from React
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { 
      alpha: false,
      desynchronized: true,
      willReadFrequently: false 
    });
    if (!ctx) return;

    const renderFrame = () => {
      frameCountRef.current++;

      // Smooth interpolation using lerp (exponential damping)
      const delta = targetScrollRef.current - scrollRef.current;
      scrollRef.current += delta * SCROLL_DAMPING;
      
      const section = Math.floor(scrollRef.current / viewportHeightRef.current);
      const clampedSection = Math.max(0, Math.min(imageCount - 1, section));
      
      // Only redraw canvas if frame changed
      if (clampedSection !== lastFrameRef.current) {
        lastFrameRef.current = clampedSection;
        
        const img = imagesRef.current.get(clampedSection);
        if (img && img.complete) {
          // Clear and draw
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
          lastDrawnImageRef.current = img;
        } else if (lastDrawnImageRef.current) {
          // Keep last frame if new image isn't ready (prevents blank frames)
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(lastDrawnImageRef.current, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
        }
      }

      // Throttle preloading to every N frames (avoid performance bottleneck)
      if (frameCountRef.current % PRELOAD_THROTTLE === 0) {
        const currentSection = Math.floor(scrollRef.current / viewportHeightRef.current);
        const imagesToPreload: number[] = [];
        
        for (let i = 0; i < PRELOAD_AHEAD; i++) {
          imagesToPreload.push(Math.min(imageCount - 1, currentSection + i));
        }
        for (let i = 1; i <= 20; i++) {
          imagesToPreload.push(Math.max(0, currentSection - i));
        }
        
        preloadImages(imagesToPreload);
      }

      // Update nav visibility (throttled check)
      if (frameCountRef.current % 10 === 0) {
        const shouldNavBeVisible = targetScrollRef.current < viewportHeightRef.current * 10;
        if (shouldNavBeVisible !== navVisible) {
          setNavVisible(shouldNavBeVisible);
        }
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [imageCount, preloadImages, navVisible]);

  // Handle scroll events - only updates target, doesn't trigger renders
  useEffect(() => {
    const handleScroll = () => {
      targetScrollRef.current = window.scrollY;
    };

    const handleResize = () => {
      viewportHeightRef.current = window.innerHeight || 1;
    };

    handleResize();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    // Aggressive preload on mount
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => {
        const allImages: number[] = [];
        for (let i = 0; i < imageCount; i++) {
          allImages.push(i);
        }
        preloadImages(allImages);
      });
    } else {
      setTimeout(() => {
        const allImages: number[] = [];
        for (let i = 0; i < imageCount; i++) {
          allImages.push(i);
        }
        preloadImages(allImages);
      }, 500);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [imageCount, preloadImages]);

  return (
    <div ref={containerRef} className="relative w-full font-[AdalineText] overflow-x-hidden">
      {/* Canvas for ultra-fast image rendering */}
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-screen object-cover"
        style={{ zIndex: 1, display: "block" }}
      />

      {/* Fixed Main Content (Nav + Headline) */}
      <div
        className={`fixed top-0 left-0 w-full z-20 pointer-events-none transition-opacity duration-300 ${
          navVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ visibility: navVisible ? "visible" : "hidden" }}
      >
        <div className="relative flex flex-wrap items-center justify-between px-4 md:px-10 pt-6 md:pt-8 w-full max-w-[1440px] mx-auto pointer-events-auto">
          <div className="hidden md:flex gap-8 text-base md:text-xs font-light font-[AdalineHeading]">
            <a href="#" className="hover:underline text-black/60">PRODUCTS</a>
            <a href="#" className="hover:underline text-black/60">PRICING</a>
            <a href="#" className="hover:underline text-black/60">BLOG</a>
          </div>
          <div className="flex items-center gap-2">
            <NextImage src="/logo.png" alt="Adaline Logo" width={22} height={22} draggable="false" />
            <span className="text-2xl md:text-2xl font-light tracking-tight text-black/80 font-[AdalineHeading] italic">Adaline</span>
          </div>
          <div className="flex gap-2 md:gap-4 mt-4 md:mt-0 w-full md:w-auto justify-end">
            <button className="rounded-full shadow-xs px-4 md:px-7 py-2 text-[#2d3c1e]/80 font-light font-[AdalineHeading] hover:bg-[#e5e3db] bg-white/70 transition text-sm md:text-xs w-1/2 md:w-auto">WATCH DEMO</button>
            <button className="rounded-full bg-[#2d3c1e] px-4 md:px-6 py-2 text-white font-light font-[AdalineHeading] hover:bg-[#1e2912] transition text-sm md:text-sm w-1/2 md:w-auto">START FOR FREE</button>
          </div>
        </div>
        <main className="flex flex-col items-center justify-center pt-10 md:pt-10 pb-10 md:pb-16 px-2 md:px-4 text-center w-full max-w-[1440px] mx-auto pointer-events-auto">
          <h1 className="atlas-web-lg mx-[var(--grid-margin)] max-w-[32ch] md:text-[min(53px,min(calc(2.5vh+25px),calc(1.5vw+25px)))] md:leading-[calc(52/53)] font-light md:tracking-[-0.04em] text-black font-[AdalineMono]"><span>The single platform to iterate,<br/> evaluate, deploy, and monitor AI agents</span></h1>
          <div className="text-xs xs:text-lg md:text-xs text-black/40 mb-2 md:mb-1 pt-10 tracking-widest font-light font-[AdalineHeading]">TRUSTED BY</div>
          <div className="w-full max-w-3xl mb-4 pt-1 md:mb-10 overflow-hidden relative">
            <motion.div
              className="flex gap-15 whitespace-nowrap"
              animate={{ x: [0, -1000] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">HubSpot</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Discord</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Reforge</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Salesforce</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">McKinsey &amp; Company</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Crush &amp; Lovely</span>
              {/* Duplicate for seamless loop */}
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">HubSpot</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Discord</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Reforge</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Salesforce</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">McKinsey &amp; Company</span>
              <span className="text-base md:text-xl text-black/70 whitespace-nowrap">Crush &amp; Lovely</span>
            </motion.div>
          </div>
        </main>
      </div>

      {/* Spacer to allow scrolling through all images */}
      <div style={{ height: `${imageCount * 100}vh` }} />
    </div>
  );
}
