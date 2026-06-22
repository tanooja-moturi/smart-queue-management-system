import { IQueue } from './Queue';

export interface IQueueEntry {
  _id: string;
  customerName: string;
  queueId: string | IQueue;
  token: string;
  status: 'waiting' | 'called' | 'served' | 'skipped';
  joinedAt?: string;
  calledAt?: string;
  servedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default IQueueEntry;
