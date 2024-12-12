import { createEncorder } from "./encorder";
import { isSafari } from "./util";

const numChannels = 2;
const mimeType = "audio/wav";
const silenceThreshold = 0.01; // 停止判定の閾値（ここを調整する）
const silenceDuration = 1000;

class Recorder {
  silenceTimeoutId: NodeJS.Timeout | null = null;
  soundDetected: boolean = false;
  encorder: Worker | null = null;
  recording: boolean = false;
  audioWorkletNode: AudioWorkletNode | null = null;
  // scriptProcessorNode: ScriptProcessorNode | null = null;

  constructor(stream: MediaStream, onExportWAV: (data: Blob) => void) {
    const audioContext = new AudioContext();
    audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);

    this.encorder = createEncorder();
    this.encorder!.postMessage({
      command: "init",
      config: {
        sampleRate: source.context.sampleRate,
        numChannels: numChannels,
        isSafari: isSafari(),
      },
    });
    this.encorder!.onmessage = (e: MessageEvent) => {
      switch (e.data.command) {
        case "exportWAV":
          onExportWAV(e.data.data);
          break;
      }
    };

    const processBuffer = (buffer: Float32Array[]) => {
      let sum = 0;
      for (let i = 0; i < buffer[0].length; i++) {
        sum += buffer[0][i] * buffer[0][i];
      }

      const rms = Math.sqrt(sum / buffer[0].length);

      if (rms < silenceThreshold) {
        if (!this.soundDetected || this.silenceTimeoutId) {
          return;
        }

        this.silenceTimeoutId = setTimeout(() => {
          this.encorder?.postMessage({
            command: "exportWAV",
            type: mimeType,
          });
          this.stop();
          this.soundDetected = false;
        }, silenceDuration);
      } else {
        this.soundDetected = true;

        if (this.silenceTimeoutId) {
          clearTimeout(this.silenceTimeoutId);
          this.silenceTimeoutId = null;
        }
      }

      this.encorder?.postMessage({
        command: "record",
        buffer: buffer,
      });
    };

    // ScriptProcessorNodeを使った場合（一応残す）
    // this.scriptProcessorNode = source.context.createScriptProcessor(
    //   4096,
    //   numChannels,
    //   numChannels
    // );
    // this.scriptProcessorNode.onaudioprocess = (e: AudioProcessingEvent) => {
    //   if (!this.recording) return;
    //   const buffer: Float32Array[] = [];
    //   for (let channel = 0; channel < numChannels; channel++) {
    //     buffer.push(e.inputBuffer.getChannelData(channel));
    //   }
    //   processBuffer(buffer);
    // };
    // source.connect(this.scriptProcessorNode);
    // this.scriptProcessorNode.connect(source.context.destination);

    // AudioWorkletNodeを使った場合
    audioContext.audioWorklet
      .addModule(`${process.env.PUBLIC_URL}/processor.js`)
      .then(() => {
        this.audioWorkletNode = new AudioWorkletNode(audioContext, "processor");
        source.connect(this.audioWorkletNode);

        this.audioWorkletNode!.port.onmessage = (event) => {
          if (event.data.command === "record") {
            const buffer: Float32Array[] = event.data.buffer;
            processBuffer(buffer);
          }
        };
      });
  }

  start = () => {
    this.audioWorkletNode?.port.postMessage({ command: "record" });
    this.recording = true;
  };

  stop = () => {
    this.audioWorkletNode?.port.postMessage({ command: "stop" });
    this.recording = false;
    this.encorder?.postMessage({ command: "clear" });
    this.silenceTimeoutId = null;
    this.soundDetected = false;
  };
}

export default Recorder;
