// Mono PCM is held only in this short rolling buffer, never recorded or saved.
class SonomendPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(15600);
    this.position = 0;
    this.count = 0;
    this.port.onmessage = () => {
      this.buffer.fill(0);
      this.position = 0;
      this.count = 0;
    };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.buffer[this.position] = value;
      this.position = (this.position + 1) % this.buffer.length;
      this.count++;
      if (this.count >= 15600 && (this.count - 15600) % 7680 === 0) {
        const pcm = new Float32Array(15600);
        pcm.set(this.buffer.subarray(this.position));
        pcm.set(this.buffer.subarray(0, this.position), 15600 - this.position);
        this.port.postMessage(
          { pcm, audioTime: currentTime + i / sampleRate },
          [pcm.buffer],
        );
      }
    }
    return true;
  }
}
registerProcessor("sonomend-pcm", SonomendPcm);
