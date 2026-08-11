(function () {
  "use strict";

  const NOTIFICATION_ACCURACY_METERS = 50;
  const FRESH_POSITION_MILLISECONDS = 2 * 60 * 1000;

  function normalize(position) {
    const source = position?.coords || position || {};
    const latitude = Number(source.latitude);
    const longitude = Number(source.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      altitude: source.altitude === null || source.altitude === undefined ? null : Number(source.altitude),
      accuracy: Number.isFinite(Number(source.accuracy)) ? Math.max(0, Number(source.accuracy)) : null,
      altitudeAccuracy: source.altitudeAccuracy === null || source.altitudeAccuracy === undefined ? null : Number(source.altitudeAccuracy),
      timestamp: Number(position?.timestamp || source.timestamp || Date.now()),
    };
  }

  function assess(position, now = Date.now()) {
    const normalized = normalize(position);
    if (!normalized) return { usable: false, notificationSafe: false, quality: "invalid", reason: "位置情報がありません" };
    const ageMilliseconds = Math.max(0, now - normalized.timestamp);
    const accurate = normalized.accuracy !== null && normalized.accuracy <= NOTIFICATION_ACCURACY_METERS;
    const fresh = ageMilliseconds <= FRESH_POSITION_MILLISECONDS;
    return {
      usable: true,
      notificationSafe: accurate && fresh,
      quality: accurate && fresh ? "precise" : "approximate",
      reason: !fresh ? "位置情報が古いため通知しません" : !accurate ? "簡易位置のため通知しません" : "高精度位置です",
      ageMilliseconds,
      position: normalized,
    };
  }

  function shouldReplace(current, candidate, now = Date.now()) {
    const next = assess(candidate, now);
    if (!next.usable) return false;
    const previous = assess(current, now);
    if (!previous.usable) return true;
    if (previous.ageMilliseconds > FRESH_POSITION_MILLISECONDS && next.position.timestamp > previous.position.timestamp) return true;
    if (previous.notificationSafe && !next.notificationSafe) return false;
    if (next.notificationSafe && !previous.notificationSafe) return true;
    const nextAccuracy = next.position.accuracy ?? Number.POSITIVE_INFINITY;
    const previousAccuracy = previous.position.accuracy ?? Number.POSITIVE_INFINITY;
    if (next.position.timestamp > previous.position.timestamp + 1000 && nextAccuracy <= previousAccuracy) return true;
    return nextAccuracy < previousAccuracy;
  }

  window.GpsPositionController = { normalize, assess, shouldReplace, NOTIFICATION_ACCURACY_METERS, FRESH_POSITION_MILLISECONDS };
}());
