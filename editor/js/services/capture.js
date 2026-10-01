// Recording sessions on the server (demorec/server/capture.py).
import { api } from './api.js';

export const listSources = () => api('/api/capture/sources');
export const captureStatus = () => api('/api/capture');
export const startCapture = (kind, id, countdown) => api('/api/capture/start', { kind, id, countdown });
export const stopCapture = () => api('/api/capture/stop', {});
export const ACTIVE = ['starting', 'countdown', 'recording', 'saving'];
