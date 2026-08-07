import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";
import { LandingGallery, type GalleryPanel } from "@/components/LandingGallery";

const TAGLINE = "Practice out loud and watch your pace fix itself.";
const DESCRIPTION =
  "PresentPro is a free, browser-based teleprompter that tracks your pace, filler words, and pauses while you rehearse out loud.";

export const metadata: Metadata = {
  title: `PresentPro · ${TAGLINE}`,
  description: DESCRIPTION,
  openGraph: {
    title: `PresentPro · ${TAGLINE}`,
    description: DESCRIPTION,
    images: ["/landing/analytics.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `PresentPro · ${TAGLINE}`,
    description: DESCRIPTION,
    images: ["/landing/analytics.png"],
  },
};

const GITHUB_URL = "https://github.com/jazhou-adobe/stage-ready-assist";
const STAGE_READY_PROGRAM_URL =
  "https://adobe.sharepoint.com/sites/TeamEpic/Shared%20Documents/Forms/AllItems.aspx?id=/sites/TeamEpic/Shared%20Documents/General/Enablement/Stage%20Ready&viewid=a418e854-3239-4a7c-a3f2-5f5fc8c8b5c9";

const GALLERY_PANELS: GalleryPanel[] = [
  {
    title: "Start",
    line: "Paste a script, give it a title, go.",
    image: "/landing/start.webp",
    alt: "PresentPro start page with a script pasted into the form and recent sessions listed",
    width: 1024,
    height: 868,
  },
  {
    title: "Studio Mode",
    line: "The words scroll. You just have to say them.",
    image: "/landing/practice2.webp",
    alt: "PresentPro teleprompter with the current sentence highlighted and live pace, volume, and filler metrics",
    width: 1024,
    height: 608,
  },
  {
    title: "Analytics",
    line: "Every filler word, timestamped.",
    image: "/landing/report2.webp",
    alt: "PresentPro session report with an overall score, per-sentence pace flow, and a timestamped filler word list",
    width: 828,
    height: 1024,
  },
];

const FEATURES = [
  {
    name: "Teleprompter",
    subtitle: "Your script, paced for the room",
    what: "A fullscreen scrolling script highlights the sentence you're on and fades the rest, with font-size controls so it reads at arm's length or across a room.",
  },
  {
    name: "Live Pace & Filler Tracking",
    subtitle: "Every \u2018um\u2019 counted while you talk",
    what: "The Web Speech API tracks words-per-minute and flags filler words in real time as you speak, so the habit shows up while it's still happening, not after.",
  },
  {
    name: "Pause Detection",
    subtitle: "Know when the room went quiet",
    what: "The Web Audio API monitors volume and flags pauses past 1.5 seconds. Long silences cost points in the score, the same way they'd cost attention in the room.",
  },
  {
    name: "Local Session Recording",
    subtitle: "Webcam and mic, saved as MP4",
    what: "Practice sessions record locally using WebCodecs and download as an MP4 from the report page. The file never leaves the browser unless the download button does.",
  },
  {
    name: "Score & Breakdown",
    subtitle: "Pace, fillers, and pauses, spelled out",
    what: "Score starts at 100 and subtracts the filler count, 5 points per long pause, and a penalty for speaking outside 110\u2013170 words per minute. Sentence-by-sentence pace and a filler timeline back it up.",
  },
  {
    name: "Recent Scripts",
    subtitle: "Your last 10 sessions, one click away",
    what: "Scripts and their last session summary save to the browser's local storage, so picking up a prior rehearsal takes one click, not a re-paste.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "Nothing leaves your browser",
    body: "Scripts, recordings, and session data stay local. There are no accounts and no servers for practice content.",
  },
  {
    title: "The score is arithmetic, not a verdict",
    body: "It's a fixed formula \u2014 filler count, pause count, and pace \u2014 not a model guessing at talent. Read it as a nudge, not a grade.",
  },
  {
    title: "No signup between you and a script",
    body: "Paste a script and start. There's no account wall before the first session.",
  },
  {
    title: "Honest about browser support",
    body: "Speech recognition needs Chrome or Edge. Recording needs Chrome 94+ or Safari 16.4+. Everything else degrades gracefully instead of breaking silently.",
  },
] as const;

const FAQ = [
  {
    q: "How is this different from a generic teleprompter app?",
    a: "A teleprompter just scrolls text. This one also tracks pace, flags filler words, detects pauses, and scores the session afterward.",
  },
  {
    q: "Does my script or recording get uploaded anywhere?",
    a: "No. Scripts, recordings, and session data stay in the browser. The only server call is the feedback form, and that's opt-in.",
  },
  {
    q: "Which browsers are supported?",
    a: "Speech recognition (pace and filler tracking) needs Chrome or Edge. Session recording needs Chrome 94+ or Safari 16.4+.",
  },
  {
    q: "How is the score calculated?",
    a: "100, minus the filler count, minus 5 points per long pause, minus a penalty for speaking outside 110\u2013170 words per minute. No model, just arithmetic.",
  },
  {
    q: "Can I download my practice recording?",
    a: "Yes. If the webcam and mic were on, the report page has a local MP4 download link.",
  },
  {
    q: "Do I need to sign up?",
    a: "No. Paste a script on the dashboard and start practicing.",
  },
  {
    q: "What happens to my recent scripts?",
    a: "The last 10 scripts, and each one's last session summary, save to the browser's local storage, not a server.",
  },
  {
    q: "Is this ready for phones and tablets?",
    a: "Not yet. It relies on desktop-grade Web Speech and WebCodecs APIs, so it's built and tested for desktop Chrome, Edge, and Safari.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="kami-landing">
      <main className="page">
        <header className="hero">
          <div className="eyebrow">
            <span>
              Speech Practice Teleprompter ·{" "}
              <a className="version-link" href={`${GITHUB_URL}/releases`}>
                v0.1.0
              </a>
            </span>
            <span className="hero-links">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </span>
          </div>

          <h1>PresentPro</h1>

          <p className="tagline">{TAGLINE}</p>

          <div className="hero-tokens">
            <span>
              <b>Free</b> forever
            </span>
            <span>
              <b>0</b> signups
            </span>
            <span>
              <b>2</b> browsers supported
            </span>
            <span>
              <b>MP4</b> local recording
            </span>
          </div>

          <div className="hero-cta">
            <a className="btn-ghost" href="#features">
              See How It Works
            </a>
            <a
              className="btn-ghost"
              href={STAGE_READY_PROGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Study in Stage Ready Program
            </a>
            <Link className="btn-primary" href="/start">
              Start Practicing Free
            </Link>
          </div>
        </header>

        <section>
          <div className="section-head">
            <p className="section-num">00 · Walkthrough</p>
            <h2 className="section-title">From script to score</h2>
            <p className="section-lede">
              Three real screens: import a script, rehearse it, then read
              exactly how it went.
            </p>
          </div>

          <LandingGallery panels={GALLERY_PANELS} />
        </section>

        <section id="features">
          <div className="section-head">
            <p className="section-num">01 · What it does</p>
            <h2 className="section-title">Six tools, one rehearsal</h2>
          </div>

          <ol className="features">
            {FEATURES.map((f) => (
              <li key={f.name}>
                <p className="name">
                  {f.name}
                  <small>{f.subtitle}</small>
                </p>
                <p className="what">{f.what}</p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="section-head">
            <p className="section-num">02 · How it thinks</p>
            <h2 className="section-title">What this will never do</h2>
          </div>

          <ol className="principles">
            {PRINCIPLES.map((p, i) => (
              <li key={p.title}>
                <span className="n">{i + 1}</span>
                <span className="body">
                  <b>{p.title}</b>
                  <span>{p.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="section-head">
            <p className="section-num">03 · The catch</p>
            <h2 className="section-title">There isn&apos;t one</h2>
          </div>

          <div className="price-card">
            <ul className="price-benefits">
              <li>Full teleprompter, recording, and analytics</li>
              <li>Unlimited practice sessions</li>
              <li>Session history stored only on your device</li>
              <li>No subscription, ever</li>
            </ul>
            <p className="price-amount">Free</p>
            <Link className="btn-primary" href="/start">
              Start Practicing Free
            </Link>
            <p className="price-trial">
              No credit card, no trial clock — it&apos;s free.
            </p>
            <p className="price-terms">
              Speech recognition requires Chrome or Edge; recording requires
              Chrome 94+ or Safari 16.4+.
            </p>
          </div>
        </section>

        <section>
          <div className="section-head">
            <p className="section-num">04 · Before you start</p>
            <h2 className="section-title">Questions people actually ask</h2>
          </div>

          <dl className="faq">
            {FAQ.map((item) => (
              <div className="faq-pair" key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
          <p className="faq-tail">
            More questions?{" "}
            <a
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open an issue on GitHub
            </a>
            .
          </p>
        </section>

        <footer className="foot">
          <div className="mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="PresentPro" />
            <span className="wm-name">PresentPro</span>
            <span className="wm-line">{TAGLINE}</span>
          </div>
          <div className="colophon">
            <div className="links">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>{" "}
              &middot;{" "}
              <a
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Report an issue
              </a>{" "}
              &middot; <Link href="/support">Support</Link>
            </div>
            <p className="ethos">Rehearsal you can actually measure.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
