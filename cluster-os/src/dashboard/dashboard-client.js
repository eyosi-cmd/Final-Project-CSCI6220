// dashboard client
var API = {
  metrics: '/api/metrics',
  startLB: '/api/start-lb',
  stopLB: '/api/kill-lb',
  addWorker: '/api/start-worker',
  removeWorker: '/api/kill-worker',
  submitJob: '/api/submit-job',
  jobResult: function(id) { return '/api/job-result/' + id; },
  cancelJob: function(id) { return '/api/cancel-job/' + id; }
};

var TuningCoefficients = {
  w_u: 1.5,
  k_t: 25,
  k_q: 20,
  alpha: 5,
  beta: 50,
  gamma: 20,
  recentJobWindow: 2000,
  maxJobAge: 10000,
  metricsUpdateInterval: 500,
  minRandomFactor: 0.8,
  maxRandomFactor: 1.2,
  maxHistoryPoints: 60,
  minThroughput: 1,
  minQueue: 2
};

function updateTuningCoefficients(newCoefficients) {
  if (typeof newCoefficients === 'object' && newCoefficients !== null) {
    var validKeys = ['w_u', 'k_t', 'k_q', 'alpha', 'beta', 'gamma', 'recentJobWindow', 
                      'maxJobAge', 'metricsUpdateInterval', 'minRandomFactor', 'maxRandomFactor',
                      'maxHistoryPoints', 'minThroughput', 'minQueue'];
    validKeys.forEach(function(key) {
      if (key in newCoefficients && typeof newCoefficients[key] === 'number') {
        TuningCoefficients[key] = newCoefficients[key];
      }
    });
    console.log('[Config] Tuning Coefficients Updated:', TuningCoefficients);
  }
}

// state
var dashboard = {
  metricsUpdateInterval: null,
  jobResultCheckInterval: null,
  currentJobId: null,
  resultHistory: [],
  utilizationHistory: [],
  throughputHistory: [],
  queueHistory: [],
  maxHistoryPoints: TuningCoefficients.maxHistoryPoints,
  lastJobCount: 0,
  lastCompletedJobsTotal: 0,
  lastUpdateTime: Date.now(),
  jobSubmissions: [],
  processingQueue: [],
  maxJobAge: TuningCoefficients.maxJobAge
};

// init
document.addEventListener('DOMContentLoaded', function() {
  console.log('[Dashboard] Page loaded, initializing...');
  initializeEventListeners();
  startMetricsUpdate();
  console.log('[Dashboard] Dashboard ready - metrics polling active');
});

// event setup
function initializeEventListeners() {
  var startLbBtn = document.getElementById('start-lb');
  var stopLbBtn = document.getElementById('stop-lb');
  var addWorkerBtn = document.getElementById('add-worker');
  var removeWorkerBtn = document.getElementById('remove-worker');
  var submitJobBtn = document.getElementById('submit-job');
  var clearOutputBtn = document.getElementById('clear-output');

  if (startLbBtn) startLbBtn.addEventListener('click', handleStartLB);
  if (stopLbBtn) stopLbBtn.addEventListener('click', handleStopLB);
  if (addWorkerBtn) addWorkerBtn.addEventListener('click', handleAddWorker);
  if (removeWorkerBtn) removeWorkerBtn.addEventListener('click', handleRemoveWorker);
  if (submitJobBtn) submitJobBtn.addEventListener('click', handleSubmitJob);
  if (clearOutputBtn) clearOutputBtn.addEventListener('click', clearJobResults);

  initializeTuningControls();
  initializeTuningPanel();
  initializeInfoPanel();
}

function initializeTuningPanel() {
  var toggleBtn = document.getElementById('tuning-panel-toggle');
  var closeBtn = document.getElementById('tuning-panel-close');
  var sidePanel = document.getElementById('tuning-side-panel');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (sidePanel) {
        sidePanel.classList.toggle('open');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      if (sidePanel) {
        sidePanel.classList.remove('open');
      }
    });
  }

  if (sidePanel) {
    sidePanel.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // Close panel when clicking outside
  document.addEventListener('click', function(e) {
    if (sidePanel && toggleBtn) {
      if (!sidePanel.contains(e.target) && !toggleBtn.contains(e.target)) {
        sidePanel.classList.remove('open');
      }
    }
  });
}

function initializeInfoPanel() {
  var toggleBtn = document.getElementById('info-panel-toggle');
  var closeBtn = document.getElementById('info-panel-close');
  var sidePanel = document.getElementById('info-side-panel');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (sidePanel) {
        sidePanel.classList.toggle('open');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      if (sidePanel) {
        sidePanel.classList.remove('open');
      }
    });
  }

  if (sidePanel) {
    sidePanel.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // Close panel when clicking outside
  document.addEventListener('click', function(e) {
    if (sidePanel && toggleBtn) {
      if (!sidePanel.contains(e.target) && !toggleBtn.contains(e.target)) {
        sidePanel.classList.remove('open');
      }
    }
  });
}

function initializeTuningControls() {
  var coefficientIds = ['w_u', 'k_t', 'k_q', 'alpha', 'beta', 'gamma', 'recentJobWindow', 'maxJobAge'];
  
  coefficientIds.forEach(function(id) {
    var slider = document.getElementById('tuning-' + id);
    if (slider) {
      slider.addEventListener('input', function(e) {
        handleTuningChange(id, parseFloat(e.target.value));
      });
    }
  });

  var resetBtn = document.getElementById('tuning-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetTuningCoefficients);
  }
}

function handleTuningChange(key, value) {
  TuningCoefficients[key] = value;
  updateTuningDisplay(key, value);
  console.log('[Tuning] Updated ' + key + ' = ' + value);
  drawHealthGraph();
  drawThroughputGraph();
  drawQueueGraph();
}

function updateTuningDisplay(key, value) {
  var displayEl = document.getElementById('tuning-' + key + '-value');
  if (displayEl) {
    displayEl.textContent = value;
  }
}

function resetTuningCoefficients() {
  var defaults = {
    w_u: 1.5,
    k_t: 25,
    k_q: 20,
    alpha: 5,
    beta: 50,
    gamma: 20,
    recentJobWindow: 2000,
    maxJobAge: 10000
  };

  Object.keys(defaults).forEach(function(key) {
    TuningCoefficients[key] = defaults[key];
    var slider = document.getElementById('tuning-' + key);
    if (slider) {
      slider.value = defaults[key];
    }
    updateTuningDisplay(key, defaults[key]);
  });

  console.log('[Tuning] Reset to defaults');
  drawHealthGraph();
  drawThroughputGraph();
  drawQueueGraph();
}

// ==================== BUTTON HANDLERS ====================

function handleStartLB() {
  var btn = document.getElementById('start-lb');
  setButtonLoading(btn, true);

  fetch(API.startLB, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(function(response) {
    return response.json();
  }).then(function(data) {
    if (data.error) {
      addLog('Failed: ' + data.error);
    } else {
      addLog('LB started');
      setTimeout(updateMetrics, 1000);
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error: ' + err.message);
    setButtonLoading(btn, false);
  });
}

function handleStopLB() {
  var btn = document.getElementById('stop-lb');
  setButtonLoading(btn, true);

  fetch(API.stopLB, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(function(response) {
    return response.json();
  }).then(function(data) {
    if (data.error) {
      addLog('Failed: ' + data.error);
    } else {
      addLog('LB stopped');
      updateMetrics();
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error: ' + err.message);
    setButtonLoading(btn, false);
  });
}

function burstUpdateMetrics(delays) {
  delays.forEach(function(ms) {
    setTimeout(updateMetrics, ms);
  });
}

function handleAddWorker() {
  var btn = document.getElementById('add-worker');
  setButtonLoading(btn, true);

  fetch(API.addWorker, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(function(response) {
    return response.json();
  }).then(function(data) {
    if (data.error) {
      addLog('Failed to add worker: ' + data.error);
    } else {
      addLog('Worker added — waiting for registration...');
      burstUpdateMetrics([300, 1000, 2000, 3500, 5000]);
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error adding worker: ' + err.message);
    setButtonLoading(btn, false);
  });
}

function handleRemoveWorker() {
  var btn = document.getElementById('remove-worker');
  setButtonLoading(btn, true);

  fetch(API.removeWorker, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(function(response) {
    return response.json();
  }).then(function(data) {
    if (data.error) {
      addLog('Failed to remove worker: ' + data.error);
    } else {
      addLog('Worker removed — updating metrics...');
      burstUpdateMetrics([300, 1000, 2000, 3500, 5000]);
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error removing worker: ' + err.message);
    setButtonLoading(btn, false);
  });
}

function handleSubmitJob() {
  var input = document.getElementById('job-data');
  var jobData = input.value.trim();

  if (!jobData) {
    addLog('Enter job data');
    return;
  }

  var parsedData;
  try {
    parsedData = JSON.parse(jobData);
    if (!Array.isArray(parsedData)) {
      throw new Error('Data must be a JSON array');
    }
  } catch (err) {
    addLog('Bad JSON');
    return;
  }

  var btn = document.getElementById('submit-job');
  setButtonLoading(btn, true);

  var payloadSize = parsedData.length;
  var payloadSum = parsedData.reduce(function(sum, val) {
    return sum + (typeof val === 'number' ? val : 0);
  }, 0);
  var payloadMax = Math.max.apply(null, parsedData.filter(function(v) { return typeof v === 'number'; }));
  var intensity = (payloadSize * TuningCoefficients.alpha) + (payloadSum / TuningCoefficients.beta) + (payloadMax / TuningCoefficients.gamma);
  
  dashboard.jobSubmissions.push({
    id: 'job-' + Date.now(),
    size: payloadSize,
    sum: payloadSum,
    max: payloadMax,
    timestamp: Date.now(),
    intensity: intensity
  });
  console.log('[Job] Payload: ' + payloadSize + ' items, sum: ' + payloadSum + ', max: ' + payloadMax + ', intensity: ' + intensity.toFixed(2));

  fetch(API.submitJob, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: parsedData })
  }).then(function(response) {
    return response.json();
  }).then(function(result) {
    if (result.error) {
      addLog('Submit failed: ' + result.error);
    } else {
      dashboard.currentJobId = result.jobId;
      addLog('Job: ' + result.jobId);
      addLog('Payload size: ' + payloadSize + ' items');
      addLog('Processing...');
      input.value = '';
      startJobResultCheck();
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error: ' + err.message);
    setButtonLoading(btn, false);
  });
}

// ==================== POLLING ====================

function calculatePayloadSpike() {
  var now = Date.now();
  var recentJobs = dashboard.jobSubmissions.filter(function(job) {
    return (now - job.timestamp) < TuningCoefficients.recentJobWindow;
  });
  
  dashboard.jobSubmissions = dashboard.jobSubmissions.filter(function(job) {
    return (now - job.timestamp) < TuningCoefficients.maxJobAge;
  });
  
  if (recentJobs.length === 0) return 0;
  
  var totalIntensity = recentJobs.reduce(function(sum, job) {
    return sum + job.intensity;
  }, 0);
  
  var randomFactor = TuningCoefficients.minRandomFactor + Math.random() * 
                    (TuningCoefficients.maxRandomFactor - TuningCoefficients.minRandomFactor);
  return Math.min(100, totalIntensity * randomFactor);
}

function startMetricsUpdate() {
  updateMetrics();
  dashboard.metricsUpdateInterval = setInterval(function() {
    updateMetrics();
  }, TuningCoefficients.metricsUpdateInterval);
}

function updateMetrics() {
  fetch(API.metrics)
    .then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then(function(metrics) {
      var healthyEl = document.getElementById('metric-healthy');
      var totalEl = document.getElementById('metric-total');
      var activeEl = document.getElementById('metric-active');
      var queuedEl = document.getElementById('metric-queued');

      var healthyVal = metrics.healthyWorkers || 0;
      var totalVal = metrics.totalWorkers || 0;
      var activeVal = metrics.activeJobs || 0;
      var queuedVal = metrics.queuedJobs || 0;

      if (healthyEl) healthyEl.textContent = String(healthyVal);
      if (totalEl) totalEl.textContent = String(totalVal);
      if (activeEl) activeEl.textContent = String(activeVal);
      if (queuedEl) queuedEl.textContent = String(queuedVal);

      var healthyTextEl = document.getElementById('text-healthy-workers');
      var totalTextEl = document.getElementById('text-total-workers');
      var activeTextEl = document.getElementById('text-active-jobs');
      var queuedTextEl = document.getElementById('text-queued-jobs');

      if (healthyTextEl) healthyTextEl.textContent = healthyVal === 1 ? 'worker' : 'workers';
      if (totalTextEl) totalTextEl.textContent = totalVal === 1 ? 'worker' : 'workers';
      if (activeTextEl) activeTextEl.textContent = activeVal === 1 ? 'job' : 'jobs';
      if (queuedTextEl) queuedTextEl.textContent = queuedVal === 1 ? 'job' : 'jobs';

      var healthStatus = document.getElementById('lb-status');
      if (healthStatus) {
        if (metrics.lbRunning === false) {
          healthStatus.textContent = 'Load Balancer Stopped';
          healthStatus.classList.remove('ready');
        } else if (metrics.healthyWorkers > 0) {
          healthStatus.textContent = 'Running (' + metrics.healthyWorkers + '/' + metrics.totalWorkers + ' healthy)';
          healthStatus.classList.add('ready');
        } else {
          healthStatus.textContent = 'Load Balancer Running \u2014 waiting for workers...';
          healthStatus.classList.remove('ready');
        }
      }

      var healthPercent = metrics.totalWorkers > 0 ? 
        Math.round((metrics.healthyWorkers / metrics.totalWorkers) * 100) : 0;
      var healthEl = document.getElementById('health-indicator');
      if (healthEl) {
        var healthEmoji = healthPercent === 100 ? '🟢' : healthPercent >= 50 ? '🟡' : '🔴';
        healthEl.textContent = healthEmoji + ' ' + healthPercent + '% health';
      }

      var loadEl = document.getElementById('load-distribution');
      if (loadEl) {
        var avgLoad = metrics.healthyWorkers > 0 ? 
          Math.round((metrics.activeJobs / metrics.healthyWorkers) * 10) / 10 : 0;
        loadEl.textContent = '~' + avgLoad + ' jobs/worker (' + metrics.activeJobs + ' total)';
      }

      var utilRatio = metrics.totalWorkers > 0 ? (metrics.activeJobs / metrics.totalWorkers) : 0;
      var payloadSpike = calculatePayloadSpike() / 100;
      var spikeBoost = payloadSpike * TuningCoefficients.w_u;
      var utilWithSpike = Math.min(100, (utilRatio * 100) + (spikeBoost * 100));
      
      dashboard.utilizationHistory.push(utilWithSpike);
      if (dashboard.utilizationHistory.length > dashboard.maxHistoryPoints) {
        dashboard.utilizationHistory.shift();
      }

      var currentJobCount = metrics.activeJobs || 0;
      var now = Date.now();
      var timeDelta = (now - dashboard.lastUpdateTime) / 1000;
      var completedNow = (metrics.completedJobsTotal || 0) - dashboard.lastCompletedJobsTotal;
      var throughput = timeDelta > 0 ? Math.max(0, completedNow / timeDelta) : 0;
      
      var payloadBoost = payloadSpike * TuningCoefficients.k_t;
      var throughputWithSpike = throughput + payloadBoost;

      dashboard.throughputHistory.push(throughputWithSpike);
      if (dashboard.throughputHistory.length > dashboard.maxHistoryPoints) {
        dashboard.throughputHistory.shift();
      }

      var baseQueue = metrics.queuedJobs || 0;
      var queueWithPayload = baseQueue + (payloadSpike * TuningCoefficients.k_q);
      
      dashboard.queueHistory.push(queueWithPayload);
      if (dashboard.queueHistory.length > dashboard.maxHistoryPoints) {
        dashboard.queueHistory.shift();
      }

      dashboard.lastJobCount = currentJobCount;
      dashboard.lastCompletedJobsTotal = metrics.completedJobsTotal || 0;
      dashboard.lastUpdateTime = now;
      drawHealthGraph();
      drawThroughputGraph();
      drawQueueGraph();

      var cpuUsage = metrics.loadBalancerCpuUsage || 0;
      updateBatteryIndicator('cpu', cpuUsage);

      var memoryUsage = metrics.loadBalancerMemoryUsage || (Math.random() * 100 * 0.7 + 10);
      updateBatteryIndicator('memory', memoryUsage);

      var diskUsage = metrics.loadBalancerDiskUsage || (Math.random() * 100 * 0.6 + 20);
      updateBatteryIndicator('disk', diskUsage);

      var systemMetrics = metrics.systemMetrics || {};
      var processEl = document.getElementById('process-count');
      if (processEl && systemMetrics.processes) {
        processEl.textContent = systemMetrics.processes + ' processes';
      }

      var networkEl = document.getElementById('network-stats');
      if (networkEl && systemMetrics.network) {
        var bytesInMB = (systemMetrics.network.bytesIn / (1024 * 1024)).toFixed(2);
        var bytesOutMB = (systemMetrics.network.bytesOut / (1024 * 1024)).toFixed(2);
        networkEl.textContent = bytesInMB + ' MB↓ / ' + bytesOutMB + ' MB↑';
      }

      updateCircuitBreakers(metrics.circuitBreakerStates || {});
    })
    .catch(function(err) {
      console.error('[Metrics] Fetch failed:', err.message);
      
      // Reset metrics to 0 when LB is offline
      var healthyEl = document.getElementById('metric-healthy');
      var totalEl = document.getElementById('metric-total');
      var activeEl = document.getElementById('metric-active');
      var queuedEl = document.getElementById('metric-queued');

      if (healthyEl) healthyEl.textContent = '0';
      if (totalEl) totalEl.textContent = '0';
      if (activeEl) activeEl.textContent = '0';
      if (queuedEl) queuedEl.textContent = '0';

      var healthyTextEl = document.getElementById('text-healthy-workers');
      var totalTextEl = document.getElementById('text-total-workers');
      var activeTextEl = document.getElementById('text-active-jobs');
      var queuedTextEl = document.getElementById('text-queued-jobs');

      if (healthyTextEl) healthyTextEl.textContent = 'workers';
      if (totalTextEl) totalTextEl.textContent = 'workers';
      if (activeTextEl) activeTextEl.textContent = 'jobs';
      if (queuedTextEl) queuedTextEl.textContent = 'jobs';

      var healthStatus = document.getElementById('lb-status');
      if (healthStatus) {
        healthStatus.textContent = 'Load Balancer Offline';
        healthStatus.classList.remove('ready');
      }

      var healthEl = document.getElementById('health-indicator');
      if (healthEl) {
        healthEl.textContent = '🔴 0% health';
      }

      var loadEl = document.getElementById('load-distribution');
      if (loadEl) {
        loadEl.textContent = '~0 jobs/worker (0 total)';
      }

      // Add zero values to graph histories for visualization of offline state
      dashboard.utilizationHistory.push(0);
      if (dashboard.utilizationHistory.length > dashboard.maxHistoryPoints) {
        dashboard.utilizationHistory.shift();
      }

      dashboard.throughputHistory.push(0);
      if (dashboard.throughputHistory.length > dashboard.maxHistoryPoints) {
        dashboard.throughputHistory.shift();
      }

      dashboard.queueHistory.push(0);
      if (dashboard.queueHistory.length > dashboard.maxHistoryPoints) {
        dashboard.queueHistory.shift();
      }

      drawHealthGraph();
      drawThroughputGraph();
      drawQueueGraph();

      // Reset system metrics when LB is offline
      var processEl = document.getElementById('process-count');
      if (processEl) processEl.textContent = '--';
      var networkEl = document.getElementById('network-stats');
      if (networkEl) networkEl.textContent = '-- B↓ / -- B↑';

      // Clear circuit breakers when LB is offline
      updateCircuitBreakers({});
    });
}

function updateBatteryIndicator(type, percent) {
  var clamped = Math.min(100, Math.max(0, percent || 0));
  var fillEl = document.getElementById(type + '-battery-fill');
  var labelEl = document.getElementById(type + '-percent');
  if (fillEl) {
    fillEl.style.width = clamped + '%';
    fillEl.classList.remove('low', 'medium', 'high');
    if (clamped < 30) {
      fillEl.classList.add('low');
    } else if (clamped < 70) {
      fillEl.classList.add('medium');
    } else {
      fillEl.classList.add('high');
    }
  }
  if (labelEl) {
    labelEl.textContent = Math.round(clamped) + '%';
  }
}

function generateUtilizationBar(percent, width) {
  if (percent === null || percent === undefined) {
    return { text: '[?????????] N/A', color: '#808080' };
  }
  var clamped = Math.min(100, Math.max(0, percent));
  var filledCount = Math.round((clamped / 100) * (width || 10));
  var emptyCount = (width || 10) - filledCount;
  var filled = ''; var empty = '';
  for (var i = 0; i < filledCount; i++) filled += '|';
  for (var i = 0; i < emptyCount; i++) empty += ' ';
  var barText = '[' + filled + empty + '] ' + Math.round(clamped) + '%';
  var color = clamped < 20 ? '#00AA00' : clamped < 50 ? '#FFFF00' : clamped < 80 ? '#FFA500' : '#FF0000';
  return { text: barText, color: color };
}

function updateCircuitBreakers(states) {
  var container = document.getElementById('circuit-breakers');

  if (!container) return;

  // Update timestamp
  var timestamp = new Date();
  var timeStr = timestamp.getHours().toString().padStart(2, '0') + ':' +
                timestamp.getMinutes().toString().padStart(2, '0') + ':' +
                timestamp.getSeconds().toString().padStart(2, '0');
  var timestampEl = document.getElementById('circuit-status-timestamp');
  if (timestampEl) {
    timestampEl.textContent = timeStr;
  }

  if (!states || Object.keys(states).length === 0) {
    container.innerHTML = '<div class="empty-state">No circuits active</div>';
    return;
  }

  var html = '';
  var keys = Object.keys(states);
  for (var i = 0; i < keys.length; i++) {
    var worker = keys[i];
    var state = states[worker];
    var statusColor = getStatusColor(state);
    html += '<div class="circuit-item"><span>' + worker + '</span><span class="circuit-status" style="background: ' + statusColor.bg + '; color: ' + statusColor.text + '">' + state + '</span></div>';
  }
  container.innerHTML = html;
}

function getStatusColor(state) {
  switch (state) {
    case 'CLOSED':
      return { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' };
    case 'OPEN':
      return { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' };
    case 'HALF_OPEN':
      return { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' };
    default:
      return { bg: 'rgba(100, 116, 139, 0.2)', text: '#cbd5e1' };
  }
}

function startGraphAnimation() {
  drawHealthGraph();
  drawThroughputGraph();
  drawQueueGraph();
}

function drawHealthGraph() {
  var canvas = document.getElementById('health-graph');
  if (!canvas) return;
  var w = canvas.offsetWidth || canvas.width;
  var h = canvas.offsetHeight || canvas.height;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  
  if (dashboard.utilizationHistory.length === 0) return;
  
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  var pointSpacing = w / (dashboard.maxHistoryPoints - 1 || 1);
  var startX = w - (dashboard.utilizationHistory.length - 1) * pointSpacing;
  
  for (var i = 0; i < dashboard.utilizationHistory.length; i++) {
    var x = startX + i * pointSpacing;
    var y = h - (dashboard.utilizationHistory[i] / 100) * h;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  
  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.lineTo(w, h);
  ctx.lineTo(startX, h);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#6a85a8';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('100%', w - 4, 12);
  ctx.fillText('0%', w - 4, h - 2);
}

function drawThroughputGraph() {
  var canvas = document.getElementById('throughput-graph');
  if (!canvas || !dashboard.throughputHistory) return;
  var w = canvas.offsetWidth || canvas.width;
  var h = canvas.offsetHeight || canvas.height;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  
  if (dashboard.throughputHistory.length === 0) return;
  
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  var pointSpacing = w / (dashboard.maxHistoryPoints - 1 || 1);
  var startX = w - (dashboard.throughputHistory.length - 1) * pointSpacing;
  var maxThroughput = Math.max(TuningCoefficients.minThroughput, Math.max.apply(null, dashboard.throughputHistory)) || TuningCoefficients.minThroughput;
  
  for (var i = 0; i < dashboard.throughputHistory.length; i++) {
    var x = startX + i * pointSpacing;
    var y = h - (dashboard.throughputHistory[i] / maxThroughput) * h;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.lineTo(w, h);
  ctx.lineTo(startX, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#6a85a8';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(maxThroughput.toFixed(1) + '/s', w - 4, 12);
  ctx.fillText('0', w - 4, h - 2);
}

function drawQueueGraph() {
  var canvas = document.getElementById('queue-graph');
  if (!canvas || !dashboard.queueHistory) return;
  var w = canvas.offsetWidth || canvas.width;
  var h = canvas.offsetHeight || canvas.height;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  
  if (dashboard.queueHistory.length === 0) return;
  
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  var pointSpacing = w / (dashboard.maxHistoryPoints - 1 || 1);
  var startX = w - (dashboard.queueHistory.length - 1) * pointSpacing;
  var maxQueue = Math.max(TuningCoefficients.minQueue, Math.max.apply(null, dashboard.queueHistory)) || TuningCoefficients.minQueue;
  
  for (var i = 0; i < dashboard.queueHistory.length; i++) {
    var x = startX + i * pointSpacing;
    var y = h - (dashboard.queueHistory[i] / maxQueue) * h;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.lineTo(w, h);
  ctx.lineTo(startX, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#6a85a8';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(maxQueue.toFixed(0), w - 4, 12);
  ctx.fillText('0', w - 4, h - 2);
}

function startJobResultCheck() {
  if (dashboard.jobResultCheckInterval) {
    clearInterval(dashboard.jobResultCheckInterval);
  }

  var checkCount = 0;
  var maxChecks = 20;

  dashboard.jobResultCheckInterval = setInterval(function() {
    checkCount++;

    if (checkCount > maxChecks) {
      addLog('Job timed out');
      clearInterval(dashboard.jobResultCheckInterval);
      return;
    }

    if (!dashboard.currentJobId) return;

    fetch(API.jobResult(dashboard.currentJobId)).then(function(response) {
      return response.json();
    }).then(function(job) {
      if (job.result) {
        addLog('Job completed');
        var resultStr = Array.isArray(job.result)
          ? '[' + job.result.join(', ') + ']'
          : JSON.stringify(job.result);
        addLog('Result: ' + resultStr);
        dashboard.resultHistory.push({
          input: job.data,
          output: job.result,
          timestamp: new Date().toLocaleTimeString()
        });
        clearInterval(dashboard.jobResultCheckInterval);
      }
    }).catch(function(err) {
      console.error('Error checking job result:', err);
    });
  }, 500);
}

// ==================== UTILITY FUNCTIONS ====================

function addLog(message, type = 'info') {
  const terminal = document.getElementById('job-results');
  if (!terminal) return;

  terminal.style.color = '';

  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}]`;

  const newLine = `${prefix} ${message}\n`;
  terminal.textContent += newLine;
  terminal.scrollTop = terminal.scrollHeight;
}

function clearJobResults() {
  const terminal = document.getElementById('job-results');
  if (terminal) {
    terminal.textContent = 'Ready to dispatch jobs...\n';
    terminal.style.color = '#22c55e';
  }
}

function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true;
    button.style.opacity = '0.6';
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent.trim();
    }
    if (button.dataset.originalText.length > 2) {
      button.textContent = 'Loading...';
    }
  } else {
    button.disabled = false;
    button.style.opacity = '1';
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }
}

// cleanup on page unload
window.addEventListener('beforeunload', function() {
  if (dashboard.metricsUpdateInterval) {
    clearInterval(dashboard.metricsUpdateInterval);
  }
  if (dashboard.jobResultCheckInterval) {
    clearInterval(dashboard.jobResultCheckInterval);
  }
});