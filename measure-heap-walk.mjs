const BASE = 'http://127.0.0.1:8765';
const tabId = Number(process.argv[2] || 2141044623);
const steps = Number(process.argv[3] || 30);
const sampleEvery = Number(process.argv[4] || 5);

async function cmd(action, params, timeoutMs, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}/cmd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params: { tabId, ...params }, timeoutMs }),
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = body.error?.message || JSON.stringify(body);
        throw new Error(msg);
      }
      return body.result;
    } catch (err) {
      if (attempt === retries) {
        console.error(`cmd ${action} failed after ${retries + 1} attempts: ${err.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

const samples = [];

const baseline = await cmd('readPerfProbe', {});
samples.push({ step: 0, ...baseline });
console.log(JSON.stringify(samples[samples.length - 1]));

for (let i = 1; i <= steps; i++) {
  await cmd('click', { selector: 'button[aria-label="goNextQuestion"]' });
  await new Promise((r) => setTimeout(r, 300));
  if (i % sampleEvery === 0 || i === steps) {
    const probe = await cmd('readPerfProbe', {}, 20000);
    samples.push({ step: i, ...probe });
    console.log(JSON.stringify(samples[samples.length - 1]));
  }
}

console.log('---summary---');
console.log(JSON.stringify(samples, null, 2));
