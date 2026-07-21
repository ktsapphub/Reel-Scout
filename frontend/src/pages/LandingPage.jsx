import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2, User, Link2, Hash, Video, Download,
  UploadCloud, ClipboardList, ArrowRight, Sparkles, ShieldCheck,
} from "lucide-react";
import axios from "axios";

function ReelScoutLogo({ className = "w-9 h-9" }) {
  // Instagram-gradient camera glyph — self-contained, no external asset needed.
  return (
    <div className={`ig-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/25 ${className}`}>
      <Video className="w-1/2 h-1/2 text-white" strokeWidth={2.25} />
    </div>
  );
}

function ModeCard({ icon: Icon, title, description, example, testId }) {
  return (
    <div
      className="group relative bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 hover:border-transparent hover:shadow-xl hover:shadow-pink-100 transition-all duration-300"
      data-testid={testId}
    >
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity ig-gradient" style={{ zIndex: -1 }} />
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 ig-gradient rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-pink-500/20">
          <Icon className="w-5 h-5 text-white" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600 mt-1 leading-snug">{description}</p>
          <code className="inline-block mt-3 px-2 py-1 rounded bg-slate-50 border border-slate-100 text-[11px] font-mono text-slate-600 break-all">
            {example}
          </code>
        </div>
      </div>
    </div>
  );
}

function FeatureBullet({ icon: Icon, text }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-slate-100">
      <span className="w-6 h-6 rounded-full ig-gradient flex items-center justify-center shrink-0 shadow-md shadow-pink-500/30">
        <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
      </span>
      {text}
    </li>
  );
}

export default function LandingPage({ onLogin, backendUrl }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signinOpen, setSigninOpen] = useState(false);

  const openSignin = () => setSigninOpen(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${backendUrl}/api/auth/login`, { email, password });
      toast.success("Welcome to Reel Scout");
      onLogin(response.data.token, response.data.email);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ReelScoutLogo className="w-9 h-9" />
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight">Reel Scout</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 -mt-0.5">for My Date Jar</p>
            </div>
          </div>
          <Button
            onClick={openSignin}
            className="ig-btn h-10 px-5 rounded-full text-sm font-semibold"
            data-testid="landing-topnav-signin"
          >
            Sign in <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden ig-grain">
        {/* Decorative floating blobs */}
        <div className="ig-blob ig-float absolute -top-24 -left-24 w-96 h-96 rounded-full ig-gradient" aria-hidden="true" />
        <div className="ig-blob ig-float absolute top-40 -right-24 w-[28rem] h-[28rem] rounded-full ig-gradient-radial" style={{ animationDelay: "3s" }} aria-hidden="true" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-24 sm:pt-24 sm:pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full ig-border bg-white ig-fade-up">
              <Sparkles className="w-3.5 h-3.5 text-pink-500" />
              <span className="text-xs font-semibold tracking-wide text-slate-700">Internal tool · allowlisted access</span>
            </div>

            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight ig-fade-up ig-delay-1">
              Pull Instagram <span className="ig-gradient-text">Reels</span>
              <br className="hidden sm:block" />
              <span> without the busywork.</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl ig-fade-up ig-delay-2">
              Reel Scout searches by <span className="font-semibold text-slate-900">profile</span>, <span className="font-semibold text-slate-900">direct URL</span>, or <span className="font-semibold text-slate-900">hashtag</span>, pulls every reel with its metadata, and lets you push the good ones to Cloudinary or export a clean CSV — in one flow.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 ig-fade-up ig-delay-3">
              <Button
                onClick={openSignin}
                className="ig-btn h-12 px-7 rounded-full text-sm font-semibold"
                data-testid="landing-hero-signin"
              >
                Get started <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <a
                href="#how"
                className="text-sm font-semibold text-slate-700 hover:text-pink-600 flex items-center gap-1.5"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Three search modes */}
      <section id="how" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-pink-600">Three ways to search</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Point Reel Scout at anything on Instagram.</h2>
          <p className="mt-3 text-base text-slate-600">Pick a mode, paste your input, hit search. You&apos;ll get reels back with owner, caption, views, likes, thumbnail, video URL, and transcript metadata — ready to review or ship.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          <ModeCard
            icon={User}
            title="User profile"
            description="Enter one or many Instagram handles. Reel Scout pulls their latest reels in one batch."
            example="@nasa, @natgeo, @spacex"
            testId="landing-mode-username"
          />
          <ModeCard
            icon={Link2}
            title="Direct reel URL"
            description="Have a specific reel already in mind? Paste up to 10 URLs and grab their metadata instantly."
            example="instagram.com/reel/Cxyz…"
            testId="landing-mode-url"
          />
          <ModeCard
            icon={Hash}
            title="Hashtag"
            description="Discover trending reels on a topic. Reel Scout scrapes the hashtag feed and applies your filters."
            example="#datenight, #travel, #cooking"
            testId="landing-mode-hashtag"
          />
        </div>
      </section>

      {/* Feature strip */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="rounded-3xl bg-slate-900 text-white px-6 sm:px-10 py-10 sm:py-14 relative overflow-hidden">
          <div className="ig-blob ig-float absolute -bottom-24 -right-24 w-96 h-96 rounded-full ig-gradient" aria-hidden="true" />
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-pink-300">What you get back</p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Every reel, every field, ready to move on.</h2>
              <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-xl">
                Reel Scout returns the full reel object plus tools to act on it — preview inline, upload the winners to Cloudinary, export the whole batch to CSV, or resume any aborted search with one click.
              </p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-100">
              <FeatureBullet icon={Video} text="Reel URL, thumbnail, owner, caption" />
              <FeatureBullet icon={Sparkles} text="Views, likes, comments, posted date" />
              <FeatureBullet icon={UploadCloud} text="One-click Cloudinary upload" />
              <FeatureBullet icon={Download} text="Instant CSV export of any selection" />
              <FeatureBullet icon={ClipboardList} text="Full search history + resume aborts" />
              <FeatureBullet icon={ShieldCheck} text="Audit-logged, allowlist-gated access" />
            </ul>
          </div>
        </div>
      </section>

      {/* CTA banner (replaces the old inline sign-in section) */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-24">
        <div className="rounded-3xl ig-gradient p-[1px]">
          <div className="rounded-3xl bg-white px-6 sm:px-10 py-10 sm:py-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-pink-600">Sign in</p>
              <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Ready when you are.</h2>
              <p className="mt-2 text-sm text-slate-600 max-w-md">
                Sign in with your My Date Jar allowlisted email. If you don&apos;t have access yet, ping the team lead.
              </p>
            </div>
            <Button
              onClick={openSignin}
              className="ig-btn h-12 px-8 rounded-full text-sm font-semibold shrink-0"
              data-testid="landing-cta-signin"
            >
              Sign in to Reel Scout <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ReelScoutLogo className="w-6 h-6" />
            <span className="font-semibold text-slate-700">Reel Scout</span>
            <span className="text-slate-300">·</span>
            <span>Internal tool for My Date Jar</span>
          </div>
          <span>Powered by Apify + Cloudinary</span>
        </div>
      </footer>

      {/* Sign-in dialog — pops over the landing page on demand */}
      <Dialog open={signinOpen} onOpenChange={setSigninOpen}>
        <DialogContent
          className="sm:max-w-md p-0 overflow-hidden border-0 bg-transparent shadow-none"
          data-testid="signin-dialog"
        >
          <div className="ig-border rounded-3xl">
            <div className="bg-white rounded-3xl p-6 sm:p-8">
              <DialogHeader className="text-center space-y-3 mb-5">
                <div className="mx-auto">
                  <ReelScoutLogo className="w-14 h-14" />
                </div>
                <DialogTitle className="text-2xl font-bold text-slate-900">Sign in to Reel Scout</DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Allowlisted My Date Jar team access only
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="landing-signin-form">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-slate-700 font-semibold text-xs uppercase tracking-wide">Email</Label>
                  <Input
                    id="email" type="email" autoComplete="email"
                    placeholder="you@mydatejar.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="h-12 border-slate-200 focus:border-pink-500 focus:ring-pink-500/20"
                    data-testid="login-email-input"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-slate-700 font-semibold text-xs uppercase tracking-wide">Password</Label>
                  <Input
                    id="password" type="password" autoComplete="current-password"
                    placeholder="••••••••"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-slate-200 focus:border-pink-500 focus:ring-pink-500/20"
                    data-testid="login-password-input"
                  />
                </div>
                <Button
                  type="submit" disabled={loading}
                  className="ig-btn w-full h-12 rounded-full text-sm font-semibold mt-2"
                  data-testid="login-submit-btn"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</>
                  ) : (
                    <>Sign in <ArrowRight className="w-4 h-4 ml-1.5" /></>
                  )}
                </Button>
                <p className="text-center text-[11px] text-slate-400 pt-1">
                  Audit-logged · allowlist-gated
                </p>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
