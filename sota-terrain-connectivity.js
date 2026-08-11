(function () {
  "use strict";

  const EARTH_METERS_PER_DEGREE = 111320;
  const DEFAULT_SPACING_METERS = 20;
  const DEFAULT_MAX_CELLS = 40000;

  function buildGrid(summit, position, options = {}) {
    const requestedSpacing = Math.max(5, Number(options.spacingMeters) || DEFAULT_SPACING_METERS);
    const maxCells = Math.max(100, Number(options.maxCells) || DEFAULT_MAX_CELLS);
    const middleLatitude = (summit.latitude + position.latitude) / 2;
    const longitudeScale = EARTH_METERS_PER_DEGREE * Math.max(0.1, Math.cos(middleLatitude * Math.PI / 180));
    const paddingMeters = Math.max(requestedSpacing, Number(options.paddingMeters) || requestedSpacing * 2);
    const south = Math.min(summit.latitude, position.latitude) - paddingMeters / EARTH_METERS_PER_DEGREE;
    const north = Math.max(summit.latitude, position.latitude) + paddingMeters / EARTH_METERS_PER_DEGREE;
    const west = Math.min(summit.longitude, position.longitude) - paddingMeters / longitudeScale;
    const east = Math.max(summit.longitude, position.longitude) + paddingMeters / longitudeScale;
    const widthMeters = Math.max(requestedSpacing, (east - west) * longitudeScale);
    const heightMeters = Math.max(requestedSpacing, (north - south) * EARTH_METERS_PER_DEGREE);
    const minimumSpacing = Math.sqrt(widthMeters * heightMeters / maxCells);
    const spacingMeters = Math.max(requestedSpacing, minimumSpacing);
    const columns = Math.max(2, Math.ceil(widthMeters / spacingMeters) + 1);
    const rows = Math.max(2, Math.ceil(heightMeters / spacingMeters) + 1);
    const points = [];
    for (let row = 0; row < rows; row += 1) {
      const latitude = south + (north - south) * row / (rows - 1);
      for (let column = 0; column < columns; column += 1) {
        points.push({ latitude, longitude: west + (east - west) * column / (columns - 1) });
      }
    }
    function nearestIndex(point) {
      const row = Math.round((point.latitude - south) / (north - south) * (rows - 1));
      const column = Math.round((point.longitude - west) / (east - west) * (columns - 1));
      return Math.max(0, Math.min(rows - 1, row)) * columns + Math.max(0, Math.min(columns - 1, column));
    }
    return { rows, columns, points, spacingMeters, summitIndex: nearestIndex(summit), positionIndex: nearestIndex(position) };
  }

  function pathExists(mask, rows, columns, startIndex, endIndex) {
    if (!mask[startIndex] || !mask[endIndex]) return false;
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIndex;
    visited[startIndex] = 1;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    while (head < tail) {
      const index = queue[head++];
      if (index === endIndex) return true;
      const row = Math.floor(index / columns);
      const column = index % columns;
      for (const [rowStep, columnStep] of directions) {
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;
        if (nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns) continue;
        const nextIndex = nextRow * columns + nextColumn;
        if (!mask[nextIndex] || visited[nextIndex]) continue;
        if (rowStep && columnStep) {
          const sideA = row * columns + nextColumn;
          const sideB = nextRow * columns + column;
          if (!mask[sideA] && !mask[sideB]) continue;
        }
        visited[nextIndex] = 1;
        queue[tail++] = nextIndex;
      }
    }
    return false;
  }

  function analyze(grid, samples, thresholdMeters) {
    if (!grid || samples.length !== grid.points.length) throw new Error("地形格子と標高数が一致しません");
    const definite = new Uint8Array(samples.length);
    const possible = new Uint8Array(samples.length);
    let missingCount = 0;
    let uncertainCount = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const rawElevation = samples[index]?.elevationMeters;
      const elevation = rawElevation === null || rawElevation === undefined || rawElevation === "" ? Number.NaN : Number(rawElevation);
      const uncertainty = Math.max(0, Number(samples[index]?.elevationUncertaintyMeters) || 0);
      if (!Number.isFinite(elevation)) {
        missingCount += 1;
        continue;
      }
      if (elevation - uncertainty >= thresholdMeters) definite[index] = 1;
      if (elevation + uncertainty >= thresholdMeters) possible[index] = 1;
      if (possible[index] && !definite[index]) uncertainCount += 1;
    }
    const details = { thresholdMeters, spacingMeters: grid.spacingMeters, rows: grid.rows, columns: grid.columns, sampleCount: samples.length, missingCount, uncertainCount };
    if (pathExists(definite, grid.rows, grid.columns, grid.summitIndex, grid.positionIndex)) {
      return { ...details, connectedToSummit: true, state: "connected", reason: "25m区域が山頂まで連続しています" };
    }
    if (pathExists(possible, grid.rows, grid.columns, grid.summitIndex, grid.positionIndex)) {
      return { ...details, connectedToSummit: null, state: "uncertain", reason: "標高誤差を含む経路だけが残るため未確定です" };
    }
    if (missingCount > 0) {
      return { ...details, connectedToSummit: null, state: "needs-terrain", reason: "標高が欠けているため地形の分断を確定できません" };
    }
    return { ...details, connectedToSummit: false, state: "disconnected", reason: "25m区域は山頂区域から分断されています" };
  }

  async function sample(provider, summit, position, options = {}) {
    if (!provider || typeof provider.getElevation !== "function") throw new Error("標高取得機能がありません");
    const grid = buildGrid(summit, position, options);
    if (typeof provider.getElevations === "function") {
      return { grid, samples: await provider.getElevations(grid.points, { concurrency: options.concurrency }) };
    }
    const samples = new Array(grid.points.length);
    const concurrency = Math.max(1, Math.min(16, Number(options.concurrency) || 8));
    let cursor = 0;
    async function worker() {
      while (cursor < grid.points.length) {
        const index = cursor++;
        const point = grid.points[index];
        try {
          samples[index] = await provider.getElevation(point.latitude, point.longitude);
        } catch (error) {
          samples[index] = { elevationMeters: null, error: String(error?.message || error) };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, grid.points.length) }, worker));
    return { grid, samples };
  }

  window.SotaTerrainConnectivity = { buildGrid, pathExists, analyze, sample, DEFAULT_SPACING_METERS, DEFAULT_MAX_CELLS };
}());
