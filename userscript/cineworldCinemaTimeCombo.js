// ==UserScript==
// @name         Cineworld Film Stack Combo Estimator 
// @namespace    local.cineworld.end-times
// @version      3.1.0
// @description  Shows a start with adverts and finish time also spawns a small GUI bottom right that tries to find possible combos of films to do!
// @match        https://www.cineworld.co.uk/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  /* 
    > Important dev notes started date 03/03/2026 - V 3.1.0 is 14/09/2026
    - from my own calculations adverts it averages between 15 - 25 minutes
    - films with higher "studio pressure" e.g. spiderman normally go right for 25 minutes regardless
    - films after 10pm normally come down in weighting (more towards 15 minutes)
    - I had to rapidly re-write and update this to respond to the new cineworld website 
    - the style is done in factorio (i like factorio) it's also easy to condense making it ver nice
  */
  const ADVERT_MINUTES = 25;

  const COMMUTE_MINUTES = 30;
  // css hook anchor finders
  const MOVIE_SELECTOR = ".cw-movie";
  const SHOWTIME_SELECTOR = 'a[href*="/order/showtimes/"][aria-label]';
  const OUTPUT_CLASS = "cw-estimated-times";
  const PLANNER_ID = "cw-combo-planner";
  const SEEN_FILMS_KEY = "cineworld-combo-seen-films";

  const MIN_GAP = 5;
  const MAX_GAP = 40;
  const DEFAULT_GAP = 10;
  const DEFAULT_MAX_GAP = 40;

  // not all places have recliner/superscreen delete as needed 
  const SPECIALITIES = [
    { key: "imax", label: "IMAX" },
    { key: "4dx", label: "4DX" },
    { key: "screenx", label: "ScreenX" },
    { key: "superscreen", label: "Superscreen" },
    { key: "recliner", label: "Recliner Seating" },
    { key: "3d", label: "3D" },
  ];

  const ACCENTS = {
    imax: "#288cbd",
    "4dx": "#f7363d",
    screenx: "#2eb873",
    superscreen: "#dc7a09",
    recliner: "#ae65d2",
  };

  const ACCENT_PRIORITY = ["imax", "4dx", "screenx", "superscreen", "recliner"];

  const P = `#${PLANNER_ID}`;
  const M = MOVIE_SELECTOR;
  const S = SHOWTIME_SELECTOR;
  const O = OUTPUT_CLASS;

  const T = {
    bg: "#2b2a28",
    bgAlt: "#242320",
    recess: "#1c1b19",
    card: "#353330",
    cardAlt: "#2c2a27",
    control: "#1c1b19",
    border: "#141210",
    text: "#ece7da",
    textMuted: "#9a9488",
    textFaint: "#6f6a60",
    orange: "#d49332",
    orangeText: "#2b1d08",
    red: "#f23a59",
    redDark: "#c91432",
    red4dx: "#f7363d",
    orangeSuperscreen: "#dc7a09",
    green: "#5fbf7a",
    blue: "#288cbd",
    purple: "#ae65d2",
    screenx: "#2eb873",
    shadow: "rgba(0, 0, 0, .5)",
  };

  const style = document.createElement("style");
  style.textContent = `
    ${S} {
      height: auto !important;
      min-height: 44px;
      min-width: 126px;
      overflow: hidden;
      background: ${T.card} !important;
      border: 2px solid ${T.border} !important;
      border-radius: 3px !important;
      color: ${T.text} !important;
      font-weight: 700 !important;
      vertical-align: top;
    }

    ${S}:hover,
    ${S}:focus {
      background: ${T.cardAlt} !important;
      border-color: ${T.orange} !important;
      color: ${T.text} !important;
    }

    ${S}.cw-before-arrival {
      filter: grayscale(1);
      opacity: .35;
      text-decoration: line-through;
    }

    .${O} {
      display: grid;
      grid-template-columns: max-content minmax(5ch, auto);
      column-gap: 6px;
      row-gap: 0;
      margin-top: 4px;
      padding: 2px 4px;
      border: 1px solid ${T.border};
      border-radius: 2px;
      background: ${T.recess};
      font-size: 10px;
      font-weight: 700;
      line-height: 1.25;
      text-align: left;
      white-space: normal;
      pointer-events: none;
    }

    .${O} .cw-time-label {
      color: ${T.textMuted};
      text-align: left;
      text-transform: uppercase;
      letter-spacing: .03em;
    }

    .${O} .cw-time-value {
      font-variant-numeric: tabular-nums;
      text-align: right;
      overflow-wrap: anywhere;
    }

    .${O} .cw-feature-time { color: ${T.red}; }
    .${O} .cw-end-time { color: ${T.green}; }

    ${M}.cw-seen-movie {
      display: block !important;
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
      overflow: hidden !important;
      margin-bottom: 8px !important;
      padding: 6px 12px !important;
      border: 2px solid ${T.border};
      border-radius: 3px;
      background: ${T.bgAlt} !important;
      opacity: .8;
    }

    [class*="css-19gafhs"]:has(${M}.cw-seen-movie) {
      padding: 2em !important;
    }

    ${M}.cw-seen-movie > * {
      height: 42px !important;
      min-height: 0 !important;
      max-height: 42px !important;
      overflow: hidden !important;
    }

    ${M}.cw-seen-movie,
    ${M}.cw-seen-movie > [class*="css-1oyqwig"] {
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
      overflow: hidden !important;
    }

    ${M}.cw-seen-movie {
      margin-block-start: 0 !important;
      margin-block-end: 8px !important;
    }

    ${M}.cw-seen-movie > [class*="css-1oyqwig"] {
      display: flex !important;
      align-items: center !important;
      height: 28px !important;
      min-height: 0 !important;
      max-height: 28px !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    ${M}.cw-seen-movie .cw-poster {
      display: none !important;
    }

    ${M}.cw-seen-movie .css-5k1sf8,
    ${M}.cw-seen-movie .css-1ldn01p {
      display: none !important;
    }

    ${M}.cw-seen-movie [class*="css-4pq4lb"] > div:not(:has(h3)) {
      display: none !important;
    }

    ${M}.cw-seen-movie .cw-poster,
    ${M}.cw-seen-movie a[href^="/films/"] img,
    ${M}.cw-seen-movie .css-f0d653,
    ${M}.cw-seen-movie a[href*="/order/showtimes/"],
    ${M}.cw-seen-movie [role="dialog"],
    ${M}.cw-seen-movie .${O} {
      display: none !important;
    }

    ${M}.cw-seen-movie [class*="css-1sxc88w"] {
      display: flex !important;
      align-items: center !important;
      flex: 1 1 auto !important;
      height: 28px !important;
      max-height: 28px !important;
      float: none !important;
      width: 100% !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    ${M}.cw-seen-movie [class*="css-4pq4lb"] {
      display: flex !important;
      align-items: center !important;
      height: 28px !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    ${M}.cw-seen-movie h3 {
      display: flex !important;
      align-items: center !important;
      height: 28px !important;
      min-height: 0 !important;
      max-height: 28px !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    ${M}.cw-seen-movie h3 {
      margin: 0 !important;
      line-height: 1.2 !important;
    }

    ${M}.cw-seen-movie h3 a[href^="/films/"] {
      display: inline-flex !important;
      align-items: center;
      gap: 12px !important;
      color: ${T.textMuted} !important;
      -webkit-text-fill-color: ${T.textMuted} !important;
      vertical-align: middle !important;
      font-size: 16px !important;
      pointer-events: none;
    }

    ${M}.cw-seen-movie .cw-seen-badge {
      margin-left: 4px;
      font-size: 11px;
      color: ${T.text} !important;
      -webkit-text-fill-color: ${T.text} !important;
    }

    .cw-seen-badge {
      display: none;
      padding: 2px 8px;
      border: 1px solid ${T.border};
      border-radius: 2px;
      background: ${T.redDark};
      color: ${T.text};
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .06em;
      line-height: 1.5;
      text-decoration: none;
      vertical-align: middle;
    }

    ${M}.cw-seen-movie .cw-seen-badge { display: inline-block; }

    ${P} {
      position: fixed;
      display: flex;
      flex-direction: column;
      right: 16px;
      bottom: 16px;
      z-index: 10000;
      width: min(440px, calc(100vw - 24px));
      height: min(800px, calc(100vh - 32px));
      max-height: min(800px, calc(100vh - 32px));
      overflow: hidden;
      border: 3px solid ${T.border};
      border-radius: 4px;
      background: ${T.bg};
      color: ${T.text};
      font-family: "Titillium Web", "Segoe UI", Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      transition: height 280ms ease, max-height 280ms ease;
    }

    ${P} * { box-sizing: border-box; }

    ${P} .cw-planner-header {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      border-bottom: 2px solid ${T.border};
      background: ${T.bgAlt};
    }

    ${P} .cw-planner-title {
      margin: 0;
      color: ${T.text};
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .05em;
      text-transform: uppercase;
    }

    ${P} .cw-planner-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    ${P} .cw-planner-toggle,
    ${P} .cw-planner-resize {
      display: grid;
      width: 23px;
      height: 23px;
      place-items: center;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.control};
      color: ${T.text};
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
    }

    ${P} .cw-planner-toggle:hover,
    ${P} .cw-planner-toggle:focus,
    ${P} .cw-planner-resize:hover,
    ${P} .cw-planner-resize:focus {
      background: ${T.orange};
      border-color: ${T.border};
      color: ${T.orangeText};
      outline: none;
    }

    ${P}.cw-height-1 { height: min(950px, calc(100vh - 32px)); max-height: min(950px, calc(100vh - 32px)); }
    ${P}.cw-height-2 { height: min(1100px, calc(100vh - 32px)); max-height: min(1100px, calc(100vh - 32px)); }
    ${P}.cw-height-3 { height: min(1250px, calc(100vh - 32px)); max-height: min(1250px, calc(100vh - 32px)); }

    ${P} .cw-planner-body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      padding: 7px;
      overflow: hidden;
    }

    ${P}.cw-collapsed { height: auto; transition: none; }
    ${P}.cw-collapsed .cw-planner-body { display: none; }

    ${P}.cw-waiting {
      height: auto !important;
      max-height: none !important;
    }

    ${P}.cw-waiting .cw-planner-controls,
    ${P}.cw-waiting .cw-combo-results {
      display: none;
    }

    ${P}.cw-waiting .cw-planner-summary {
      margin: 0;
      padding: 4px;
    }

    ${P} .cw-planner-controls {
      display: grid;
      grid-template-columns: 1fr;
      align-items: center;
      gap: 5px;
      margin-bottom: 6px;
      padding: 6px;
      border: 2px solid ${T.border};
      border-radius: 3px;
      background: ${T.bgAlt};
    }

    ${P} label {
      margin: 0;
      color: ${T.text};
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
      font-size: 10px;
    }

    ${P} .cw-quad {
      display: grid;
      grid-template-columns: 44px 1fr 1fr 74px 74px 70px;
      gap: 4px;
    }

    ${P} .cw-field {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    ${P} .cw-field label {
      font-size: 9px;
      letter-spacing: .02em;
      white-space: nowrap;
    }

    ${P} .cw-field select,
    ${P} .cw-field input[type="time"],
    ${P} .cw-field input[type="number"] {
      width: 100%;
      min-width: 0;
      padding: 2px 3px;
      text-align: center;
    }

    ${P} .cw-checkbox-label {
      display: flex;
      grid-column: 1 / -1;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      text-transform: none;
      font-size: 11px;
    }

    ${P} .cw-help {
      position: relative;
      display: inline-grid;
      width: 16px;
      height: 16px;
      place-items: center;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.control};
      color: ${T.red};
      cursor: help;
      font-size: 10px;
      font-weight: 700;
    }

    ${P} .cw-help::after {
      position: absolute;
      left: 0;
      right: auto;
      bottom: calc(100% + 8px);
      z-index: 10001;
      width: min(250px, calc(100vw - 30px));
      padding: 7px 9px;
      border: 2px solid ${T.border};
      border-radius: 3px;
      background: ${T.recess};
      color: ${T.text};
      content: attr(data-tooltip);
      font-size: 11px;
      font-weight: 400;
      line-height: 1.35;
      opacity: 0;
      pointer-events: none;
      text-align: left;
      text-transform: none;
      transition: opacity 120ms ease;
      visibility: hidden;
    }

    ${P} .cw-help:hover::after,
    ${P} .cw-help:focus::after {
      opacity: 1;
      visibility: visible;
    }

    ${P} input[type="checkbox"] {
      width: 15px;
      height: 15px;
      margin: 0;
      accent-color: ${T.red};
    }

    ${P} select,
    ${P} input[type="time"],
    ${P} input[type="number"],
    ${P} .cw-required-film-input {
      padding: 3px 6px;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.control};
      color: ${T.text};
      font: inherit;
      font-size: 11px;
      font-weight: 700;
    }

    ${P} select { min-width: 88px; }

    ${P} input[type="time"] {
      min-width: 104px;
      color-scheme: dark;
      font-variant-numeric: tabular-nums;
    }

    ${P} input[type="number"] {
      min-width: 0;
      appearance: textfield;
      font-variant-numeric: tabular-nums;
    }

    ${P} input[type="number"]::-webkit-inner-spin-button,
    ${P} input[type="number"]::-webkit-outer-spin-button {
      margin: 0;
      opacity: .7;
    }

    ${P} select:focus,
    ${P} input[type="time"]:focus,
    ${P} input[type="number"]:focus,
    ${P} .cw-required-film-input:focus {
      border-color: ${T.red};
      outline: none;
    }

    ${P} .cw-required-film-control {
      display: flex;
      grid-column: 1 / -1;
      gap: 5px;
    }

    ${P} .cw-required-film-input { width: 100%; min-width: 0; }
    ${P} .cw-required-film-input::placeholder { color: ${T.textFaint}; }

    ${P} .cw-clear-required-film {
      flex: 0 0 auto;
      min-width: 30px;
      padding: 3px 7px;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.control};
      color: ${T.text};
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
    }

    ${P} .cw-clear-required-film:hover,
    ${P} .cw-clear-required-film:focus {
      background: ${T.redDark};
      border-color: ${T.border};
      color: ${T.text};
      outline: none;
    }

    ${P} .cw-planner-summary {
      margin: 0 0 6px;
      padding: 3px 6px;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.bgAlt};
      color: ${T.textMuted};
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
    }

    ${P} .cw-combo-results {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 5px 4px 7px 5px;
      border: 2px solid ${T.border};
      border-radius: 3px;
      background: ${T.recess};
      overscroll-behavior: contain;
      scrollbar-color: ${T.textFaint} ${T.recess};
    }

    ${P} .cw-combo-card {
      position: relative;
      margin-bottom: 7px;
      padding: 6px;
      overflow: hidden;
      border: 2px solid ${T.border};
      border-radius: 3px;
      background: ${T.card};
    }

    ${P} .cw-premium-stack {
      /* Gradient border trick: the visible "border" is actually the 2nd
         background layer showing through a transparent border, clipped to
         border-box. The 1st layer repaints the card fill just inside it,
         clipped to padding-box. This keeps the rounded corners, which
         border-image (the more obvious approach) cannot do. */
      border-color: transparent;
      background-image:
        linear-gradient(${T.card}, ${T.card}),
        var(--cw-stack-border, linear-gradient(${T.red}, ${T.red}));
      background-origin: border-box;
      background-clip: padding-box, border-box;
    }

    ${P} .cw-combo-card:last-child { margin-bottom: 0; }

    ${P} .cw-combo-heading {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 5px;
      margin: -6px -6px 5px;
      padding: 3px 7px;
      border-bottom: 2px solid ${T.border};
      background: ${T.orange};
      color: ${T.orangeText};
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .05em;
    }

    ${P} .cw-combo-heading span:last-child {
      overflow-wrap: anywhere;
      font-variant-numeric: tabular-nums;
    }

    ${P} .cw-stack-heading-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }

    ${P} .cw-combo-film {
      padding: 5px 6px;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.cardAlt};
    }

    ${P} .cw-combo-film-title {
      margin-bottom: 4px;
      overflow-wrap: anywhere;
      color: ${T.text};
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .02em;
    }

    ${P} .cw-film-runtime {
      color: ${T.textMuted};
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }

    ${P} .cw-format-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-bottom: 4px;
    }

    ${P} .cw-format-badge {
      display: inline-flex;
      align-items: center;
      min-height: 15px;
      padding: 1px 5px;
      border: 1px solid ${T.border};
      border-radius: 2px;
      background: ${T.control};
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      line-height: 1;
      white-space: nowrap;
      text-transform: uppercase;
    }

    ${P} .cw-heading-badges {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 3px;
    }

    ${P} .cw-heading-badges .cw-format-badge {
      min-height: 14px;
      padding: 0 4px;
      background: ${T.recess};
      font-size: 8px;
    }

    /* .cw-format-3d sets a light background + dark text; without this rule
       the darker background above (higher specificity, 2 classes vs 1) wins
       here and leaves the dark text unreadable against it. */
    ${P} .cw-heading-badges .cw-format-3d {
      background: ${T.text};
      color: ${T.orangeText};
    }

    ${P} .cw-format-imax { color: ${T.blue}; }
    ${P} .cw-format-4dx { color: ${T.red4dx}; }
    ${P} .cw-format-screenx { color: ${T.screenx}; }
    ${P} .cw-format-superscreen { color: ${T.orangeSuperscreen}; }
    ${P} .cw-format-recliner { color: ${T.purple}; }

    ${P} .cw-format-3d {
      background: ${T.text};
      border-color: ${T.border};
      color: ${T.orangeText};
    }

    ${P} .cw-combo-times {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }

    ${P} .cw-combo-time-block {
      padding: 5px 4px;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.control};
      text-align: center;
    }

    ${P} .cw-combo-time-label {
      display: block;
      margin-bottom: 2px;
      color: ${T.textMuted};
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    ${P} .cw-combo-time-value {
      display: block;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    ${P} .cw-start-time { color: ${T.text}; }
    ${P} .cw-ads-time { color: ${T.red}; }
    ${P} .cw-end-time { color: ${T.green}; }

    ${P} .cw-break {
      position: relative;
      margin: 6px 12px;
      padding: 5px 8px;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.bgAlt};
      color: ${T.green};
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .05em;
      text-align: center;
      text-transform: uppercase;
    }

    ${P} .cw-break::before,
    ${P} .cw-break::after {
      position: absolute;
      left: 50%;
      width: 3px;
      height: 6px;
      margin-left: -1px;
      background: ${T.border};
      content: "";
    }

    ${P} .cw-break::before { top: -6px; }
    ${P} .cw-break::after { bottom: -6px; }

    ${P} .cw-break-overlap {
      background: ${T.bgAlt};
      border-color: ${T.border};
      color: ${T.red};
    }

    ${P} .cw-seen-panel {
      grid-column: 1 / -1;
      border: 2px solid ${T.border};
      border-radius: 2px;
      background: ${T.bgAlt};
    }

    ${P} .cw-seen-panel summary {
      padding: 7px 9px;
      color: ${T.red};
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .05em;
      text-transform: uppercase;
    }

    ${P} .cw-seen-list {
      display: grid;
      max-height: 130px;
      overflow-y: auto;
      gap: 5px;
      padding: 0 9px 9px;
      scrollbar-color: ${T.textFaint} ${T.recess};
    }

    ${P} .cw-seen-list .cw-seen-badge {
      display: none !important;
    }

    ${P} .cw-seen-item {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      color: ${T.text};
      cursor: pointer;
      font-size: 11px;
      font-weight: 400;
      text-transform: none;
    }

    ${P} .cw-seen-item:has(.cw-seen-checkbox:checked) {
      color: ${T.textMuted};
      opacity: .7;
      text-decoration: line-through;
    }

    ${P} .cw-no-combos {
      margin: 0;
      padding: 15px 8px;
      color: ${T.textMuted};
      font-weight: 700;
      letter-spacing: .04em;
      text-align: center;
      text-transform: uppercase;
    }

    @media (max-width: 520px) {
      ${P} {
        right: 8px;
        bottom: 8px;
        width: calc(100vw - 16px);
        height: calc(100vh - 16px);
        max-height: calc(100vh - 16px);
      }
    }
  `;
  document.head.appendChild(style);

  const q = (root, selector) => root.querySelector(selector);

  function getFilmName(movie) {
    const titleLink = q(movie, 'h3 a[href^="/films/"]');
    if (!titleLink) return "";

    return [...titleLink.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getMovies() {
    const movies = [];

    document.querySelectorAll('h3 a[href^="/films/"]').forEach((titleLink) => {
      let card = titleLink.parentElement;

      while (card && !card.querySelector(SHOWTIME_SELECTOR)) {
        card = card.parentElement;
      }

      if (card && !movies.includes(card)) {
        card.classList.add("cw-movie");
        movies.push(card);
      }
    });

    return movies;
  }

  const uniqueNames = (showings) =>
    [...new Set(showings.map((showing) => showing.name))].sort();

  const escapeHtml = (value) =>
    value.replace(
      /[&<>"]/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
    );

  const throttle = (fn) => {
    let pending = false;

    return () => {
      if (pending) return;
      pending = true;

      requestAnimationFrame(() => {
        pending = false;
        fn();
      });
    };
  };

  function parseRuntime(movie) {
    const text =
      q(movie, ".css-f0d653")?.textContent || movie.textContent || "";

    const hoursAndMinutes = text.match(
      /\b(\d{1,2})\s*(?:hours?|hrs?|h)\s*(?:(\d{1,2})\s*(?:mins?|minutes?|m))?/i,
    );
    if (hoursAndMinutes) {
      return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] || 0);
    }

    const minutesOnly = text.match(/\b(\d{1,3})\s*(?:mins?|minutes?)\b/i);
    if (minutesOnly) return Number(minutesOnly[1]);

    return null;
  }

  function parseTime(value) {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
  }

  function formatTime(totalMinutes) {
    const MINUTES_PER_DAY = 1440;
    const normalized =
      ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

    const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
    const minutes = String(normalized % 60).padStart(2, "0");
    const nextDay =
      Math.floor(totalMinutes / MINUTES_PER_DAY) > 0 ? " (+1 day)" : "";

    return `${hours}:${minutes}${nextDay}`;
  }

  function defaultArrivalTime() {
    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes() + COMMUTE_MINUTES;
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;

    const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
    const minutes = String(normalized % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function getAdvertMinutes() {
    const input = document.getElementById("cw-advert-minutes");
    const value = Number(input?.value);
    return Number.isFinite(value) && value >= 0 && value <= 120
      ? value
      : ADVERT_MINUTES;
  }

  function addTimes(movie) {
    if (movie.classList.contains("cw-seen-movie")) return;

    const runtime = parseRuntime(movie);
    if (!runtime) return;
    const advertMinutes = getAdvertMinutes();

    movie.querySelectorAll(S).forEach((showtime) => {
      const advertised = parseTime(showtime.getAttribute("aria-label") || "");
      if (advertised === null) return;

      const signature = `${advertised}:${runtime}:${advertMinutes}`;
      const existing = q(showtime, `.${O}`);
      if (existing?.dataset.signature === signature) return;
      existing?.remove();

      const featureStart = advertised + advertMinutes;
      const output = document.createElement("span");
      output.className = O;
      output.dataset.signature = signature;
      output.setAttribute("aria-hidden", "true");
      output.innerHTML =
        '<span class="cw-time-label">Ads:</span>' +
        `<span class="cw-time-value cw-feature-time">${formatTime(featureStart)}</span>` +
        '<span class="cw-time-label">Ends:</span>' +
        `<span class="cw-time-value cw-end-time">${formatTime(featureStart + runtime)}</span>`;

      showtime.appendChild(output);
    });
  }

  function applyArrivalState(arrivalTime) {
    getMovies().forEach((movie) => {
      const poster = q(movie, '[class*="css-lgj9p7"]');
      poster?.classList.add("cw-poster");

      movie.querySelectorAll(S).forEach((showtime) => {
        const advertised = parseTime(showtime.getAttribute("aria-label") || "");
        showtime.classList.toggle(
          "cw-before-arrival",
          arrivalTime !== null && advertised !== null && advertised < arrivalTime,
        );
      });
    });
  }

  function getShowingFormats(showtime) {
    const row = showtime.closest('[class*="css-ts82x8"]');
    const attributeNodes =
      row?.querySelectorAll(
        '[role="img"][aria-label], [title], [aria-label]',
      ) || [];

    const haystack = [
      showtime.dataset.attrs || "",
      ...[...attributeNodes].map(
        (element) =>
          `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`,
      ),
    ]
      .join(" ")
      .toLowerCase();

    return SPECIALITIES.filter((speciality) => {
      const pattern =
        speciality.key === "recliner"
          ? /\brecliner(?:\s+seating)?\b/
          : new RegExp(`\\b${speciality.key}\\b`, "i");

      return pattern.test(haystack);
    });
  }

  function getShowings() {
    const showings = [];

    getMovies().forEach((movie) => {
      const runtime = parseRuntime(movie);
      if (!runtime) return;

      const name = getFilmName(movie) || "Unknown film";

      movie.querySelectorAll(S).forEach((showtime) => {
        const advertised = parseTime(showtime.getAttribute("aria-label") || "");
        if (advertised === null) return;

        const featureStart = advertised + getAdvertMinutes();

        showings.push({
          name,
          runtime,
          advertised,
          featureStart,
          end: featureStart + runtime,
          formats: getShowingFormats(showtime),
          id: showtime.dataset.url || `${name}:${advertised}`,
        });
      });
    });

    return showings.sort(
      (a, b) => a.advertised - b.advertised || a.name.localeCompare(b.name),
    );
  }

  function getTransition(first, second, minimumGap, maximumGap, allowOverlap) {
    if (first.name === second.name || second.advertised <= first.advertised) {
      return null;
    }

    const gap = second.advertised - first.end;
    if (gap >= minimumGap && gap <= maximumGap) {
      return { overlap: 0, gap };
    }

    if (
      allowOverlap &&
      first.end > second.advertised &&
      first.end <= second.featureStart
    ) {
      return { overlap: first.end - second.advertised, gap: 0 };
    }

    return null;
  }

  function findCombos(
    showings,
    minimumGap,
    maximumGap,
    allowOverlap,
    stackSize,
  ) {
    const combos = [];

    const extend = (stack, transitions) => {
      if (stack.length === stackSize) {
        combos.push({ films: [...stack], transitions: [...transitions] });
        return;
      }

      const last = stack[stack.length - 1];

      showings.forEach((candidate) => {
        const alreadyUsed = stack.some(
          (film) => film.id === candidate.id || film.name === candidate.name,
        );
        if (alreadyUsed) return;

        const transition = getTransition(
          last,
          candidate,
          minimumGap,
          maximumGap,
          allowOverlap,
        );
        if (!transition) return;

        extend([...stack, candidate], [...transitions, transition]);
      });
    };

    showings.forEach((showing) => extend([showing], []));

    return combos.sort(
      (a, b) =>
        a.films[0].advertised - b.films[0].advertised ||
        a.films[a.films.length - 1].end - b.films[b.films.length - 1].end,
    );
  }

  const renderFormatBadge = (format) =>
    `<span class="cw-format-badge cw-format-${format.key}">${format.label}</span>`;

  const getComboFormats = (combo) => [
    ...new Map(
      combo.films.flatMap((film) =>
        film.formats.map((format) => [format.key, format]),
      ),
    ).values(),
  ];

  function getFilmAccent(formats) {
    for (const key of ACCENT_PRIORITY) {
      if (formats.some((format) => format.key === key)) return ACCENTS[key];
    }
    return null;
  }

  // Builds gradient across every film in the stack (defined earlier)
  // just wanted a way to easy spot cool film stacks!
  function getStackBorderGradient(films) {
    const stops = films.map((film, index) => {
      const color = getFilmAccent(film.formats) || "transparent";
      const position =
        films.length === 1 ? 0 : (index / (films.length - 1)) * 100;

      return `${color} ${position}%`;
    });

    return `linear-gradient(to right, ${stops.join(", ")})`;
  }

  function getSeenFilms() {
    try {
      const saved = JSON.parse(localStorage.getItem(SEEN_FILMS_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  }

  const saveSeenFilms = (planner) =>
    localStorage.setItem(
      SEEN_FILMS_KEY,
      JSON.stringify(
        [...planner.querySelectorAll(".cw-seen-checkbox:checked")].map(
          (checkbox) => checkbox.value,
        ),
      ),
    );

  function applySeenFilmState(seenFilms) {
    getMovies().forEach((movie) => {
      const name = getFilmName(movie);
      if (!name) return;

      const isExcluded = seenFilms.has(name);
      movie.classList.toggle("cw-seen-movie", isExcluded);

      const titleLink = q(movie, 'h3 a[href^="/films/"]');
      if (titleLink && !q(titleLink, ".cw-seen-badge")) {
        const badge = document.createElement("span");
        badge.className = "cw-seen-badge";
        badge.textContent = "EXCLUDED - COLLAPSED";
        badge.setAttribute("aria-hidden", "true");
        titleLink.appendChild(badge);
      }

      if (isExcluded) {
        movie.querySelectorAll(`.${O}`).forEach((output) => output.remove());
      } else {
        addTimes(movie);
      }
    });
  }

  function renderList(container, names, itemHtml, emptyHtml) {
    const signature = names.join("\n");
    if (container.dataset.signature === signature) return;

    container.dataset.signature = signature;
    container.innerHTML = names.length
      ? names.map(itemHtml).join("")
      : emptyHtml;
  }

  function renderFilmCard(film, index) {
    const badges = film.formats.length
      ? `<div class="cw-format-badges">${film.formats.map(renderFormatBadge).join("")}</div>`
      : "";

    return (
      '<div class="cw-combo-film">' +
      '<div class="cw-combo-film-title">' +
      `${index + 1}. ${escapeHtml(film.name)} ` +
      `<span class="cw-film-runtime">(${film.runtime} min)</span>` +
      "</div>" +
      badges +
      '<div class="cw-combo-times">' +
      '<div class="cw-combo-time-block">' +
      '<span class="cw-combo-time-label">Start</span>' +
      `<span class="cw-combo-time-value cw-start-time">${formatTime(film.advertised)}</span>` +
      "</div>" +
      '<div class="cw-combo-time-block">' +
      '<span class="cw-combo-time-label">After ads</span>' +
      `<span class="cw-combo-time-value cw-ads-time">${formatTime(film.featureStart)}</span>` +
      "</div>" +
      '<div class="cw-combo-time-block">' +
      '<span class="cw-combo-time-label">Ends</span>' +
      `<span class="cw-combo-time-value cw-end-time">${formatTime(film.end)}</span>` +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderBreak(transition, index) {
    const text = transition.overlap
      ? `ADVERT OVERLAP: miss ${transition.overlap} min of film ${index + 2}'s adverts`
      : `${transition.gap} min break before film ${index + 2}`;

    const overlapClass = transition.overlap ? " cw-break-overlap" : "";

    return `<div class="cw-break${overlapClass}">${text}</div>`;
  }

  function renderComboCard(combo) {
    const films = combo.films;
    const last = films[films.length - 1];
    const comboFormats = getComboFormats(combo);

    const headingBadges = comboFormats.length
      ? `<span class="cw-heading-badges">${comboFormats.map(renderFormatBadge).join("")}</span>`
      : "";

    const timeline = films
      .map((film, index) => {
        const card = renderFilmCard(film, index);
        if (index === films.length - 1) return card;

        return card + renderBreak(combo.transitions[index], index);
      })
      .join("");

    const isPremium = comboFormats.length > 0;
    const premiumClass = isPremium ? " cw-premium-stack" : "";
    const specialLabel = isPremium ? "SPECIAL " : "";

    return (
      `<section class="cw-combo-card${premiumClass}" style="--cw-stack-border: ${getStackBorderGradient(films)}">` +
      '<div class="cw-combo-heading">' +
      `<span class="cw-stack-heading-main">${specialLabel}${films.length}-FILM STACK ${headingBadges}</span>` +
      `<span>${formatTime(films[0].advertised)}-${formatTime(last.end)}</span>` +
      "</div>" +
      timeline +
      "</section>"
    );
  }

  function renderPlanner() {
    const planner = document.getElementById(PLANNER_ID);
    if (!planner) return;

    const hasListings = document.querySelector(S);
    planner.classList.toggle("cw-waiting", !hasListings);
    if (!hasListings) return;

    const minimumGap = Number(q(planner, "#cw-combo-min-gap").value);
    const maximumGap = Number(q(planner, "#cw-combo-max-gap").value);
    const allowOverlap = q(planner, "#cw-overlap-adverts").checked;
    const stackSize = Number(q(planner, "#cw-stack-size").value);

    const arrivalValue = q(planner, "#cw-arrival-time").value;
    const arrivalTime = arrivalValue ? parseTime(arrivalValue) : null;

    const departureValue = q(planner, "#cw-departure-time").value;
    const departureTime = departureValue ? parseTime(departureValue) : null;

    const requiredFilm = q(planner, "#cw-required-film")
      .value.trim()
      .toLocaleLowerCase();

    const allShowings = getShowings();
    const names = uniqueNames(allShowings);
    const seenFilms = getSeenFilms();

    renderList(
      q(planner, ".cw-seen-list"),
      names,
      (name) =>
        '<label class="cw-seen-item">' +
        `<input class="cw-seen-checkbox" type="checkbox" value="${escapeHtml(name)}"${seenFilms.has(name) ? " checked" : ""}>` +
        `<span>${escapeHtml(name)}</span>` +
        "</label>",
      '<span class="cw-no-combos">No films loaded yet.</span>',
    );

    renderList(
      q(planner, "#cw-required-film-options"),
      names,
      (name) => `<option value="${escapeHtml(name)}"></option>`,
      "",
    );

    applySeenFilmState(seenFilms);
    applyArrivalState(arrivalTime);

    const showings = allShowings.filter(
      (showing) => !seenFilms.has(showing.name),
    );

    let combos = findCombos(
      showings,
      minimumGap,
      maximumGap,
      allowOverlap,
      stackSize,
    );

    if (requiredFilm) {
      combos = combos.filter((combo) =>
        combo.films.some((film) =>
          film.name.toLocaleLowerCase().includes(requiredFilm),
        ),
      );
    }

    if (arrivalTime !== null) {
      combos = combos.filter(
        (combo) => combo.films[0].advertised >= arrivalTime,
      );
    }

    if (departureTime !== null) {
      combos = combos.filter(
        (combo) => combo.films[combo.films.length - 1].end <= departureTime,
      );
    }

    const activeFilters = [];
    if (requiredFilm) activeFilters.push("required film");
    if (arrivalTime !== null)
      activeFilters.push(`arrival ${formatTime(arrivalTime)}`);
    if (departureTime !== null)
      activeFilters.push(`departure ${formatTime(departureTime)}`);

    const filterSummary = activeFilters.length
      ? ` | filters: ${activeFilters.join(", ")}`
      : "";

    q(planner, ".cw-planner-summary").textContent =
      `${showings.length} available showings | ${combos.length} possible ${stackSize}-film stacks${filterSummary}`;

    const results = q(planner, ".cw-combo-results");

    if (!combos.length) {
      results.innerHTML = `<p class="cw-no-combos">No matching ${stackSize}-film stacks.</p>`;
      return;
    }

    results.innerHTML = combos.map(renderComboCard).join("");
  }

  const schedulePlannerUpdate = throttle(renderPlanner);

  function updateListings() {
    applySeenFilmState(getSeenFilms());
    getMovies().forEach(addTimes);
    schedulePlannerUpdate();
  }

  function createPlanner() {
    if (document.getElementById(PLANNER_ID)) return;

    const gapOptions = (selected) => {
      let html = "";

      for (let minutes = MIN_GAP; minutes <= MAX_GAP; minutes += 5) {
        html += `<option value="${minutes}"${minutes === selected ? " selected" : ""}>${minutes} min</option>`;
      }

      return html;
    };

    const planner = document.createElement("aside");
    planner.id = PLANNER_ID;
    planner.innerHTML =
      '<div class="cw-planner-header">' +
      '<h2 class="cw-planner-title">Film Combo Planner</h2>' +
      '<div class="cw-planner-actions">' +
      '<button type="button" class="cw-planner-resize" aria-label="Expand planner height by 150 pixels" title="Expand height by 150px">&#8963;</button>' +
      '<button type="button" class="cw-planner-toggle" aria-label="Collapse combo planner" aria-expanded="true">-</button>' +
      "</div>" +
      "</div>" +
      '<div class="cw-planner-body">' +
      '<div class="cw-planner-controls">' +
      '<div class="cw-quad">' +
      '<div class="cw-field">' +
      '<label for="cw-stack-size">Films</label>' +
      '<select id="cw-stack-size"><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>' +
      "</div>" +
      '<div class="cw-field">' +
      '<label for="cw-combo-min-gap">Min gap</label>' +
      `<select id="cw-combo-min-gap">${gapOptions(DEFAULT_GAP)}</select>` +
      "</div>" +
      '<div class="cw-field">' +
      '<label for="cw-combo-max-gap">Max gap</label>' +
      `<select id="cw-combo-max-gap">${gapOptions(DEFAULT_MAX_GAP)}</select>` +
      "</div>" +
      '<div class="cw-field">' +
      '<label for="cw-arrival-time">Arrive</label>' +
      '<input id="cw-arrival-time" type="time" step="300" aria-describedby="cw-arrival-help">' +
      "</div>" +
      '<div class="cw-field">' +
      '<label for="cw-departure-time">Depart</label>' +
      '<input id="cw-departure-time" type="time" step="300" aria-describedby="cw-departure-help">' +
      "</div>" +
      '<div class="cw-field">' +
      '<label for="cw-advert-minutes">Adverts</label>' +
      '<input id="cw-advert-minutes" type="number" min="0" max="120" step="1" value="25" aria-label="Advert minutes">' +
      "</div>" +
      "</div>" +
      '<span id="cw-arrival-help" style="display:none">Exclude combinations whose first advertised film time is earlier than your arrival. Defaults to now plus your usual commute time.</span>' +
      '<span id="cw-departure-help" style="display:none">Exclude combinations whose last film ends after your departure time.</span>' +
      '<div class="cw-required-film-control">' +
      '<input id="cw-required-film" class="cw-required-film-input" type="search" list="cw-required-film-options" placeholder="Search or select one film" autocomplete="off">' +
      '<datalist id="cw-required-film-options"></datalist>' +
      '<button type="button" class="cw-clear-required-film" aria-label="Clear required film" title="Clear required film">x</button>' +
      "</div>" +
      '<label class="cw-checkbox-label" for="cw-overlap-adverts">' +
      '<input id="cw-overlap-adverts" type="checkbox">' +
      "<span>Overlap advert time?</span>" +
      '<span class="cw-help" tabindex="0" aria-label="Overlap advert time help" data-tooltip="Allows one film to finish after the next film\'s advertised start, but only while its estimated adverts are still playing. Results clearly warn how many advert minutes you may miss.">?</span>' +
      "</label>" +
      '<details class="cw-seen-panel">' +
      "<summary>Films to Exclude</summary>" +
      '<div class="cw-seen-list"></div>' +
      "</details>" +
      "</div>" +
      '<p class="cw-planner-summary">Waiting for listings...</p>' +
      '<div class="cw-combo-results" aria-live="polite"></div>' +
      "</div>";

    planner.addEventListener("change", (event) => {
      if (event.target.classList.contains("cw-seen-checkbox")) {
        saveSeenFilms(planner);
      }

      const minSelect = q(planner, "#cw-combo-min-gap");
      const maxSelect = q(planner, "#cw-combo-max-gap");

      if (Number(minSelect.value) > Number(maxSelect.value)) {
        if (event.target === minSelect) maxSelect.value = minSelect.value;
        else if (event.target === maxSelect) minSelect.value = maxSelect.value;
      }

      schedulePlannerUpdate();
    });

    q(planner, "#cw-required-film").addEventListener(
      "input",
      schedulePlannerUpdate,
    );
    q(planner, "#cw-arrival-time").addEventListener(
      "input",
      schedulePlannerUpdate,
    );
    q(planner, "#cw-departure-time").addEventListener(
      "input",
      schedulePlannerUpdate,
    );
    q(planner, "#cw-advert-minutes").addEventListener(
      "input",
      schedulePlannerUpdate,
    );

    q(planner, ".cw-clear-required-film").addEventListener("click", () => {
      const input = q(planner, "#cw-required-film");
      input.value = "";
      input.focus();
      schedulePlannerUpdate();
    });

    q(planner, ".cw-planner-resize").addEventListener("click", (event) => {
      const level = (Number(planner.dataset.heightLevel || 0) + 1) % 4;
      planner.dataset.heightLevel = String(level);

      planner.classList.remove("cw-height-1", "cw-height-2", "cw-height-3");
      if (level) planner.classList.add(`cw-height-${level}`);

      const chevrons = [
        "\u2303",
        "\u2303\u2303",
        "\u2303\u2303\u2303",
        "\u2304",
      ];
      const button = event.currentTarget;
      button.textContent = chevrons[level];

      const isMaxed = level === 3;
      button.setAttribute(
        "aria-label",
        isMaxed
          ? "Return planner to normal height"
          : "Expand planner height by 150 pixels",
      );
      button.title = isMaxed
        ? "Return to normal height"
        : `Expand another 150px (${level * 150}px added)`;
    });

    q(planner, ".cw-planner-toggle").addEventListener("click", (event) => {
      const collapsed = planner.classList.toggle("cw-collapsed");
      const button = event.currentTarget;

      button.textContent = collapsed ? "+" : "-";
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute(
        "aria-label",
        `${collapsed ? "Expand" : "Collapse"} combo planner`,
      );
    });

    q(planner, "#cw-arrival-time").value = defaultArrivalTime();

    document.body.appendChild(planner);
    renderPlanner();
  }

  const scheduleUpdate = throttle(updateListings);

  const observer = new MutationObserver((mutations) => {
    const isRelevant = mutations.some((mutation) => {
      if (mutation.target.closest?.(P)) return false;

      return [...mutation.addedNodes].some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          !node.classList?.contains(O) &&
          !node.closest?.(P),
      );
    });

    if (isRelevant) scheduleUpdate();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  createPlanner();
  updateListings();
})();