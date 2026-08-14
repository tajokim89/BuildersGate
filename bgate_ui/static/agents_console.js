/* agents_console.js — the left half of the Agents cockpit: talk, cat, replies.
 *
 * You say a sentence. The director reads it, answers you, and delegates the
 * pieces. Its children appear on the graph next door with an edge back to the
 * sentence that caused them. That is the whole loop, and this file owns three
 * quarters of it:
 *
 *   · the transcript      — your messages and the director's answers
 *   · the cat             — the floor's mood, in one animated frame and a line
 *   · agent responses     — what every OTHER seat has just said or produced
 *
 * It also owns the ONE poll. /api/console/state answers the whole cockpit in a
 * single request, and the graph is handed the same payload rather than fetching
 * its own — the old view made 1 + 1 + N requests every 3.5 seconds to draw less.
 *
 * THE CAT. The mascot is a real character with real moods, because a floor with
 * seven agents on it has a state that a number cannot carry: idle, working,
 * something wants you, something broke. Drawn as pixel geometry so it inherits
 * the theme and needs no asset — and replaced by a real sprite sheet the moment
 * the project has an approved artifact named "mascot", which is the honest way
 * to let a game's own art take over its tooling.
 */
(function () {
  "use strict";

  // POLL CADENCE, MATCHED TO WHETHER ANYTHING IS ACTUALLY HAPPENING.
  // A fixed 3s tick meant an idle board — nothing running, nothing queued —
  // still rebuilt the whole cockpit twenty times a minute and re-read every live
  // agent's log server-side to do it. 3s is right when you are watching an agent
  // work; it is pure heat when the floor is empty.
  //
  // The numbers come from the settings registry (console.poll_live_ms /
  // console.poll_idle_ms), delivered in the page bootstrap as
  // window.BGATE_SETTINGS — not a second fetch on load. THE FALLBACK IS NOT
  // DECORATION: a page served by an older build, or by a dashboard whose project
  // could not be read, has no bootstrap, and a console that then polls at NaN ms
  // is a console that never refreshes. Clamped as well as defaulted, because a
  // stored 0 would busy-loop the browser against the most expensive endpoint on
  // the server.
  const cfg = (key, fallback, lo, hi) => {
    const raw = Number((window.BGATE_SETTINGS || {})[key]);
    return Number.isFinite(raw) && raw > 0
      ? Math.max(lo, Math.min(raw, hi)) : fallback;
  };
  const POLL_LIVE_MS = cfg("poll_live_ms", 3000, 500, 60000);
  const POLL_IDLE_MS = cfg("poll_idle_ms", 12000, 1000, 300000);

  const SEATS = ["director", "narrative", "gameplay", "tech", "art", "audio", "qa"];
  const SEAT_LABELS = {
    director: "총괄", narrative: "서사", gameplay: "플레이", tech: "기술",
    art: "아트", audio: "오디오", qa: "검수",
  };
  const seatLabel = s => SEAT_LABELS[String(s || "").toLowerCase()] || String(s || "");
  // A seat name lands inside var(--c-…). esc() stops an attribute escape but not
  // a CSS one, and the value is agent-authored — so it is whitelisted, never
  // interpolated raw.
  const seatColor = s => `var(--c-${SEATS.includes(s) ? s : "tech"})`;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const trunc = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const modelError = s => {
    const text = String(s || "").trim();
    if (!text) return "파트너가 답하지 못했습니다";
    if (/OAuth access token has expired|Re-authenticate to continue/i.test(text)) {
      return "Codex CLI 로그인 세션이 만료됐습니다. 터미널에서 `codex login`으로 다시 로그인한 뒤 재시도하세요.";
    }
    if (/OPENAI_API_KEY|API key/i.test(text)) {
      return "API 키 경로가 아니라 로컬 Codex CLI 실행 경로를 써야 합니다. 설정에서 실행기를 `codex`로 다시 확인하세요.";
    }
    return text;
  };

  /* ── the director's work, shown as work ───────────────────────────────────
     A RUNNING TURN USED TO RENDER AS "reading the board…" AND A STEP COUNT.
     The payload already carried the whole feed — every tool call with its name,
     its one-line hint and the files it touched — and the console threw all of it
     away to print a number. Watching the director was therefore strictly less
     informative than watching any other seat, whose steps the graph does show,
     which is backwards: the director is the one you are in conversation with.

     This is deliberately the same vocabulary a CLI session uses, because that is
     what the human is comparing it to. A tool call is a line with a verb and a
     target. Prose is prose. Nothing is invented that the feed did not carry. */

  // A handful of the tools an agent actually reaches for, mapped to a verb a
  // person reads faster than a function name. Anything not here falls back to
  // the tool's own name — a lookup table that silently renames the unknown is
  // how a UI starts lying about what ran.
  const TOOL_VERB = {
    queue_add: "큐에 넣음", queue_add_chain: "체인 구성", queue_update: "수정",
    queue_complete: "닫음", queue_get: "읽음", queue_list: "보드 읽음",
    seat_brief: "지침 확인", seat_post_note: "메모 남김",
    bible_read: "바이블 읽음", bible_add: "바이블 작성",
    lore_add: "로어 추가", lore_fact: "사실 고정", canon_check: "캐논 검사",
    image_generate: "생성", blender_run: "모델링", godot_run: "게임 실행",
    godot_screenshot: "스크린샷", ask_human: "사용자에게 질문",
    agent_steer: "조향", pending_decisions: "막힌 결정 확인",
  };

  const stepIcon = k => k === "tool" ? "▸" : k === "result" ? "■" : k === "steer" ? "↯" : "·";

  /* One sentence out of a paragraph, for the places that only have room for one
     (the cat). Splits on terminal punctuation followed by space, and falls back
     to a hard truncate — a "sentence" splitter that returns nothing on prose
     without full stops would silence the bubble exactly when an agent is being
     terse, which is when it matters most. */
  function firstSentence(text, cap = 180) {
    const t = String(text || "").trim().replace(/\s+/g, " ");
    if (!t) return "";
    const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
    const one = m ? m[1] : t;
    return one.length > cap ? one.slice(0, cap - 1) + "…" : one;
  }

  function dirStep(s) {
    const kind = s.kind === "tool" ? "tool" : s.kind === "steer" ? "steer"
      : s.kind === "result" ? "res" : "say";
    let body;
    if (s.kind === "tool") {
      const name = String(s.name || "tool");
      const verb = TOOL_VERB[name];
      body = `<span class="ck-tool">${esc(verb || name)}</span>`
        + (verb ? `<span class="ck-toolraw">${esc(name)}</span>` : "")
        + (s.hint ? `<span class="ck-hintx">${esc(trunc(s.hint, 90))}</span>` : "");
    } else {
      body = esc(trunc(s.text || "", 400));
    }
    // The paths it named, as chips that open. peek.js binds data-peek globally.
    const files = (s.files || []).map(rel =>
      `<button class="ck-fchip" type="button" data-peek="${esc(rel)}"
               title="${esc(rel)}">${esc(String(rel).split("/").pop())}</button>`).join("");
    return `<div class="ck-step k-${kind}"><i class="ck-stepi">${stepIcon(s.kind)}</i>`
      + `<div class="ck-stepb">${body}`
      + (files ? `<div class="ck-fchips">${files}</div>` : "")
      + `</div></div>`;
  }

  /* How many steps ride in the bubble while it works, and how many stay once it
     is done. A finished turn keeps a FOLD rather than the lot: the answer is the
     product, the steps are the receipt, and a transcript that keeps every
     receipt open is one nobody scrolls. */
  const LIVE_STEPS = 6;

  function dirSteps(reply, done) {
    const steps = (reply.steps || []).filter(s => s && s.kind !== "result");
    if (!steps.length) return "";
    if (!done) {
      const tail = steps.slice(-LIVE_STEPS);
      const hidden = steps.length - tail.length;
      return `<div class="ck-steps-live">`
        + (hidden ? `<div class="ck-step-more">이전 단계 ${hidden}개</div>` : "")
        + tail.map(dirStep).join("") + `</div>`;
    }
    return `<details class="ck-steps-fold"><summary>${steps.length}단계</summary>${
      steps.map(dirStep).join("")}</details>`;
  }

  /* ── the cat ─────────────────────────────────────────────────────────────
     THE CAT IS A REACTION, NOT A NARRATOR. IT HAS NO WORDS AT ALL.

     Two versions of this were wrong in opposite directions. It began as a quote
     machine, rotating canned cowboy lines on a 14-second timer regardless of
     what was happening — the most animated thing on the page was the one
     element guaranteed to be saying nothing true. Feeding it the director's
     real voice fixed the truthfulness and created a worse problem: once the cat
     moved INTO the conversation it sat directly beneath the director's answer
     repeating the first sentence of it. The same words twice, six lines apart,
     with the copy in the louder box.

     There is no bubble now. The transcript is where words go — it has room for
     the whole answer, the tool calls and the files. The cat carries only what
     text cannot: it mouths WHILE a real voice is mid-sentence (see talk), its
     idle animation tracks the floor's mood, and it plays a one-off beat when
     something actually lands, fails or needs a human (see beat). Motion is the
     signal; the reader gets the words from the panel above. */

  /* THE MASCOT IS A SHIPPED SPRITE, not drawn geometry.
     It used to be inline SVG so it would theme itself and need no asset. That
     was the right call while it was a placeholder and the wrong one once the
     pipeline could make a real character: the drawn cat could not be the same
     cat the games use, and a tool whose own art is a wireframe is a poor advert
     for an art pipeline.
     Four cells of 128px: rest, half, wide, blink. The talk cycle walks the
     first three and back with steps(), so the mouth moves while it is
     delivering a line; blink lives in cell 3 and fires on its own timer when
     idle, because a blink on every syllable is a twitch. */
  const CAT_SPRITE = `<div class="cat-sprite" aria-hidden="true"></div>`;

  /* The brainstorm-mode chrome, injected rather than added to app.css — that
   * file belongs to another agent today. Everything here is namespaced under
   * ck- and only paints surfaces this file introduced.
   *
   * --solid-N, never --surface-N, on anything carrying text: Orbit surfaces are
   * translucent and a plan you are about to spend money agreeing to must not
   * have the board showing through it. That exact mistake has shipped twice. */
  const CK_STYLE_ID = "ck-bs-style";
  function injectConsoleStyle() {
    if (document.getElementById(CK_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = CK_STYLE_ID;
    s.textContent = `
/* ONE CONTROL. The mode, the box and the consequence share a border and a
   background so they read as a single thing that changes state — the earlier
   shape (a pill floating above, a footer bolted below) read as three widgets
   stacked by accident, which the user called janky and was right to. */
.ck-say-wrap{border:1px solid var(--line);border-radius:12px;
  background:var(--solid-1);padding:6px 8px 8px}
.ck-say-wrap:focus-within{border-color:var(--accent)}
.ck-say-wrap.bs{border-color:var(--good-line,var(--good))}
.ck-mode{display:inline-flex;gap:2px;padding:2px;margin-bottom:6px;
  background:var(--solid-2);border-radius:999px}
.ck-mode button{padding:3px 12px;border:0;border-radius:999px;background:none;
  color:var(--text-3);font:inherit;font-size:11.5px;cursor:pointer}
.ck-mode button.on{background:var(--solid-0,var(--surface-2));color:var(--text-1)}
.ck-say-wrap.bs .ck-mode button.on{color:var(--good)}
.ck-mode button:hover:not(.on){color:var(--text-2)}
/* The textarea gives up its own border to the wrapper — two nested boxes is
   what made this look bolted together. */
.ck-say-wrap .ck-composer textarea{background:transparent;border-color:transparent;
  padding-left:2px;padding-right:2px}
.ck-say-wrap .ck-composer textarea:focus{border-color:transparent}
.ck-bsfoot{display:flex;align-items:center;gap:10px;margin-top:6px;
  padding-top:7px;border-top:1px solid var(--line);font-size:11px;
  color:var(--text-3);flex-wrap:wrap}
.ck-bsnote b{color:var(--good)}
.ck-bsspace{flex:1}
.ck-bspartner{font-size:10.5px;color:var(--text-3)}
.ck-bspartner.live{color:var(--good)}
.ck-bsdeploy{padding:3px 12px;font-size:11.5px}
.ck-bsbar{padding:7px 10px;margin-bottom:8px;border:1px solid var(--good-line,var(--line));
  background:var(--good-soft,var(--solid-1));border-radius:8px;font-size:11.5px;
  color:var(--text-2);line-height:1.5}
.ck-bsid{color:var(--text-3);font-size:10.5px}
/* THE REVIEW SHEET. Opaque, and it must stay that way — see the note above. */
.ck-sheet{position:fixed;inset:0;z-index:900;display:flex;align-items:center;
  justify-content:center;padding:24px;background:rgba(0,0,0,.55)}
.ck-sheet[hidden]{display:none}
.ck-sh{width:min(760px,100%);max-height:86vh;display:flex;flex-direction:column;
  background:var(--solid-0,#14171c);border:1px solid var(--line-strong,var(--line));
  border-radius:14px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.5)}
.ck-sh-h{padding:14px 16px;border-bottom:1px solid var(--line);background:var(--solid-1)}
.ck-sh-h b{display:block;font-size:14px;color:var(--text-1)}
.ck-safe{display:inline-block;margin-top:3px;font-size:11px;color:var(--good)}
.ck-sh-b{flex:1;min-height:0;overflow:auto;padding:14px 16px;font-size:12.5px}
.ck-sh-f{display:flex;align-items:center;gap:8px;padding:12px 16px;
  border-top:1px solid var(--line);background:var(--solid-1)}
.ck-plansum{margin-bottom:12px;color:var(--text-2);line-height:1.6}
.ck-planwho{margin-bottom:12px;padding:8px 10px;border-radius:8px;
  background:var(--solid-2);color:var(--text-2);line-height:1.55}
.ck-planrow{display:grid;grid-template-columns:88px 1fr;gap:4px 10px;padding:9px 0;
  border-top:1px solid var(--line)}
.ck-planseat{grid-row:span 2;font-size:10.5px;text-transform:uppercase;
  letter-spacing:.05em;color:var(--accent);padding-top:2px}
.ck-plantitle{color:var(--text-1);font-weight:600}
.ck-planbrief{color:var(--text-3);line-height:1.55;white-space:pre-wrap}
.ck-planwait{grid-column:2;font-size:10.5px;color:var(--warn)}
.ck-plannotes{margin-top:12px;font-size:11.5px;color:var(--text-3)}
.ck-plannotes ul{margin:4px 0 0 16px}
`;
    document.head.appendChild(s);
  }

  const AgentsConsole = {
    root: null, mounted: false, timer: null, state: null,
    mood: "idle", line: "", _lineAt: 0, _lineIx: 0, _spriteRel: "", _saidSig: "",
    _sending: false, _lastTurnSig: "", _pinBottom: true, _talkTimer: 0,
    // Who the composer is talking to. null = the director; a number = steer
    // that running agent directly. The director can steer too (agent_steer),
    // this is the human doing it without going through it.
    target: null,
    steers: [],
    // Half-typed answers to open questions, seq -> text. Kept out of the DOM so
    // a repaint of this column cannot take a sentence with it.
    answers: {}, _askSig: "",
    // An archived session being read instead of the live one. The poll keeps
    // running underneath — the graph stays live while you read history.
    viewing: null,

    /* ---- WHAT TALKING DOES ----------------------------------------------
     * "just the conversation type so i can talk about what i want before
     * dispatching" — the same composer and the same transcript, routed at a
     * different backend:
     *
     *   dispatch    /api/console/say. Files a work item, spawns an agent.
     *   brainstorm  /api/brainstorm/{id}/message. A conversation that files
     *               NOTHING. Deploy synthesises a plan, shows it with the
     *               agents it intends to dispatch, and only a confirm queues.
     *
     * A SECOND CHAT UI WAS BUILT HERE AND REMOVED — twice, once as
     * `Brainstorm.mount(..., {pads:false})` and once as `{chrome:"minimal"}`.
     * Both were the wrong shape: this view already has a conversation, and what
     * was wanted was for that conversation to be able to not-dispatch. The
     * brainstorm workspace still exists whole in the director seat, and a
     * session started here is an ordinary director session that shows up in its
     * list — findable rather than a parallel track.
     *
     * bsSession is the session this console is talking in. Remembered in
     * localStorage so the conversation survives a reload, re-resolved against
     * the server on every entry because it can be archived or deleted from the
     * seat view while this tab is open. */
    bsMode: false, bsSession: null, bsBusy: false, bsPlan: null, bsThinker: null,

    /* ---- mount ---------------------------------------------------------- */
    mount() {
      if (this.mounted) return true;
      const chat = document.getElementById("ck-chat");
      const graphHost = document.getElementById("ck-canvas");
      if (!chat || !graphHost) return false;
      this.mounted = true;

      const mascot = document.getElementById("ck-cat");
      if (mascot) mascot.innerHTML = CAT_SPRITE;

      injectConsoleStyle();
      document.querySelectorAll("#ck-mode [data-cmode]").forEach(b =>
        b.onclick = () => this.setSayMode(b.dataset.cmode));
      // No Deploy wiring here: the button does not exist in dispatch mode.
      // renderSayMode builds it and binds it when brainstorm mode is entered.

      const form = document.getElementById("ck-say-form");
      const input = document.getElementById("ck-say");
      if (form) form.onsubmit = e => { e.preventDefault(); this.say(); };
      if (input) {
        input.onkeydown = e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.say(); }
        };
        input.oninput = () => {
          input.style.height = "auto";
          input.style.height = Math.min(150, input.scrollHeight) + "px";
        };
      }
      chat.addEventListener("scroll", () => {
        this._pinBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
      });

      const auto = document.getElementById("ck-auto");
      if (auto) auto.onclick = () => this.toggleAuto();
      document.querySelectorAll("#ck-gate [data-gate]").forEach(b =>
        b.onclick = () => this.setGate(b.dataset.gate, b));
      const filter = document.getElementById("ck-filter");
      if (filter) filter.onclick = () => {
        const mode = window.AgentsGraph
          ? AgentsGraph.setFilter(AgentsGraph.filter === "active" ? "all" : "active")
          : "active";
        filter.textContent = mode === "active" ? "진행 중" : "전체";
        filter.title = mode === "active"
          ? "실행 중, 대기 중, 실패했거나 막 완료된 작업을 표시합니다"
          : "완료된 항목까지 창 안의 모든 작업을 표시합니다";
      };
      const clear = document.getElementById("ck-target-x");
      if (clear) clear.onclick = () => this.aim(null);
      this.bindQueueButtons();
      const panic = document.getElementById("ck-panic");
      if (panic) panic.onclick = () => this.panic();
      const clearBtn = document.getElementById("ck-clear");
      if (clearBtn) clearBtn.onclick = () => this.clearSession();
      const history = document.getElementById("ck-history");
      if (history) history.onclick = () => this.openHistory();
      const relayout = document.getElementById("ck-relayout");
      if (relayout) relayout.onclick = () => window.AgentsGraph && AgentsGraph.relayout();
      const restoreHidden = document.getElementById("ck-restore-hidden");
      if (restoreHidden) restoreHidden.onclick = () => window.AgentsGraph && AgentsGraph.restoreHidden();
      const fit = document.getElementById("ck-fit");
      if (fit) fit.onclick = () => window.AgentsGraph && AgentsGraph.fit();

      if (window.AgentsGraph) {
        AgentsGraph.mount(graphHost, document.getElementById("ck-detail"));
      }
      this.findSprite();
      this.bindDeck();
      this.poll();
      this.retime(POLL_LIVE_MS);
      return true;
    },

    /* One timer, re-armed only when the cadence actually changes. */
    retime(ms) {
      if (this._pollMs === ms && this.timer) return;
      this._pollMs = ms;
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (!this.visible()) return;
        this.poll();
      }, ms);
    },

    /* Is there anything worth a fast tick? Running agents, queued work about to
       be picked up, or something held for approval. An empty board is not. */
    busy() {
      const f = (this.state || {}).floor || {};
      const a = (this.state || {}).autopilot || {};
      return !!(f.running || f.dispatched
        || (a.on && f.queued) || f.review);
    },

    visible() {
      const view = document.getElementById("view-agents");
      const cockpit = document.getElementById("cockpit");
      return !!(view && view.classList.contains("active")
        && cockpit && !cockpit.hidden
        && document.visibilityState !== "hidden");
    },

    activate() {
      if (!this.mount()) return;
      // The mode is restored, not reset. Somebody who left this view mid-
      // conversation and came back to find the composer silently re-armed to
      // dispatch would file the next thought as work — the failure this whole
      // toggle exists to prevent.
      if (!this._modeRestored) {
        this._modeRestored = true;
        let saved = "dispatch";
        try { saved = localStorage.getItem("bgate-ck-mode") || "dispatch"; } catch (e) {}
        if (saved === "brainstorm") { this.setSayMode("brainstorm"); }
        else { this.renderSayMode(); }
      }
      this.poll();
      if (window.AgentsGraph) AgentsGraph.activate();
    },

    /* ---- the one poll --------------------------------------------------- */
    async poll() {
      const state = await window.readJSON("/api/console/state", { turns: [], items: [] });
      if (state.__error) { this.renderError(state.__error); return; }
      const before = this._sig;
      this.state = state;
      this._sig = this.signature(state);
      // THE BELL IS DRIVEN FROM HERE AND HAS NO POLL OF ITS OWN. notify.js keeps
      // one watchdog that every update() pushes back, so while this view is open
      // it never fires and /api/events is read on the drawer's own throttle
      // rather than on a second interval racing this one.
      //
      // ABOVE the repaint skip on purpose. Placed after it, the bell would stop
      // being driven the moment the payload stopped changing — an idle board is
      // exactly when the badge is the only thing on the page that still moves,
      // and it would have gone quiet for the 45s the watchdog takes to notice.
      if (window.Notify) { try { Notify.update(state); } catch (e) { /* never the console's problem */ } }
      this.retime(this.busy() ? POLL_LIVE_MS : POLL_IDLE_MS);
      // NOTHING MOVED: skip the repaint. The graph's rebuild walks every node and
      // the panels rebuild their innerHTML wholesale, and on an idle board that
      // work produced a pixel-identical page. A steer being typed, a dragged
      // node and a scrolled rail all survive better for not being touched.
      if (before && before === this._sig && !this._forceRender) return;
      this._forceRender = false;
      try {
        // An agent that has finished cannot be steered, and a composer still
        // aimed at it would swallow the next thing typed.
        if (this.target) {
          const still = (state.agents || []).some(
            a => a.state === "running" && Number(a.item_id) === this.target.id);
          if (!still) { window.toast(`#${this.target.id} 완료 - 다시 총괄에게 말합니다`); this.aim(null); }
        }
        this.renderChat();
        this.renderQueue();
        this.renderQuestions();
        this.renderReview();
        this.renderReplies();
        this.renderAuto();
        this.renderGate();
        this.renderMood();
        this.renderLive();
        this.renderReveal();
        // AFTER the four page renders, never before: the deck decides which
        // page to show from their counts, and picking on last poll's numbers is
        // how a question that just arrived waits a full tick to be jumped to.
        this.renderDeck();
        if (window.AgentsGraph) AgentsGraph.apply(state);
      } catch (e) { try { console.warn("[agents-console]", e); } catch (_) {} }
    },

    /* A 32-bit digest of the whole payload.
     *
     * Deliberately hashed from the FULL state rather than a hand-picked list of
     * fields: a signature that misses a field is a cockpit that silently stops
     * updating, which is a far worse bug than one wasted stringify. One pass,
     * and only the number is kept — holding the string itself would trade paint
     * time for GC churn every three seconds. */
    signature(state) {
      let text;
      try { text = JSON.stringify(state); } catch (e) { return 0; }
      // THE UNREAD COUNT IS NOT ON THIS PAYLOAD. It comes from /api/events, read
      // by notify.js on its own throttle, and it moves for things this payload
      // cannot show — an event pruned, another tab pressing "mark all read", an
      // answer landing somewhere else. Folded in because the question cards in
      // the column below are painted behind this signature, so without it a card
      // could sit there claiming to be open until something unrelated moved on
      // the board.
      if (window.Notify && window.Notify.mounted) {
        text += `|nt${Notify.readSeq}:${Notify.unread}:${Notify.head}`;
      }
      let h = 5381;
      for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
      return h || 1;
    },

    renderError(message) {
      const chat = document.getElementById("ck-chat");
      if (chat) chat.innerHTML = `<div class="empty err">콘솔에 연결할 수 없습니다 - ${esc(message)}</div>`;
    },

    /* ---- transcript ----------------------------------------------------- */
    renderChat() {
      const box = document.getElementById("ck-chat");
      if (!box) return;
      this.renderSessionBar();

      // BRAINSTORM MODE PAINTS THE SAME BUBBLES FROM A DIFFERENT SOURCE. Same
      // markup on purpose — the whole point is that this is one conversation
      // surface whose CONSEQUENCE changes, not two chat widgets.
      if (this.bsMode) { this.renderBsChat(box); return; }

      // Reading an archived session: same turns, same replies, plus the one
      // thing you came back for — the log of each run.
      if (this.viewing) {
        const v = this.viewing;
        const rows = (v.turns || []).map(t => {
          const r = t.reply || {};
          return `<div class="ck-turn">
            <div class="ck-msg you"><div class="ck-who">사용자</div>
              <div class="ck-txt">${esc(t.said || t.title)}</div></div>
            <div class="ck-msg dir"><div class="ck-who">총괄
                <span class="ck-arch">#${t.id} · ${esc(t.status)}</span></div>
              <div class="ck-txt">${esc(r.text || "(기록된 답변 없음)")}</div>
              <button class="qbtn small ghost" data-log="${t.id}">로그</button></div>
          </div>`;
        }).join("") || `<div class="ck-empty">이 세션에는 대화가 없습니다</div>`;
        box.innerHTML = `<div class="ck-archbar">보관된 세션을 읽는 중 -
          <button class="cg-link" data-back="1">실시간으로 돌아가기</button></div>` + rows;
        box.querySelectorAll("[data-log]").forEach(b =>
          b.onclick = () => window.watchAgent && watchAgent(Number(b.dataset.log)));
        const back = box.querySelector("[data-back]");
        if (back) back.onclick = () => this.backToLive();
        this._lastTurnSig = "archived:" + (v.session || {}).id;
        return;
      }

      const turns = ((this.state || {}).turns || []);
      if (!turns.length && !this._sending && !this.steers.length) {
        box.innerHTML = `<div class="ck-welcome">
          <p>원하는 일을 총괄에게 말하세요. 총괄이 보드를 읽고 답한 뒤,
             처리할 수 있는 좌석에 나누어 맡깁니다.</p>
          <p class="ck-eg">“허브 화면이 밋밋하니 패럴랙스와 낮/밤 색감을 넣어줘”
             · “적 스프라이트가 설정과 다르니 세트를 고쳐줘”</p>
        </div>`;
        return;
      }
      // The step COUNT is in the signature as well as the text length: a turn
      // that is working its way through tool calls changes nothing else, and
      // without this the feed froze at whatever it had when the answer's length
      // last moved — which looked exactly like a stalled agent.
      const sig = turns.map(t => `${t.id}:${t.status}:${(t.reply || {}).running ? 1 : 0}:${((t.reply || {}).text || "").length}:${(t.reply || {}).step_count || 0}`).join("|")
        + "//" + this.syncSteers();
      const rows = turns.map(t => {
        const r = t.reply || {};
        const answer = r.text
          ? `<div class="ck-msg dir"><div class="ck-who">총괄</div>
               ${dirSteps(r, true)}
               <div class="ck-txt">${esc(r.text)}</div>
               ${r.cost ? `<div class="ck-cost">$${Number(r.cost).toFixed(3)}</div>` : ""}</div>`
          : r.running
            ? `<div class="ck-msg dir live"><div class="ck-who">총괄 <span class="ck-dots"><i></i><i></i><i></i></span></div>
                 ${dirSteps(r, false)}
                 <div class="ck-txt thinking">${esc(r.thinking || "보드를 읽는 중...")}</div></div>`
            : t.status === "failed"
              ? `<div class="ck-msg dir bad"><div class="ck-who">총괄</div>
                   <div class="ck-txt">이 턴은 실패했습니다. 그래프에서 로그를 여세요.</div></div>`
              : `<div class="ck-msg dir"><div class="ck-who">총괄</div>
                   <div class="ck-txt thinking">아직 투입되지 않았습니다. 아무도 읽지 않았습니다.</div>
                   <button class="qbtn small" data-deploy="${t.id}">투입</button></div>`;
        return `<div class="ck-turn" data-turn="${t.id}">
          <div class="ck-msg you"><div class="ck-who">사용자</div>
            <div class="ck-txt">${esc(t.said || t.title)}</div></div>
          ${answer}
        </div>`;
      }).join("");
      const pending = this._sending
        ? `<div class="ck-turn"><div class="ck-msg you"><div class="ck-who">사용자</div>
             <div class="ck-txt">${esc(this._sending)}</div></div>
           <div class="ck-msg dir live"><div class="ck-who">총괄 <span class="ck-dots"><i></i><i></i><i></i></span></div>
             <div class="ck-txt thinking">깨우는 중...</div></div></div>` : "";
      if (sig !== this._lastTurnSig || pending) {
        this._lastTurnSig = sig;
        box.innerHTML = rows + this.steerHTML() + pending;
        if (this._pinBottom) box.scrollTop = box.scrollHeight;
      }
      // Clicking a turn selects it on the graph — the sentence and its
      // consequences are the same object seen twice.
      box.querySelectorAll(".ck-turn").forEach(el => el.onclick = () => {
        if (window.AgentsGraph) AgentsGraph.select("turn_" + el.dataset.turn);
      });
      box.querySelectorAll("[data-deploy]").forEach(b => b.onclick = e => {
        e.stopPropagation();
        this.deploy(Number(b.dataset.deploy), b);
      });
    },

    /* Steers you sent, in the transcript with the rest of the conversation —
       a message to an agent is part of the same exchange, and a steer that
       vanished into a chip on another panel is a steer you cannot remember
       sending. "queued" flips to "read" when the agent's own log echoes it. */
    syncSteers() {
      const steps = (this.state || {}).steps || {};
      const now = Date.now();
      this.steers = this.steers.filter(s => now - s.at < 240000);
      this.steers.forEach(s => {
        if (s.state !== "queued") return;
        const echoed = (steps[String(s.id)] || []).some(
          x => x.kind === "steer" && String(x.text || "").includes(s.text.slice(0, 40)));
        if (echoed) s.state = "read";
      });
      return this.steers.map(s => s.id + ":" + s.state).join(",");
    },

    steerHTML() {
      return this.steers.slice(-6).map(s => {
        const note = s.state === "sending" ? "보내는 중..."
          : s.state === "error" ? "전달 실패 - " + esc(s.err || "")
            : s.state === "read" ? "에이전트가 읽었습니다"
              : "대기 중 - 에이전트가 현재 단계를 끝내면 읽습니다";
        return `<div class="ck-turn"><div class="ck-msg steer ${esc(s.state)}">
          <div class="ck-who">사용자 → 에이전트 #${s.id}</div>
          <div class="ck-txt">${esc(s.text)}</div>
          <div class="ck-steps">${note}</div></div></div>`;
      }).join("");
    },

    /* Point the composer at one running agent (or back at the director).
       Called from the graph's detail rail and by the "@41 …" prefix. */
    aim(itemId, item) {
      this.target = itemId ? { id: Number(itemId), seat: (item && item.seat) || "",
                               title: (item && item.title) || "" } : null;
      // The composer's aim is client state, not payload state, so the next poll
      // would skip the repaint that shows it.
      this._forceRender = true;
      const chip = document.getElementById("ck-target");
      const input = document.getElementById("ck-say");
      if (chip) {
        chip.hidden = !this.target;
        const label = chip.querySelector(".ck-target-l");
        if (label && this.target) {
          label.textContent = `조향 #${this.target.id}`
            + (this.target.seat ? ` · ${seatLabel(this.target.seat)}` : "");
          label.title = this.target.title || "";
        }
      }
      if (input) {
        input.placeholder = this.target
          ? "그 에이전트에게 바로 말하기 - 현재 단계를 끝내면 읽습니다..."
          : "원하는 일을 총괄에게 말하기 - 답한 뒤 위임합니다...";
        input.focus();
      }
      const send = document.getElementById("ck-send");
      if (send) send.textContent = this.target ? "조향" : "전송";
    },

    renderBsChat(box) {
      const s = this.bsSession;
      const msgs = (s && s.messages) || [];
      // The cockpit's poll repaints every few seconds. Rebuilding this
      // transcript's innerHTML on each tick would drop a text selection and
      // fight the scroll position for no gain, so an unchanged conversation
      // paints once.
      const sig = "bs:" + (s ? s.id : 0) + ":" + msgs.length
        + ":" + (this.bsBusy ? 1 : 0) + ":" + (this.bsError || "");
      if (sig === this._lastTurnSig) return;
      let html = `<div class="ck-bsbar">총괄과 생각 정리 중 -
        <b>여기 내용은 아직 보드에 올라가지 않습니다.</b> 투입은 작업안을 먼저
        보여주고, 사용자가 확인해야 큐에 넣습니다.${s ? ` <span class="ck-bsid">#${s.id}
        · 총괄 좌석 세션</span>` : ""}</div>`;
      html += msgs.map(m => `<div class="ck-msg ${m.role === "user" ? "you" : "dir"}">
          <div class="ck-who">${m.role === "user" ? "사용자" : "총괄"}</div>
          <div class="ck-txt">${esc(m.text)}</div></div>`).join("")
        || `<div class="ck-empty">생각 중인 내용을 말하세요. 총괄은 답하고
            반문하지만, 아무 작업도 만들지 않습니다.</div>`;
      if (this.bsBusy) {
        html += `<div class="ck-msg dir"><div class="ck-who">총괄</div>
          <div class="ck-txt">…</div></div>`;
      }
      if (this.bsError) {
        // The saved-but-unanswered case has to read differently from a send
        // that failed, or somebody retypes a message the server already has.
        html += `<div class="ck-msg dir err"><div class="ck-who">메시지는 저장됐지만
          파트너가 답하지 못했습니다</div>
          <div class="ck-txt">${esc(modelError(this.bsError))}</div></div>`;
      }
      box.innerHTML = html;
      this._lastTurnSig = sig;
      if (this._pinBottom) box.scrollTop = box.scrollHeight;
    },

    /* ---- Deploy: the gate, and it is the reason this mode exists ---------
     * Two calls, and the first one writes nothing. synthesize reads the
     * conversation and PROPOSES; the human reads the proposal, including which
     * seats would be dispatched; only confirm files. Deploy never
     * re-synthesises — asking again at confirm time would file a plan nobody
     * read, which makes the review step theatre. */
    async bsDeployOpen() {
      const s = this.bsSession;
      if (!s) return;
      this.bsSheet(`<div class="ck-sh-h"><b>대화를 읽는 중...</b>
        <span class="ck-safe">아직 큐에 넣지 않습니다. 이 단계는 읽기만 합니다.</span></div>
        <div class="ck-sh-b"><div class="ck-empty">작업안을 만드는 중...</div></div>`);
      let r;
      try {
        r = await window.mutate(`/api/brainstorm/${s.id}/synthesize`,
          { body: {}, quiet: true });
      } catch (e) { r = { ok: false, error: "대시보드에 닿지 못했습니다" }; }
      if (!r.ok) {
        this.bsSheet(`<div class="ck-sh-h"><b>작업 초안을 만들지 못했습니다</b>
          <span class="ck-safe">큐에는 아무것도 넣지 않았습니다.</span></div>
          <div class="ck-sh-b">${esc(r.error || "작업 계획 작성 실패")}</div>
          <div class="ck-sh-f"><button class="qbtn ghost" data-x="close">닫기</button></div>`);
        return;
      }
      this.bsPlan = (r.data || {}).plan || null;
      this.bsRenderPlan();
    },

    bsRenderPlan() {
      const plan = this.bsPlan || {};
      const items = plan.items || [];
      const rows = items.map((it, i) => `<div class="ck-planrow">
          <span class="ck-planseat">${esc(seatLabel(it.seat))}</span>
          <span class="ck-plantitle">${esc(it.title)}</span>
          <span class="ck-planbrief">${esc(String(it.brief || "").slice(0, 400))}</span>
          ${plan.chained && i ? `<span class="ck-planwait">위 작업을 기다림</span>` : ""}
        </div>`).join("")
        || `<div class="ck-empty">총괄이 제안한 작업이 없습니다. 계속 이야기하거나 닫으세요.</div>`;
      // NAMED SEATS, NOT A COUNT. "queue 4 items" tells you nothing about what
      // is about to be spawned; the seats are what a person checks before
      // agreeing to spend on them.
      const seats = [...new Set(items.map(i => i.seat))];
      const who = seats.length
        ? `<div class="ck-planwho"><b>${items.length}개 작업</b>을 큐에 넣고
           <b>${esc(seats.map(seatLabel).join(", "))}</b> 좌석을 투입합니다${plan.chained
             ? " - 앞 작업을 기다리는 체인으로 실행" : ""}.</div>` : "";
      const notes = (plan.notes || []).length
        ? `<div class="ck-plannotes"><b>작업안에 반영된 교정</b>
           <ul>${plan.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : "";
      const asks = (plan.questions || []).length
        ? `<div class="ck-plannotes"><b>확인이 필요한 항목</b>
           <ul>${plan.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ul></div>` : "";
      this.bsSheet(`<div class="ck-sh-h"><b>큐에 넣기 전 검토</b>
          <span class="ck-safe">아직 기록된 작업은 없습니다.</span></div>
        <div class="ck-sh-b">
          ${plan.summary ? `<div class="ck-plansum">${esc(plan.summary)}</div>` : ""}
          ${who}${asks}${rows}${notes}
        </div>
        <div class="ck-sh-f">
          <button class="qbtn ghost" data-x="close">취소</button>
          <span class="ck-bsspace"></span>
          <button class="qbtn" data-x="confirm" ${items.length ? "" : "disabled"}>
            확인 - ${items.length}개 작업 큐에 넣기</button>
        </div>`);
    },

    async bsConfirm() {
      const s = this.bsSession;
      if (!s || !this.bsPlan) return;
      const r = await window.mutate(`/api/brainstorm/${s.id}/deploy`,
        { body: { plan: this.bsPlan }, quiet: true });
      if (!r.ok) {
        window.toast(r.error || "기록된 작업이 없습니다");
        return;
      }
      const filed = (r.data || {}).filed || [];
      this.bsSheetClose();
      window.toast(`${filed.length}개 작업을 큐에 넣었습니다`);
      await this.bsLoad(s.id);
      // The board is the other half of this view and it just changed.
      this._lastTurnSig = "";
      this.poll();
      this.renderChat();
    },

    bsSheet(html) {
      let el = document.getElementById("ck-bssheet");
      if (!el) {
        el = document.createElement("div");
        el.id = "ck-bssheet";
        el.className = "ck-sheet";
        document.body.appendChild(el);
        el.onclick = ev => {
          if (ev.target === el) return this.bsSheetClose();
          const b = ev.target.closest("[data-x]");
          if (!b) return;
          if (b.dataset.x === "close") this.bsSheetClose();
          if (b.dataset.x === "confirm") this.bsConfirm();
        };
      }
      el.hidden = false;
      el.innerHTML = `<div class="ck-sh">${html}</div>`;
    },

    bsSheetClose() {
      const el = document.getElementById("ck-bssheet");
      if (el) { el.hidden = true; el.innerHTML = ""; }
      this.bsPlan = null;
    },

    /* ---- brainstorm mode ------------------------------------------------ */

    /** Flip what sending does. Purely client state — nothing is written until
     *  somebody actually says something. */
    async setSayMode(mode) {
      const want = mode === "brainstorm";
      if (want === this.bsMode) return;
      this.bsMode = want;
      try { localStorage.setItem("bgate-ck-mode", want ? "brainstorm" : "dispatch"); } catch (e) {}
      // AIMING AND BRAINSTORMING ARE INCOMPATIBLE. The target rail points the
      // composer at one running agent; a brainstorm has no agent to steer, and
      // leaving it aimed would send a thinking sentence into a working session.
      if (want && this.target) this.setTarget(null);
      this.renderSayMode();
      if (want) await this.bsEnsureSession();
      this._lastTurnSig = "";
      this.renderChat();
    },

    renderSayMode() {
      document.querySelectorAll("#ck-mode [data-cmode]").forEach(b =>
        b.classList.toggle("on", (b.dataset.cmode === "brainstorm") === this.bsMode));
      // CREATED AND REMOVED, NEVER HIDDEN. This strip says "no work item, no
      // dispatch" — under a composer that in the other mode files work and
      // spawns an agent. It shipped visible in dispatch mode for a few minutes
      // because it lived in the markup with a `hidden` attribute and this
      // file's own `.ck-bsfoot{display:flex}` beat it; `hidden` is a default,
      // not a guarantee. A wrong promise about consequences is not a cosmetic
      // bug, so the element simply does not exist unless it is true.
      const wrap = document.getElementById("ck-say-wrap");
      let foot = document.getElementById("ck-bsfoot");
      if (!this.bsMode) {
        if (foot) foot.remove();
      } else if (!foot && wrap) {
        foot = document.createElement("div");
        foot.className = "ck-bsfoot";
        foot.id = "ck-bsfoot";
        foot.innerHTML = `<span class="ck-bsnote"><b>아직 기록하지 않음</b> ·
            투입을 누르기 전에는 작업 생성도 에이전트 실행도 없습니다</span>
          <span class="ck-bsspace"></span>
          <span class="ck-bspartner" id="ck-bspartner"></span>
          <button class="qbtn ck-bsdeploy" id="ck-bsdeploy" type="button">투입</button>`;
        wrap.appendChild(foot);
        foot.querySelector("#ck-bsdeploy").onclick = () => this.bsDeployOpen();
      }
      const input = document.getElementById("ck-say");
      if (input && !this.target) {
        input.placeholder = this.bsMode
          ? "생각을 그대로 말하기 - 투입을 누르기 전에는 기록하지 않습니다..."
          : "원하는 일을 총괄에게 말하기 - 답한 뒤 위임합니다...";
      }
      const send = document.getElementById("ck-send");
      if (send && !this.target) send.textContent = this.bsMode ? "말하기" : "전송";
      if (wrap) wrap.classList.toggle("bs", this.bsMode);
      this.renderBsPartner();
    },

    renderBsPartner() {
      const el = document.getElementById("ck-bspartner");
      if (!el) return;
      const t = this.bsThinker;
      if (!t) { el.textContent = ""; return; }
      const cost = Number(t.spent_usd || 0);
      el.textContent = (t.live ? "파트너 실행 중" : "파트너 종료")
        + (t.turns ? ` · ${t.turns}턴` : "")
        + (cost ? ` · $${cost.toFixed(2)}` : "");
      el.className = "ck-bspartner" + (t.live ? " live" : "");
      el.title = t.label ? `생각 파트너: ${t.label}` : "";
    },

    /** The director session this console brainstorms in.
     *
     * Reuses the most recent open director session rather than opening a new
     * one per visit — "one ongoing conversation" is the point, and a view that
     * minted a session every time you clicked the tab would fill the seat's
     * list with empty rooms. Creates one only when there is genuinely none.
     */
    async bsEnsureSession() {
      let want = 0;
      try { want = Number(localStorage.getItem("bgate-ck-bs")) || 0; } catch (e) {}
      let list = [];
      try {
        const r = await fetch("/api/brainstorm?seat=director");
        const b = await r.json();
        list = ((b.data || {}).sessions || []).filter(s => s.status !== "archived");
      } catch (e) { list = []; }
      let pick = list.filter(s => s.id === want)[0] || list[0] || null;
      if (!pick) {
        const made = await window.mutate("/api/brainstorm",
          { body: { seat: "director", title: "에이전트 콘솔에서 시작" }, quiet: true });
        if (!made.ok) { window.toast("브레인스토밍 세션을 열 수 없습니다"); return null; }
        pick = made.data;
      }
      try { localStorage.setItem("bgate-ck-bs", String(pick.id)); } catch (e) {}
      await this.bsLoad(pick.id);
      return this.bsSession;
    },

    async bsLoad(id) {
      try {
        const r = await fetch("/api/brainstorm/" + id);
        const b = await r.json();
        if (!b || b.ok === false) return null;
        this.bsSession = b.data;
        this.bsThinker = b.data.thinker || null;
        this.renderBsPartner();
        return this.bsSession;
      } catch (e) { return null; }
    },

    /** One brainstorm turn. Same composer, same disable-and-restore contract as
     *  say(), and the same promise: the sentence comes back if it did not land. */
    async bsSay(text, input) {
      const session = this.bsSession || await this.bsEnsureSession();
      if (!session) { if (input) input.value = text; return; }
      // Optimistic, and honest: the server stores the human's message BEFORE it
      // asks the partner and keeps it if the partner fails, so showing it
      // immediately is a fact rather than a hope.
      (this.bsSession.messages = this.bsSession.messages || [])
        .push({ id: "tmp", role: "user", text });
      this.bsBusy = true;
      this.renderChat();
      let r;
      try {
        r = await window.mutate(`/api/brainstorm/${session.id}/message`,
          { body: { text }, button: "ck-send", quiet: true });
      } catch (err) {
        r = { ok: false, _local: true, error: "브레인스토밍 메시지를 보낼 수 없습니다" };
      } finally {
        this.bsBusy = false;
        this._sending = false;
        if (input) { input.disabled = false; input.focus(); }
      }
      this.bsSession.messages = (this.bsSession.messages || [])
        .filter(m => m.id !== "tmp");
      if (!r.ok) {
        // Nothing was stored on a thrown error: give them their sentence back.
        if (input) input.value = text;
        window.toast(r.error || "브레인스토밍 응답이 없습니다");
        this.renderChat();
        return;
      }
      const d = r.data || {};
      if (d.message) this.bsSession.messages.push(d.message);
      if (d.reply) this.bsSession.messages.push(d.reply);
      this.bsThinker = d.thinker || this.bsThinker;
      this.renderBsPartner();
      // A 200 with reply:null is the no-partner path — the text IS saved, so
      // the box stays empty and the transcript says what happened instead.
      if (d.model && d.model.ok === false) {
        this.bsError = modelError(d.model.error || "파트너가 답하지 못했습니다");
      } else { this.bsError = null; }
      this.renderChat();
    },

    async say() {
      const input = document.getElementById("ck-say");
      let text = (input && input.value || "").trim();
      if (!text) return;
      if (this._sending) return;
      // BRAINSTORM BRANCHES BEFORE THE @-AIM AND BEFORE /api/console/say. There
      // is no agent to steer in a conversation that has not dispatched one.
      if (this.bsMode) {
        this._sending = text;
        if (input) { input.value = ""; input.style.height = "auto"; input.disabled = true; }
        await this.bsSay(text, input);
        return;
      }

      // "@41 slow down" aims one message without changing the target — the
      // keyboard path for the same thing the rail's button does.
      const at = text.match(/^@#?(\d+)\s+([\s\S]+)$/);
      const aimed = at ? Number(at[1]) : (this.target && this.target.id) || 0;
      if (at) text = at[2].trim();
      if (aimed) {
        if (input) { input.value = ""; input.style.height = "auto"; }
        await this.steer(aimed, text);
        return;
      }
      this._sending = text;
      if (input) { input.value = ""; input.style.height = "auto"; input.disabled = true; }
      // THE COMPOSER MUST COME BACK, whatever happens in between. It disables
      // itself while a turn is in flight and _sending gates re-entry — so a
      // throw anywhere below (a render against a null state after a failed
      // poll, say) used to leave the box disabled and the gate stuck closed
      // forever, and only a reload got the page back.
      let r;
      try {
        this.renderChat();
        r = await window.mutate("/api/console/say", { body: { text }, button: "ck-send" });
      } catch (err) {
        try { console.warn("[agents-console] say", err); } catch (e) {}
        // _local marks a failure mutate() never saw, so it never toasted it.
        r = { ok: false, _local: true,
              error: "콘솔 메시지를 보낼 수 없습니다. 계속되면 새로고침하세요" };
      } finally {
        this._sending = false;
        if (input) { input.disabled = false; input.focus(); }
      }
      if (!r.ok) {
        if (r._local) window.toast(r.error);
        // The message is not lost — the operator gets their sentence back.
        if (input) input.value = text;
        this._lastTurnSig = "";
        this.renderChat();
        return;
      }
      const data = r.data || {};
      if (data.dispatched === false && data.refusal) {
        // A dirty tree is the one refusal the browser can actually resolve, and
        // dirtygate.js already owns that conversation — but it only hooks
        // /api/queue/{id}/dispatch. Re-dispatching the turn through that URL is
        // what gets the operator the "run anyway" button instead of a dead end.
        if (data.refusal.code === "dirty_tree" && data.turn_id) {
          const again = await window.mutate(`/api/queue/${data.turn_id}/dispatch`, { quiet: true });
          if (!again.ok) window.toast(`큐에는 넣었지만 투입하지 못했습니다 - ${data.refusal.message}`);
        } else {
          window.toast(`큐에는 넣었지만 투입하지 못했습니다 - ${data.refusal.message}`);
        }
      }
      this._lastTurnSig = "";
      this.speak(data.dispatched === false ? "broken" : "working", true);
      this.poll();
    },

    /* A message straight to a working agent. It lands as a user turn in that
       agent's live session, which it reads when its current step ends — so the
       chip says "queued" until the agent's own log echoes it back. */
    async steer(itemId, text) {
      const entry = { id: Number(itemId), text, state: "sending", at: Date.now() };
      this.steers.push(entry);
      this._lastTurnSig = "";
      this.renderChat();
      const r = await window.mutate(`/api/queue/${itemId}/steer`,
                                    { body: { text }, quiet: true });
      entry.state = r.ok ? "queued" : "error";
      entry.err = r.error;
      if (!r.ok) window.toast(r.error);
      this._lastTurnSig = "";
      this.renderChat();
      this.speak("working", true);
      this.poll();
    },

    /* ---- the kill switch ------------------------------------------------
     * One button, one call, no arguments: in the moment you need this you are
     * not going to enumerate item ids. It turns auto-deploy off FIRST — killing
     * agents while the loop is still on just dispatches a replacement into the
     * gap — then kills every tree, reaps orphans from any earlier dashboard,
     * and settles the items so the board stops claiming work is running. */
    async panic() {
      const running = ((this.state || {}).floor || {}).running || 0;
      const yes = await window.askConfirm({
        title: running ? `실행 중인 에이전트 ${running}개를 멈출까요?`
                       : "모두 멈출까요?",
        body: "이 프로젝트의 모든 에이전트와 그 하위 프로세스를 종료하고, "
            + "대체 작업이 자동으로 들어가지 않도록 자동 투입을 끕니다.\n\n"
            + "진행 중 작업은 사라집니다. 항목은 완료가 아니라 중지로 표시되므로 "
            + "무엇이 끊겼는지 보고 다시 큐에 넣을 수 있습니다.\n\n"
            + "터미널에서는 `bgate panic`과 같은 동작입니다.",
        ok: "모두 멈추기", cancel: "계속 실행", danger: true,
      });
      if (!yes) return;
      const r = await window.mutate("/api/console/killswitch",
                                    { body: { reason: "stopped from the console" },
                                      button: "ck-panic" });
      if (!r.ok) return;
      const d = r.data || {};
      const bits = [`에이전트 ${(d.stopped || []).length}개 중지`];
      if ((d.orphans || []).length) bits.push(`고립 프로세스 ${d.orphans.length}개 정리`);
      if (d.autopilot) bits.push("자동 투입 꺼짐");
      window.toast(bits.join(" · "), "ok");
      (d.errors || []).forEach(e => window.toast(e));
      this.speak("broken", true);
      this.poll();
    },

    /* ---- sessions: clear the console, come back to it later -------------
     * "Clear" files the conversation and moves a cut line. It deletes nothing:
     * every turn is still a work item and every run's log is still on disk,
     * which is the only reason clearing is safe to offer at all. */
    async clearSession() {
      const turns = ((this.state || {}).turns || []).length;
      if (!turns) { window.toast("정리할 대화가 없습니다"); return; }
      const yes = await window.askConfirm({
        title: "이 대화를 보관할까요?",
        body: `위의 ${turns}턴을 기록으로 옮기고 콘솔을 새로 시작합니다.\n\n`
            + "삭제되는 것은 없습니다. 작업 항목은 보드에 남고, 모든 에이전트 "
            + "로그도 그대로 둡니다. 기록에서 다시 열 수 있습니다.",
        ok: "보관", cancel: "계속 열어두기",
      });
      if (!yes) return;
      const r = await window.mutate("/api/console/clear",
                                    { button: "ck-clear", ok: "보관됨 - 새 콘솔" });
      if (!r.ok) return;
      this.viewing = null;
      this._lastTurnSig = "";
      this.steers = [];
      this.poll();
    },

    async openHistory() {
      const sessions = ((this.state || {}).sessions || []);
      if (!sessions.length) {
        window.toast("이전 세션이 아직 없습니다. '정리'를 누르면 현재 세션을 보관합니다.");
        return;
      }
      const pick = await window.askPick({
        title: "이전 대화",
        placeholder: "검색...",
        empty: "일치하는 세션이 없습니다",
        items: sessions.map(s => ({
          value: s.id,
          label: s.title || `세션 ${s.id}`,
          meta: `${s.turns}턴 · #${s.from_id}–#${s.to_id}`,
          tags: [{ text: (s.at || "").slice(0, 16) }],
        })),
      });
      if (pick == null) return;
      const data = await window.readJSON(`/api/console/session/${pick}`, null);
      if (!data || data.__error) {
        window.toast(`그 세션을 열 수 없습니다 - ${(data && data.__error) || "사라짐"}`);
        return;
      }
      this.viewing = data;
      this._lastTurnSig = "";
      this.renderChat();
    },

    backToLive() {
      this.viewing = null;
      this._lastTurnSig = "";
      this.renderChat();
      this.renderSessionBar();
    },

    renderSessionBar() {
      const label = document.getElementById("ck-sess");
      if (!label) return;
      const s = this.state || {};
      if (this.viewing) {
        const v = this.viewing.session || {};
        label.innerHTML = `<b>보관됨</b> · ${esc(trunc(v.title || "세션", 34))}`;
        label.classList.add("archived");
      } else {
        const n = (s.turns || []).length;
        label.textContent = n ? `현재 세션 · ${n}턴` : "현재 세션";
        label.classList.remove("archived");
      }
      const clear = document.getElementById("ck-clear");
      if (clear) clear.textContent = this.viewing ? "실시간으로" : "정리";
      if (clear) clear.onclick = this.viewing ? () => this.backToLive()
                                              : () => this.clearSession();
    },

    /* ---- the queue: work that exists but is not happening ---------------
     * Deploying is the human's move, and it is the only door onto the graph.
     * That is the whole shape of this page: the director files work here, you
     * decide what actually runs, and the canvas next door shows exactly what
     * is live — never a wishlist. (Auto-deploy, if you turn it on, presses this
     * button for you.) */
    /* Undispatched chat turns are queued work like any other. A message whose
       dispatch was refused (or that you cancelled at the dirty-tree prompt)
       used to appear nowhere you could act on it — the transcript said "queued"
       and the one panel that can deploy did not list it. */
    queuedItems() {
      const s = this.state || {};
      return (s.turns || []).filter(t => t.status === "queued")
        .map(t => ({ ...t, seat: "director", title: t.said || t.title, _turn: true }))
        .concat((s.items || []).filter(
          i => i.status === "queued" && i.source !== "chat"));
    },

    /* The queue's two buttons live in the deck header and are rebuilt whenever
       the deck turns to that page, so their handlers cannot be bound once at
       mount — this is called from both places. */
    bindQueueButtons() {
      const all = document.getElementById("ck-deploy-all");
      if (all) all.onclick = () => this.deployAll();
      const clearQ = document.getElementById("ck-clear-queue");
      if (clearQ) clearQ.onclick = () => this.clearQueue();
      this.renderQueue();
    },

    renderQueue() {
      const box = document.getElementById("ck-queue");
      if (!box) return;
      const queued = this.queuedItems();
      const n = document.getElementById("ck-queue-n");
      if (n) n.textContent = String(queued.length);
      const all = document.getElementById("ck-deploy-all");
      if (all) all.disabled = !queued.length;
      const clear = document.getElementById("ck-clear-queue");
      if (clear) clear.disabled = !queued.length;

      box.innerHTML = queued.slice(0, 20).map(i => {
        // A chain link whose predecessor has not landed cannot be deployed, and
        // the button used to be offered anyway — one click, one refusal, no
        // explanation of what it was waiting for.
        const w = i.waiting_on;
        const held = i.ready === false && w;
        return `
        <div class="ck-q${i._turn ? " turn" : ""}${held ? " held" : ""}" data-id="${i.id}">
          <span class="ck-rep-seat" style="color:${seatColor(i.seat)}">${
            i._turn ? "내 요청" : esc(seatLabel(i.seat))}</span>
          <span class="ck-rep-t" title="${esc(i.brief_preview || i.title)}">${esc(trunc(i.title, 52))}</span>
          ${held
            ? `<span class="ck-hold" title="${esc(w.title || "")}">#${w.id} ${esc(seatLabel(w.seat))} · ${esc(w.status)} 대기</span>`
            : `<button class="qbtn small" data-deploy="${i.id}">투입</button>`}
          <button class="ck-x" data-discard="${i.id}" title="이 티켓 버리기"
                  aria-label="버리기">×</button>
        </div>`; }).join("")
        || `<div class="ck-empty">대기 중인 작업이 없습니다. 위에서 요청하세요.</div>`;
      box.querySelectorAll("[data-deploy]").forEach(b =>
        b.onclick = () => this.deploy(Number(b.dataset.deploy), b));
      box.querySelectorAll("[data-discard]").forEach(b =>
        b.onclick = () => this.discard(Number(b.dataset.discard), b));
    },

    /* Discard, not delete: the item goes to 'cancelled' with a reason, so a
       ticket that was called off still reads as called-off on the board and in
       the timeline rather than vanishing without an account of itself. */
    async discard(id, btn) {
      const r = await window.mutate(`/api/queue/${id}/cancel`,
        { body: { reason: "콘솔 큐에서 버림" },
          ok: `#${id} 버림`, button: btn });
      if (!r.ok) return;
      this.poll();
    },

    async clearQueue() {
      const queued = this.queuedItems();
      if (!queued.length) { window.toast("큐가 이미 비어 있습니다"); return; }
      const yes = await window.askConfirm({
        title: `${queued.length}개 티켓을 버릴까요?`,
        body: "큐에서 기다리는 항목을 모두 취소합니다. 삭제하지 않고 사유와 함께 "
            + "취소 표시만 하므로 보드에는 기록이 남습니다.\n\n이미 실행 중인 "
            + "작업은 건드리지 않습니다.",
        ok: "버리기", cancel: "유지", danger: true,
      });
      if (!yes) return;
      let gone = 0;
      for (const item of queued) {
        const r = await window.mutate(`/api/queue/${item.id}/cancel`,
          { body: { reason: "콘솔에서 큐 비움" }, quiet: true });
        if (r.ok) gone += 1;
      }
      window.toast(gone ? `${gone}개 티켓을 버렸습니다` : "버릴 수 있는 항목이 없습니다",
                   gone ? "ok" : undefined);
      this.poll();
    },

    async deploy(id, btn) {
      // Straight at /api/queue/{id}/dispatch so dirtygate.js can offer "run
      // anyway" on an uncommitted tree instead of a dead-end toast.
      const r = await window.mutate(`/api/queue/${id}/dispatch`,
                                    { ok: `#${id} 투입됨`, button: btn });
      if (!r.ok) return;
      this.speak("working", true);
      this.poll();
    },

    async deployAll() {
      // A chain link whose predecessor has not landed would refuse, and one
      // refusal aborts the loop — so "deploy all" on a board with one chain in
      // it used to stop dead at the second link and report the chain as an
      // error. Deploy what is READY; the rest follow their own predecessors.
      const all = this.queuedItems();
      const queued = all.filter(i => i.ready !== false);
      const held = all.length - queued.length;
      if (!queued.length) {
        window.toast(held ? `${held}개 항목이 앞 작업을 기다리는 중입니다` : "투입할 항목이 없습니다");
        return;
      }
      const btn = document.getElementById("ck-deploy-all");
      if (btn) btn.disabled = true;
      let sent = 0;
      for (const item of queued) {
        // Sequential on purpose: dispatch refuses past the concurrency cap, and
        // firing twenty at once turns one cap refusal into twenty toasts.
        const r = await window.mutate(`/api/queue/${item.id}/dispatch`, { quiet: true });
        if (r.ok) { sent += 1; continue; }
        window.toast(sent ? `${sent}개 투입 후 중단: ${r.error}` : r.error);
        break;
      }
      if (sent) window.toast(`${sent}개 항목 투입됨`
        + (held ? ` - ${held}개는 앞 작업을 기다리는 중` : ""), "ok");
      this.poll();
    },

    /* ---- agent responses — LIVE agents only ------------------------------
     * This panel used to fill with the last thing every finished run said,
     * which meant the loudest thing on the page was a wall of "killed:
     * exceeded the runtime budget" from last week. What an agent said when it
     * died belongs to its log; this is a window on what is happening NOW. */
    renderReplies() {
      const box = document.getElementById("ck-replies");
      if (!box) return;
      const s = this.state || {};
      const live = new Set((s.agents || []).filter(a => a.state === "running")
        .map(a => Number(a.item_id)));
      const items = (s.items || []).filter(i => i.source !== "chat");
      const steps = s.steps || {};

      const running = items.filter(i => live.has(Number(i.id))).map(i => {
        const feed = steps[String(i.id)] || [];
        const last = [...feed].reverse().find(x => x.kind === "tool" || x.kind === "say"
          || x.kind === "result");
        const line = !last ? "시작 중..."
          : last.kind === "tool" ? `<b>${esc(last.name || "tool")}</b> ${esc(trunc(last.hint || "", 70))}`
            : esc(trunc(last.text || "", 110));
        return `<button class="ck-rep live" data-id="${i.id}">
          <span class="ck-rep-seat" style="color:${seatColor(i.seat)}">${esc(seatLabel(i.seat))}</span>
          <span class="ck-rep-t">${esc(trunc(i.title, 54))}</span>
          <span class="ck-rep-l">${line}</span></button>`;
      });

      box.innerHTML = running.join("")
        || `<div class="ck-empty">실행 중인 에이전트가 없습니다. 큐에서 작업을 투입하세요.</div>`;
      box.querySelectorAll(".ck-rep").forEach(el => el.onclick = () => {
        if (window.AgentsGraph && AgentsGraph.select("task_" + el.dataset.id)) return;
        if (window.watchAgent) watchAgent(Number(el.dataset.id));
      });
      const n = document.getElementById("ck-replies-n");
      if (n) n.textContent = String(running.length);
    },

    /* ---- auto-deploy ---------------------------------------------------- */
    renderAuto() {
      const btn = document.getElementById("ck-auto");
      const why = document.getElementById("ck-auto-why");
      if (!btn) return;
      const a = (this.state && this.state.autopilot) || {};
      btn.classList.toggle("on", !!a.on);
      btn.setAttribute("aria-pressed", a.on ? "true" : "false");
      const label = btn.querySelector(".ck-auto-l");
      if (label) label.textContent = a.on ? "자동 투입 켜짐" : "자동 투입 꺼짐";
      if (why) {
        const ref = a.last_refusal;
        // An autopilot that is quietly refusing looks exactly like one that has
        // nothing to do. Say which it is.
        why.textContent = !a.on
          ? "큐 작업은 사용자가 투입을 누를 때까지 기다립니다"
          : ref ? `보류: ${ref.message}`
            : "슬롯이 비면 큐 작업이 자동으로 투입됩니다";
        why.classList.toggle("warn", !!(a.on && ref));
      }
    },

    /* ---- the approval gate ---------------------------------------------- */
    renderGate() {
      const host = document.getElementById("ck-gate");
      if (!host) return;
      const g = (this.state && this.state.gate) || {};
      const active = g.mode || "agent";
      host.querySelectorAll("[data-gate]").forEach(b => {
        b.classList.toggle("on", b.dataset.gate === active);
        b.setAttribute("aria-pressed", b.dataset.gate === active ? "true" : "false");
      });
      // A panel showing 'agent' while BGATE_QA_GATE=0 forces 'none' is the most
      // expensive lie a settings control can tell, so the override says so.
      host.classList.toggle("forced", !!g.env_override);
      host.title = g.env_override
        ? `${g.env_override} - this control is overridden`
        : (g.labels && g.labels[active]) || "";
    },

    async setGate(mode, btn) {
      const g = (this.state && this.state.gate) || {};
      if (g.mode === mode) return;
      const r = await window.mutate("/api/gate",
        { body: { mode }, button: btn,
          ok: (g.labels && g.labels[mode]) || `gate: ${mode}` });
      if (!r.ok) return;
      this.poll();
    },

    /* ---- a seat asked YOU something -------------------------------------
     * ask_human is not a work item on purpose — a question that becomes a queued
     * row is a row somebody has to dispatch in order to read it. So it arrives on
     * this payload as state.questions and is answered from here, which is the one
     * panel already sitting next to the conversation the question came out of.
     *
     * The bell renders the same list in the drawer for when you are in another
     * view. Both post the same body to the same endpoint; neither is the primary.
     *
     * ONLY UNANSWERED ONES. An answered card that stays reads as still open, and
     * the answer is already on the event and in the handoff thread. */
    openQuestions() {
      const raw = (this.state || {}).questions;
      if (!Array.isArray(raw)) return [];
      return raw
        .map(q => ({
          seq: Number(q.event_seq || q.seq) || 0,
          item: Number(q.item_id) || 0,
          seat: String(q.seat || ""),
          question: String(q.question || ""),
          asked_at: String(q.asked_at || ""),
          refs: Array.isArray(q.refs) ? q.refs.map(String) : [],
          answer: String(q.answer || ""),
        }))
        .filter(q => q.seq && !q.answer);
    },

    renderQuestions() {
      // The wrapper is gone — the deck owns which page is visible now — but it
      // is still looked up rather than assumed absent, so this file keeps
      // working against a page served by an older build instead of rendering
      // the questions into a panel nothing ever shows.
      const wrap = document.getElementById("ck-askwrap");
      const box = document.getElementById("ck-ask");
      if (!box) return;
      const open = this.openQuestions();
      if (wrap) wrap.hidden = !open.length;
      const n = document.getElementById("ck-ask-n");
      if (n) n.textContent = String(open.length);
      // An empty state, because the deck keeps this page reachable instead of
      // hiding the panel. "Nothing here" and "this panel is broken" have to
      // look different, and a blank box is how they stop looking different.
      if (!open.length) {
        box.innerHTML = `<div class="ck-empty">응답을 기다리는 에이전트가 없습니다</div>`;
        this._askSig = "";
        return;
      }

      // Its own signature, like the transcript's. The rest of this column
      // repaints whenever anything on the board moves, and rebuilding a textarea
      // somebody is mid-sentence in is how a half-typed answer disappears.
      const sig = open.map(q => q.seq).join(",");
      if (sig !== this._askSig) {
        this._askSig = sig;
        // The caret, so a repaint that DOES land while you are typing (a new
        // question arriving) puts you back where you were. The text itself is in
        // this.answers, not in the DOM, for the same reason.
        const active = document.activeElement;
        const focused = active && active.dataset && active.dataset.answer;
        const caret = focused ? active.selectionStart : 0;

        box.innerHTML = open.map(q => {
          const who = q.seat || "director";
          return `<div class="ck-ask" data-seq="${q.seq}">
            <div class="ck-ask-top">
              <span class="ck-rep-seat" style="color:${seatColor(who)}">${esc(seatLabel(who))}</span>
              ${q.item ? `<span class="ck-ask-item">#${q.item}</span>` : ""}
              <span class="ck-spacer"></span>
              <span class="ck-hint">${esc(q.asked_at.slice(11, 16))}</span>
            </div>
            <div class="ck-ask-q">${esc(q.question)}</div>
            ${q.refs.length ? `<div class="ck-ask-refs">${q.refs
              .map(r => `<code>${esc(trunc(r, 52))}</code>`).join(" ")}</div>` : ""}
            <textarea class="ck-ask-reply" rows="2" data-answer="${q.seq}"
              placeholder="한 문장으로 답하기"></textarea>
            <div class="ck-ask-row">
              <span class="ck-hint">${q.item
                ? "실행 중 에이전트는 조향으로 읽고, 끝난 에이전트에는 인계 메모로 남습니다"
                : "다음 세션이 읽을 결정으로 기록됩니다"}</span>
              <button class="qbtn small" data-send="${q.seq}">답변</button>
            </div>
          </div>`;
        }).join("");

        // value, not markup: a draft with "</textarea>" in it would otherwise
        // close the element early, and esc() inside a textarea is its own trap.
        box.querySelectorAll("[data-answer]").forEach(t => {
          t.value = this.answers[t.dataset.answer] || "";
          t.oninput = () => { this.answers[t.dataset.answer] = t.value; };
        });
        if (focused) {
          const again = box.querySelector(`[data-answer="${focused}"]`);
          if (again) {
            again.focus();
            try { again.setSelectionRange(caret, caret); } catch (e) { /* not fatal */ }
          }
        }
      }
      box.querySelectorAll("[data-send]").forEach(b =>
        b.onclick = () => this.answer(Number(b.dataset.send), b));
    },

    /* The answer goes where the asker can still read it, and the toast says
       WHICH of the three paths that was — a steer to a live agent, a handoff note
       for a finished one, a decision on the record. "Sent" would hide the one
       difference that matters. */
    async answer(seq, btn) {
      const key = String(seq || "");
      const text = String(this.answers[key] || "").trim();
      if (!text) {
        window.toast("write the answer first - an empty reply is not an answer");
        return;
      }
      const r = await window.mutate("/api/console/answer",
        { body: { seq: Number(key), answer: text }, button: btn, quiet: true });
      if (!r.ok) {
        window.toast(r.error);
        // 409 is somebody else answering first; the stored answer wins and the
        // draft does not, so re-read rather than retry.
        if (r.status === 409) { this._askSig = ""; this.poll(); }
        return;
      }
      const d = r.data || {};
      delete this.answers[key];
      window.toast(String(d.delivery || "answer recorded"), "ok");
      if (d.delivery_error) window.toast(`partly delivered - ${d.delivery_error}`);
      this._askSig = "";
      // The bell is showing the same question; make it re-read rather than wait
      // out its throttle with a card that is no longer open.
      if (window.Notify) { try { Notify.refresh(true); } catch (e) {} }
      this.poll();
    },

    /* ---- what is waiting on the human ----------------------------------- */
    reviewItems() {
      return ((this.state || {}).items || []).filter(i => i.status === "review");
    },

    renderReview() {
      const wrap = document.getElementById("ck-reviewwrap");   // see renderQuestions
      const box = document.getElementById("ck-review");
      if (!box) return;
      const held = this.reviewItems();
      if (wrap) wrap.hidden = !held.length;
      const n = document.getElementById("ck-review-n");
      if (n) n.textContent = String(held.length);
      if (!held.length) {
        box.innerHTML = `<div class="ck-empty">승인 대기 중인 항목이 없습니다</div>`;
        return;
      }
      box.innerHTML = held.slice(0, 20).map(i => `
        <div class="ck-q review" data-id="${i.id}">
          <span class="ck-rep-seat" style="color:${seatColor(i.seat)}">${esc(i.seat)}</span>
          <span class="ck-rep-t" title="${esc(i.result || i.brief_preview || i.title)}">${esc(trunc(i.title, 44))}</span>
          <button class="qbtn small" data-approve="${i.id}">approve</button>
          <button class="qbtn small ghost" data-rejectq="${i.id}">reject</button>
        </div>`).join("");
      box.querySelectorAll("[data-approve]").forEach(b =>
        b.onclick = () => this.approve(Number(b.dataset.approve), b));
      box.querySelectorAll("[data-rejectq]").forEach(b =>
        b.onclick = () => this.rejectItem(Number(b.dataset.rejectq), b));
    },

    async approve(id, btn) {
      const r = await window.mutate(`/api/queue/${id}/approve`,
        { body: {}, button: btn, ok: `#${id} 승인됨 - 뒤에 연결된 작업을 시작할 수 있습니다` });
      if (!r.ok) return;
      this.poll();
    },

    /* Rejection needs a reason for the same purpose a QA fail does: it is
       appended to the brief, so the next agent reads what to change instead of
       repeating the run that was turned down. */
    async rejectItem(id, btn) {
      const reason = await window.askText({
        title: `#${id} 반려`,
        body: "무엇이 문제이고 어떻게 고치면 되는지 정확히 적어 주세요. 이 내용은 "
            + "항목 brief에 붙어서 다음 에이전트가 같은 실수를 반복하지 않게 합니다.",
        placeholder: "좌우 반전 검증이 빠졌습니다. 추가한 뒤 다시 빌드하세요...",
        ok: "돌려보내기", required: true,
      });
      if (reason == null || !String(reason).trim()) return;
      const r = await window.mutate(`/api/queue/${id}/reject`,
        { body: { reason: String(reason).trim() }, button: btn,
          ok: `#${id} 다시 처리하도록 돌려보냄` });
      if (!r.ok) return;
      this.poll();
    },

    async toggleAuto() {
      const a = (this.state && this.state.autopilot) || {};
      const next = !a.on;
      const r = await window.mutate("/api/console/autopilot",
        { body: { on: next }, button: "ck-auto",
          ok: next ? "자동 투입 켜짐 - 큐 작업이 자동으로 투입됩니다"
                   : "자동 투입 꺼짐" });
      if (!r.ok) return;
      const sent = ((r.data || {}).tick || {}).dispatched || [];
      if (sent.length) window.toast(`큐 항목 ${sent.length}개 자동 투입됨`, "ok");
      this.speak(next ? "auto" : "idle", true);
      this.poll();
    },

    /* ---- the live strip ─────────────────────────────────────────────────
     * Who is working, for how long, what it has cost. One line, one place,
     * independent of which deck page is up and of whether the graph is even
     * on screen — which is the whole requirement when the window is a stream
     * and the viewer cannot scroll or click anything.
     *
     * The clock ticks LOCALLY between polls. The server sends whole seconds
     * every 3s (12s idle), and a counter that advances in three-second jumps
     * reads as a stalled UI rather than a slow one. So the poll sets a baseline
     * and a 1s tick interpolates from it; nothing is invented, the offset is
     * just wall-clock since the number arrived.
     */
    _liveBase: null,

    /* The run the strip is about: the longest-running agent, or the director's
       own turn when no seat is out. Longest rather than newest because on a
       fan-out the interesting one is the one that might be stuck. */
    liveSubject() {
      const s = this.state || {};
      const running = (s.agents || []).filter(a => a.state === "running");
      if (running.length) {
        const items = new Map((s.items || []).map(i => [Number(i.id), i]));
        const rows = running.map(a => {
          const it = items.get(Number(a.item_id)) || {};
          return { seat: it.seat || "", title: it.title || `item #${a.item_id}`,
                   seconds: Number(a.seconds) || 0, cost: Number(a.cost_usd) || 0,
                   n: running.length };
        }).sort((x, y) => y.seconds - x.seconds);
        return rows[0];
      }
      const turns = s.turns || [];
      const last = turns[turns.length - 1];
      if (last && last.reply && last.reply.running) {
        return { seat: "director", title: last.said || last.title || "thinking",
                 seconds: 0, cost: Number(last.reply.cost) || 0, n: 1 };
      }
      return null;
    },

    renderLive() {
      const host = document.getElementById("ck-live");
      if (!host) return;
      const subj = this.liveSubject();
      if (!subj) {
        host.hidden = true;
        this._liveBase = null;
        return;
      }
      host.hidden = false;
      this._liveBase = { at: Date.now(), seconds: subj.seconds };
      const what = document.getElementById("ck-live-what");
      if (what) {
        what.innerHTML =
          (subj.seat ? `<b style="color:${seatColor(subj.seat)}">${esc(subj.seat)}</b> ` : "")
          + esc(trunc(subj.title, 60))
          + (subj.n > 1 ? `<span class="ck-live-n">+${subj.n - 1} more</span>` : "");
      }
      const cost = document.getElementById("ck-live-c");
      if (cost) cost.textContent = subj.cost ? `$${subj.cost.toFixed(2)}` : "";
      this.tickLive();
    },

    tickLive() {
      const el = document.getElementById("ck-live-t");
      const b = this._liveBase;
      if (!el || !b) return;
      const secs = b.seconds + Math.floor((Date.now() - b.at) / 1000);
      const m = Math.floor(secs / 60), s = secs % 60;
      el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    },

    /* ---- the deck ───────────────────────────────────────────────────────
     * Four panels, one frame. The rule that makes it a cockpit instrument
     * rather than a slideshow: ROTATION IS THE IDLE BEHAVIOUR, ATTENTION WINS.
     *
     *   · a page with something BLOCKING on it (a question, an approval) is
     *     jumped to and held — rotating away from an agent that is stopped
     *     waiting for you is the one thing this must never do;
     *   · touching a dot or an arrow pins that page, because a rotation that
     *     steals the panel out from under a click is worse than no rotation;
     *   · the pin decays, so a stream left alone comes back to life on its own
     *     instead of freezing on whatever was last poked.
     *
     * Empty pages are still REACHABLE (the dots are always there — you can look
     * at an empty queue on purpose) but never rotated INTO. That is the split
     * the four stacked panels got wrong in both directions: two were always
     * visible and usually empty, two vanished entirely and moved everything
     * else when they came back.
     */
    deck: {
      pages: [
        { id: "queue",   label: "큐",        hint: "투입 대기" },
        { id: "ask",     label: "질문",      hint: "질문한 에이전트에게 돌아갑니다", urgent: true },
        { id: "review",  label: "승인",      hint: "승인하면 체인이 풀립니다",      urgent: true },
        { id: "replies", label: "응답",      hint: "실시간만" },
        /* The audience. Not urgent — a viewer's remark is never something an
           agent is STOPPED waiting on, which is what urgent means here — and
           its count is the feedback session's, not the message rate, so a busy
           channel cannot yank the deck off an approval somebody has to make. */
        { id: "chat",    label: "채팅",      hint: "라이브 채팅과 피드백 세션" },
      ],
      at: 0, pinnedUntil: 0, turnAt: 0,
    },
    // How long a page holds before the deck moves on, and how long a human's
    // choice outranks the rotation. 9s is long enough to read a couple of rows
    // and short enough that a stream does not sit on one panel; 45s is about a
    // sentence typed and sent, which is what a pin is usually for.
    _deckHold: 9000,
    _deckPin: 45000,

    deckCounts() {
      const s = this.state || {};
      return {
        queue: this.queuedItems().length,
        ask: this.openQuestions().length,
        review: this.reviewItems().length,
        replies: ((s.agents || []).filter(a => a.state === "running")).length,
        /* What an OPEN feedback session has captured, and nothing otherwise.
           Deliberately not the live message count: chat scrolling is not work
           waiting for anybody, and a badge that ticks up all stream long
           teaches people to ignore the badges that mean something. */
        chat: (window.ChatLive && window.ChatLive.captured
               && window.ChatLive.captured()) || 0,
      };
    },

    /* The chat page is owned by chatlive.js, which polls on its own clock and
       knows nothing about the deck. Mounted lazily the first time the page is
       drawn — mounting at init would start a second poll loop on every
       dashboard, including the ones nobody has connected a channel on. */
    mountChat() {
      const slot = document.getElementById("ck-chat");
      if (!slot || slot.dataset.mounted) return;
      if (!window.ChatLive) return;
      slot.dataset.mounted = "1";
      try { window.ChatLive.mount(slot); } catch (e) { /* panel stays empty */ }
    },

    /* Which page the deck WANTS to be on. Urgency first, then the rotation. */
    deckPick(counts) {
      const d = this.deck;
      const now = Date.now();
      const urgent = d.pages.findIndex(p => p.urgent && counts[p.id] > 0);
      if (urgent >= 0) return urgent;
      if (now < d.pinnedUntil) return d.at;
      if (now - d.turnAt < this._deckHold) return d.at;
      // Advance to the next page that has anything on it. All empty: stay put
      // rather than cycling four blank frames, which is motion without content.
      const live = d.pages.map((p, i) => [i, counts[p.id] || 0]).filter(x => x[1] > 0);
      if (!live.length) return d.at;
      const next = live.find(x => x[0] > d.at) || live[0];
      return next[0];
    },

    deckGo(index, byHuman) {
      const d = this.deck;
      const n = d.pages.length;
      d.at = ((index % n) + n) % n;
      d.turnAt = Date.now();
      if (byHuman) d.pinnedUntil = Date.now() + this._deckPin;
      this.renderDeck();
    },

    renderDeck() {
      const host = document.getElementById("ck-deck");
      if (!host) return;
      const d = this.deck;
      const counts = this.deckCounts();
      const want = this.deckPick(counts);
      if (want !== d.at) { d.at = want; d.turnAt = Date.now(); }
      const page = d.pages[d.at];

      host.querySelectorAll(".ck-page").forEach(el =>
        el.classList.toggle("on", el.dataset.page === page.id));
      if (page.id === "chat") this.mountChat();

      const tabs = document.getElementById("ck-deck-tabs");
      if (tabs) {
        const sig = d.pages.map(p => `${p.id}:${counts[p.id]}`).join("|") + "@" + d.at;
        if (tabs.dataset.sig !== sig) {
          tabs.dataset.sig = sig;
          tabs.innerHTML = d.pages.map((p, i) => {
            const n = counts[p.id] || 0;
            const cls = ["ck-tab", i === d.at ? "on" : "",
                         n ? "has" : "", p.urgent && n ? "urgent" : ""].join(" ");
            return `<button class="${cls}" type="button" role="tab"
                      aria-selected="${i === d.at}" data-go="${i}"
                      title="${esc(p.hint)}">${esc(p.label)}${
                      n ? `<span class="ck-tab-n">${n}</span>` : ""}</button>`;
          }).join("");
          tabs.querySelectorAll("[data-go]").forEach(b =>
            b.onclick = () => this.deckGo(Number(b.dataset.go), true));
        }
      }

      // The countdown bar. Restarted by writing the animation fresh, and simply
      // absent while pinned or while an urgent page is held — a clock that is
      // not counting down to anything is a lie about what happens next.
      const fill = document.getElementById("ck-deck-fill");
      if (fill) {
        // Three ways there is nothing to count down to, and a bar that fills
        // anyway is a promise the deck does not keep: pinned by a human, held on
        // something urgent, or simply nowhere else with anything on it.
        const occupied = d.pages.filter(p => (counts[p.id] || 0) > 0).length;
        const rotating = Date.now() >= d.pinnedUntil
          && occupied > 1
          && !d.pages.some((p, i) => p.urgent && counts[p.id] > 0 && i === d.at);
        host.toggleAttribute("data-rotating", rotating);
        if (rotating) {
          const key = String(d.turnAt);
          if (fill.dataset.turn !== key) {
            fill.dataset.turn = key;
            fill.style.animation = "none";
            void fill.offsetWidth;
            fill.style.animation = `ckdeck ${this._deckHold}ms linear`;
          }
        } else {
          fill.style.animation = "none";
          fill.dataset.turn = "";
        }
      }
    },

    bindDeck() {
      const prev = document.getElementById("ck-deck-prev");
      const next = document.getElementById("ck-deck-next");
      if (prev) prev.onclick = () => this.deckGo(this.deck.at - 1, true);
      if (next) next.onclick = () => this.deckGo(this.deck.at + 1, true);
      // Hovering the deck pauses the rotation for as long as you are over it.
      // Reading a row while it slides away is the single most annoying thing a
      // carousel does, and it is one line to not do it.
      const host = document.getElementById("ck-deck");
      if (host) {
        host.addEventListener("pointerenter", () => {
          this.deck.pinnedUntil = Math.max(this.deck.pinnedUntil, Date.now() + 4000);
          this.renderDeck();
        });
        host.addEventListener("pointerleave", () => {
          // Give back the last couple of seconds rather than resuming instantly
          // under a cursor that has only just left.
          this.deck.pinnedUntil = Math.min(this.deck.pinnedUntil, Date.now() + 2000);
        });
      }
      this.renderDeck();
      // The rotation needs its own tick: the poll is 3s when live and 12s when
      // idle, and a deck that only advances when the server answers would sit
      // still on exactly the quiet board this is meant to keep alive.
      clearInterval(this._deckTimer);
      this._deckTimer = setInterval(() => {
        this.renderDeck();
        this.tickLive();     // the clock, between polls — see renderLive
      }, 1000);
    },

    /* ---- the cat -------------------------------------------------------- */
    moodOf() {
      const s = this.state || {};
      const floor = s.floor || {};
      const gates = (s.gates || []).filter(g => g.blocking);
      if ((s.items || []).some(i => i.status === "failed")) return "broken";
      if (floor.running) return "working";
      if (gates.length) return "gate";
      if (floor.queued) return (s.autopilot && s.autopilot.on) ? "auto" : "gate";
      if (floor.done) return "done";
      return "idle";
    },

    /* WHAT THE FLOOR IS ACTUALLY SAYING, newest real voice first.
       Returns {who, text, live} or null when nothing on the board has spoken —
       which is the only case the canned lines are for. Kept separate from
       rendering so the choice can be reasoned about (and tested) on its own. */
    floorSays() {
      const s = this.state || {};
      const turns = s.turns || [];
      const last = turns[turns.length - 1];

      // 1. The director, mid-turn. Its own narration beats the tool it is on:
      //    the say-step is what it CHOSE to tell you, the tool is what it
      //    happened to be doing when the poll landed.
      if (last && last.reply && last.reply.running) {
        const r = last.reply;
        if (r.thinking) return { who: "director", text: r.thinking, live: true };
        const tools = (r.steps || []).filter(x => x && x.kind === "tool");
        const tool = tools[tools.length - 1];
        if (tool) {
          const name = String(tool.name || "tool");
          return { who: "director", live: true,
                   text: (TOOL_VERB[name] || name) + (tool.hint ? ` - ${tool.hint}` : "") };
        }
        return { who: "director", text: "reading the board…", live: true };
      }

      // 2. The answer it just gave — one sentence, not the essay. A bubble is a
      //    glance; the transcript above it is where the whole reply lives.
      if (last && last.reply && last.reply.text) {
        return { who: "director", text: firstSentence(last.reply.text), live: false };
      }

      // 3. Any other seat that has just said something. This is the half of the
      //    floor the conversation panel never shows, so the cat is the only
      //    place a working seat gets a voice at all.
      const live = (s.agents || []).filter(a => a.state === "running");
      for (let i = live.length - 1; i >= 0; i--) {
        const a = live[i];
        const feed = ((s.steps || {})[String(a.item_id)] || []);
        for (let j = feed.length - 1; j >= 0; j--) {
          const st = feed[j];
          if (st && st.kind === "say" && st.text) {
            return { who: a.seat || "a seat", text: firstSentence(st.text), live: true };
          }
        }
      }
      return null;
    },

    /* ---- the critique window ────────────────────────────────────────────
     * GENERATED ART WAS INVISIBLE UNLESS YOU WENT LOOKING FOR IT. An art run
     * files candidate after candidate and the only surfaces that showed them
     * were the Assets view and a node you had to click. So the single most
     * watchable thing this product does — a picture appearing that did not
     * exist a minute ago — happened entirely off screen.
     *
     * Newest wins if several arrive at once: a queue of reveals would still be
     * showing the first by the time the run had moved on, which is a slideshow
     * of the past rather than a window on now. And the FIRST poll seeds the
     * seen-set without showing anything, or opening the page would flash every
     * artifact the project has ever made — the same "already there" noise the
     * deck's rotation avoids.
     *
     * IT IS A CRITIQUE, NOT A NOTIFICATION. A thumbnail sliding past says "a
     * file appeared", which is the least interesting true thing about it. What
     * makes this watchable is the JUDGEMENT: an agent made a heron, looked at
     * it, and said the legs are cropped. The payload already carries all of
     * that — the artifact's metadata.qa_review holds the machine verdict with
     * its score and its reasons, and the phase's own say-steps hold the agent
     * narrating what it just did — and none of it was on screen anywhere.
     *
     * BOTH DIRECTIONS, because an agent looking at a reference is as much a
     * visual event as one producing a plate: phase.artifacts is what it MADE,
     * phase.seen is what it had in front of it. Made wins when both land in one
     * tick — producing is the bigger moment, and the reference was probably the
     * input to it.
     */
    _art: null, _revealTimer: 0,

    /* Every visual thing on the floor right now, newest last, each tagged with
       who it belongs to and what the agent said about it. */
    visuals() {
      const s = this.state || {};
      const items = new Map((s.items || []).map(i => [String(i.id), i]));
      const out = [];
      for (const [itemId, list] of Object.entries(s.phases || {})) {
        const seat = (items.get(String(itemId)) || {}).seat || "";
        for (const ph of (list || [])) {
          // The agent's own most recent words in this pocket. Not correlated to
          // a specific image — it cannot be, the feed does not say — so it is
          // labelled as what it is: what the seat was saying at the time.
          const says = (ph.steps || []).filter(x => x && x.kind === "say" && x.text);
          const narration = says.length ? firstSentence(says[says.length - 1].text, 200) : "";
          for (const a of (ph.artifacts || [])) {
            if (!a || !a.id || !a.path) continue;
            const qa = (a.metadata || {}).qa_review || {};
            out.push({
              key: "a" + a.id, path: a.path, seat, mode: "made",
              name: a.logical_name || String(a.path).split("/").pop(),
              meta: [a.kind, a.revision ? `r${a.revision}` : ""].filter(Boolean).join(" · "),
              verdict: qa.verdict || "", score: Number(qa.score) || 0,
              // The verdict's OWN reasons beat the narration: they are about
              // this image, where the narration merely happened near it.
              note: qa.reasons || narration,
              noteIsVerdict: !!qa.reasons,
            });
          }
          for (const rel of (ph.seen || [])) {
            if (!rel) continue;
            out.push({
              key: "s" + rel, path: rel, seat, mode: "looking at",
              name: String(rel).split("/").pop(), meta: "",
              verdict: "", score: 0, note: narration, noteIsVerdict: false,
            });
          }
        }
      }
      return out;
    },

    renderReveal() {
      const all = this.visuals();
      const before = this._art;
      this._art = new Set(all.map(v => v.key));
      if (!before) return;                 // first poll seeds, never reveals
      const fresh = all.filter(v => !before.has(v.key));
      if (!fresh.length) return;
      // Made outranks looked-at; otherwise the newest.
      const made = fresh.filter(v => v.mode === "made");
      const v = (made.length ? made : fresh)[(made.length ? made : fresh).length - 1];

      const host = document.getElementById("ck-reveal");
      if (!host) return;
      const verdict = v.verdict
        ? `<span class="ck-crit-v ${v.verdict === "pass" ? "ok" : "no"}">${
            v.verdict === "pass" ? "✓ pass" : "✗ fail"}${v.score ? ` · ${v.score}` : ""}</span>`
        : "";
      host.innerHTML =
        `<div class="ck-crit-head">
           <span class="ck-crit-seat" style="color:${seatColor(v.seat)}">${esc(v.seat || "floor")}</span>
           <span class="ck-crit-mode">${esc(v.mode)}</span>
           <span class="ck-spacer"></span>${verdict}
         </div>
         <div class="ck-crit-body">
           <img class="ck-crit-img" src="/api/preview?rel=${encodeURIComponent(v.path)}"
                alt="${esc(v.name)}" loading="lazy">
           <div class="ck-crit-m">
             <b>${esc(trunc(v.name, 44))}</b>
             ${v.meta ? `<span class="ck-crit-meta">${esc(v.meta)}</span>` : ""}
             ${v.note
               ? `<blockquote class="ck-crit-note${v.noteIsVerdict ? " verdict" : ""}">${
                   esc(trunc(v.note, 220))}</blockquote>`
               : `<span class="ck-crit-meta">no comment recorded</span>`}
             ${fresh.length > 1 ? `<span class="ck-crit-meta">+${fresh.length - 1} more this tick</span>` : ""}
           </div>
         </div>`;
      host.hidden = false;
      // Clicking opens it full size; peek.js binds data-peek globally.
      host.dataset.peek = v.path;
      clearTimeout(this._revealTimer);
      // Long enough to read a sentence and look at the picture. A verdict earns
      // longer than a bare reference does.
      this._revealTimer = setTimeout(() => { host.hidden = true; },
                                     v.noteIsVerdict ? 12000 : 8000);
    },

    /* ---- reaction beats ─────────────────────────────────────────────────
     * The mascot animated on a TIMER: it bobbed, blinked and shook according to
     * a mood that changes slowly, so the moments that actually matter — a run
     * failing, work landing, a chain releasing — passed with no more motion than
     * the four seconds before them. On a stream that is the whole game: the
     * viewer cannot read the board, so the only way they learn something
     * happened is that something MOVED when it did.
     *
     * A beat is one-off and short. It is not a mood (moods persist and describe
     * a state) and it is not a line (lines can be read at leisure). It is the
     * visual equivalent of looking up.
     *
     * FIRED FROM TRANSITIONS, NEVER FROM LEVELS. "three items are failed" is a
     * state and the cat must not flinch at it every three seconds forever;
     * "an item just became failed" is an event and is worth exactly one flinch.
     */
    _seen: null,

    /* What changed since the last poll, as a beat name or "". Order is
       priority: two things can land in one tick and only one can be played. */
    beatFor() {
      const s = this.state || {};
      const items = s.items || [];
      const now = {};
      for (const i of items) now[i.id] = i.status;
      const before = this._seen;
      this._seen = now;
      if (!before) return "";        // first poll is not a transition

      let landed = 0, failed = 0, released = 0, started = 0;
      for (const [id, status] of Object.entries(now)) {
        const was = before[id];
        if (was === undefined || was === status) continue;
        if (status === "failed") failed += 1;
        else if (status === "done") { landed += 1; if (was === "review") released += 1; }
        else if (status === "dispatched") started += 1;
      }
      // Something needing a human is the one a stream host must not miss, so it
      // outranks even a failure — a failure is visible in the transcript, an
      // approval is a thing the room is WAITING on.
      const gates = (s.gates || []).filter(g => g.blocking).length;
      const wasGates = this._seenGates || 0;
      this._seenGates = gates;
      if (gates > wasGates) return "wants";
      if (failed) return "oops";
      if (released) return "released";
      if (landed) return "landed";
      if (started) return "dispatch";
      return "";
    },

    /* Play one beat: a CSS class for the motion, and a line that says why.
       Both, because motion alone tells you to look and words tell you at what. */
    beat(name) {
      const host = document.getElementById("ck-mascot");
      if (!host || !name) return;
      host.setAttribute("data-react", name);
      clearTimeout(this._beatTimer);
      this._beatTimer = setTimeout(() => host.removeAttribute("data-react"), 1400);
    },

    renderMood() {
      // The beat first: it is a transition and it is gone by the next poll,
      // whereas everything below describes a state that will still be there.
      const beat = this.beatFor();
      if (beat) this.beat(beat);
      const mood = this.moodOf();
      const changed = mood !== this.mood;
      this.mood = mood;
      const host = document.getElementById("ck-mascot");
      if (host) host.dataset.mood = mood;

      const said = this.floorSays();
      if (said) {
        // Only on a CHANGE of words. Polling every three seconds and restarting
        // the mouth on the same sentence is a stutter, and a mouth that never
        // stops moving stops meaning anything.
        const sig = said.who + "|" + said.text;
        if (sig !== this._saidSig) {
          this._saidSig = sig;
          this.talk(said.text, said.who);
        }
        return;
      }
      // Nothing on the floor is speaking: the cat falls back to its idle
      // animation, which data-mood already drives. There is no canned line to
      // deliver any more — with no bubble there is nowhere to deliver it, and
      // inventing chatter over a quiet board was what made the mascot the least
      // informative thing on the page.
      this._saidSig = "";
    },

    /* IMMEDIATE FEEDBACK ON AN ACTION YOU JUST TOOK. Deploying, stopping or
       flipping autopilot changes the floor, but the payload that proves it is
       up to three seconds away — so the cat switches mood and moves NOW rather
       than sitting still through the gap. It says nothing; the toast that
       accompanies every one of these callers is where the words are. */
    speak(mood) {
      this.mood = mood;
      const host = document.getElementById("ck-mascot");
      if (host) host.dataset.mood = mood;
      this.talk("acknowledged", "");
    },

    /* THE CAT MOUTHS WHILE SOMEBODY IS ACTUALLY SPEAKING — it does not repeat
       what they said. The words are in the transcript six lines up; a second
       copy of them under the original was the loudest thing on the panel and
       carried no information the reader did not already have.

       So the utterance is used only for its LENGTH and its source: how long the
       mouth should move, and whether this is the cat's own idle animation or it
       relaying a real voice. Nothing is rendered. */
    talk(text, who) {
      this.line = String(text || "");
      this._lineAt = Date.now();
      const host = document.getElementById("ck-mascot");
      if (!host) return;
      host.setAttribute("data-talking", "1");
      host.toggleAttribute("data-relaying", !!who);
      clearTimeout(this._talkTimer);
      // Roughly reading speed, so the mouth stops about when a person would
      // have finished the sentence. A permanently talking cat is a screensaver.
      this._talkTimer = setTimeout(
        () => host.removeAttribute("data-talking"),
        Math.min(6000, 900 + this.line.length * 45));
    },

    /* A project that has drawn its own mascot outranks the built-in cat. The
       rule is one line of policy: an APPROVED artifact whose logical name is
       "mascot" takes the frame. */
    async findSprite() {
      try {
        const d = await window.readJSON("/api/artifacts?logical_name=mascot", { artifacts: [] });
        const arts = (d.artifacts || []).filter(a => a.status === "approved");
        if (!arts.length) return;
        const art = arts[0];
        const frames = (art.metadata && art.metadata.frames) || {};
        const count = Object.keys(frames).length;
        const host = document.getElementById("ck-cat");
        if (!host) return;
        this._spriteRel = art.path;
        host.innerHTML = count > 1
          ? `<div class="ck-sprite spr-mount" data-rel="${esc(art.path)}" data-count="${count}" data-fps="8"></div>`
          : `<img class="ck-sprite" src="/api/preview?rel=${encodeURIComponent(art.path)}" alt="project mascot">`;
        if (count > 1 && window.SpriteAnim) SpriteAnim.mountAll(host);
      } catch (e) { /* the drawn cat is the fallback and it is always there */ }
    },
  };

  window.AgentsConsole = AgentsConsole;
})();
