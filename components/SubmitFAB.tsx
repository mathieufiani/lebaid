"use client";

type SubmitFABProps = {
  onClick: () => void;
};

export default function SubmitFAB({ onClick }: SubmitFABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-52 right-4 z-20 w-14 h-14 rounded-full bg-[#CC0001] text-white shadow-lg flex items-center justify-center text-2xl hover:bg-red-700 active:scale-95 transition-all"
      aria-label="Signaler un lieu"
    >
      +
    </button>
  );
}
