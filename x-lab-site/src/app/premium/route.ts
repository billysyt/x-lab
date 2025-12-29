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
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .pay-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.35);
        color: var(--muted);
        font-size: 13px;
      }
      .pay-chip svg {
        width: 18px;
        height: 18px;
        color: var(--text);
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
          Unlock the full studio: priority transcription, premium export controls, and early
          access to new captioning models.
        </p>

        <div class="split">
          <div>
            <div class="price-title">All-in-one exclusive discount</div>
            <div class="price-line">
              <div class="price-old">$1199</div>
              <div class="price-new">$99HKD</div>
              <div class="price-unit">/ term</div>
            </div>
            <div class="countdown">7-Day Countdown</div>

            <div class="section">
              <div class="section-title">Auto Issue</div>
              <div class="row">
                <div class="cta">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M4 7.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Zm4.5 2a1 1 0 0 0 0 2h7a1 1 0 1 0 0-2h-7Zm0 4a1 1 0 0 0 0 2h4.5a1 1 0 1 0 0-2H8.5Z" />
                  </svg>
                  Taobao self-service
                </div>

                <div class="cta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3v12" />
                    <path d="m8.5 11.5 3.5 3.5 3.5-3.5" />
                    <path d="M4 19h16" />
                  </svg>
                  Manual payment
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Payment methods</div>
              <div class="pay-row">
                <div class="pay-chip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6.5 12.5c-2.2 0-4-1.6-4-3.6C2.5 6.7 4 5 6.1 5c1.3 0 2.5.6 3.2 1.5" />
                    <path d="M11.5 16.8c-2.9 0-5.2-2-5.2-4.5" />
                    <path d="M14.7 8.2c.7-.7 1.6-1.2 2.7-1.2 2.1 0 3.8 1.7 3.8 3.8 0 2.1-1.7 3.8-3.8 3.8" />
                    <path d="M9.5 10.5c.9-1.4 2.6-2.4 4.6-2.4 2.9 0 5.2 2 5.2 4.5 0 2.5-2.3 4.5-5.2 4.5" />
                  </svg>
                  WeChat Pay
                </div>
                <div class="pay-chip">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 4c4.4 0 8 3.6 8 8 0 3.5-2.3 6.5-5.5 7.6l-1.3-2.4c2.1-.8 3.6-2.8 3.6-5.2 0-3.1-2.5-5.6-5.6-5.6S6.4 9.9 6.4 13c0 1.9.9 3.6 2.4 4.6l-1.2 2.3C4.3 18.4 2 15.3 2 12c0-4.4 3.6-8 8-8Z" />
                  </svg>
                  Alipay
                </div>
                <div class="pay-chip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                  </svg>
                  FPS
                </div>
                <div class="pay-chip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 4h6a4 4 0 0 1 0 8H8V4Z" />
                    <path d="M8 12v8" />
                  </svg>
                  PayMe
                </div>
              </div>
            </div>

            <div class="contact">Contact us if you need help.</div>
          </div>

          <div>
            <div class="qr-wrap">
              <div class="qr">
                <img src="/wechat-group-qr.svg" alt="WeChat QR code" />
              </div>
              <div class="qr-title">Scan &amp; Join the group</div>
              <div class="qr-text">Share your machine code to activate premium access.</div>
              <div class="qr-text">24/7 Support</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;

export async function GET() {
  return new NextResponse(premiumHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
