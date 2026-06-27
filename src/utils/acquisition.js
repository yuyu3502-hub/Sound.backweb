const STORAGE_KEY = 'soundback_acquisition_v1';
const MAX_VALUE_LENGTH = 120;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function sanitizeValue(value, maxLength = MAX_VALUE_LENGTH) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.slice(0, maxLength);
}

function readStoredAcquisition() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.capturedAt || Date.now() - Number(parsed.capturedAt) > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getAcquisitionRecord() {
  const record = readStoredAcquisition();
  if (!record) return null;

  return {
    source: sanitizeValue(record.source, 60) || 'direct',
    medium: sanitizeValue(record.medium, 60) || 'none',
    campaign: sanitizeValue(record.campaign, 80) || 'none',
    content: sanitizeValue(record.content, 80) || 'none',
    term: sanitizeValue(record.term, 80) || 'none',
    referrer: sanitizeValue(record.referrer, 80) || 'none',
    landingPath: sanitizeValue(record.landingPath, 180) || '/',
    capturedAt: Number(record.capturedAt) || 0,
  };
}

function writeStoredAcquisition(record) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage failures. Attribution is useful, but should never block the app.
  }
}

function getExternalReferrer() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return '';
  const referrer = sanitizeValue(document.referrer, 180);
  if (!referrer) return '';

  try {
    const referrerUrl = new URL(referrer);
    if (referrerUrl.origin === window.location.origin) return '';
    return referrerUrl.hostname;
  } catch {
    return '';
  }
}

export function captureAcquisition(pathname = '', search = '') {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(search || window.location.search);
  const utmSource = sanitizeValue(params.get('utm_source'), 60);
  const utmMedium = sanitizeValue(params.get('utm_medium'), 60);
  const utmCampaign = sanitizeValue(params.get('utm_campaign'), 80);
  const utmContent = sanitizeValue(params.get('utm_content'), 80);
  const utmTerm = sanitizeValue(params.get('utm_term'), 80);
  const externalReferrer = getExternalReferrer();
  const hasCampaignSignal = Boolean(utmSource || utmMedium || utmCampaign || utmContent || utmTerm);
  const stored = readStoredAcquisition();

  if (!hasCampaignSignal && !externalReferrer) {
    return stored ? getAcquisitionEventParams() : {};
  }

  const landingPath = sanitizeValue(`${pathname || window.location.pathname}${search || window.location.search}`, 180);
  const record = {
    source: utmSource || (externalReferrer ? 'referral' : 'direct'),
    medium: utmMedium || (externalReferrer ? 'referral' : 'none'),
    campaign: utmCampaign || 'none',
    content: utmContent || 'none',
    term: utmTerm || 'none',
    referrer: externalReferrer || 'none',
    landingPath,
    capturedAt: Date.now(),
  };

  writeStoredAcquisition(record);
  return getAcquisitionEventParams(record);
}

export function getAcquisitionEventParams(record = readStoredAcquisition()) {
  if (!record) return {};

  return {
    acquisition_source: sanitizeValue(record.source, 60) || 'direct',
    acquisition_medium: sanitizeValue(record.medium, 60) || 'none',
    acquisition_campaign: sanitizeValue(record.campaign, 80) || 'none',
    acquisition_content: sanitizeValue(record.content, 80) || 'none',
    acquisition_term: sanitizeValue(record.term, 80) || 'none',
    acquisition_referrer: sanitizeValue(record.referrer, 80) || 'none',
    acquisition_landing_path: sanitizeValue(record.landingPath, 180) || '/',
  };
}
