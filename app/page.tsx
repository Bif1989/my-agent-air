"use client";
import * as VKID from "@vkid/sdk";
export default function Home() {
   
  VKID.Config.init({
    app: 54770027,
    redirectUrl: "https://my-agent-air.vercel.app/auth/callback",
    responseMode: VKID.ConfigResponseMode.Redirect,
    source: VKID.ConfigSource.LOWCODE,
  }); 
  
    return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-blue-100 p-8">

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-4xl font-bold">A</span>
            </div>
          </div>

          {/* Brand */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">
              My Agent Air
            </h1>

            <p className="mt-2 text-blue-600 font-medium">
              Travel Agent Network
            </p>

            <p className="mt-4 text-slate-500 text-sm leading-6">
              Aviakassa va turizm agentlari uchun
              professional B2B platforma
            </p>
          </div>

          {/* VK Login */}
          <button
            type="button"
            onClick={() => VKID.Auth.login().catch(console.error)}
            className="mt-8 w-full bg-[#0077FF] hover:opacity-90 text-white font-semibold py-4 px-6 rounded-2xl transition flex items-center justify-center gap-3"
          >
            <span className="bg-white text-[#0077FF] font-bold rounded-lg px-2 py-1">
              VK
            </span>

            VK orqali kirish
          </button>

          <div className="mt-7 flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400">
              MY AGENT AIR
            </span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          {/* Features */}
          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xl">✈️</div>
              <div className="text-xs text-slate-600 mt-1">
                Exchange
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xl">💬</div>
              <div className="text-xs text-slate-600 mt-1">
                Agent Chat
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xl">🤝</div>
              <div className="text-xs text-slate-600 mt-1">
                Deals
              </div>
            </div>
          </div>

        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Find • Connect • Deal
        </p>
      </div>
    </main>
  );
}