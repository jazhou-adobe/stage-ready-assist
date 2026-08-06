"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

export type GalleryPanel = {
  title: string;
  line: string;
  image: string;
  alt: string;
  width: number;
  height: number;
};

const ROTATE_MS = 4500;
const TRANSITION_MS = 920;

/**
 * Screen-first product gallery: auto-rotating carousel with click-to-jump tabs
 * and click-half-of-frame-to-step navigation. Pauses on hover/focus and honors
 * prefers-reduced-motion. Ported 1:1 from the kami landing-page template's
 * vanilla-JS behavior (see design/landing-page-candidate/landing-page-en.html).
 */
export function LandingGallery({ panels }: { panels: GalleryPanel[] }) {
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery || panels.length === 0) return;

    const frame = gallery.querySelector<HTMLElement>(".gallery-frame");
    const panelEls = Array.from(
      gallery.querySelectorAll<HTMLElement>(".gallery-panel"),
    );
    const tabEls = Array.from(
      gallery.querySelectorAll<HTMLButtonElement>(".gallery-tabs button"),
    );
    const titleEl = gallery.querySelector<HTMLElement>("[data-gallery-title]");
    const lineEl = gallery.querySelector<HTMLElement>("[data-gallery-line]");
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let index = 0;
    let timer: number | null = null;
    let transitionTimer: number | null = null;

    if (panelEls.length <= 1) return;

    function activate(next: number) {
      if (next === index) return;
      const previous = index;
      const direction = (next - previous + panelEls.length) % panelEls.length;
      gallery!.dataset.direction =
        direction > panelEls.length / 2 ? "prev" : "next";
      if (transitionTimer) window.clearTimeout(transitionTimer);
      panelEls.forEach((p) => p.classList.remove("was-active"));
      const outgoing = panelEls[previous];
      outgoing?.classList.add("was-active");
      gallery!.classList.add("is-switching");
      transitionTimer = window.setTimeout(() => {
        gallery!.classList.remove("is-switching");
        outgoing?.classList.remove("was-active");
        transitionTimer = null;
      }, TRANSITION_MS);
      index = next;
      panelEls.forEach((p, i) => {
        const active = i === index;
        p.classList.toggle("is-active", active);
        p.setAttribute("aria-hidden", active ? "false" : "true");
      });
      tabEls.forEach((t, i) => {
        const active = i === index;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (titleEl) titleEl.textContent = panels[index]?.title ?? "";
      if (lineEl) lineEl.textContent = panels[index]?.line ?? "";
    }

    function start() {
      if (reduceMotion || timer) return;
      timer = window.setInterval(() => {
        activate((index + 1) % panelEls.length);
      }, ROTATE_MS);
    }
    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    }

    const tabHandlers = tabEls.map((tab, i) => {
      const handler = () => {
        stop();
        activate(i);
        start();
      };
      tab.addEventListener("click", handler);
      return handler;
    });

    const frameHandler = (e: MouseEvent) => {
      if (!frame) return;
      const box = frame.getBoundingClientRect();
      const next =
        e.clientX < box.left + box.width / 2
          ? (index - 1 + panelEls.length) % panelEls.length
          : (index + 1) % panelEls.length;
      stop();
      activate(next);
      start();
    };
    frame?.addEventListener("click", frameHandler);

    gallery.addEventListener("mouseenter", stop);
    gallery.addEventListener("mouseleave", start);
    gallery.addEventListener("focusin", stop);
    gallery.addEventListener("focusout", start);

    start();

    return () => {
      stop();
      if (transitionTimer) window.clearTimeout(transitionTimer);
      tabEls.forEach((tab, i) => tab.removeEventListener("click", tabHandlers[i]));
      frame?.removeEventListener("click", frameHandler);
      gallery.removeEventListener("mouseenter", stop);
      gallery.removeEventListener("mouseleave", start);
      gallery.removeEventListener("focusin", stop);
      gallery.removeEventListener("focusout", start);
    };
  }, [panels]);

  return (
    <div className="gallery" data-gallery ref={galleryRef}>
      <div className="gallery-frame" aria-live="polite">
        {panels.map((panel, i) => (
          <figure
            key={panel.title}
            className={i === 0 ? "gallery-panel is-active" : "gallery-panel"}
            data-title={panel.title}
            data-line={panel.line}
            aria-hidden={i === 0 ? "false" : "true"}
          >
            <Image
              src={panel.image}
              alt={panel.alt}
              width={panel.width}
              height={panel.height}
              sizes="(max-width: 880px) 100vw, 960px"
              loading={i === 0 ? "eager" : "lazy"}
              priority={i === 0}
            />
          </figure>
        ))}
      </div>
      <div className="gallery-caption">
        <p className="title" data-gallery-title>
          {panels[0]?.title}
        </p>
        <p className="line" data-gallery-line>
          {panels[0]?.line}
        </p>
      </div>
      <div className="gallery-tabs" aria-label="Choose a screenshot">
        {panels.map((panel, i) => (
          <button
            key={panel.title}
            type="button"
            className={i === 0 ? "is-active" : undefined}
            aria-pressed={i === 0 ? "true" : "false"}
          >
            {panel.title}
          </button>
        ))}
      </div>
    </div>
  );
}
