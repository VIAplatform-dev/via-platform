"use client";

import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { usePathname } from "next/navigation";
import TasteMatchModal from "./taste-match/TasteMatchModal";

interface TasteMatchContextType {
  openModal: () => void;
}

const TasteMatchContext = createContext<TasteMatchContextType | null>(null);

export function useTasteMatch() {
  const context = useContext(TasteMatchContext);
  if (!context) {
    throw new Error("useTasteMatch must be used within TasteMatchProvider");
  }
  return context;
}

export function TasteMatchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasAutoShownRef = useRef(false);
  const pathname = usePathname();

  const openModal = () => setIsOpen(true);
  const closeModal = () => {
    setIsOpen(false);
    // Mark that we've shown the modal this session
    sessionStorage.setItem("via_taste_modal_shown", "true");
  };

  // Auto-show modal after 2 seconds on homepage
  useEffect(() => {
    // Only auto-show on homepage
    if (pathname !== "/") return;

    // Check if already shown this session
    const alreadyShown = sessionStorage.getItem("via_taste_modal_shown");
    if (alreadyShown || hasAutoShownRef.current) return;

    const timer = setTimeout(() => {
      hasAutoShownRef.current = true;
      setIsOpen(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <TasteMatchContext.Provider value={{ openModal }}>
      {children}
      <TasteMatchModal isOpen={isOpen} onClose={closeModal} />
    </TasteMatchContext.Provider>
  );
}

// Footer link component
export function TasteMatchFooterLink() {
  const { openModal } = useTasteMatch();

  return (
    <button
      onClick={openModal}
      className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm text-left"
    >
      Discover Your Taste
    </button>
  );
}
