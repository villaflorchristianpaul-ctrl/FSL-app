import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, NativeModules
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';

const LOCAL_GLB = require('../../assets/models/girl-tutor.glb');
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

declare const process: {
  env?: {
    EXPO_PUBLIC_GEMINI_API_KEY?: string;
  };
};

type ExpoRuntimeConstants = typeof Constants & {
  expoConfig?: { hostUri?: string };
  manifest?: { debuggerHost?: string; hostUri?: string };
  manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
};

const getGeminiApiKey = () => {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const apiKey = env?.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Gemini API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart Expo.');
  }

  return apiKey;
};

const isLoopbackHost = (host?: string) =>
  !host || host === 'localhost' || host.startsWith('127.');

const getHostFromUri = (uri?: string) => {
  if (!uri) return undefined;

  const withoutScheme = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const hostWithPort = withoutScheme.split('/')[0];
  const host = hostWithPort.split('@').pop()?.split(':')[0];

  return isLoopbackHost(host) ? undefined : host;
};

const getExpoDevServerHost = () => {
  const runtime = Constants as ExpoRuntimeConstants;
  const hostUri =
    runtime.expoConfig?.hostUri ??
    runtime.manifest?.hostUri ??
    runtime.manifest?.debuggerHost ??
    runtime.manifest2?.extra?.expoClient?.hostUri;

  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  return getHostFromUri(hostUri) ?? getHostFromUri(sourceCode?.scriptURL);
};

const rewriteLoopbackAssetUri = (uri: string) => {
  const devServerHost = getExpoDevServerHost();

  if (!devServerHost) return uri;

  return uri.replace(
    /^(https?:\/\/)(localhost|127(?:\.\d+){3})(:\d+)?/i,
    `$1${devServerHost}$3`,
  );
};

// ─── Gemini Flash Lite API ────────────────────────────────────────────────
async function getGlossSequence(
  sentence: string,
  availableClips: string[],
): Promise<string[]> {
  const clipList = availableClips.filter(c => {
    const lower = c.toLowerCase();
    return lower !== 'idle' && lower !== 'action';
  }).join(', ');

  const prompt = `You are an expert Filipino Sign Language (FSL) interpreter.

The user said: "${sentence}"

Available FSL animation clips: ${clipList}

Task: Map the sentence to the correct sequence of FSL signs using ONLY clips from the list above.
Rules:
- FSL does not sign every word (skip: ay, ang, ng, na, sa, mga, at, etc.)
- Use the most semantically accurate clip for each meaningful word
- Return ONLY a JSON array of clip names in signing order, no explanation
- If no clips match at all, return an empty array []

Example: "Ako ay guro" -> ["Ako","Guro"]
Example: "Basahin ang libro" -> ["Basahin","Libro"]

Respond with ONLY the JSON array, nothing else.`;

  const apiKey = getGeminiApiKey();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0 },
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error('Gemini API ' + response.status + ': ' + errBody.slice(0, 120));
  }

  const data = await response.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/```[a-z]*\n?|```/g, '').trim();
  const parsed = JSON.parse(clean.length ? clean : '[]');
  if (!Array.isArray(parsed)) throw new Error('API did not return a valid array.');

  const clipMap = new Map(availableClips.map(c => [c.toLowerCase(), c]));
  return parsed
    .filter((c: any) => typeof c === 'string' && clipMap.has(c.toLowerCase()))
    .map((c: string) => clipMap.get(c.toLowerCase()) as string);
}

// ─── WEBVIEW HTML ─────────────────────────────────────────────────────────
function buildHtml(glbUri: string): string {
  const safeGlb = encodeURIComponent(glbUri);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:100%; height:100%; overflow:hidden; background:#040912; }
    canvas { display:block; width:100%!important; height:100%!important; touch-action:none; }
    #status {
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%);
      color:#00e5ff; font-family:monospace; font-size:13px;
      text-align:center; pointer-events:none; white-space:pre-line;
    }
    #tag {
      position:absolute; top:8px; left:8px;
      background:rgba(0,0,0,0.7); color:#00e5ff;
      font-family:monospace; font-size:11px;
      padding:3px 7px; border-radius:4px; display:none;
    }

    /* ── NOW-SIGNING BANNER (cleaned: no rounded rect, smaller & lower) ── */
    #now-signing {
      position:absolute; bottom:40px; left:0; right:0;
      display:none; flex-direction:column; align-items:center;
      pointer-events:none;
    }
    #now-signing .label {
      font-family:monospace; font-size:9px; color:#607d8b;
      text-transform:uppercase; letter-spacing:1.5px; margin-bottom:3px;
    }
    #now-signing .clip-name {
      font-family:monospace; font-size:18px; font-weight:700;
      color:#00e5ff; text-shadow: 0 0 14px rgba(0,229,255,0.6);
      background:transparent; padding:0; border-radius:0;
      border:0;
    }
    #now-signing .progress-bar-wrap {
      margin-top:4px; width:120px; height:3px;
      background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;
    }
    #now-signing .progress-bar {
      height:100%; width:0%; background:#00e5ff;
      transition:width 0.05s linear;
    }

  </style>
</head>
<body>
  <div id="status">Loading...</div>
  <div id="tag"></div>
  <div id="now-signing">
    <div class="label">now signing</div>
    <div class="clip-name" id="ns-clip">—</div>
    <div class="progress-bar-wrap"><div class="progress-bar" id="ns-bar"></div></div>
  </div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

    const statusEl   = document.getElementById('status');
    const tagEl      = document.getElementById('tag');
    const nsEl       = document.getElementById('now-signing');
    const nsClipEl   = document.getElementById('ns-clip');
    const nsBarEl    = document.getElementById('ns-bar');

    function showNowSigning(name) {
      nsClipEl.textContent   = name;
      nsBarEl.style.width    = '0%';
      nsEl.style.display     = 'flex';
      postRN('nowSigning', { name });
    }
    function updateSigningProgress(pct) {
      nsBarEl.style.width = Math.min(100, pct) + '%';
    }
    function hideNowSigning() {
      nsEl.style.display = 'none';
      postRN('nowSigning', { name: null });
    }

    function dbg(msg, type = 'info') {
      // no-op for production use
    }

    // Live state panel — updated every frame
    let _liveAction = null;
    function updateStatePanel() {
      // no-op; debug UI has been removed
    }

    function setStateLabel(label) {
      // no-op; debug UI has been removed
    }

    function setStatus(msg) {
      statusEl.style.display = msg ? 'block' : 'none';
      statusEl.textContent   = msg;
    }
    function postRN(type, payload = {}) {
      if (window.ReactNativeWebView)
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    }
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    function fetchBuffer(uri, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', uri, true);
        xhr.responseType = 'arraybuffer';
        xhr.onprogress = e => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
        xhr.onload  = () =>
          (xhr.status === 200 || xhr.status === 0)
            ? resolve(xhr.response)
            : reject(new Error('HTTP ' + xhr.status));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
      });
    }

    // ── Renderer ──────────────────────────────────────────────────────────
    const PR = Math.min(window.devicePixelRatio || 1, 1.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    renderer.setPixelRatio(PR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace  = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040912);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.8);
    scene.add(ambientLight);
    const frontLight = new THREE.PointLight(0xffffff, 6.0, 1.5);
    scene.add(frontLight);
    const leftFill  = new THREE.PointLight(0xfff6ee, 2.5, 2.5);
    scene.add(leftFill);
    const rightFill = new THREE.PointLight(0xfff6ee, 2.5, 2.5);
    scene.add(rightFill);
    const rimLight  = new THREE.PointLight(0xaad4ff, 1.2, 2.0);
    scene.add(rimLight);
    scene.add(new THREE.GridHelper(10, 10, 0x1a1a3a, 0x0d0d1f));

    const canvas = renderer.domElement;
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
    canvas.addEventListener('mousedown',  e => e.preventDefault());
    canvas.addEventListener('mousemove',  e => e.preventDefault());
    canvas.addEventListener('wheel',      e => e.preventDefault(), { passive: false });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ── State ─────────────────────────────────────────────────────────────
    let mixer      = null;
    let clips      = {};
    let actions    = {};
    let idleName   = null;
    let avatarRoot = null;
    const clock    = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      if (mixer) mixer.update(clock.getDelta());
      updateStatePanel();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);

    // ── Low-level helpers ─────────────────────────────────────────────────

    // Hard-stop every action. Called only when switching clips.
    function hardStopAll(exceptAction) {
      for (const name of Object.keys(actions)) {
        const a = actions[name];
        if (a === exceptAction) continue;
        a.enabled = false;
        a.paused  = false;
        a.stop();
      }
    }

    function getAction(name) {
      if (!actions[name] && mixer && clips[name]) {
        actions[name] = mixer.clipAction(clips[name]);
        dbg('lazy-created action: ' + name, 'info');
      }
      return actions[name] ?? null;
    }

    // ── AnimationController ───────────────────────────────────────────────
    let AC_idleName = null;
    let AC_signing  = false;
    let AC_seqGen   = 0;   // bumped on every new sequence/playSingle call

    // ── goIdle ────────────────────────────────────────────────────────────
    function AC_goIdle() {
      if (!AC_idleName) { dbg('goIdle: no idleName', 'warn'); return; }
      if (AC_signing)   { dbg('goIdle: skipped (signing)', 'warn'); return; }
      dbg('goIdle → ' + AC_idleName, 'ok');
      setStateLabel('idle');
      hideNowSigning();
      const a = getAction(AC_idleName);
      if (!a) { dbg('goIdle: missing action', 'err'); return; }
      hardStopAll(a);
      a.enabled = true;
      a.paused  = false;
      a.reset();
      a.time = 0;
      a.setEffectiveTimeScale(1);
      a.setEffectiveWeight(1);
      const isStaticIdle = AC_idleName?.toLowerCase() === 'idle';
      if (isStaticIdle) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.play();
        a.paused = true;
      } else {
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.clampWhenFinished = false;
        a.play();
      }
      _liveAction = a;
      dbg('idle playing — dur:' + a.getClip().duration.toFixed(2) + 's running:' + a.isRunning() + (isStaticIdle ? ' [static idle]' : ''), 'ok');
    }

    // ── playOnce: rAF-poll based — immune to setTimeout throttling ────────
    // Resolves when action.time >= clip.duration (i.e. animation finished).
    // Does NOT rely on mixer 'finished' event or setTimeout.
    function AC_playOnce(name, myGen, timeScale = 1) {
      return new Promise(resolve => {
        const a = getAction(name);
        if (!a) {
          dbg('playOnce: no action "' + name + '"', 'err');
          resolve('missing');
          return;
        }

        const clip = a.getClip();
        const dur  = clip.duration;
        dbg('playOnce → ' + name + ' dur:' + dur.toFixed(3) + 's timeScale:' + timeScale.toFixed(2), 'info');

        // Stop everything else, then configure this action
        hardStopAll(a);
        a.enabled = true;
        a.paused  = false;
        a.reset();
        a.time = 0;
        a.setEffectiveTimeScale(timeScale);
        a.setEffectiveWeight(1);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;  // keeps pose on last frame
        a.play();
        _liveAction = a;
        setStateLabel('playing');
        showNowSigning(name);   // ← banner appears immediately

        dbg('playOnce a.play() → running:' + a.isRunning() +
            ' enabled:' + a.enabled +
            ' w:' + a.getEffectiveWeight().toFixed(2), 'info');

        // Poll every animation frame until:
        //   (a) clip time reached duration  → done naturally
        //   (b) gen changed                 → superseded, exit
        //   (c) action stopped externally   → exit
        let lastLoggedTime = -1;
        let frameCount = 0;
        function poll() {
          frameCount++;

          // Check superseded
          if (AC_seqGen !== myGen) {
            dbg('playOnce SUPERSEDED during poll: ' + name, 'warn');
            hideNowSigning();
            resolve('superseded');
            return;
          }

          const t   = a.time;
          const pct = dur > 0 ? (t / dur * 100).toFixed(0) : '?';

          // Log every ~20 frames to avoid spam
          if (frameCount % 20 === 0) {
            dbg('poll ' + name + ' t:' + t.toFixed(3) + '/' + dur.toFixed(3) +
                ' (' + pct + '%) running:' + a.isRunning(), 'info');
          }

          // Update progress bar
          updateSigningProgress(parseFloat(pct));

          // Detect completion: time at or past duration
          if (dur > 0 && t >= dur - 0.016) {
            dbg('playOnce DONE (time) ' + name + ' t:' + t.toFixed(3), 'ok');
            hideNowSigning();
            resolve('time-done');
            return;
          }

          // Detect if action stopped playing unexpectedly (not by us)
          if (!a.isRunning() && !a.paused && t < dur * 0.9) {
            dbg('playOnce action stopped early t:' + t.toFixed(3) + ' restarting', 'warn');
            // Try to restart it once
            a.enabled = true;
            a.play();
          }

          requestAnimationFrame(poll);
        }
        requestAnimationFrame(poll);
      });
    }

    // ── sequence ─────────────────────────────────────────────────────────
    async function AC_sequence(words) {
      dbg('sequence START [' + words.join(',') + ']', 'ok');
      const myGen = ++AC_seqGen;
      AC_signing  = true;
      setStateLabel('playing');

      for (const w of words) {
        if (AC_seqGen !== myGen) { dbg('sequence superseded before: ' + w, 'warn'); return; }
        if (!clips[w])           { dbg('no clip: ' + w + ' — skip', 'err'); continue; }
        dbg('signing: ' + w, 'info');
        const result = await AC_playOnce(w, myGen, 0.82);
        dbg('signed: ' + w + ' result:' + result, 'ok');
        if (result === 'superseded') return;
        await sleep(100);
      }

      AC_signing = false;
      dbg('sequence DONE', 'ok');
      postRN('sequenceDone');
      await sleep(380);
      AC_goIdle();
    }

    // ── playSingle ────────────────────────────────────────────────────────
    async function AC_playSingle(name) {
      dbg('playSingle: ' + name, 'info');
      const myGen = ++AC_seqGen;
      AC_signing  = true;

      if (clips[name]) {
        const result = await AC_playOnce(name, myGen);
        dbg('playSingle result:' + result, 'info');
        if (result === 'superseded') return;
      } else {
        dbg('playSingle: no clip "' + name + '"', 'err');
      }

      AC_signing = false;
      postRN('sequenceDone');
      await sleep(280);
      AC_goIdle();
    }

    // ── stop ──────────────────────────────────────────────────────────────
    function AC_stop() {
      dbg('AC_stop', 'warn');
      AC_seqGen++;
      AC_signing = false;
      hardStopAll(null);
      _liveAction = null;
      setStateLabel('stopped');
    }

    const AC = {
      get _idleName()  { return AC_idleName; },
      set _idleName(v) { AC_idleName = v; postRN('idleChanged', { name: v }); },
      goIdle:     AC_goIdle,
      sequence:   AC_sequence,
      playSingle: AC_playSingle,
      stop:       AC_stop,
    };

    // ── Load GLB ──────────────────────────────────────────────────────────
    async function loadGLB(uri) {
      dbg('loadGLB: ' + uri.slice(-40), 'info');
      setStatus('Fetching model...');
      const buffer = await fetchBuffer(uri, p =>
        setStatus('Downloading... ' + (p * 100).toFixed(0) + '%')
      );

      setStatus('Parsing...');
      const loader = new GLTFLoader();
      const gltf   = await new Promise((res, rej) => loader.parse(buffer, '', res, rej));

      if (avatarRoot) { scene.remove(avatarRoot); avatarRoot = null; }
      if (mixer)      { mixer.stopAllAction(); mixer = null; }
      actions = {};
      clips   = {};

      scene.add(gltf.scene);
      avatarRoot = gltf.scene;
      gltf.scene.position.set(0, 0, 0);

      camera.position.set(0, 0.25, 2.35);
      camera.lookAt(0, 0.35, 0);

      frontLight.position.set(0,    0.25,  1.9);
      leftFill.position.set(-1.0,   0.5,  0.5);
      rightFill.position.set(1.0,   0.5,  0.5);
      rimLight.position.set(0,      0.8, -1.0);

      let meshCount = 0;
      gltf.scene.traverse(obj => {
        if (!obj.isMesh) return;
        meshCount++;
        obj.castShadow    = false;
        obj.receiveShadow = false;
        obj.frustumCulled = false;
      });

      tagEl.textContent   = 'Meshes: ' + meshCount;
      tagEl.style.display = 'block';

      mixer = new THREE.AnimationMixer(gltf.scene);

      // Log ALL mixer finished events globally for diagnostics
      mixer.addEventListener('finished', e => {
        dbg('MIXER finished → ' + e.action.getClip().name + ' | running:' + e.action.isRunning(), 'info');
      });

      const names = [];
      for (const clip of gltf.animations) {
        clips[clip.name] = clip;
        const a = mixer.clipAction(clip);
        a.enabled = false;
        a.stop();
        actions[clip.name] = a;
        names.push(clip.name);
        dbg('clip loaded: "' + clip.name + '" dur:' + clip.duration.toFixed(2) + 's', 'info');
      }

      dbg('Total clips: ' + names.length + ' | ' + names.join(', '), 'ok');

      idleName = names.find(n => n.toLowerCase() === 'idle')
        ?? names.find(n => n.toLowerCase() === 'action')
        ?? names[0]
        ?? null;
      AC._idleName = idleName;
      dbg('idleName: ' + idleName, 'ok');

      postRN('loaded',      { meshCount });
      postRN('animsLoaded', { names });

      AC.goIdle();
      setStatus('');
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    const glbUri = decodeURIComponent('${safeGlb}');
    loadGLB(glbUri).catch(err => {
      setStatus('Error:\\n' + err.message);
      dbg('BOOT ERROR: ' + err.message, 'err');
      postRN('error', { message: err.message });
    });

    // ── RN → WebView message bridge ───────────────────────────────────────
    function _handleRNMessageEvent(e) {
      try {
        // RN WebView sometimes wraps the payload (e.data) inside another object
        let raw = e && e.data !== undefined ? e.data : e;
        if (raw && typeof raw === 'object' && raw.data) raw = raw.data;
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;

        dbg('RN→WV: ' + (msg?.type ?? '[no-type]') + (msg?.words ? ' [' + msg.words.join(',') + ']' : '') + (msg?.name ? ' ' + msg.name : ''), 'info');

        switch (msg?.type) {
          case 'sequence':
            AC.sequence(msg.words ?? []);
            break;
          case 'play':
            // If loop is explicitly false, play single once; otherwise set as idle loop
            if (msg.loop === false) {
              AC.playSingle(msg.name);
            } else {
              AC._idleName = msg.name;
              AC.goIdle();
            }
            break;
          case 'stop':
            AC.stop();
            break;
          case 'reload':
            loadGLB(glbUri).catch(console.error);
            break;
          default:
            dbg('RN→WV unknown type: ' + String(msg?.type), 'warn');
        }
      } catch (err) {
        dbg('RN→WV parse error: ' + (err && err.message ? err.message : String(err)), 'err');
      }
    }

    // Attach to both document and window for maximum compatibility across platforms
    document.addEventListener && document.addEventListener('message', _handleRNMessageEvent);
    window.addEventListener && window.addEventListener('message', _handleRNMessageEvent);
  </script>
</body>
</html>`;
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────
export default function TextToFSLScreen() {
  const [inputText,     setInputText]     = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [glbUri,        setGlbUri]        = useState<string | null>(null);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [meshCount,     setMeshCount]     = useState<number | null>(null);
  const [animNames,     setAnimNames]     = useState<string[]>([]);
  const [idleName,      setIdleName]      = useState<string | null>(null);
  const [isPreparing,   setIsPreparing]   = useState(true);
  const [glossPreview,  setGlossPreview]  = useState<string[]>([]);
  const [playingChip,   setPlayingChip]   = useState<string | null>(null);
  const webViewRef = useRef<any>(null);

  const sendMsg = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  const prepareAssets = useCallback(async () => {
    setLoadError(null);
    setMeshCount(null);
    setAnimNames([]);
    setGlossPreview([]);
    setIsPreparing(true);
    try {
      if (!FileSystem.cacheDirectory) {
        throw new Error('File cache is unavailable on this device.');
      }

      const asset = Asset.fromModule(LOCAL_GLB);
      const assetKey = asset.hash || 'girl-tutor';
      const dest     = `${FileSystem.cacheDirectory}girltutoranimations-${assetKey}.glb`;
      const destInfo = await FileSystem.getInfoAsync(dest);
      const cachedSize = destInfo.exists && 'size' in destInfo ? destInfo.size : 0;
      const shouldRefreshCache = !destInfo.exists || cachedSize < 1024 * 1024;

      if (shouldRefreshCache) {
        if (destInfo.exists) {
          await FileSystem.deleteAsync(dest, { idempotent: true });
        }

        if (asset.localUri) {
          await FileSystem.copyAsync({ from: asset.localUri, to: dest });
        } else {
          const remoteUri = rewriteLoopbackAssetUri(asset.uri);
          await FileSystem.downloadAsync(remoteUri, dest);
        }
      }

      setGlbUri(dest);
    } catch (e: any) {
      setLoadError(e?.message ?? String(e));
    } finally {
      setIsPreparing(false);
    }
  }, []);

  useEffect(() => { prepareAssets(); }, [prepareAssets]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'loaded')       setMeshCount(msg.meshCount);
      if (msg.type === 'error')        setLoadError(msg.message);
      if (msg.type === 'animsLoaded')  setAnimNames(msg.names);
      if (msg.type === 'idleChanged')  setIdleName(msg.name ?? null);
      if (msg.type === 'sequenceDone') {
        setIsTranslating(false);
        setPlayingChip(null);
      }
      // Real-time clip highlight — fires at the start of every sign
      if (msg.type === 'nowSigning') {
        setPlayingChip(msg.name ?? null);
      }
    } catch (_) {}
  }, []);

  const handleTranslate = useCallback(async () => {
    const text = inputText.trim();
    if (!text) { Alert.alert('Error', 'Please enter text to translate'); return; }
    if (animNames.length === 0) { Alert.alert('Not ready', 'Animations are still loading.'); return; }

    setIsTranslating(true);
    setGlossPreview([]);
    setPlayingChip(null);

    try {
      const glosses = await getGlossSequence(text, animNames);
      if (glosses.length === 0) {
        Alert.alert('No matching signs', 'No FSL clips matched this sentence.');
        setIsTranslating(false);
        return;
      }
      setGlossPreview(glosses);
      sendMsg({ type: 'sequence', words: glosses });
    } catch (err: any) {
      Alert.alert('Translation failed', err.message ?? String(err));
      setIsTranslating(false);
    }
  }, [inputText, animNames, sendMsg]);

  const handleChipPlay = useCallback((name: string) => {
    if (isTranslating) return;
    setPlayingChip(name);
    setGlossPreview([name]);
    sendMsg({ type: 'play', name, loop: false });
  }, [isTranslating, sendMsg]);

  const handleChipLongPress = useCallback((name: string) => {
    if (isTranslating) return;
    // Ask WebView to loop this clip as the idle animation
    sendMsg({ type: 'play', name, loop: true });
    // optimistic UI update
    setIdleName(name);
  }, [isTranslating, sendMsg]);

  const html = glbUri ? buildHtml(glbUri) : null;

  return (
    <View style={styles.container}>

      {/* ── 3D Viewport ── */}
      <View style={styles.modelContainer}>
        {html && (
          <WebView
            ref={webViewRef}
            style={StyleSheet.absoluteFillObject}
            originWhitelist={['*']}
            source={{ html, baseUrl: 'file://' }}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            javaScriptEnabled
            domStorageEnabled={false}
            thirdPartyCookiesEnabled={false}
            cacheEnabled
            onMessage={handleMessage}
            mixedContentMode="always"
            scrollEnabled={false}
            nestedScrollEnabled={false}
            androidHardwareAccelerationDisabled={false}
          />
        )}

        {isPreparing && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#00e5ff" size="large" />
            <Text style={styles.overlayText}>Preparing model…</Text>
          </View>
        )}

        {!isPreparing && loadError && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle" size={32} color="#ff6b6b" />
            <Text style={styles.overlayError}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={prepareAssets}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {meshCount !== null && (
          <View style={styles.diagnosticsTag} pointerEvents="none">
            <Text style={styles.diagnosticsText}>
              Meshes: {meshCount}{animNames.length ? '  Anims: ' + animNames.length : ''}
            </Text>
          </View>
        )}

        {glossPreview.length > 0 && (
          <View style={styles.glossBar} pointerEvents="none">
            {glossPreview.map((g, i) => (
              <View key={i} style={styles.glossChip}>
                <Text style={styles.glossText}>{g}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Input Section ── */}
      <View style={styles.inputSection}>
        <View style={styles.titleRow}>
          <Text style={styles.sectionTitle}>Type to Translate to FSL</Text>
        </View>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Ako ay guro sa klase"
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={t => { setInputText(t); if (!t.trim()) setGlossPreview([]); }}
            multiline
            maxLength={200}
          />
          <View style={styles.charCount}>
            <Text style={styles.charCountText}>{inputText.length}/200</Text>
          </View>
        </View>

        {animNames.length > 0 && (
          <View style={styles.availableSignsContainer}>
            <Text style={styles.availableSignsTitle}>Available FSL Signs (tap to preview):</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.signsScroll}
            >
              {animNames
                .filter(n => {
                  const lower = n.toLowerCase();
                  return lower !== 'idle' && lower !== 'action';
                })
                .map((name, index) => {
                  const isActive = playingChip === name;
                  const isIdleLoop = idleName === name;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.signChip,
                        isActive && styles.signChipActive,
                        isIdleLoop && styles.signChipIdle,
                      ]}
                      onPress={() => handleChipPlay(name)}
                      onLongPress={() => handleChipLongPress(name)}
                      disabled={isTranslating}
                      activeOpacity={0.7}
                    >
                      {isActive && (
                        <ActivityIndicator
                          size="small"
                          color="#00e5ff"
                          style={{ marginRight: 4, transform: [{ scale: 0.6 }] }}
                        />
                      )}
                      <Text style={[
                        styles.signText,
                        isActive && styles.signTextActive,
                        isIdleLoop && styles.signTextIdle,
                      ]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => { setInputText(''); setGlossPreview([]); setPlayingChip(null); }}
            disabled={isTranslating}
          >
            <Ionicons name="trash" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.translateButton, isTranslating && styles.translateButtonDisabled]}
            onPress={handleTranslate}
            disabled={isTranslating}
          >
            {isTranslating && !playingChip ? (
              <View style={styles.rowCenter}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.translateButtonText}>Signing…</Text>
              </View>
            ) : (
              <View style={styles.rowCenter}>
                <Ionicons name="hand-left" size={20} color="#fff" />
                <Text style={styles.translateButtonText}>Translate & Sign</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.speakButton} disabled={isTranslating}>
            <Ionicons name="volume-high" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <Text style={styles.helpText}>
          Powered by Gemini Flash Lite — type any Filipino sentence and the avatar
          will sign the FSL equivalent automatically.
        </Text>
      </View>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:               { flex: 1, backgroundColor: '#fff' },
  modelContainer:          { flex: 0.55, backgroundColor: '#090c18', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: 'hidden' },
  inputSection:            { flex: 0.45, padding: 16, justifyContent: 'space-between' },
  titleRow:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:            { fontSize: 16, fontWeight: 'bold', color: '#333' },

  inputWrapper:            { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, backgroundColor: '#f9f9f9', marginBottom: 12 },
  textInput:               { fontSize: 14, color: '#333', maxHeight: 80 },
  charCount:               { marginTop: 8, alignItems: 'flex-end' },
  charCountText:           { fontSize: 11, color: '#999' },
  buttonContainer:         { flexDirection: 'row', gap: 10, marginBottom: 12 },
  clearButton:             { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd' },
  translateButton:         { flex: 1, height: 50, backgroundColor: '#00e5ff', borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  translateButtonDisabled: { opacity: 0.7 },
  translateButtonText:     { color: '#fff', fontWeight: 'bold', fontSize: 14, marginLeft: 6 },
  rowCenter:               { flexDirection: 'row', alignItems: 'center' },
  speakButton:             { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd' },
  overlay:                 { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,12,24,0.85)', justifyContent: 'center', alignItems: 'center', gap: 12 },
  overlayText:             { color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  overlayError:            { color: '#ff6b6b', fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  retryButton:             { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#00e5ff', borderRadius: 20 },
  retryText:               { color: '#fff', fontWeight: 'bold' },
  helpText:                { fontSize: 12, color: '#666', fontStyle: 'italic', lineHeight: 18 },
  diagnosticsTag:          { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.75)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 },
  diagnosticsText:         { color: '#00e5ff', fontSize: 11, fontFamily: 'monospace' },
  glossBar:                { position: 'absolute', bottom: 12, left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  glossChip:               { backgroundColor: 'rgba(0,229,255,0.15)', borderWidth: 1, borderColor: '#00e5ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  glossText:               { color: '#00e5ff', fontSize: 11, fontWeight: '600' },
  availableSignsContainer: { marginBottom: 12 },
  availableSignsTitle:     { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6 },
  signsScroll:             { gap: 8, paddingBottom: 4 },
  signChip:                { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  signChipActive:          { backgroundColor: 'rgba(0,229,255,0.12)', borderColor: '#00e5ff' },
  signChipIdle:            { borderColor: '#4cff91', backgroundColor: 'rgba(76,255,145,0.08)' },
  signText:                { color: '#555', fontSize: 11, fontWeight: '500' },
  signTextActive:          { color: '#00e5ff', fontWeight: '700' },
  signTextIdle:            { color: '#4cff91', fontWeight: '700' },
});
