import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
  };
};

type ExpoRuntimeConstants = typeof Constants & {
  expoConfig?: { hostUri?: string };
  manifest?: { debuggerHost?: string; hostUri?: string };
  manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
};

const DEFAULT_API_URL = 'http://localhost:8000';

const isLoopbackHost = (host?: string) =>
  !host || host === 'localhost' || host.startsWith('127.');

const getHostFromUri = (uri?: string) => {
  if (!uri) return undefined;

  const withoutScheme = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const hostWithPort = withoutScheme.split('/')[0];
  const host = hostWithPort.split(':')[0];

  return isLoopbackHost(host) ? undefined : host;
};

const getExpoHost = () => {
  const runtime = Constants as ExpoRuntimeConstants;
  const hostUri =
    runtime.expoConfig?.hostUri ??
    runtime.manifest?.hostUri ??
    runtime.manifest?.debuggerHost ??
    runtime.manifest2?.extra?.expoClient?.hostUri;

  return getHostFromUri(hostUri);
};

const getBundleHost = () => {
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  return getHostFromUri(sourceCode?.scriptURL);
};

export const resolveApiUrl = () => {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured && configured.toLowerCase() !== 'auto') {
    return configured.replace(/\/$/, '');
  }

  const host = getExpoHost() ?? getBundleHost();
  return (host ? `http://${host}:8000` : DEFAULT_API_URL).replace(/\/$/, '');
};

export const API = resolveApiUrl();
export const LOGIN_ENDPOINT = `${API}/login`;
export const REGISTER_ENDPOINT = `${API}/register`;
export const TRANSLATE_ENDPOINT = `${API}/translate`;
export const RESET_SEQUENCE_ENDPOINT = `${API}/reset-sequence`;
