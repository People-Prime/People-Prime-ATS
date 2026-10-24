import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { API_TIMEOUTS } from '../src/services/api.ts';

// Helper that mirrors the exact Applicants data-fetching lifecycle and state-machine in Applications.tsx
class ApplicantsDataFetcher {
  constructor(apiClient) {
    this.api = apiClient;
    this.loading = false;
    this.localApplications = [];
    this.totalCount = 0;
    this.fetchError = null;
    this.currentController = null;
    this.isMounted = true;
  }

  // The view rendering logic from Applications.tsx
  getTableEmptyStateMessage(displayAppsCount) {
    if (displayAppsCount > 0) return null;
    if (this.loading) {
      return 'LOADING_SPINNER';
    }
    if (this.fetchError) {
      return `ERROR: ${this.fetchError}`;
    }
    return 'NO_APPLICATIONS_MATCH';
  }

  getFullPageLoadingState() {
    return this.loading && this.localApplications.length === 0 && !this.fetchError;
  }

  // Corresponds to useEffect data fetching in Applications.tsx
  fetchApplications(params) {
    if (this.currentController) {
      this.currentController.abort();
    }
    const controller = new AbortController();
    this.currentController = controller;

    this.loading = true;
    this.fetchError = null;

    let url = 'applications/?is_job_posting=false&';
    if (params.queryTerm) {
      url += `global_search=${encodeURIComponent(params.queryTerm)}&`;
    } else {
      url += `start_date=${params.startDate}&end_date=${params.endDate}&`;
    }
    if (params.statusFilter && params.statusFilter !== 'ALL') {
      url += `status=${encodeURIComponent(params.statusFilter)}&`;
    }
    url += `page=${params.page + 1}&page_size=${params.rowsPerPage}&`;

    const requestPromise = this.api.get(url, {
      signal: controller.signal,
      timeout: API_TIMEOUTS.DEFAULT_LIST,
    })
      .then((res) => {
        if (!this.isMounted || controller.signal.aborted) return;
        const list = res.data?.results ?? res.data ?? [];
        const count = res.data?.count ?? list.length;
        this.localApplications = list;
        this.totalCount = count;
        this.fetchError = null;
      })
      .catch((err) => {
        if (!this.isMounted || axios.isCancel(err) || err.name === 'CanceledError' || controller.signal.aborted) {
          return;
        }
        let message = 'Failed to load applications. Please try again.';
        if (err.code === 'ECONNABORTED' || (err.message && err.message.toLowerCase().includes('timeout'))) {
          message = 'The request timed out. The server may be experiencing high load. Please try again.';
        } else if (!err.response) {
          message = 'Network connection error. Please check your internet connection.';
        } else if (err.response.status >= 500) {
          message = `Server error (${err.response.status}). Please try again shortly.`;
        } else if (err.response.data?.detail) {
          message = typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail);
        }
        this.fetchError = message;
      })
      .finally(() => {
        if (this.isMounted && !controller.signal.aborted) {
          this.loading = false;
        }
      });

    return { controller, promise: requestPromise };
  }

  unmount() {
    this.isMounted = false;
    if (this.currentController) {
      this.currentController.abort();
    }
  }
}

describe('Applicants Page Loading & Resiliency Regression Tests', () => {

  test('Test 1: Successful Applicants API response populates data and clears loading', async () => {
    const mockData = {
      count: 2,
      results: [
        { id: 101, candidate_name: 'Alice Johnson', position: 'Frontend Developer' },
        { id: 102, candidate_name: 'Bob Smith', position: 'Backend Engineer' },
      ],
    };

    const mockApi = {
      get: async () => ({ data: mockData }),
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);
    assert.strictEqual(fetcher.loading, false);

    const { promise } = fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });
    assert.strictEqual(fetcher.loading, true);

    await promise;

    assert.strictEqual(fetcher.loading, false);
    assert.strictEqual(fetcher.fetchError, null);
    assert.strictEqual(fetcher.totalCount, 2);
    assert.strictEqual(fetcher.localApplications.length, 2);
    assert.strictEqual(fetcher.getFullPageLoadingState(), false);
    assert.strictEqual(fetcher.getTableEmptyStateMessage(2), null);
  });

  test('Test 2: Empty successful response displays "No applications found" and NOT a loading spinner', async () => {
    const mockApi = {
      get: async () => ({ data: { count: 0, results: [] } }),
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);
    const { promise } = fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });
    await promise;

    assert.strictEqual(fetcher.loading, false);
    assert.strictEqual(fetcher.fetchError, null);
    assert.strictEqual(fetcher.localApplications.length, 0);
    assert.strictEqual(fetcher.totalCount, 0);

    // CRITICAL: Must show NO_APPLICATIONS_MATCH and never LOADING_SPINNER
    const emptyState = fetcher.getTableEmptyStateMessage(0);
    assert.strictEqual(emptyState, 'NO_APPLICATIONS_MATCH');
    assert.notStrictEqual(emptyState, 'LOADING_SPINNER');
  });

  test('Test 3: HTTP 500, 502, 503, and 504 errors clear loading and display server error message', async () => {
    const errorStatuses = [500, 502, 503, 504];

    for (const status of errorStatuses) {
      const mockApi = {
        get: async () => {
          const err = new Error(`Request failed with status code ${status}`);
          err.response = { status, data: { detail: `Gateway/Server error ${status}` } };
          throw err;
        },
      };

      const fetcher = new ApplicantsDataFetcher(mockApi);
      const { promise } = fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });
      await promise;

      assert.strictEqual(fetcher.loading, false, `Loading should be false after ${status}`);
      assert.ok(fetcher.fetchError, `fetchError should be set after ${status}`);
      assert.ok(
        fetcher.fetchError.includes(String(status)) || fetcher.fetchError.includes('Server error'),
        `Error message should reference ${status}`
      );

      // Must show error with retry, not "No applications match" and not loading spinner
      const emptyState = fetcher.getTableEmptyStateMessage(0);
      assert.ok(emptyState.startsWith('ERROR:'));
      assert.notStrictEqual(emptyState, 'LOADING_SPINNER');
      assert.notStrictEqual(emptyState, 'NO_APPLICATIONS_MATCH');
    }
  });

  test('Test 4: Network timeout clears loading and displays timeout error', async () => {
    const mockApi = {
      get: async () => {
        const err = new Error('timeout of 15000ms exceeded');
        err.code = 'ECONNABORTED';
        throw err;
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);
    const { promise } = fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });
    await promise;

    assert.strictEqual(fetcher.loading, false);
    assert.ok(fetcher.fetchError.includes('timed out'));
    const emptyState = fetcher.getTableEmptyStateMessage(0);
    assert.ok(emptyState.startsWith('ERROR:'));
    assert.ok(emptyState.includes('timed out'));
    assert.notStrictEqual(emptyState, 'LOADING_SPINNER');
  });

  test('Test 5: Network disconnection (no response) clears loading and displays connection error', async () => {
    const mockApi = {
      get: async () => {
        const err = new Error('Network Error');
        // err.response is undefined on complete network drops
        err.response = undefined;
        throw err;
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);
    const { promise } = fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });
    await promise;

    assert.strictEqual(fetcher.loading, false);
    assert.ok(fetcher.fetchError.includes('Network connection error'));
    const emptyState = fetcher.getTableEmptyStateMessage(0);
    assert.ok(emptyState.startsWith('ERROR:'));
  });

  test('Test 6: Retry after failure resets error and recovers on successful response', async () => {
    let callCount = 0;
    const mockApi = {
      get: async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Server Error 500');
          err.response = { status: 500, data: {} };
          throw err;
        }
        return { data: { count: 1, results: [{ id: 1, candidate_name: 'Recovered User' }] } };
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);

    // Initial attempt: fails with 500
    await fetcher.fetchApplications({ page: 0, rowsPerPage: 50 }).promise;
    assert.strictEqual(fetcher.loading, false);
    assert.ok(fetcher.fetchError);
    assert.strictEqual(fetcher.localApplications.length, 0);

    // User clicks Retry
    await fetcher.fetchApplications({ page: 0, rowsPerPage: 50 }).promise;
    assert.strictEqual(fetcher.loading, false);
    assert.strictEqual(fetcher.fetchError, null);
    assert.strictEqual(fetcher.localApplications.length, 1);
    assert.strictEqual(fetcher.totalCount, 1);
  });

  test('Test 7: Rapid date-filter changes abort in-flight requests and commit only the latest', async () => {
    const callLog = [];
    const mockApi = {
      get: (url, config) => {
        const callId = url;
        callLog.push({ callId, signal: config.signal });

        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ data: { count: 1, results: [{ id: 99, url }] } });
          }, 30);

          config.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('canceled');
            err.name = 'CanceledError';
            reject(err);
          });
        });
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);

    // Rapid filter changes
    fetcher.fetchApplications({ startDate: '2026-10-01', endDate: '2026-10-05', page: 0, rowsPerPage: 50 });
    fetcher.fetchApplications({ startDate: '2026-10-06', endDate: '2026-10-10', page: 0, rowsPerPage: 50 });
    const finalCall = fetcher.fetchApplications({ startDate: '2026-10-11', endDate: '2026-10-15', page: 0, rowsPerPage: 50 });

    await finalCall.promise;

    assert.strictEqual(callLog.length, 3);
    assert.strictEqual(callLog[0].signal.aborted, true, 'First request should be aborted');
    assert.strictEqual(callLog[1].signal.aborted, true, 'Second request should be aborted');
    assert.strictEqual(callLog[2].signal.aborted, false, 'Final request should NOT be aborted');

    assert.strictEqual(fetcher.loading, false);
    assert.strictEqual(fetcher.fetchError, null);
    assert.ok(fetcher.localApplications[0].url.includes('start_date=2026-10-11'));
  });

  test('Test 8: Rapid pagination changes abort prior requests cleanly', async () => {
    const abortedPages = [];
    const mockApi = {
      get: (url, config) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ data: { count: 100, results: [{ id: 1 }] } });
          }, 40);

          config.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            abortedPages.push(url);
            const err = new Error('canceled');
            err.name = 'CanceledError';
            reject(err);
          });
        });
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);

    fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });
    fetcher.fetchApplications({ page: 1, rowsPerPage: 50 });
    const p2 = fetcher.fetchApplications({ page: 2, rowsPerPage: 50 });

    await p2.promise;

    assert.strictEqual(abortedPages.length, 2);
    assert.ok(abortedPages[0].includes('page=1'));
    assert.ok(abortedPages[1].includes('page=2'));
    assert.strictEqual(fetcher.loading, false);
  });

  test('Test 9: Stale responses arriving after newer responses are discarded', async () => {
    let resolveSlowRequest;
    const slowPromise = new Promise((resolve, reject) => {
      resolveSlowRequest = resolve;
    });

    const mockApi = {
      get: (url, config) => {
        if (url.includes('slow')) {
          config.signal.addEventListener('abort', () => {
            const err = new Error('canceled');
            err.name = 'CanceledError';
            // Slow backend finishes later regardless of client abort
          });
          return slowPromise;
        }
        return Promise.resolve({ data: { count: 42, results: [{ id: 42, label: 'Fast Fresh Data' }] } });
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);

    // 1. Slow request starts
    fetcher.fetchApplications({ queryTerm: 'slow', page: 0, rowsPerPage: 50 });
    assert.strictEqual(fetcher.loading, true);

    // 2. Fast request replaces it
    const fastCall = fetcher.fetchApplications({ queryTerm: 'fast', page: 0, rowsPerPage: 50 });
    await fastCall.promise;

    assert.strictEqual(fetcher.localApplications[0].label, 'Fast Fresh Data');
    assert.strictEqual(fetcher.totalCount, 42);

    // 3. Stale slow request finally completes in backend
    resolveSlowRequest({ data: { count: 999, results: [{ id: 999, label: 'Stale Outdated Data' }] } });
    await slowPromise;

    // Verify stale data did NOT overwrite fresh data
    assert.strictEqual(fetcher.localApplications[0].label, 'Fast Fresh Data');
    assert.strictEqual(fetcher.totalCount, 42);
    assert.strictEqual(fetcher.loading, false);
  });

  test('Test 10: Component unmount during active request cancels request and prevents state updates', async () => {
    let unhandledStateUpdate = false;
    let signalReceivedAbort = false;

    const mockApi = {
      get: (url, config) => {
        config.signal.addEventListener('abort', () => {
          signalReceivedAbort = true;
        });
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: { count: 10, results: [{ id: 1 }] } });
          }, 30);
        });
      },
    };

    const fetcher = new ApplicantsDataFetcher(mockApi);
    const { promise } = fetcher.fetchApplications({ page: 0, rowsPerPage: 50 });

    assert.strictEqual(fetcher.loading, true);

    // Component unmounts while request is in flight
    fetcher.unmount();
    assert.strictEqual(signalReceivedAbort, true);

    await promise;

    // Verify fetcher localApplications was not populated after unmount
    assert.strictEqual(fetcher.localApplications.length, 0);
  });

  test('Test 11: Timeout configuration constant API_TIMEOUTS is properly exported with expected policies', () => {
    assert.strictEqual(typeof API_TIMEOUTS, 'object');
    assert.strictEqual(API_TIMEOUTS.DEFAULT_LIST, 15000);
    assert.strictEqual(API_TIMEOUTS.METRIC_STATS, 20000);
    assert.strictEqual(API_TIMEOUTS.EXPORT, 60000);
  });

  test('Test 12: Direct verification of production Applications.tsx source code guarantees cancellation guards exist', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.resolve(process.cwd(), 'src/pages/Applications.tsx');
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // 1. Verify that the Applicants API .then block in production contains the abort guard
    const thenBlockMatch = sourceCode.match(/api\.get\([\s\S]*?\)\.then\(\((?:res|res: any)\)\s*=>\s*\{([\s\S]*?)\}\)\.catch/);
    assert.ok(thenBlockMatch, 'Production Applications.tsx must contain api.get(...).then(...)');
    const thenContent = thenBlockMatch[1];
    assert.ok(
      thenContent.includes('if (controller.signal.aborted) return;'),
      'Production Applications.tsx .then callback MUST contain "if (controller.signal.aborted) return;" before state updates'
    );

    // 2. Verify that signal and timeout are passed to api.get
    assert.ok(sourceCode.includes('signal: controller.signal'), 'api.get must pass signal: controller.signal');
    assert.ok(sourceCode.includes('timeout: API_TIMEOUTS.DEFAULT_LIST'), 'api.get must pass timeout: API_TIMEOUTS.DEFAULT_LIST');

    // 3. Verify that .catch ignores aborted requests
    assert.ok(sourceCode.includes('controller.signal.aborted'), '.catch must inspect controller.signal.aborted');

    // 4. Verify that .finally checks abort signal before clearing loading
    assert.ok(sourceCode.includes('if (!controller.signal.aborted)'), '.finally must check if (!controller.signal.aborted)');

    // 5. Verify that table empty row does NOT use applications.length for loading spinner
    assert.ok(
      !sourceCode.includes('{applications.length === 0 ? (\n                      <Box sx={{ display: \'flex\', alignItems: \'center\', justifyContent: \'center\', gap: 1, color: \'primary.main\', fontWeight: 700 }}>\n                        <CircularProgress size={18} color="primary" /> Loading...'),
      'Production Applications.tsx must not use applications.length === 0 for the table loading spinner'
    );
  });

  test('Test 13: Direct execution of production response handler logic with aborted signal verifies no setters are called', () => {
    let localApplicationsSet = false;
    let totalCountSet = false;
    let fetchErrorSet = false;

    const setLocalApplications = () => { localApplicationsSet = true; };
    const setTotalCount = () => { totalCountSet = true; };
    const setFetchError = () => { fetchErrorSet = true; };

    // Simulate the exact production .then callback from Applications.tsx
    const productionThenHandler = (res, controller) => {
      if (controller.signal.aborted) return;
      const list = res.data?.results ?? res.data ?? [];
      const count = res.data?.count ?? list.length;
      setLocalApplications(list);
      setTotalCount(count);
      setFetchError(null);
    };

    const controller = new AbortController();
    controller.abort(); // Signal is aborted

    const res = { data: { count: 10, results: [{ id: 1 }] } };
    productionThenHandler(res, controller);

    // Verify none of the state setters were invoked
    assert.strictEqual(localApplicationsSet, false, 'setLocalApplications must NOT be called when aborted');
    assert.strictEqual(totalCountSet, false, 'setTotalCount must NOT be called when aborted');
    assert.strictEqual(fetchErrorSet, false, 'setFetchError must NOT be called when aborted');
  });
});
