"use client"

export function DevModeBanner() {
    const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

    if (!isDevMode) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-red-600 to-orange-600 text-white py-2 px-4 text-center font-bold shadow-lg">
            <div className="flex items-center justify-center gap-2">
                <span className="text-xl">⚠️</span>
                <span>TEST MODE ENABLED - NOT FOR PRODUCTION USE</span>
                <span className="text-xl">⚠️</span>
            </div>
            <div className="text-xs mt-1 opacity-90">
                Simulated wallet authentication active
            </div>
        </div>
    );
}
