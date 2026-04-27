import chalk from 'chalk';

interface UtilizationBar {
  text: string;
  hex: string;
  ansi: string;
}

class CpuMonitor {
  private isVercel: boolean;
  private cpuUsagePercent: number | null = null;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastHrTime: [number, number] | null = null;
  private samplingInterval: NodeJS.Timeout | null = null;
  private startTime: number;

  constructor() {
    this.isVercel = !!process.env.VERCEL;
    this.startTime = Date.now();
    
    if (!this.isVercel) {
      this.lastCpuUsage = process.cpuUsage();
      this.lastHrTime = process.hrtime();
    }
  }

  startSampling() {
    var self = this;
    
    if (this.isVercel) {
      return;
    }

    this.samplingInterval = setInterval(function() {
      self.updateCpuUsage();
    }, 1000);
  }

  private updateCpuUsage() {
    if (this.isVercel) {
      var elapsedMs = Date.now() - this.startTime;
      var timeoutMs = parseInt(process.env.FUNCTION_TIMEOUT || '60000', 10);
      if (elapsedMs < 100) {
        this.cpuUsagePercent = null;
      } else {
        this.cpuUsagePercent = Math.min(100, (elapsedMs / timeoutMs) * 100);
      }
      return;
    }

    var currentCpuUsage = process.cpuUsage();
    var currentHrTime = process.hrtime();

    if (this.lastCpuUsage === null || this.lastHrTime === null) {
      this.lastCpuUsage = currentCpuUsage;
      this.lastHrTime = currentHrTime;
      return;
    }

    var userDiff = currentCpuUsage.user - this.lastCpuUsage.user;
    var systemDiff = currentCpuUsage.system - this.lastCpuUsage.system;
    var totalCpuTime = (userDiff + systemDiff) / 1000;

    var hrDiff = (currentHrTime[0] - this.lastHrTime[0]) * 1000 + (currentHrTime[1] - this.lastHrTime[1]) / 1000000;

    var cpuPercent = 0;
    if (hrDiff > 0) {
      cpuPercent = (totalCpuTime / hrDiff) * 100;
    }

    this.cpuUsagePercent = Math.min(100, Math.max(0, cpuPercent));

    this.lastCpuUsage = currentCpuUsage;
    this.lastHrTime = currentHrTime;
  }

  getCpuUsage(): number | null {
    return this.cpuUsagePercent;
  }

  stopSampling() {
    if (this.samplingInterval !== null) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
  }

  static getUtilizationBar(percent: number | null, width: number = 10): UtilizationBar {
    if (percent === null) {
      return {
        text: '[?????????] N/A',
        hex: '#808080',
        ansi: chalk.gray('[?????????] N/A')
      };
    }

    var clamped = Math.min(100, Math.max(0, percent));
    var filledCount = Math.round((clamped / 100) * width);
    var emptyCount = width - filledCount;

    var filled = ''.padEnd(filledCount, '|');
    var empty = ''.padEnd(emptyCount, ' ');
    var barText = '[' + filled + empty + '] ' + Math.round(clamped) + '%';

    var hex: string;
    var ansiText: string;

    if (clamped < 20) {
      hex = '#00AA00';
      ansiText = chalk.green(barText);
    } else if (clamped < 50) {
      hex = '#FFFF00';
      ansiText = chalk.yellow(barText);
    } else if (clamped < 80) {
      hex = '#FFA500';
      ansiText = chalk.rgb(255, 165, 0)(barText);
    } else {
      hex = '#FF0000';
      ansiText = chalk.red(barText);
    }

    return {
      text: barText,
      hex: hex,
      ansi: ansiText
    };
  }
}

export { CpuMonitor };
