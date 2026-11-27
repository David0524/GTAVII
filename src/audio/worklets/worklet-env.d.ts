// Minimal AudioWorkletGlobalScope typings (TypeScript's DOM lib does not ship them).
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;
interface AudioParamDescriptorT74 { name: string; defaultValue?: number; minValue?: number; maxValue?: number; automationRate?: 'a-rate' | 'k-rate' }
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown; numberOfInputs?: number; numberOfOutputs?: number });
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, ctor: (new (options?: any) => AudioWorkletProcessor) & { parameterDescriptors?: AudioParamDescriptorT74[] }): void;
