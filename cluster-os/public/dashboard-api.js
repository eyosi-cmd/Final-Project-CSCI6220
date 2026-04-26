function getApiBaseUrl() {
  var meta = document.querySelector('meta[name="api-base-url"]');
  if (!meta) return '';
  return (meta.getAttribute('content') || '').trim().replace(/\/$/, '');
}

function apiUrl(path) {
  var base = getApiBaseUrl();
  return base ? base + path : path;
}

async function requestJson(path, options) {
  var response = await fetch(apiUrl(path), {
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    ...options
  });

  var text = await response.text();
  var data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('Invalid JSON response');
    }
  }

  if (!response.ok) {
    throw new Error((data && data.error) || ('HTTP ' + response.status));
  }

  return data;
}

export function createDashboardApi() {
  return {
    getMetrics: function() {
      return requestJson('/api/metrics', { method: 'GET' });
    },
    startLoadBalancer: function() {
      return requestJson('/api/start-lb', { method: 'POST' });
    },
    stopLoadBalancer: function() {
      return requestJson('/api/kill-lb', { method: 'POST' });
    },
    startWorker: function() {
      return requestJson('/api/start-worker', { method: 'POST' });
    },
    stopWorker: function() {
      return requestJson('/api/kill-worker', { method: 'POST' });
    },
    submitJob: function(data) {
      return requestJson('/api/submit-job', {
        method: 'POST',
        body: JSON.stringify({ data: data })
      });
    },
    getJobResult: function(id) {
      return requestJson('/api/job-result/' + id, { method: 'GET' });
    },
    cancelJob: function(id) {
      return requestJson('/api/cancel-job/' + id, { method: 'POST' });
    }
  };
}
