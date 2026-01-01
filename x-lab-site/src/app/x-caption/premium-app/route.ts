import { NextResponse } from "next/server";

const premiumHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>X-Caption Premium</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f0f10;
        --text: #f2f5f9;
        --muted: #9aa4b2;
        --soft: #7b889a;
        --accent: #74f0da;
        --accent-2: #7aa8ff;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Manrope", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .frame {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 28px;
        position: relative;
        overflow: hidden;
      }
      .glow {
        position: absolute;
        border-radius: 999px;
        filter: blur(120px);
        opacity: 0.45;
      }
      .glow.one {
        width: 320px;
        height: 320px;
        left: -140px;
        top: 80px;
        background: rgba(116, 240, 218, 0.2);
      }
      .glow.two {
        width: 360px;
        height: 360px;
        right: -180px;
        top: -140px;
        background: rgba(122, 168, 255, 0.18);
      }
      .grid {
        position: absolute;
        inset: 0;
        background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: 70px 70px;
        opacity: 0.2;
      }
      .content {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 980px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border-radius: 999px;
        padding: 8px 16px;
        font-size: 11px;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--soft);
        background: rgba(0,0,0,0.5);
      }
      h1 {
        margin: 14px 0 8px;
        font-size: 30px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .lead {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
        max-width: 720px;
      }
      .split {
        display: grid;
        gap: 36px;
        grid-template-columns: 3fr 2fr;
        align-items: start;
        margin-top: 28px;
      }
      .price-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 10px;
        margin-top: 6px;
      }
      .price-title {
        font-size: 16px;
        color: var(--text);
        font-weight: 600;
      }
      .price-old {
        font-size: 13px;
        color: var(--soft);
        text-decoration: line-through;
      }
      .price-new {
        font-size: 26px;
        color: var(--accent);
        font-weight: 700;
      }
      .price-unit {
        font-size: 12px;
        color: var(--soft);
      }
      .countdown {
        margin-top: 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(122, 168, 255, 0.12);
        color: var(--accent-2);
        font-size: 12px;
        letter-spacing: 0.08em;
      }
      .countdown-row {
        margin-top: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .countdown-top {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
      }
      .countdown-slot {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        color: var(--accent-2);
        font-size: 12px;
        letter-spacing: 0.16em;
      }
      .countdown-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.28em;
        color: var(--accent-2);
      }
      .slot-group {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .slot-digit {
        width: 26px;
        height: 30px;
        border-radius: 6px;
        background: rgba(0,0,0,0.45);
        color: var(--text);
        display: grid;
        place-items: center;
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 12px rgba(122, 168, 255, 0.28);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 6px 14px rgba(0,0,0,0.35);
      }
      .slot-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.28em;
        color: var(--accent-2);
      }
      .promo-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.12em;
        color: #0b0d10;
        background: linear-gradient(135deg, #74f0da, #7aa8ff);
        text-transform: uppercase;
        animation: pulse 1.6s ease-in-out infinite;
        transform-origin: center;
        box-shadow: 0 10px 24px rgba(116, 240, 218, 0.25);
      }
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      @media (max-width: 640px) {
        .slot-digit {
          width: 24px;
          height: 28px;
          font-size: 16px;
        }
      }
      .section {
        margin-top: 22px;
      }
      .section-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.28em;
        color: var(--soft);
      }
      .row {
        margin-top: 12px;
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr;
      }
      @media (min-width: 860px) {
        .row {
          grid-template-columns: 1fr 1fr;
        }
      }
      .cta {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 14px;
        background: rgba(0,0,0,0.45);
        color: var(--text);
        font-size: 14px;
      }
      .cta svg {
        width: 18px;
        height: 18px;
      }
      .pay-row {
        margin-top: 12px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }
      .pay-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 18px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(116, 240, 218, 0.9), rgba(122, 168, 255, 0.95));
        color: #0b0d10;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        border: none;
        cursor: pointer;
        box-shadow: 0 12px 26px rgba(116, 240, 218, 0.22);
        transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        animation: ctaPulse 2.2s ease-in-out infinite;
        text-decoration: none;
      }
      .pay-chip:hover {
        transform: translateY(-1px) scale(1.02);
        box-shadow: 0 16px 34px rgba(116, 240, 218, 0.3);
        filter: brightness(1.02);
      }
      @keyframes ctaPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.04); }
        100% { transform: scale(1); }
      }
      @media (max-width: 640px) {
        .pay-row {
          gap: 8px;
        }
        .pay-chip {
          gap: 8px;
          padding: 8px 14px;
          font-size: 12px;
        }
        .pay-chip svg {
          width: 16px;
          height: 16px;
        }
      }
      .pay-icons {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .icon-chip {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-chip svg {
        width: 20px;
        height: 20px;
        color: var(--text);
      }
      .contact {
        margin-top: 16px;
        font-size: 13px;
        color: var(--muted);
      }
      .qr-wrap {
        display: grid;
        justify-items: center;
        text-align: center;
        gap: 14px;
      }
      .qr {
        width: 170px;
        height: 170px;
        background: white;
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 18px 35px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .qr img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .qr-title {
        font-weight: 600;
        font-size: 15px;
      }
      .qr-text {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.6;
      }
      @media (max-width: 800px) {
        .split {
          grid-template-columns: 1fr;
        }
        .qr-wrap {
          margin-top: 20px;
        }
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="glow one"></div>
      <div class="glow two"></div>
      <div class="grid"></div>

      <div class="content">
        <div class="badge">Premium Access</div>
        <h1>X-Caption Premium</h1>
        <p class="lead">
          Unlock all premium features, including other products, unlimited usage, lifetime support,
          and early access to new releases.
        </p>

        <div class="split">
          <div>
            <div class="price-title">Lifetime Subscription</div>
            <div class="price-line">
              <div class="price-old">$199</div>
              <div class="price-new">$19.9</div>
              <div class="price-unit">USD / device</div>
            </div>
            <div class="countdown-row" aria-live="polite">
              <span class="countdown-top">
                <span class="countdown-label">Time left</span>
                <span class="promo-badge">90% OFF</span>
              </span>
              <span class="countdown-slot">
                <span class="slot-group" aria-label="Days left">
                  <span class="slot-digit" data-slot="d1">0</span>
                  <span class="slot-digit" data-slot="d2">0</span>
                  <span class="slot-label">D</span>
                </span>
                <span class="slot-group" aria-label="Hours left">
                  <span class="slot-digit" data-slot="h1">0</span>
                  <span class="slot-digit" data-slot="h2">0</span>
                  <span class="slot-label">H</span>
                </span>
                <span class="slot-group" aria-label="Minutes left">
                  <span class="slot-digit" data-slot="m1">0</span>
                  <span class="slot-digit" data-slot="m2">0</span>
                  <span class="slot-label">M</span>
                </span>
              </span>
            </div>
            <div class="section">
              <div class="section-title">Payment</div>
              <div class="pay-row">
                <a class="pay-chip" href="${process.env.NEXT_PUBLIC_PREMIUM_URL || 'https://x-lab.hk/zh-Hant/premium'}" target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Pay Now
                </a>
              </div>
            </div>

          </div>

          <div>
            <div class="qr-wrap">
              <div class="qr">
                <img src="/wechat-qrcode.png" alt="WeChat QR code" />
              </div>
              <div class="qr-title">Scan &amp; Join the group</div>
              <div class="qr-text">Contact us in WeChat</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
  <script>
    (function () {
      const target = new Date("2026-01-15T00:00:00");

      const getDigits = (value) => {
        const text = String(value).padStart(2, "0");
        const slice = text.slice(-2);
        return [slice[0], slice[1]];
      };
      const slots = {
        d1: document.querySelector('[data-slot="d1"]'),
        d2: document.querySelector('[data-slot="d2"]'),
        h1: document.querySelector('[data-slot="h1"]'),
        h2: document.querySelector('[data-slot="h2"]'),
        m1: document.querySelector('[data-slot="m1"]'),
        m2: document.querySelector('[data-slot="m2"]')
      };
      const slotEls = Object.values(slots).filter(Boolean);
      if (!slotEls.length) return;

      const setDigits = (digits) => {
        if (slots.d1) slots.d1.textContent = digits.d1;
        if (slots.d2) slots.d2.textContent = digits.d2;
        if (slots.h1) slots.h1.textContent = digits.h1;
        if (slots.h2) slots.h2.textContent = digits.h2;
        if (slots.m1) slots.m1.textContent = digits.m1;
        if (slots.m2) slots.m2.textContent = digits.m2;
      };

      const spinToDigits = (digits, duration) => {
        const start = Date.now();
        const timer = setInterval(() => {
          const elapsed = Date.now() - start;
          if (elapsed >= duration) {
            clearInterval(timer);
            setDigits(digits);
            return;
          }
          slotEls.forEach((el) => {
            el.textContent = String(Math.floor(Math.random() * 10));
          });
        }, 60);
      };
      const tick = () => {
        const now = new Date();
        let diff = Math.floor((target.getTime() - now.getTime()) / 1000);
        if (diff <= 0) {
          setDigits({ d1: "0", d2: "0", h1: "0", h2: "0", m1: "0", m2: "0" });
          return;
        }
        const days = Math.floor(diff / 86400);
        diff %= 86400;
        const hours = Math.floor(diff / 3600);
        diff %= 3600;
        const mins = Math.floor(diff / 60);
        const dayDigits = getDigits(days);
        const hourDigits = getDigits(hours);
        const minDigits = getDigits(mins);
        setDigits({
          d1: dayDigits[0],
          d2: dayDigits[1],
          h1: hourDigits[0],
          h2: hourDigits[1],
          m1: minDigits[0],
          m2: minDigits[1]
        });
      };

      tick();
      spinToDigits({
        d1: slots.d1 ? slots.d1.textContent || "0" : "0",
        d2: slots.d2 ? slots.d2.textContent || "0" : "0",
        h1: slots.h1 ? slots.h1.textContent || "0" : "0",
        h2: slots.h2 ? slots.h2.textContent || "0" : "0",
        m1: slots.m1 ? slots.m1.textContent || "0" : "0",
        m2: slots.m2 ? slots.m2.textContent || "0" : "0"
      }, 900);
      setInterval(tick, 1000);
    })();
  </script>
</html>`;

export async function GET() {
  const premiumUrl = process.env.NEXT_PUBLIC_PREMIUM_URL || 'https://x-lab.hk/zh-Hant/premium';
  const html = premiumHtml.replace('${process.env.NEXT_PUBLIC_PREMIUM_URL || \'https://x-lab.hk/zh-Hant/premium\'}', premiumUrl);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
