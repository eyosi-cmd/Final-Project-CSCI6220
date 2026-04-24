var dashboard = {
  metricsUpdateInterval: null,
  jobResultCheckInterval: null,
  currentJobId: null,
  resultHistory: []
};

var apiPromise = null;

function getApi() {
  if (!apiPromise) {
    apiPromise = import('./dashboard-api.js').then(function(module) {
      return module.createDashboardApi();
    });
  }
  return apiPromise;
}

document.addEventListener('DOMContentLoaded', function() {
  initializeEventListeners();
  startMetricsUpdate();
});

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

function handleStartLB() {
  var btn = document.getElementById('start-lb');
  setButtonLoading(btn, true);

  getApi().then(function(api) {
    return api.startLoadBalancer();
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

  getApi().then(function(api) {
    return api.stopLoadBalancer();
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

  getApi().then(function(api) {
    return api.startWorker();
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

  getApi().then(function(api) {
    return api.stopWorker();
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

  getApi().then(function(api) {
    return api.submitJob(parsedData);
  }).then(function(result) {
    dashboard.currentJobId = result.jobId;
    addLog('Job: ' + result.jobId);
    addLog('Processing...');
    input.value = '';
    startJobResultCheck();
    setButtonLoading(btn, false);
  }).catch(function(err) {
    addLog('Error: ' + err.message);
    setButtonLoading(btn, false);
  });
}

function startMetricsUpdate() {
  updateMetrics();
  dashboard.metricsUpdateInterval = setInterval(function() {
    updateMetrics();
  }, 2000);
}

function updateMetrics() {
  getApi().then(function(api) {
    return api.getMetrics();
  }).then(function(metrics) {
    var healthyEl = document.getElementById('metric-healthy');
    var totalEl = document.getElementById('metric-total');
    var activeEl = document.getElementById('metric-active');
    var queuedEl = document.getElementById('metric-queued');

    if (healthyEl) healthyEl.textContent = String(metrics.healthyWorkers || 0);
    if (totalEl) totalEl.textContent = String(metrics.totalWorkers || 0);
    if (activeEl) activeEl.textContent = String(metrics.activeJobs || 0);
    if (queuedEl) queuedEl.textContent = String(metrics.queuedJobs || 0);

    updateCircuitBreakers(metrics.circuitBreakerStates || {});
  }).catch(function(err) {
    console.error('[Metrics] Fetch failed:', err.message);
  });
}

function updateCircuitBreakers(states) {
  var container = document.getElementById('circuit-breakers');

  if (!container) return;

  var timestamp = new Date();
  var timeStr = timestamp.getHours().toString().padStart(2, '0') + ':' +
                timestamp.getMinutes().toString().padStart(2, '0') + ':' +
                timestamp.getSeconds().toString().padStart(2, '0');
  var timestampEl = document.getElementById('circuit-status-timestamp');
  if (timestampEl) {
    timestampEl.textContent = timeStr;
  }

  if (!states || Object.keys(states).length === 0) {
    container.innerHTML = '<div class="empty-state">No circuits</div>';
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

    getApi().then(function(api) {
      return api.getJobResult(dashboard.currentJobId);
    }).then(function(job) {
      if (job && job.result) {
        addLog('Job completed');
        addLog('Result: [' + job.result.join(', ') + ']');
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

function addLog(message) {
  var terminal = document.getElementById('job-results');
  if (!terminal) return;

  var timestamp = new Date().toLocaleTimeString();
  terminal.textContent += '[' + timestamp + '] ' + message + '\n';
  terminal.scrollTop = terminal.scrollHeight;
}

function clearJobResults() {
  var terminal = document.getElementById('job-results');
  if (terminal) {
    terminal.textContent = 'Ready to dispatch jobs...\n';
  }
}

function setButtonLoading(button, isLoading) {
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.style.opacity = '0.6';
    button.dataset.originalText = button.textContent || '';
    button.textContent = 'Loading...';
  } else {
    button.disabled = false;
    button.style.opacity = '1';
    button.textContent = button.dataset.originalText || button.textContent || 'Button';
  }
}

window.addEventListener('beforeunload', function() {
  if (dashboard.metricsUpdateInterval) {
    clearInterval(dashboard.metricsUpdateInterval);
  }
  if (dashboard.jobResultCheckInterval) {
    clearInterval(dashboard.jobResultCheckInterval);
  }
});
