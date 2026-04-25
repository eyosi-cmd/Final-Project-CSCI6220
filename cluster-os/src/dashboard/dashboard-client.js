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

// state
var dashboard = {
  metricsUpdateInterval: null,
  jobResultCheckInterval: null,
  currentJobId: null,
  resultHistory: []
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
      addLog('Failed: ' + data.error);
    } else {
      addLog('Worker added');
      setTimeout(updateMetrics, 500);
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error: ' + err.message);
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
      addLog('Failed: ' + data.error);
    } else {
      addLog('Worker removed');
      setTimeout(updateMetrics, 500);
    }
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error: ' + err.message);
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

function startMetricsUpdate() {
  console.log('[Metrics] Starting dynamic metrics update every 2 seconds');
  updateMetrics();
  dashboard.metricsUpdateInterval = setInterval(function() {
    updateMetrics();
  }, 2000);
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
        if (metrics.healthyWorkers > 0) {
          healthStatus.textContent = 'Running (' + metrics.healthyWorkers + '/' + metrics.totalWorkers + ' healthy)';
          healthStatus.classList.add('ready');
        } else {
          healthStatus.textContent = 'Waiting for Load Balancer...';
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

      console.log('[Metrics] Updated:', {
        healthy: metrics.healthyWorkers,
        total: metrics.totalWorkers,
        active: metrics.activeJobs,
        queued: metrics.queuedJobs,
        timestamp: new Date().toLocaleTimeString()
      });

      updateCircuitBreakers(metrics.circuitBreakerStates || {});
    })
    .catch(function(err) {
      console.error('[Metrics] Fetch failed:', err.message);
    });
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

function startJobResultCheck() {
  if (dashboard.jobResultCheckInterval) {
    clearInterval(dashboard.jobResultCheckInterval);
  }

  var checkCount = 0;
  var maxChecks = 60;

  dashboard.jobResultCheckInterval = setInterval(function() {
    checkCount++;

    if (checkCount > maxChecks) {
      addLog('Job result check timed out');
      clearInterval(dashboard.jobResultCheckInterval);
      return;
    }

    if (!dashboard.currentJobId) return;

    fetch(API.jobResult(dashboard.currentJobId)).then(function(response) {
      return response.json();
    }).then(function(job) {
      if (job.result) {
        addLog('Job completed');
        var resultStr = job.result.join(', ');
        addLog('Result: [' + resultStr + ']');
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
  }, 2000);
}

// ==================== UTILITY FUNCTIONS ====================

function addLog(message, type = 'info') {
  const terminal = document.getElementById('job-results');
  if (!terminal) return;

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
  }
}

function setButtonLoading(button, isLoading) {
  var textEl = button.querySelector('.btn-text');

  if (!textEl) return;

  if (isLoading) {
    button.disabled = true;
    button.style.opacity = '0.6';
    textEl.textContent = 'Loading...';
  } else {
    button.disabled = false;
    button.style.opacity = '1';
    var originalTexts = {
      'start-lb': 'Start LB',
      'stop-lb': 'Stop LB',
      'add-worker': 'Add Worker',
      'remove-worker': 'Remove Worker',
      'submit-job': 'Dispatch Job'
    };
    textEl.textContent = originalTexts[button.id] || 'Button';
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