import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line } from 'react-native-svg';
import { RESET_SEQUENCE_ENDPOINT, TRANSLATE_ENDPOINT } from '../../constants/api';

const RESET_ENDPOINT = RESET_SEQUENCE_ENDPOINT;

const FRAME_INTERVAL_MS = 120;
const REQUEST_TIMEOUT_MS = 5000;
const GEMINI_REQUEST_TIMEOUT_MS = 12000;
const SNAPSHOT_QUALITY = 10;
const SIGN_COOLDOWN_MS = 320;
const REPEAT_SIGN_COOLDOWN_MS = 950;
const MAX_CAPTURED_TOKENS = 60;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

declare const process: {
  env?: {
    EXPO_PUBLIC_GEMINI_API_KEY?: string;
  };
};

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const POSE_CONNECTIONS = [
  [0, 1], [0, 2], [2, 4], [1, 3], [3, 5], [0, 6], [1, 7],
];

type LandmarkPoint = { x: number; y: number; visibility?: number };
type Landmarks = { hands: LandmarkPoint[][]; pose: LandmarkPoint[] };
type Facing = 'front' | 'back';
type StopLiveOptions = { promptForSentence?: boolean };
type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: { message?: string };
};

const EMPTY_LANDMARKS: Landmarks = { hands: [], pose: [] };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const formatSentence = (tokens: string[]) => {
  if (tokens.length === 0) return '';
  if (tokens.every(token => token.length === 1)) {
    return tokens.join('').toUpperCase();
  }
  return tokens.join(' ');
};

const normalizeCapturedTokens = (tokens: string[]) =>
  tokens.map(token => token.trim()).filter(Boolean);

const getGeminiApiKey = () => {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const apiKey = env?.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Gemini API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart Expo.');
  }

  return apiKey;
};

const extractGeminiText = (data: GeminiResponse) =>
  data.candidates?.[0]?.content?.parts
    ?.map(part => part.text ?? '')
    .join('')
    .trim() ?? '';

const buildSentenceWithGemini = async (tokens: string[]) => {
  const cleanedTokens = normalizeCapturedTokens(tokens);
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Gemini API key is missing.');
  }

  const prompt = `You help convert Filipino Sign Language recognition tokens into one natural sentence.

Captured tokens in order:
${JSON.stringify(cleanedTokens)}

Rules:
- Keep the meaning implied by the captured tokens.
- Remove obvious accidental repeats or false filler tokens.
- If consecutive tokens are single letters, combine them as a spelled word when it makes sense.
- Return one clear sentence only.
- Do not add explanations, markdown, labels, or quotation marks.`;

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.2 },
      }),
    },
    GEMINI_REQUEST_TIMEOUT_MS,
  );

  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) as GeminiResponse : {};

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini API ${response.status}`);
  }

  const sentence = extractGeminiText(data).replace(/^["']|["']$/g, '').trim();

  if (!sentence) {
    throw new Error('Gemini did not return a sentence.');
  }

  return sentence;
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const isValidPoint = (point: unknown): point is LandmarkPoint => {
  if (!point || typeof point !== 'object') return false;
  const candidate = point as LandmarkPoint;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number';
};

const isValidLandmarks = (value: unknown): value is Landmarks => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Landmarks;
  const handsAreValid =
    Array.isArray(candidate.hands) &&
    candidate.hands.every(hand => Array.isArray(hand) && hand.every(isValidPoint));

  const poseIsValid =
    Array.isArray(candidate.pose) &&
    candidate.pose.every(isValidPoint);

  return handsAreValid && poseIsValid;
};

const imagePathToBase64 = async (path: string): Promise<string> => {
  const imageResponse = await fetch(`file://${path}`);
  const blob = await imageResponse.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('Could not read camera snapshot.'));
        return;
      }

      const [, base64] = result.split(',');
      if (!base64) {
        reject(new Error('Could not convert camera snapshot to base64.'));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => reject(new Error('Failed to read camera snapshot.'));
    reader.readAsDataURL(blob);
  });
};

export default function TranslateScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();

  const [facing, setFacing] = useState<Facing>('front');
  const device = useCameraDevice(facing);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [translation, setTranslation] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [bufferProgress, setBufferProgress] = useState<{ current: number; total: number } | null>(null);
  const [sentence, setSentence] = useState<string[]>([]);
  const [landmarks, setLandmarks] = useState<Landmarks>(EMPTY_LANDMARKS);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [showMesh, setShowMesh] = useState(false);
  const [builderVisible, setBuilderVisible] = useState(false);
  const [builderTokens, setBuilderTokens] = useState<string[]>([]);
  const [builderResult, setBuilderResult] = useState('');
  const [builderError, setBuilderError] = useState('');
  const [isBuildingSentence, setIsBuildingSentence] = useState(false);

  const cameraRef = useRef<Camera>(null);
  const isBusyRef = useRef(false);
  const isLiveRef = useRef(false);
  const isConnectedRef = useRef(true);
  const sessionIdRef = useRef(0);
  const lastSignRef = useRef('');
  const lastAddedAtRef = useRef(0);
  const sentenceRef = useRef<string[]>([]);

  const updateConnection = useCallback((value: boolean) => {
    if (isConnectedRef.current === value) return;
    isConnectedRef.current = value;
    setIsConnected(value);
  }, []);

  useEffect(() => {
    sentenceRef.current = sentence;
  }, [sentence]);

  const resetBackend = useCallback(async () => {
    try {
      await fetchWithTimeout(RESET_ENDPOINT, { method: 'POST' }, 2500);
    } catch {
      // Reset is best-effort. Do not block navigation or the UI.
    }
  }, []);

  const openSentenceBuilder = useCallback((tokens: string[]) => {
    const cleanedTokens = normalizeCapturedTokens(tokens);

    if (cleanedTokens.length === 0) return;

    setBuilderTokens(cleanedTokens);
    setBuilderResult('');
    setBuilderError('');
    setBuilderVisible(true);
  }, []);

  const closeSentenceBuilder = useCallback(() => {
    if (isBuildingSentence) return;

    setBuilderVisible(false);
    setBuilderError('');
  }, [isBuildingSentence]);

  const updateBuilderToken = useCallback((index: number, value: string) => {
    setBuilderTokens(prev => prev.map((token, tokenIndex) => (
      tokenIndex === index ? value : token
    )));
    setBuilderResult('');
    setBuilderError('');
  }, []);

  const removeBuilderToken = useCallback((index: number) => {
    setBuilderTokens(prev => prev.filter((_, tokenIndex) => tokenIndex !== index));
    setBuilderResult('');
    setBuilderError('');
  }, []);

  const addBuilderToken = useCallback(() => {
    setBuilderTokens(prev => [...prev, '']);
    setBuilderResult('');
    setBuilderError('');
  }, []);

  const handleBuildSentence = useCallback(async () => {
    const cleanedTokens = normalizeCapturedTokens(builderTokens);

    if (cleanedTokens.length === 0) {
      setBuilderError('Add at least one captured sign first.');
      return;
    }

    setIsBuildingSentence(true);
    setBuilderError('');
    setBuilderResult('');

    try {
      const builtSentence = await buildSentenceWithGemini(cleanedTokens);
      setBuilderResult(builtSentence);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not build a sentence.';
      setBuilderError(message);
    } finally {
      setIsBuildingSentence(false);
    }
  }, [builderTokens]);

  const useBuiltSentence = useCallback(() => {
    const cleanedResult = builderResult.trim();

    if (!cleanedResult) return;

    setSentence([cleanedResult]);
    setTranslation('');
    setConfidence(0);
    setBuilderVisible(false);
    setBuilderError('');
  }, [builderResult]);

  const sendFrame = useCallback(async (sessionId: number) => {
    const isCurrentSession = () => isLiveRef.current && sessionIdRef.current === sessionId;

    if (isBusyRef.current || !cameraRef.current || !isCurrentSession()) return;

    isBusyRef.current = true;

    try {
      const snapshot = await cameraRef.current.takeSnapshot({ quality: SNAPSHOT_QUALITY });
      if (!isCurrentSession()) return;

      const base64 = await imagePathToBase64(snapshot.path);
      if (!isCurrentSession()) return;

      const response = await fetchWithTimeout(TRANSLATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, facing, include_landmarks: showMesh }),
      });

      if (!isCurrentSession()) return;

      if (!response.ok) {
        updateConnection(true);
        setStatusMessage(response.status >= 500
          ? 'Frame skipped by server. Keep signing.'
          : 'Frame was not accepted. Try again.');
        setBufferProgress(null);
        return;
      }

      updateConnection(true);

      const result = await response.json();
      if (!isCurrentSession()) return;

      if (showMesh && isValidLandmarks(result.landmarks)) {
        setLandmarks(result.landmarks);
      }

      const serverMessage = typeof result.message === 'string' ? result.message : '';

      if (result.buffering) {
        const current = typeof result.buffer_progress === 'number' ? result.buffer_progress : 0;
        const total = typeof result.buffer_total === 'number' ? result.buffer_total : 0;

        setTranslation('');
        setConfidence(0);
        setStatusMessage(serverMessage || 'Reading sign...');
        setBufferProgress(total > 0 ? { current, total } : null);
        return;
      }

      setBufferProgress(null);

      const nextTranslation = typeof result.translation === 'string' ? result.translation.trim() : '';
      const nextConfidence = typeof result.confidence === 'number'
        ? Math.max(0, Math.min(100, Math.round(result.confidence * 100)))
        : 0;

      if (!nextTranslation) {
        setTranslation('');
        setConfidence(nextConfidence);
        setStatusMessage(serverMessage || 'Hold sign steady');
        return;
      }

      setTranslation(nextTranslation);
      setConfidence(nextConfidence);
      setStatusMessage('');

      const now = Date.now();
      const isRepeatSign = nextTranslation === lastSignRef.current;
      const cooldownMs = isRepeatSign ? REPEAT_SIGN_COOLDOWN_MS : SIGN_COOLDOWN_MS;
      const canAddToSentence =
        now - lastAddedAtRef.current >= cooldownMs;

      if (canAddToSentence) {
        lastSignRef.current = nextTranslation;
        lastAddedAtRef.current = now;
        setSentence(prev => [...prev, nextTranslation].slice(-MAX_CAPTURED_TOKENS));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown frame error';
      console.warn('Frame error:', message);
      if (isCurrentSession()) {
        updateConnection(false);
      }
    } finally {
      if (sessionIdRef.current === sessionId) {
        isBusyRef.current = false;
      }
    }
  }, [facing, showMesh, updateConnection]);

  const runLiveLoop = useCallback(async (sessionId: number) => {
    while (isLiveRef.current && sessionIdRef.current === sessionId) {
      await sendFrame(sessionId);
      await sleep(FRAME_INTERVAL_MS);
    }
  }, [sendFrame]);

  const startLive = useCallback(async () => {
    if (isLiveRef.current) return;

    setTranslation('');
    setConfidence(0);
    setSentence([]);
    setLandmarks(EMPTY_LANDMARKS);
    setStatusMessage('Starting camera reader...');
    setBufferProgress(null);

    lastSignRef.current = '';
    lastAddedAtRef.current = 0;
    isLiveRef.current = true;
    const nextSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = nextSessionId;
    setIsLive(true);

    await resetBackend();
    if (isLiveRef.current && sessionIdRef.current === nextSessionId) {
      void runLiveLoop(nextSessionId);
    }
  }, [resetBackend, runLiveLoop]);

  const stopLive = useCallback(async (options: StopLiveOptions = {}) => {
    if (!isLiveRef.current && !isLive) return;

    const shouldPromptForSentence = options.promptForSentence === true;
    const capturedTokens = normalizeCapturedTokens(sentenceRef.current);

    isLiveRef.current = false;
    isBusyRef.current = false;
    sessionIdRef.current += 1;

    setIsLive(false);
    setTranslation('');
    setConfidence(0);
    setLandmarks(EMPTY_LANDMARKS);
    setStatusMessage('');
    setBufferProgress(null);

    await resetBackend();

    if (shouldPromptForSentence && capturedTokens.length > 0) {
      Alert.alert(
        'Build sentence?',
        'Review the captured signs and use Gemini to turn them into a sentence?',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Review', onPress: () => openSentenceBuilder(capturedTokens) },
        ],
      );
    }
  }, [isLive, openSentenceBuilder, resetBackend]);

  useEffect(() => {
    if (!showMesh) {
      setLandmarks(EMPTY_LANDMARKS);
    }
  }, [showMesh]);

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }

    return () => {
      isLiveRef.current = false;
      isBusyRef.current = false;
      sessionIdRef.current += 1;
      void resetBackend();
    };
  }, [hasPermission, requestPermission, resetBackend]);

  useEffect(() => {
    if (!isFocused && isLiveRef.current) {
      void stopLive();
    }
  }, [isFocused, stopLive]);

  const handleBack = useCallback(async () => {
    await stopLive();
    router.replace('/(drawer)');
  }, [router, stopLive]);

  const handleCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;

    setCanvasSize(prev => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const clearSentence = useCallback(() => {
    setSentence([]);
    lastSignRef.current = '';
    lastAddedAtRef.current = 0;
  }, []);

  const toggleCamera = useCallback(() => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
    setLandmarks(EMPTY_LANDMARKS);
    setBufferProgress(null);
    void resetBackend();
  }, [resetBackend]);

  const toggleMesh = useCallback(() => {
    setShowMesh(current => !current);
  }, []);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.message}>We need camera permission</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.button}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.message}>No camera found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { width: cw, height: ch } = canvasSize;
  const toX = (nx: number) => (facing === 'front' ? 1 - nx : nx) * cw;
  const toY = (ny: number) => ny * ch;
  const showReadingStatus = isLive && !translation && Boolean(statusMessage || bufferProgress);
  const predictionText = translation || (sentence.length > 0 ? formatSentence(sentence) : '');
  const showPredictionBox = Boolean(predictionText);
  const reviewedTokenCount = normalizeCapturedTokens(builderTokens).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Translate</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#00ff88' : '#ff4444' }]} />
          <Text style={styles.statusText}>{isConnected ? 'Online' : 'Offline'}</Text>
        </View>
      </View>

      <View style={styles.cameraContainer} onLayout={handleCameraLayout}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          photo={true}
          pixelFormat="rgb"
        />

        {showMesh && cw > 0 && ch > 0 && (
          <Svg style={StyleSheet.absoluteFill} width={cw} height={ch}>
            {landmarks.pose.length > 0 && POSE_CONNECTIONS.map(([a, b], i) => {
              const pa = landmarks.pose[a];
              const pb = landmarks.pose[b];
              if (!pa || !pb) return null;
              return (
                <Line
                  key={`pc-${i}`}
                  x1={toX(pa.x)}
                  y1={toY(pa.y)}
                  x2={toX(pb.x)}
                  y2={toY(pb.y)}
                  stroke="#ffff00"
                  strokeWidth={2}
                  opacity={0.85}
                />
              );
            })}

            {landmarks.pose.map((pt, i) => (
              <Circle key={`pp-${i}`} cx={toX(pt.x)} cy={toY(pt.y)} r={4} fill="#ffff00" opacity={0.9} />
            ))}

            {landmarks.hands.map((hand, hi) =>
              HAND_CONNECTIONS.map(([a, b], i) => {
                const pa = hand[a];
                const pb = hand[b];
                if (!pa || !pb) return null;
                return (
                  <Line
                    key={`hc-${hi}-${i}`}
                    x1={toX(pa.x)}
                    y1={toY(pa.y)}
                    x2={toX(pb.x)}
                    y2={toY(pb.y)}
                    stroke="#00e5ff"
                    strokeWidth={2}
                    opacity={0.85}
                  />
                );
              })
            )}

            {landmarks.hands.map((hand, hi) =>
              hand.map((pt, i) => (
                <Circle key={`hp-${hi}-${i}`} cx={toX(pt.x)} cy={toY(pt.y)} r={5} fill="#00e5ff" opacity={0.95} />
              ))
            )}
          </Svg>
        )}

        {bufferProgress && (
          <View style={styles.bufferPill}>
            <Text style={styles.bufferPillText}>
              {bufferProgress.current}/{bufferProgress.total}
            </Text>
          </View>
        )}

        <View style={styles.overlay}>
          <View style={styles.topOverlay}>
            <View style={styles.modeToggle}>
              <TouchableOpacity style={[styles.modeButton, styles.activeModeButton]}>
                <Ionicons name="hand-left" size={18} color="#fff" />
                <Text style={styles.modeText}>FSL -&gt; Text</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modeButton} onPress={() => router.push('/text-to-fsl')}>
                <Ionicons name="text" size={18} color="#fff" />
                <Text style={styles.modeText}>Text -&gt; FSL</Text>
              </TouchableOpacity>
            </View>

            {showReadingStatus && (
              <Text style={styles.readingStatus}>Reading sign</Text>
            )}
          </View>

          <View style={styles.bottomOverlay}>
            {showPredictionBox && (
              <View style={styles.translationBox}>
                <Text style={styles.translationText}>
                  {predictionText}
                </Text>

                {confidence > 0 && translation && (
                  <>
                    <View style={styles.confidenceBarBg}>
                      <View style={[styles.confidenceBarFill, { width: `${confidence}%` }]} />
                    </View>
                    <Text style={styles.confidenceLabel}>{confidence}% confidence</Text>
                  </>
                )}

                {sentence.length > 0 && translation && (
                  <View style={styles.sentenceRow}>
                    <Text style={styles.sentenceText}>{formatSentence(sentence)}</Text>
                    <TouchableOpacity onPress={clearSentence}>
                      <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <View style={styles.controls}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={toggleCamera}
                accessibilityLabel="Switch camera"
              >
                <Ionicons name="camera-reverse" size={26} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.liveBtn, isLive && styles.liveBtnActive]}
                onPress={isLive ? () => void stopLive({ promptForSentence: true }) : () => void startLive()}
              >
                <Ionicons name={isLive ? 'stop' : 'radio'} size={28} color="#fff" />
                <Text style={styles.liveBtnText}>{isLive ? 'Stop' : 'Live'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, showMesh && styles.controlButtonActive]}
                onPress={toggleMesh}
                accessibilityLabel="Toggle hand mesh"
              >
                <Ionicons name={showMesh ? 'eye' : 'eye-off'} size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={builderVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSentenceBuilder}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.builderSheet}>
            <View style={styles.builderHeader}>
              <View style={styles.builderTitleGroup}>
                <Text style={styles.builderTitle}>Build sentence</Text>
                <Text style={styles.builderSubtitle}>
                  {reviewedTokenCount} captured {reviewedTokenCount === 1 ? 'sign' : 'signs'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBuilderButton}
                onPress={closeSentenceBuilder}
                disabled={isBuildingSentence}
                accessibilityLabel="Close sentence builder"
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.tokenList}
              contentContainerStyle={styles.tokenListContent}
              keyboardShouldPersistTaps="handled"
            >
              {builderTokens.map((token, index) => (
                <View style={styles.tokenEditRow} key={`token-${index}`}>
                  <Text style={styles.tokenIndex}>{index + 1}</Text>
                  <TextInput
                    style={styles.tokenInput}
                    value={token}
                    onChangeText={value => updateBuilderToken(index, value)}
                    placeholder="Word or letter"
                    placeholderTextColor="rgba(255,255,255,0.42)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.removeTokenButton}
                    onPress={() => removeBuilderToken(index)}
                    accessibilityLabel="Remove captured sign"
                  >
                    <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.68)" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.addTokenButton} onPress={addBuilderToken}>
              <Ionicons name="add" size={18} color="#00e5ff" />
              <Text style={styles.addTokenText}>Add word</Text>
            </TouchableOpacity>

            {builderResult ? (
              <View style={styles.builderResultBox}>
                <Text style={styles.builderResultText}>{builderResult}</Text>
              </View>
            ) : null}

            {builderError ? (
              <Text style={styles.builderError}>{builderError}</Text>
            ) : null}

            <View style={styles.builderActions}>
              <TouchableOpacity
                style={styles.secondaryBuilderButton}
                onPress={closeSentenceBuilder}
                disabled={isBuildingSentence}
              >
                <Text style={styles.secondaryBuilderButtonText}>Cancel</Text>
              </TouchableOpacity>

              {builderResult ? (
                <TouchableOpacity
                  style={styles.secondaryBuilderButton}
                  onPress={useBuiltSentence}
                  disabled={isBuildingSentence}
                >
                  <Text style={styles.secondaryBuilderButtonText}>Use</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryBuilderButton,
                  (isBuildingSentence || reviewedTokenCount === 0) && styles.primaryBuilderButtonDisabled,
                ]}
                onPress={handleBuildSentence}
                disabled={isBuildingSentence || reviewedTokenCount === 0}
              >
                {isBuildingSentence ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="sparkles" size={18} color="#fff" />
                )}
                <Text style={styles.primaryBuilderButtonText}>
                  {isBuildingSentence ? 'Building' : 'Build'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  cameraContainer: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  topOverlay: { alignItems: 'center' },
  bottomOverlay: { gap: 12 },
  topBar: {
    backgroundColor: '#2E3192',
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { marginRight: 12, padding: 8 },
  topBarTitle: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#fff', fontSize: 12 },
  modeToggle: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 25,
    marginHorizontal: 5,
  },
  activeModeButton: { backgroundColor: '#00e5ff' },
  modeText: { color: '#fff', marginLeft: 5, fontSize: 13 },
  readingStatus: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  translationBox: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  translationText: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  bufferPill: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bufferPillText: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '700' },
  confidenceBarBg: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceBarFill: { height: '100%', backgroundColor: '#00e5ff', borderRadius: 3 },
  confidenceLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, alignSelf: 'flex-end' },
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  sentenceText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, flex: 1, textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 50,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  controlButton: { padding: 10, borderRadius: 24 },
  controlButtonActive: { backgroundColor: 'rgba(0,229,255,0.2)' },
  liveBtn: {
    backgroundColor: '#2E3192',
    borderRadius: 50,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 80,
  },
  liveBtnActive: { backgroundColor: '#cc2200' },
  liveBtnText: { color: '#fff', fontSize: 12, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  builderSheet: {
    maxHeight: '84%',
    backgroundColor: '#101426',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    gap: 12,
  },
  builderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  builderTitleGroup: { flex: 1 },
  builderTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  builderSubtitle: { color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 2 },
  closeBuilderButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tokenList: { maxHeight: 230 },
  tokenListContent: { gap: 8, paddingBottom: 2 },
  tokenEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tokenIndex: {
    width: 24,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  tokenInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 4,
  },
  removeTokenButton: { padding: 4 },
  addTokenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
    borderRadius: 14,
    paddingVertical: 10,
  },
  addTokenText: { color: '#00e5ff', fontSize: 13, fontWeight: '700' },
  builderResultBox: {
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderColor: 'rgba(0,229,255,0.35)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  builderResultText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  builderError: { color: '#ff8a8a', fontSize: 12, lineHeight: 17 },
  builderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryBuilderButton: {
    minHeight: 46,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
  },
  secondaryBuilderButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  primaryBuilderButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#2E3192',
    paddingHorizontal: 16,
  },
  primaryBuilderButtonDisabled: { opacity: 0.55 },
  primaryBuilderButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  message: { textAlign: 'center', paddingBottom: 10, color: '#fff' },
  button: { backgroundColor: '#00e5ff', padding: 10, borderRadius: 5, alignSelf: 'center' },
  buttonText: { color: '#fff' },
});
