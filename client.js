/**
 * Client half of the thinking-slider bundle.
 *
 * Takes over the composer's model control (`conversation.input.model`, a
 * single seat whose declared risk is `shadows-shipped-ui`). The trigger looks
 * like the shipped one; opening it shows the model row plus the calibrator
 * card, so the shipped "reasoning level" row is replaced by construction
 * rather than hidden with CSS against another plugin's DOM.
 *
 * Two layers, deliberately separate:
 *  - The rail is continuous over the clip's 241 display frames (step 0.125 of
 *    a 0..30 scale), so the portrait evolves frame by frame as the user drags.
 *  - Four anchors at 0 / 10 / 20 / 30 carry the stage names; crossing an
 *    anchor's midpoint submits a real `ModelSelection` through the shared
 *    `modelDirectories` service — the same path the shipped picker used.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-thinking-slider',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const {
      useCallback,
      useEffect,
      useRef,
      useState,
      useSyncExternalStore,
    } = React;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'thinking-slider';
    /** Host route registered by this bundle's Host half. */
    const VIDEO_URL = '/thinking-slider/liang-evolution.mp4';
    /** Host route holding the durable per-model effort memory. */
    const PREFERENCES_URL = '/thinking-slider/preferences';
    /** Source clip frame rate. */
    const VIDEO_FPS = 24;
    /** Calibrator scale: the rail runs 0..30, one frame per 0.125. */
    const MAX_LEVEL = 30;
    /** Rail step: 1/8 level = exactly one source frame. */
    const RAIL_STEP = 1 / 8;
    /** Display frames available in the clip (243 authored, 1..241 shown). */
    const DISPLAY_FRAMES = 241;
    /** Stage names, weakest to strongest, spread across the anchors. */
    const STAGES = ['小难梁', '梁子', '梁圣', '梁祖'];
    /** Popup width used for edge clamping. */
    const POPUP_WIDTH = 320;

    const zh = {
      title: '滑动变祖器',
      caption: '思考程度',
      model: '模型',
      effort: '推理等级',
      applying: '切换中…',
      noLevels: '当前模型未提供推理等级',
      failed: '档位读取失败',
      unavailable: '本会话无法调整档位',
      loading: '载入连续祖力…',
      empty: '没有可用模型',
      crash: '变祖器渲染出错',
    };
    const en = {
      title: 'Liang Intensity Calibrator',
      caption: 'Thinking level',
      model: 'Model',
      effort: 'Reasoning level',
      applying: 'Switching…',
      noLevels: 'This model advertises no reasoning levels',
      failed: 'Could not read reasoning levels',
      unavailable: 'Reasoning levels are unavailable for this session',
      loading: 'Loading…',
      empty: 'No models available',
      crash: 'Calibrator render error',
    };

    const CSS = [
      // ---- trigger: matches the shipped composer model seat ----
      '.tsl-trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(320px,42cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:6px;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:400;line-height:20px;cursor:pointer}',
      '.tsl-trigger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.tsl-trigger:disabled{color:var(--dsw-alias-state-idle-primary);cursor:default}',
      '.tsl-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.tsl-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tsl-trigger-effort{flex-shrink:1000;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);opacity:.75}',
      '.tsl-caret{flex:none;width:12px;height:12px;opacity:.7}',
      // ---- popup ----
      '.tsl-popup{position:fixed;z-index:1100;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:#ffffff;color:var(--dsw-alias-label-primary);box-shadow:0 14px 36px rgb(0 0 0 / 22%)}',
      // ui-theme marks the dark palette with body[data-ds-dark-theme].
      'body[data-ds-dark-theme] .tsl-popup{background:var(--dsw-alias-bg-layer-1)}',
      '.tsl-popup[hidden]{display:none}',
      '.tsl-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}',
      '.tsl-row:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.tsl-row:disabled{cursor:default;opacity:.6}',
      '.tsl-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.tsl-row-key{flex:none}',
      '.tsl-row-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-secondary)}',
      '.tsl-row-caret{flex:none;width:12px;height:12px;opacity:.55}',
      '.tsl-divider{height:1px;margin:4px 8px;background:var(--dsw-alias-border-l1)}',
      '.tsl-back{display:flex;align-items:center;gap:6px;width:100%;padding:6px 10px 8px;border:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;text-align:left;cursor:pointer}',
      '.tsl-back:hover{color:var(--dsw-alias-label-primary)}',
      '.tsl-back:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:8px}',
      '.tsl-list{max-height:min(46vh,320px);overflow:auto;margin:0;padding:0;list-style:none}',
      '.tsl-group{padding:6px 10px 2px;color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.04em}',
      '.tsl-model{display:block;width:100%;padding:7px 10px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tsl-model:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.tsl-model[data-current="true"]{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.tsl-model:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      // ---- calibrator card ----
      '.tsl-popup .tsl-card{max-width:none;margin:0;padding:6px 8px 4px;border:0;border-radius:8px;background:none;box-shadow:none}',
      '.tsl-main{display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.tsl-portrait{display:block;width:100%;aspect-ratio:1 / 1;max-height:200px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 0 calc(2px + var(--tsl-strength,0) * 18px) color-mix(in srgb, var(--dsw-alias-brand-primary) calc(var(--tsl-strength,0) * 55%), transparent)}',
      '.tsl-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.tsl-title-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}',
      '.tsl-stage{font-family:"Songti SC",STSong,"SimSun",serif;font-weight:900;font-size:24px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tsl-count{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
      '.tsl-sub{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tsl-dim{color:var(--dsw-alias-state-idle-primary);font-size:11px;line-height:15px}',
      '.tsl-zone{position:relative;margin-top:8px}',
      '.tsl-labels{position:relative;height:15px;margin:0 8px}',
      '.tsl-label{position:absolute;top:0;padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:15px;white-space:nowrap;cursor:pointer}',
      '.tsl-label:disabled{cursor:default}',
      '.tsl-label[data-active="true"]{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.tsl-label:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}',
      '.tsl-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:18px;margin:2px 0 0;background:transparent;cursor:ew-resize}',
      '.tsl-range:disabled{cursor:default;opacity:.45}',
      '.tsl-range::-webkit-slider-runnable-track{height:2px;border-radius:1px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent)}',
      '.tsl-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin-top:-7px;border:2px solid var(--dsw-alias-bg-layer-1);border-radius:50%;background:var(--dsw-alias-brand-primary);box-shadow:0 1px 5px rgb(0 0 0 / 30%)}',
      '.tsl-range::-moz-range-track{height:2px;border-radius:1px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent)}',
      '.tsl-range::-moz-range-thumb{width:14px;height:14px;border:2px solid var(--dsw-alias-bg-layer-1);border-radius:50%;background:var(--dsw-alias-brand-primary);box-shadow:0 1px 5px rgb(0 0 0 / 30%)}',
      '.tsl-range:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}',
      '.tsl-error{margin:4px 0 0;color:var(--dsw-alias-state-error-primary);font-size:11px}',
      '.tsl-video{position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}',
    ].join('');

    /** Stable fallback snapshot so the hook never churns before a directory exists. */
    const EMPTY_SNAPSHOT = {
      current: null,
      pending: null,
      retainedEffort: undefined,
      groups: [],
      status: 'idle',
      error: null,
    };

    /** Stable empty list: a fresh `[]` per render would churn callback identity. */
    const EMPTY_EFFORTS = [];

    /** Chevron used by both the trigger and the drill-in rows. */
    function caret(className) {
      return h(
        'svg',
        {
          className,
          viewBox: '0 0 12 12',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', {
          d: 'M4.2 2.6 7.6 6l-3.4 3.4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /**
     * Contains a calibrator-card crash so it can never take the model seat with
     * it. Without this, a card crash reaches the slot boundary, which retires
     * the whole entry and hands the seat back to the shipped picker.
     */
    class CardBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { message: null, resetKey: props.resetKey };
      }

      static getDerivedStateFromError(error) {
        return { message: error && error.message ? error.message : String(error) };
      }

      /**
       * A crash is contained, not permanent: when the model changes the card
       * gets a fresh attempt instead of showing the error until a page reload.
       */
      static getDerivedStateFromProps(props, state) {
        if (props.resetKey === state.resetKey) return null;
        return { message: null, resetKey: props.resetKey };
      }

      render() {
        if (this.state.message !== null) {
          return h('p', { className: 'tsl-error' }, (this.props.label || '') + this.state.message);
        }
        return this.props.children;
      }
    }

    /**
     * Find one model entry in the catalog groups the directory publishes.
     * @param groups - catalog groups from the directory snapshot.
     * @param selection - provider and model to find.
     * @returns the catalog model entry, when the catalog describes it.
     */
    function modelEntryOf(groups, selection) {
      if (!selection || !Array.isArray(groups)) return undefined;
      // A model id is a string. Anything else is a bad selection and must not
      // be matched, rendered, or forwarded.
      if (typeof selection.model !== 'string') return undefined;
      for (const group of groups) {
        if (group === null || group === undefined || group.id !== selection.provider) continue;
        const models = Array.isArray(group.models) ? group.models : [];
        for (const model of models) {
          if (model !== null && model !== undefined && model.id === selection.model) return model;
        }
      }
      return undefined;
    }

    /**
     * Rail positions of the four DeepSeek anchors. Hand-tuned instead of the
     * even 0 / 10 / 20 / 30 split, because an anchor's position is also the
     * clip frame the portrait comes to rest on: the even split put 梁圣 on
     * frame 161, where the subject's eyes are mid-blink. Position 19.25 is
     * frame 155 — the same stage, eyes open.
     */
    const ANCHOR_POSITIONS = [0, 10, 19.25, 30];

    /** Rail position of anchor `index` among `count` anchors. */
    function anchorPosition(index, count) {
      if (count < 2) return 0;
      if (count === ANCHOR_POSITIONS.length) {
        const tuned = ANCHOR_POSITIONS[index];
        if (Number.isFinite(tuned)) return tuned;
      }
      return (index * MAX_LEVEL) / (count - 1);
    }

    /**
     * Nearest anchor to a continuous rail position. Searched by distance rather
     * than derived from even spacing, so a tuned table stays correct.
     */
    function anchorAt(position, count) {
      if (count < 2) return 0;
      const safe = Number.isFinite(position) ? position : 0;
      let best = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < count; index += 1) {
        const distance = Math.abs(anchorPosition(index, count) - safe);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      return best;
    }

    /**
     * The clip frame that represents one continuous rail position. Always
     * returns a finite in-range frame: a non-finite value here would reach
     * `video.currentTime` and throw, which kills the animation loop.
     */
    function frameAt(position) {
      const safe = Number.isFinite(position) ? position : 0;
      const clamped = Math.max(0, Math.min(MAX_LEVEL, safe));
      return Math.max(1, Math.min(DISPLAY_FRAMES, 1 + Math.round(clamped * 8)));
    }

    /**
     * Stage name for one anchor index, spreading the names over any anchor
     * count. Always returns a string, because the result is rendered as a React
     * child and an undefined one would blank the row.
     */
    function stageAt(index, count) {
      if (count < 2) return STAGES[0];
      const safe = Number.isFinite(index) ? index : 0;
      const slot = Math.round((safe / (count - 1)) * (STAGES.length - 1));
      return STAGES[Math.max(0, Math.min(STAGES.length - 1, slot))] ?? STAGES[0];
    }

    /**
     * The composer model seat: a trigger plus a popup holding the model row
     * and the calibrator card that replaces the shipped reasoning row.
     * @param props - slot props (sessionId, locked) plus the service and translator.
     */
    function ModelControl(props) {
      const {
        available: injectedAvailable,
        directory: injectedDirectory,
        directoryError,
        sessionId,
        locked,
        models,
        t,
      } = props;
      const available = injectedAvailable !== false;

      // `directoryFor` can reject transiently on the first paint, before the
      // session scope exists. Resolving once and throwing there retired this
      // shadowing entry permanently — the slot boundary abdicates on a crash —
      // which is how the calibrator silently disappeared. Retry instead, and
      // only retire the entry when the wiring is genuinely broken.
      // The injected directory is authoritative whenever it exists. The retry
      // only fills the gap while it does not, so a session change can never
      // leave a stale directory behind (which a plain useState initializer did).
      const [resolvedDirectory, setResolvedDirectory] = useState(null);
      const directory =
        injectedDirectory === undefined || injectedDirectory === null
          ? resolvedDirectory
          : injectedDirectory;
      const [directoryFailed, setDirectoryFailed] = useState(false);
      const [loadError, setLoadError] = useState(null);
      const [open, setOpen] = useState(false);
      const [pane, setPane] = useState('root');
      const [anchor, setAnchor] = useState(null);

      useEffect(() => {
        if (directory !== null) return undefined;
        let cancelled = false;
        let attempts = 0;
        let timer = 0;
        const attempt = () => {
          if (cancelled) return;
          attempts += 1;
          let next = null;
          try {
            if (
              models !== undefined &&
              models !== null &&
              sessionId !== undefined &&
              sessionId !== null
            ) {
              next = models.directoryFor(sessionId);
            }
          } catch (error) {
            next = null;
          }
          if (next !== null) {
            setResolvedDirectory(next);
            return;
          }
          if (attempts >= 40) {
            setDirectoryFailed(true);
            return;
          }
          timer = setTimeout(attempt, 250);
        };
        attempt();
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [directory, models, sessionId]);

      // Re-runs on every open, like the shipped picker's reload(): a transient
      // catalog failure must be recoverable without remounting the entry.
      useEffect(() => {
        if (directory === null || !available) return undefined;
        let alive = true;
        setLoadError(null);
        Promise.resolve()
          .then(() => directory.load())
          .catch((error) => {
            if (alive) setLoadError(error && error.message ? error.message : String(error));
          });
        return () => {
          alive = false;
        };
      }, [directory, open, available]);

      const subscribe = useCallback(
        (notify) => (directory === null ? () => undefined : directory.store.subscribe(notify)),
        [directory],
      );
      const getSnapshot = useCallback(
        () => (directory === null ? EMPTY_SNAPSHOT : directory.store.getSnapshot()),
        [directory],
      );
      const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      const selection =
        state.pending !== undefined && state.pending !== null ? state.pending : state.current;
      const entry = modelEntryOf(state.groups, selection);
      const reasoning = entry !== undefined ? entry.reasoning : undefined;
      const efforts =
        reasoning !== undefined && reasoning !== null && Array.isArray(reasoning.efforts)
          ? reasoning.efforts
          : EMPTY_EFFORTS;
      const declared =
        selection !== undefined && selection !== null && selection.reasoningEffort !== undefined
          ? selection.reasoningEffort
          : reasoning !== undefined && reasoning !== null
            ? reasoning.defaultEffort
            : undefined;
      const found = efforts.findIndex(
        (level) => level !== null && level !== undefined && level.id === declared,
      );
      const committedIndex = found < 0 ? 0 : found;
      const count = efforts.length;
      const usable = directory !== null && count > 1;
      const busy = state.status === 'selecting';
      // The catalog is fetched lazily, so "no levels" must not be claimed while
      // it is still loading.
      const catalogLoading = state.status === 'loading' || state.status === 'idle';

      /* ---- continuous rail position: local while dragging, store otherwise ---- */

      const [railPosition, setRailPosition] = useState(null);
      const [clipUrl, setClipUrl] = useState(null);
      const lastSentRef = useRef(null);
      /** Remembered effort id per `provider/model`, for the life of the mount. */
      const lastEffortRef = useRef(new Map());
      const modelKey =
        selection !== undefined && selection !== null
          ? selection.provider + '/' + selection.model
          : '';

      useEffect(() => {
        setRailPosition(null);
        lastSentRef.current = null;
      }, [modelKey]);

      // The memory is persisted by the Host half, not in browser storage: the
      // Web port is not a guaranteed-stable origin, so localStorage could not
      // be relied on across a restart. Both directions are best-effort — a
      // failure here must never affect the control itself.
      const saveEfforts = useCallback(() => {
        const efforts = {};
        for (const [key, value] of lastEffortRef.current) efforts[key] = value;
        try {
          fetch(PREFERENCES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ efforts }),
          }).catch(() => undefined);
        } catch (error) {
          /* best effort */
        }
      }, []);

      useEffect(() => {
        let alive = true;
        try {
          fetch(PREFERENCES_URL, { headers: { Accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
              if (!alive || data === null || typeof data !== 'object') return;
              const efforts = data.efforts;
              if (efforts === null || typeof efforts !== 'object') return;
              for (const [key, value] of Object.entries(efforts)) {
                // Only `provider/model` keys are real entries: anything else in
                // the file is not ours to carry around, and re-saving it would
                // make the file grow without bound.
                if (typeof key !== 'string' || key === '' || key.startsWith('__')) continue;
                if (typeof value !== 'string' || value === '') continue;
                lastEffortRef.current.set(key, value);
              }
            })
            .catch(() => undefined);
        } catch (error) {
          /* best effort */
        }
        return () => {
          alive = false;
        };
      }, []);

      const storePosition = usable ? anchorPosition(committedIndex, count) : 0;
      const position = railPosition !== null ? railPosition : storePosition;
      const activeIndex = usable ? anchorAt(position, count) : 0;
      const activeEffort = usable ? efforts[activeIndex] : undefined;
      const strength = position / MAX_LEVEL;

      /* ---- clip scrubbing: one off-screen video, drawn into the card canvas ---- */

      const videoRef = useRef(null);
      const canvasRef = useRef(null);
      const targetRef = useRef(1 / VIDEO_FPS);
      const shownFrameRef = useRef(1);
      const desiredFrameRef = useRef(1);
      const seekingRef = useRef(false);
      const seekStartedAtRef = useRef(0);
      const drawingRef = useRef(false);
      const reloadAttemptsRef = useRef(0);

      useEffect(() => {
        desiredFrameRef.current = frameAt(position);
      }, [position]);

      useEffect(() => {
        drawingRef.current = open;
      }, [open]);

      const draw = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video === null || canvas === null) return;
        // HAVE_METADATA is enough to attempt a draw: the call below is contained,
        // and Chrome can still hand over a frame there. Requiring
        // HAVE_CURRENT_DATA instead froze the portrait for the whole of a slow
        // seek — which is most of a cold start.
        if (video.readyState < 1) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const context = canvas.getContext('2d');
        if (!context) return;
        // Cover-crop instead of stretching: the clip keeps its own aspect ratio
        // and only the overflowing edges are cut, biased toward the top so a
        // portrait keeps its head in frame.
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        if (!sourceWidth || !sourceHeight) return;
        const scale = Math.max(width / sourceWidth, height / sourceHeight);
        const cropWidth = width / scale;
        const cropHeight = height / scale;
        const cropX = (sourceWidth - cropWidth) / 2;
        const cropY = Math.max(0, Math.min((sourceHeight - cropHeight) * 0.5, sourceHeight - cropHeight));
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.clearRect(0, 0, width, height);
        try {
          context.drawImage(
            video,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            width,
            height,
          );
        } catch (error) {
          // No frame the browser will hand over yet; the next loop frame
          // retries. It must never escape: `draw()` is also reached from the
          // `seeked` listener and from event handlers, outside the loop's guard.
        }
      }, []);

      const chase = useCallback(() => {
        const video = videoRef.current;
        if (video === null || seekingRef.current) return;
        if (video.readyState < 1) return;
        const target = targetRef.current;
        // A non-finite target makes `currentTime` throw; the throw would escape
        // the animation loop that called us and stop that loop for good.
        if (!Number.isFinite(target) || target < 0) return;
        // Half a source frame: anything closer is already the frame that was
        // asked for. A tighter residual would re-seek forever whenever the
        // decoder settles a hair off the requested time.
        if (Math.abs(video.currentTime - target) < 1 / (VIDEO_FPS * 2)) {
          if (drawingRef.current) draw();
          return;
        }
        seekingRef.current = true;
        seekStartedAtRef.current = performance.now();
        try {
          video.currentTime = target;
        } catch (error) {
          seekingRef.current = false;
        }
      }, [draw]);

      // The clip is fetched once and then played from an object URL instead of
      // being streamed from the Host route. A streaming media element seeks with
      // byte-range requests, and one that loses a race with the route's
      // registration stays stuck on its first frame for the rest of the session.
      // A single fetch can simply be retried, and every seek after it is local.
      useEffect(() => {
        let alive = true;
        let timer = 0;
        let attempts = 0;
        let objectUrl = null;
        const attempt = () => {
          attempts += 1;
          fetch(VIDEO_URL, { cache: 'no-store' })
            .then((response) => {
              if (!response.ok) throw new Error('HTTP ' + response.status);
              return response.blob();
            })
            .then((blob) => {
              if (!alive) return;
              objectUrl = URL.createObjectURL(blob);
              setClipUrl(objectUrl);
            })
            .catch(() => {
              if (!alive) return;
              if (attempts < 60) timer = window.setTimeout(attempt, 500);
            });
        };
        attempt();
        return () => {
          alive = false;
          window.clearTimeout(timer);
          if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
        };
      }, []);

      useEffect(() => {
        const video = videoRef.current;
        if (video === null) return undefined;
        const onSeeked = () => {
          seekingRef.current = false;
          chase();
        };
        // A failed load must be retried by hand: a `<video>` that failed once
        // never retries on its own, so a request that raced the Host half's
        // route registration would leave the portrait frozen on nothing for the
        // rest of the session. Backed off and bounded, and re-armed by a later
        // success so a transient failure cannot disable the control forever.
        const onError = () => {
          seekingRef.current = false;
          if (reloadAttemptsRef.current >= 5) return;
          reloadAttemptsRef.current += 1;
          const attempt = reloadAttemptsRef.current;
          window.setTimeout(() => {
            const current = videoRef.current;
            if (current === null || current !== video) return;
            try {
              current.load();
            } catch (error) {
              /* retried below, or given up on */
            }
          }, 400 * attempt);
        };
        const onReady = () => {
          reloadAttemptsRef.current = 0;
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('loadeddata', chase);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('error', onError);
        return () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('loadeddata', chase);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('error', onError);
        };
        // `clipUrl` is a dependency because the element only exists once the
        // clip has been fetched; without it the listeners would bind to nothing.
      }, [chase, clipUrl]);

      // One persistent loop eases the shown frame toward the rail's frame, so a
      // continuous drag trails smoothly and a jumped anchor sweeps the whole
      // evolution instead of cutting.
      useEffect(() => {
        // Only runs while the popup is open: a closed calibrator has nothing to
        // advance, so a 60 Hz wake-up for a static image is pure cost.
        if (!open) return undefined;
        let raf = 0;
        const loop = () => {
          // This loop is the only thing that advances the clip, so it must
          // never die: anything thrown here would freeze the portrait until a
          // page reload.
          try {
            // Watchdog for a seek whose `seeked` never arrived. It may only fire
            // when the element is genuinely NOT seeking: releasing the latch
            // during a slow but still-running seek makes the next frame cancel
            // and re-issue it, which on a cold start never completes.
            const element = videoRef.current;
            if (
              seekingRef.current &&
              element !== null &&
              !element.seeking &&
              performance.now() - seekStartedAtRef.current > 1000
            ) {
              seekingRef.current = false;
            }
            // A seek that is genuinely still seeking but has made no progress for
            // seconds is hung (an interrupted range request leaves the media
            // pipeline like this). Releasing the latch here is safe precisely
            // because it is slow: the loop re-issues the target, which cancels
            // the stuck seek instead of waiting on it forever.
            if (
              seekingRef.current &&
              element !== null &&
              element.seeking &&
              performance.now() - seekStartedAtRef.current > 5000
            ) {
              seekingRef.current = false;
            }
            const desired = desiredFrameRef.current;
            const shown = shownFrameRef.current;
            if (!Number.isFinite(desired) || !Number.isFinite(shown)) {
              shownFrameRef.current = 1;
              desiredFrameRef.current = 1;
              targetRef.current = 1 / VIDEO_FPS;
              chase();
            } else {
              const diff = desired - shown;
              if (Math.abs(diff) < 0.6) {
                if (shown !== desired) {
                  shownFrameRef.current = desired;
                  targetRef.current = desired / VIDEO_FPS;
                  chase();
                } else if (drawingRef.current) {
                  draw();
                }
              } else {
                const next = shown + diff * 0.22;
                shownFrameRef.current = next;
                targetRef.current = next / VIDEO_FPS;
                chase();
              }
            }
          } catch (error) {
            /* one bad frame must not stop the loop */
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
      }, [chase, draw, open]);

      /* ---- submitting the real selection ---- */

      const commitEffort = useCallback(
        (index) => {
          if (directory === null || selection === undefined || selection === null) return;
          if (typeof selection.model !== 'string') return;
          const effort = efforts[index];
          if (effort === undefined || effort === null) return;
          if (lastSentRef.current === effort.id) return;
          const sent = effort.id;
          lastSentRef.current = sent;
          // Remember an explicit choice per model, so a round trip through a
          // model without levels (or through another model) comes back to it
          // instead of resetting to that model's default.
          lastEffortRef.current.set(selection.provider + '/' + selection.model, sent);
          saveEfforts();
          // `select` resolves `{ok:false,error}` on failure and the store then
          // reverts the selection, so the guard has to be released on an
          // unsuccessful settle — otherwise that level can never be retried.
          const abandon = () => {
            if (lastSentRef.current === sent) lastSentRef.current = null;
          };
          try {
            Promise.resolve(
              directory.select({
                provider: selection.provider,
                model: selection.model,
                reasoningEffort: sent,
              }),
            ).then((result) => {
              if (result !== undefined && result !== null && result.ok === false) abandon();
            }, abandon);
          } catch (error) {
            abandon();
          }
        },
        [directory, selection, efforts, saveEfforts],
      );

      const selectModel = useCallback(
        (provider, model) => {
          if (directory === null) return;
          // `model` is the catalog entry, not its id. Passing the object through
          // as the selection's model produced a non-string `state.pending`,
          // which then rendered as a React child and crashed the trigger — the
          // one crash site outside the card boundary, so it retired the entry.
          const modelId =
            model !== null && model !== undefined && typeof model.id === 'string'
              ? model.id
              : undefined;
          if (modelId === undefined) return;
          const sameModel =
            selection !== undefined &&
            selection !== null &&
            selection.provider === provider &&
            selection.model === modelId;
          // Prefer the level this model was last left on, but only while the
          // adapter still advertises it; otherwise fall back to its default.
          const remembered = lastEffortRef.current.get(provider + '/' + modelId);
          const advertised =
            typeof remembered === 'string' &&
            model.reasoning !== undefined &&
            model.reasoning !== null &&
            Array.isArray(model.reasoning.efforts) &&
            model.reasoning.efforts.some(
              (level) => level !== null && level !== undefined && level.id === remembered,
            );
          const nextReasoning = sameModel
            ? declared
            : advertised
              ? remembered
              : model.reasoning !== undefined && model.reasoning !== null
                ? model.reasoning.defaultEffort
                : undefined;
          const sent = nextReasoning === undefined ? null : nextReasoning;
          if (typeof nextReasoning === 'string') {
            lastEffortRef.current.set(provider + '/' + modelId, nextReasoning);
            saveEfforts();
          }
          lastSentRef.current = sent;
          const abandon = () => {
            if (lastSentRef.current === sent) lastSentRef.current = null;
          };
          try {
            Promise.resolve(
              directory.select(
                nextReasoning === undefined
                  ? { provider, model: modelId }
                  : { provider, model: modelId, reasoningEffort: nextReasoning },
              ),
            ).then((result) => {
              if (result !== undefined && result !== null && result.ok === false) abandon();
            }, abandon);
          } catch (error) {
            abandon();
          }
          setOpen(false);
          setPane('root');
        },
        [directory, selection, declared, saveEfforts],
      );

      const onRailInput = useCallback(
        (event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          // Dragging the rail moves the clip immediately, with no easing: a
          // fast drag would otherwise leave the easing permanently behind a
          // target that keeps moving away, which reads as the clip freezing.
          // The serialized seek chase below already coalesces intermediate
          // frames onto the newest target, so this is the lowest-latency path.
          const frame = frameAt(next);
          desiredFrameRef.current = frame;
          shownFrameRef.current = frame;
          targetRef.current = frame / VIDEO_FPS;
          chase();
          setRailPosition(next);
          commitEffort(anchorAt(next, count));
        },
        [commitEffort, count, chase],
      );

      // An effort change we did not ask for (another surface, another tab)
      // releases the local rail position so the thumb follows the store again.
      // `busy` is essential: `declared` only catches up after the select
      // round-trip, so without it the thumb snaps back to the previous anchor
      // on every commit and then jumps forward again.
      useEffect(() => {
        if (railPosition === null) return;
        if (busy) return;
        if (lastSentRef.current === declared) return;
        const shownId = usable ? efforts[activeIndex]?.id : undefined;
        if (shownId === declared) return;
        setRailPosition(null);
      }, [declared, railPosition, usable, efforts, activeIndex, busy]);

      /* ---- popup placement, dismissal, and focus ---- */

      const triggerRef = useRef(null);
      const popupRef = useRef(null);

      const place = useCallback(() => {
        const element = triggerRef.current;
        if (element === null) return;
        const rect = element.getBoundingClientRect();
        const width = Math.min(POPUP_WIDTH, window.innerWidth - 24);
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
        setAnchor({ left, bottom: window.innerHeight - rect.top + 8 });
      }, []);

      const close = useCallback(() => {
        setOpen(false);
        setPane('root');
        const element = triggerRef.current;
        if (element !== null) element.focus();
      }, []);

      useEffect(() => {
        if (!open) return undefined;
        place();
        const onPointerDown = (event) => {
          const target = event.target;
          if (popupRef.current !== null && popupRef.current.contains(target)) return;
          if (triggerRef.current !== null && triggerRef.current.contains(target)) return;
          setOpen(false);
          setPane('root');
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          close();
        };
        const onReflow = () => place();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onReflow);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('resize', onReflow);
        };
      }, [open, place, close]);

      useEffect(() => {
        if (!open) return;
        const element = popupRef.current;
        if (element === null) return;
        const first = element.querySelector('button:not(:disabled)');
        if (first !== null) first.focus();
      }, [open, pane]);

      /* ---- labels ---- */

      const modelName =
        entry !== undefined && typeof entry.name === 'string' && entry.name !== ''
          ? entry.name
          : selection !== undefined &&
              selection !== null &&
              typeof selection.model === 'string'
            ? selection.model
            : '';
      const effortName =
        usable && activeEffort && typeof activeEffort.name === 'string' ? activeEffort.name : '';
      const stageName = usable ? stageAt(activeIndex, count) : null;
      // The composer caption shows the stage name, not the raw adapter effort id.
      const triggerEffort = usable && stageName !== null ? stageName : effortName;
      const errorText = loadError !== null ? loadError : state.error;
      const groups = Array.isArray(state.groups)
        ? state.groups.filter(
            (group) => group !== null && group !== undefined && Array.isArray(group.models) && group.models.length > 0,
          )
        : [];

      // An addressed subagent session has no model selection at all. The
      // shipped seat renders nothing there and so does this one; rendering a
      // working-looking control would only offer a slider whose every write
      // rejects. Placed after every hook so the hook count cannot change.
      if (!available) return null;

      // Every hook above has run, so retiring the entry here cannot change the
      // hook count. Only a genuinely unresolvable directory reaches this.
      if (directory === null && directoryFailed) {
        throw new Error('thinking-slider: ' + (directoryError || 'model directory unavailable'));
      }

      const popupChildren = [];

      if (pane === 'root') {
        popupChildren.push(
          h(
            'button',
            {
              key: 'model-row',
              type: 'button',
              className: 'tsl-row',
              disabled: groups.length === 0,
              onClick: () => setPane('models'),
            },
            h('span', { className: 'tsl-row-key' }, t('model')),
            h('span', { className: 'tsl-row-value' }, modelName !== '' ? modelName : t('loading')),
            caret('tsl-row-caret'),
          ),
          h('div', { key: 'divider', className: 'tsl-divider' }),
          h(
            'div',
            { key: 'card', className: 'tsl-card', style: { '--tsl-strength': String(strength) } },
            h(
              CardBoundary,
              { key: 'guard', resetKey: modelKey, label: t('crash') + '：' },
              h(
              'div',
              { className: 'tsl-main' },
              h('canvas', {
                key: 'canvas',
                ref: canvasRef,
                className: 'tsl-portrait',
                role: 'img',
                'aria-label': stageName !== null ? stageName : t('title'),
              }),
              h(
                'div',
                { className: 'tsl-meta' },
                h(
                  'div',
                  { className: 'tsl-title-row' },
                  h(
                    'span',
                    { className: 'tsl-stage' },
                    usable ? stageName : t('caption'),
                  ),
                  usable
                    ? h('span', { className: 'tsl-count' }, Math.round(position) + ' / ' + MAX_LEVEL)
                    : null,
                ),
                usable
                  ? h(
                      'div',
                      { className: 'tsl-sub' },
                      modelName + ' · ' + (busy ? t('applying') : effortName),
                    )
                  : h(
                      'div',
                      { className: 'tsl-dim' },
                      directory === null
                        ? t('unavailable')
                        : catalogLoading
                          ? t('loading')
                          : count === 1 &&
                              efforts[0] !== null &&
                              efforts[0] !== undefined &&
                              typeof efforts[0].name === 'string'
                            ? efforts[0].name
                            : t('noLevels'),
                    ),
              ),
            ),
            usable
              ? h(
                  'div',
                  { className: 'tsl-zone' },
                  h(
                    'div',
                    { className: 'tsl-labels' },
                    efforts.map((effort, index) => {
                      const ratio = anchorPosition(index, count) / MAX_LEVEL;
                      const transform =
                        index === 0
                          ? 'none'
                          : index === count - 1
                            ? 'translateX(-100%)'
                            : 'translateX(-50%)';
                      return h(
                        'button',
                        {
                          key:
                            effort !== null && effort !== undefined && typeof effort.id === 'string'
                              ? effort.id
                              : 'e' + index,
                          type: 'button',
                          className: 'tsl-label',
                          'data-active': String(index === activeIndex),
                          style: { left: ratio * 100 + '%', transform },
                          onClick: () => {
                            setRailPosition(anchorPosition(index, count));
                            commitEffort(index);
                          },
                        },
                        stageAt(index, count),
                      );
                    }),
                  ),
                  h('input', {
                    className: 'tsl-range',
                    type: 'range',
                    min: 0,
                    max: MAX_LEVEL,
                    step: RAIL_STEP,
                    value: position,
                    'aria-label': t('title') + ' · ' + t('effort'),
                    'aria-valuetext':
                      (stageName !== null ? stageName : '') +
                      '，' +
                      Math.round(position) +
                      ' / ' +
                      MAX_LEVEL +
                      (effortName !== '' ? '，' + effortName : ''),
                    onChange: onRailInput,
                  }),
                )
              : null,
            errorText !== null && errorText !== undefined
              ? h('p', { key: 'error', className: 'tsl-error' }, t('failed') + '：' + String(errorText))
              : null,
            ),
          ),
        );
        // Requested layout is the card first with the model row underneath; the
        // three root children are pushed above in reverse and flipped once here.
        popupChildren.reverse();
      } else {
        popupChildren.push(
          h(
            'button',
            { key: 'back', type: 'button', className: 'tsl-back', onClick: () => setPane('root') },
            '‹ ',
            t('model'),
          ),
          h(
            'ul',
            { key: 'list', className: 'tsl-list' },
            groups.flatMap((group) => [
              h(
                'li',
                { key: 'g:' + String(group.id), className: 'tsl-group' },
                typeof group.name === 'string' && group.name !== ''
                  ? group.name
                  : String(group.id),
              ),
              ...group.models.map((model) =>
                h(
                  'li',
                  { key: 'm:' + String(group.id) + '/' + String(model.id) },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'tsl-model',
                      'data-current': String(
                        selection !== undefined &&
                          selection !== null &&
                          selection.provider === group.id &&
                          selection.model === model.id,
                      ),
                      onClick: () => selectModel(group.id, model),
                    },
                    typeof model.name === 'string' && model.name !== ''
                      ? model.name
                      : String(model.id),
                  ),
                ),
              ),
            ]),
          ),
        );
      }

      return h(
        React.Fragment,
        null,
        clipUrl === null
          ? null
          : h('video', {
              key: 'video',
              ref: videoRef,
              className: 'tsl-video',
              // Inline as well as class-scoped: the clip must never become
              // visible even if the stylesheet has not been applied yet.
              style: {
                position: 'fixed',
                top: 0,
                left: '-9999px',
                width: '1px',
                height: '1px',
                opacity: 0,
                pointerEvents: 'none',
              },
              src: clipUrl,
              muted: true,
              playsInline: true,
              preload: 'auto',
              tabIndex: -1,
              'aria-hidden': 'true',
            }),
        h(
          'button',
          {
            key: 'trigger',
            ref: triggerRef,
            type: 'button',
            className: 'tsl-trigger',
            disabled: locked === true,
            'aria-haspopup': 'menu',
            'aria-expanded': String(open),
            title: t('title') + ' · ' + t('caption'),
            onClick: () => {
              if (open) {
                close();
              } else {
                setOpen(true);
                setPane('root');
              }
            },
          },
          h('span', { className: 'tsl-trigger-label' }, modelName !== '' ? modelName : t('model')),
          triggerEffort !== '' ? h('span', { className: 'tsl-trigger-effort' }, triggerEffort) : null,
          caret('tsl-caret'),
        ),
        h(
          'div',
          {
            key: 'popup',
            ref: popupRef,
            className: 'tsl-popup',
            role: 'menu',
            hidden: !open,
            style:
              anchor === null
                ? { position: 'fixed', zIndex: 1100, visibility: 'hidden' }
                : { position: 'fixed', zIndex: 1100, left: anchor.left, bottom: anchor.bottom },
          },
          popupChildren,
        ),
      );
    }

    /**
     * Required client services. `remote` and `remote.session` are listed because
     * `modelDirectories.directoryFor()` reaches `ctx.remote.session` whenever it
     * has to build a directory that is not already cached — without these the
     * call throws `cannot get property "remote.session" without inject`. The
     * shipped picker declares exactly the same two entries.
     */
    const inject = [
      'slots',
      'modelDirectories',
      'locale',
      'sessions',
      'remote',
      'remote.session',
    ];

    /**
     * Client plugin body: register dictionaries, then take the model seat.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = '@local/dsh-thinking-slider';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'thinking-slider: stylesheet');
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'thinking-slider: dictionaries');
      const t = ctx.locale.bind(NS);
      ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
        const models = scope.modelDirectories;
        const sessions = scope.sessions;
        scope.slots.inject('conversation.input.model', () =>
          // `conversation.input.model` is a single seat. A second registration at
          // the same priority throws; shadowing requires a different priority,
          // and the lowest one renders. The shipped picker sits at 0.
          //
          // The seat's owner calls `inject(sessionId)`; the shipped picker reads
          // its directory from exactly this path, and the standard props do not
          // carry a usable session id here.
          //
          // The directory is resolved on every call, exactly like the shipped
          // picker. Caching it here would pin one that a connection reset has
          // already disposed, leaving the control permanently stale.
          scope.slots.register(
            {
              name: 'conversation.input.model',
              priority: -1,
              registrant: '@local/dsh-thinking-slider',
              inject: (sessionId) => {
                // An addressed subagent session has no model selection at all;
                // the shipped seat asks the same question and renders nothing.
                let available = true;
                try {
                  if (
                    sessions !== undefined &&
                    sessions !== null &&
                    typeof sessions.subagentAddress === 'function'
                  ) {
                    available = sessions.subagentAddress(sessionId) === undefined;
                  }
                } catch (error) {
                  available = true;
                }
                try {
                  if (models === undefined || models === null) {
                    return {
                      sessionId,
                      available,
                      directory: null,
                      directoryError: 'modelDirectories service is unavailable',
                    };
                  }
                  return {
                    sessionId,
                    available,
                    directory: models.directoryFor(sessionId),
                    directoryError: null,
                  };
                } catch (error) {
                  return {
                    sessionId,
                    available,
                    directory: null,
                    directoryError: error && error.message ? error.message : String(error),
                  };
                }
              },
            },
            (props) =>
              h(ModelControl, {
                available: props.available,
                directory: props.directory,
                directoryError: props.directoryError,
                sessionId: props.sessionId,
                locked: props.locked,
                models,
                t,
              }),
          ),
        );
      });
    }

    return { inject, apply };
  },
});
