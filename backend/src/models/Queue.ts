export interface IQueue {
  _id: string;
  queueName: string;
  queueCode: string;
  averageServiceTime: number;
  tokenPrefix: string;
  lastTokenNumber: number;
  createdAt?: string;
  updatedAt?: string;
}

export default IQueue;
