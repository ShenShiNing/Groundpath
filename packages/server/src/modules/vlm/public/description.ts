export type {
  VLMProvider,
  VLMImageInput,
  VLMDescribeOptions,
} from '../vlm-provider.interface';
export { getVLMProvider, resetVLMProvider } from '../vlm.factory';
export { vlmService } from '../vlm.service';
export type { VLMServiceDescribeInput, VLMServiceBatchResult } from '../vlm.service';
