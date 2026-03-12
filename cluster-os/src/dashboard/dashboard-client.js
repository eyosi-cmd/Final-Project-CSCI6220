// Dashboard Client - JavaScript Frontend Module
// Manages UI interactions and real-time metrics from ClusterOS backend

// API Constants
const API = {
  metrics: '/api/metrics',
  startLB: '/api/start-lb',
  stopLB: '/api/kill-lb',
  addWorker: '/api/start-worker',
  removeWorker: '/api/kill-worker',
  submitJob: '/api/submit-job',
  jobResult: (id) => `/api/job-result/${id}`,
  cancelJob: (id) => `/api/cancel-job/${id}`
};

// Global dashboard state
const dashboard = {
  metricsUpdateInterval: null,
  jobResultCheckInterval: null,
  currentJobId: null,
  resultHistory: []
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  startMetricsUpdate();
  updateSystemStatus();
});

// ==================== EVENT LISTENERS ====================

function initializeEventListeners() {
  const startLbBtn = document.getElementById('start-lb');
  const stopLbBtn = document.getElementById('stop-lb');
  const addWorkerBtn = document.getElementById('add-worker');
  const removeWorkerBtn = document.getElementById('remove-worker');
  const submitJobBtn = document.getElementById('submit-job');
  const clearOutputBtn = document.getElementById('clear-output');
  const jobDataInput = document.getElementById('job-data');

  startLbBtn?.addEventListener('click', handleStartLB);
  stopLbBtn?.addEventListener('click', handleStopLB);
  addWorkerBtn?.addEventListener('click', handleAddWorker);
  removeWorkerBtn?.addEventListener('click', handleRemoveWorker);
  submitJobBtn?.addEventListener('click', handleSubmitJob);
  clearOutputBtn?.addEventListener('click', clearJobResults);

  jobDataInput?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      handleSubmitJob();
    }
  });
}

// ==================== BUTTON HANDLERS ====================

async function handleStartLB() {
  const btn = document.getElementById('start-lb');
  setButtonLoading(btn, true);

  try {
    const response = await fetch(API.startLB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (data.error) {
      addLog(`❌ Failed to start LB: ${data.error}`, 'error');
    } else {
      addLog(`✓ Load Balancer started - ${data.status}`, 'success');
      setTimeout(updateSystemStatus, 1000);
    }
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleStopLB() {
  const btn = document.getElementById('stop-lb');
  setButtonLoading(btn, true);

  try {
    const response = await fetch(API.stopLB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (data.error) {
      addLog(`❌ Failed to stop LB: ${data.error}`, 'error');
    } else {
      addLog(`✓ Load Balancer stopped - ${data.status}`, 'success');
      updateSystemStatus();
    }
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleAddWorker() {
  const btn = document.getElementById('add-worker');
  setButtonLoading(btn, true);

  try {
    const response = await fetch(API.addWorker, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (data.error) {
      addLog(`❌ Failed to add worker: ${data.error}`, 'error');
    } else {
      addLog(`✓ Worker added - ${data.status}`, 'success');
      setTimeout(updateMetrics, 500);
    }
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleRemoveWorker() {
  const btn = document.getElementById('remove-worker');
  setButtonLoading(btn, true);

  try {
    const response = await fetch(API.removeWorker, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (data.error) {
      addLog(`❌ Failed to remove worker: ${data.error}`, 'error');
    } else {
      addLog(`✓ Worker removed - ${data.status}`, 'success');
      setTimeout(updateMetrics, 500);
    }
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleSubmitJob() {
  const input = document.getElementById('job-data');
  const jobData = input.value.trim();

  if (!jobData) {
    addLog('❌ Please enter job data (JSON array)', 'error');
    return;
  }

  let parsedData;
  try {
    parsedData = JSON.parse(jobData);
    if (!Array.isArray(parsedData)) {
      throw new Error('Data must be a JSON array');
    }
  } catch (err) {
    addLog(`❌ Invalid JSON: ${err.message}`, 'error');
    return;
  }

  const btn = document.getElementById('submit-job');
  setButtonLoading(btn, true);

  try {
    const response = await fetch(API.submitJob, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: parsedData })
    });

    const result = await response.json();

    if (result.error) {
      addLog(`❌ Submission failed: ${result.error}`, 'error');
    } else {
      dashboard.currentJobId = result.jobId;
      addLog(`✓ Job submitted [ID: ${result.jobId}]`, 'success');
      addLog(`→ Processing ${parsedData.length} items...`, 'info');
      input.value = '';

      startJobResultCheck();
    }
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// ==================== POLLING & UPDATES ====================

function startMetricsUpdate() {
  updateMetrics();
  dashboard.metricsUpdateInterval = setInterval(updateMetrics, 2000);
}

async function updateMetrics() {
  try {
    const response = await fetch(API.metrics);
    const metrics = await response.json();

    const healthyEl = document.getElementById('metric-healthy');
    const totalEl = document.getElementById('metric-total');
    const activeEl = document.getElementById('metric-active');
    const queuedEl = document.getElementById('metric-queued');

    if (healthyEl) healthyEl.textContent = String(metrics.healthyWorkers || 0);
    if (totalEl) totalEl.textContent = String(metrics.totalWorkers || 0);
    if (activeEl) activeEl.textContent = String(metrics.activeJobs || 0);
    if (queuedEl) queuedEl.textContent = String(metrics.queuedJobs || 0);

    updateCircuitBreakers(metrics.circuitBreakerStates || {});
    updateSystemStatus();
  } catch (err) {
    console.error('Failed to fetch metrics:', err);
  }
}

async function updateSystemStatus() {
  try {
    const response = await fetch(API.metrics);
    if (response.ok) {
      const data = await response.json();
      const status = document.getElementById('system-status');

      if (!status) return;

      const dot = status.querySelector('.status-dot');
      const text = status.querySelector('.status-text');

      if (data.healthyWorkers > 0) {
        status.style.background = 'rgba(16, 185, 129, 0.1)';
        status.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        if (dot) dot.style.background = '#10b981';
        if (text) {
          text.textContent = 'Online';
          text.style.color = '#10b981';
        }
      } else {
        status.style.background = 'rgba(239, 68, 68, 0.1)';
        status.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        if (dot) dot.style.background = '#ef4444';
        if (text) {
          text.textContent = 'Offline';
          text.style.color = '#ef4444';
        }
      }
    }
  } catch (err) {
    console.error('Failed to update system status:', err);
  }
}

function updateCircuitBreakers(states) {
  const container = document.getElementById('circuit-breakers');

  if (!container) return;

  if (!states || Object.keys(states).length === 0) {
    container.innerHTML = '<div class="empty-state">No circuits active</div>';
    return;
  }

  let html = '';
  for (const [worker, state] of Object.entries(states)) {
    const statusColor = getStatusColor(state);
    html += `
      <div class="circuit-item">
        <span>${worker}</span>
        <span class="circuit-status" style="background: ${statusColor.bg}; color: ${statusColor.text}">
          ${state}
        </span>
      </div>
    `;
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

  let checkCount = 0;
  const maxChecks = 60; // Check for up to 2 minutes

  dashboard.jobResultCheckInterval = setInterval(async () => {
    checkCount++;

    if (checkCount > maxChecks) {
      addLog('⚠ Job result check timed out', 'warning');
      clearInterval(dashboard.jobResultCheckInterval);
      return;
    }

    try {
      if (!dashboard.currentJobId) return;

      const response = await fetch(API.jobResult(dashboard.currentJobId));
      const job = await response.json();

      if (job.result) {
        addLog(`✓ Job completed!`, 'success');
        addLog(`← Result: [${job.result.join(', ')}]`, 'result');
        dashboard.resultHistory.push({
          input: job.data,
          output: job.result,
          timestamp: new Date().toLocaleTimeString()
        });
        clearInterval(dashboard.jobResultCheckInterval);
      }
    } catch (err) {
      console.error('Error checking job result:', err);
    }
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
  const textEl = button.querySelector('.btn-text');

  if (!textEl) return;

  if (isLoading) {
    button.disabled = true;
    button.style.opacity = '0.6';
    textEl.textContent = 'Loading...';
  } else {
    button.disabled = false;
    button.style.opacity = '1';
    const originalTexts = {
      'start-lb': 'Start LB',
      'stop-lb': 'Stop LB',
      'add-worker': 'Add Worker',
      'remove-worker': 'Remove Worker',
      'submit-job': 'Dispatch Job'
    };
    textEl.textContent = originalTexts[button.id] || 'Button';
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (dashboard.metricsUpdateInterval) {
    clearInterval(dashboard.metricsUpdateInterval);
  }
  if (dashboard.jobResultCheckInterval) {
    clearInterval(dashboard.jobResultCheckInterval);
  }
});
