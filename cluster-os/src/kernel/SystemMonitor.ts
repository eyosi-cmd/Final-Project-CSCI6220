import * as si from 'systeminformation';
import chalk from 'chalk';

interface UtilizationBar {
  text: string;
  hex: string;
  ansi: string;
}

interface SystemMetrics {
  cpu: {
    usage: number | null;
    model: string;
    cores: number;
    speed: number;
  };
  memory: {
    usage: number | null;
    used: number;
    total: number;
    free: number;
  };
  disk: {
    usage: number | null;
    used: number;
    total: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  processes: number;
}

class SystemMonitor {
  private isVercel: boolean;
  private metrics: SystemMetrics | null = null;
  private samplingInterval: NodeJS.Timeout | null = null;
  private lastNetworkStats: any = null;
  private startTime: number;

  constructor() {
    this.isVercel = !!process.env.VERCEL;
    this.startTime = Date.now();
  }

  async startSampling() {
    if (this.isVercel) {
      return;
    }

    // Initial metrics fetch
    await this.updateMetrics();

    // Set up periodic updates
    this.samplingInterval = setInterval(async () => {
      await this.updateMetrics();
    }, 2000); // Update every 2 seconds for network stats
  }

  stopSampling() {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
  }

  private async updateMetrics() {
    try {
      if (this.isVercel) {
        return;
      }

      // Gather CPU metrics
      const cpuData = await si.currentLoad();
      const cpuInfo = await si.cpu();

      // Gather memory metrics
      const memData = await si.mem();

      // Gather disk metrics
      const diskData = await si.fsSize();
      const totalDisk = diskData.reduce((sum, d) => sum + d.size, 0);
      const usedDisk = diskData.reduce((sum, d) => sum + d.used, 0);

      // Gather network metrics
      const networkStats = await si.networkStats();
      let netBytesIn = 0;
      let netBytesOut = 0;
      let netPacketsIn = 0;
      let netPacketsOut = 0;

      networkStats.forEach((iface) => {
        netBytesIn += iface.rx_bytes || 0;
        netBytesOut += iface.tx_bytes || 0;
        netPacketsIn += iface.rx_dropped || 0;
        netPacketsOut += iface.tx_dropped || 0;
      });

      // Gather process count
      const processes = await si.processes();

      this.metrics = {
        cpu: {
          usage: Math.min(100, Math.max(0, cpuData.currentLoad)),
          model: cpuInfo.brand || 'Unknown',
          cores: cpuInfo.cores || 1,
          speed: cpuInfo.speed || 0,
        },
        memory: {
          usage: Math.min(100, (memData.used / memData.total) * 100),
          used: Math.round(memData.used / (1024 * 1024)), // MB
          total: Math.round(memData.total / (1024 * 1024)), // MB
          free: Math.round(memData.available / (1024 * 1024)), // MB
        },
        disk: {
          usage: totalDisk > 0 ? Math.min(100, (usedDisk / totalDisk) * 100) : 0,
          used: Math.round(usedDisk / (1024 * 1024 * 1024)), // GB
          total: Math.round(totalDisk / (1024 * 1024 * 1024)), // GB
        },
        network: {
          bytesIn: netBytesIn,
          bytesOut: netBytesOut,
          packetsIn: netPacketsIn,
          packetsOut: netPacketsOut,
        },
        processes: processes.all || 0,
      };
    } catch (error) {
      console.error('[SystemMonitor] Error updating metrics:', error);
    }
  }

  public getMetrics(): SystemMetrics | null {
    return this.metrics;
  }

  public getCpuUsage(): number | null {
    return this.metrics?.cpu.usage || null;
  }

  public getMemoryUsage(): number | null {
    return this.metrics?.memory.usage || null;
  }

  public getDiskUsage(): number | null {
    return this.metrics?.disk.usage || null;
  }

  public static getUtilizationBar(percent: number | null, width: number = 10): UtilizationBar {
    if (percent === null || percent === undefined) {
      return {
        text: '[?????????] N/A',
        hex: '#808080',
        ansi: chalk.gray('[?????????] N/A'),
      };
    }

    const clamped = Math.min(100, Math.max(0, percent));
    const filledCount = Math.round((clamped / 100) * width);
    const emptyCount = width - filledCount;

    let filled = '';
    let empty = '';

    for (let i = 0; i < filledCount; i++) {
      filled += '|';
    }
    for (let i = 0; i < emptyCount; i++) {
      empty += ' ';
    }

    const barText = `[${filled}${empty}] ${Math.round(clamped)}%`;

    let hex: string;
    let ansi: string;

    if (clamped < 20) {
      hex = '#00AA00';
      ansi = chalk.green(barText);
    } else if (clamped < 50) {
      hex = '#FFFF00';
      ansi = chalk.yellow(barText);
    } else if (clamped < 80) {
      hex = '#FFA500';
      ansi = chalk.rgb(255, 165, 0)(barText);
    } else {
      hex = '#FF0000';
      ansi = chalk.red(barText);
    }

    return { text: barText, hex, ansi };
  }
}

export default SystemMonitor;
