export class LamportClock {
  private localTime: number = 0;
  private nodeId: string;

  constructor(nodeId: string = 'unknown') {
    this.nodeId = nodeId;
    this.localTime = 0;
  }

  public increment(): number {
    this.localTime += 1;
    return this.localTime;
  }

  public update(receivedTime: number): number {
    this.localTime = Math.max(this.localTime, receivedTime) + 1;
    return this.localTime;
  }

  public getTime(): number {
    return this.localTime;
  }

  public getNodeId(): string {
    return this.nodeId;
  }

  public reset(): void {
    this.localTime = 0;
  }

  public toString(): string {
    return `[${this.nodeId}:${this.localTime}]`;
  }
}

export default LamportClock;
