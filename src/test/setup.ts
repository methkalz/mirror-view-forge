import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom has no WebAudio; stub just enough so game/audio.ts can load.
if (typeof (globalThis as unknown as { AudioContext?: unknown }).AudioContext === "undefined") {
  class StubAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    sampleRate = 44100;
    createOscillator() {
      return {
        type: "sine",
        frequency: {
          value: 0,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          setTargetAtTime: () => {},
        },
        detune: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
        },
        connect() { return this; },
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          setTargetAtTime: () => {},
        },
        connect() { return this; },
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() { return this; },
        start() {},
        stop() {},
      };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(0) };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: { value: 0 },
        connect() { return this; },
      };
    }
    decodeAudioData() {
      return Promise.resolve({});
    }
    resume() {
      return Promise.resolve();
    }
  }
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = StubAudioContext;
}
