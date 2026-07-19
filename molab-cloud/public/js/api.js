/**
 * Thin fetch wrapper for the MOLAB Cloud API. Always sends cookies
 * (credentials: 'include') so the httpOnly session cookie is used.
 */
const API = {
  async request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body || {}); },
  put(url, body) { return this.request('PUT', url, body || {}); },
  patch(url, body) { return this.request('PATCH', url, body || {}); },
};
