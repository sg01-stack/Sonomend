// Separate, bounded three-second recording. Never connected to trip capture.
class SoundCheck extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(48000);
    this.offset = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (
      let i = 0;
      i < channels[0].length && this.offset < this.samples.length;
      i++
    ) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.samples[this.offset++] = value;
    }
    if (this.offset === this.samples.length) {
      this.port.postMessage(this.samples, [this.samples.buffer]);
      return false;
    }
    return true;
  }
}
registerProcessor("sound-check", SoundCheck);
