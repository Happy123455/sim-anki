// Trains the personal memory model off the main thread so studying never stutters.
import { trainPersonalModel } from '../utils/memoryModel.js';

self.onmessage = (event) => {
  const { cards, now } = event.data || {};
  try {
    self.postMessage({ ok: true, result: trainPersonalModel(cards || [], { now }) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
