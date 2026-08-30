const endpoint = "http://127.0.0.1:5001/demo-bazm-online/asia-south1/health";
const requestId = "emulator-health-check";
const response = await fetch(endpoint, {
  headers: { "x-request-id": requestId },
});
const body = await response.json();

if (
  response.status !== 200 ||
  body?.ok !== true ||
  body?.data?.status !== "ok" ||
  body?.meta?.requestId !== requestId
) {
  throw new Error(
    `Functions health check failed: ${response.status} ${JSON.stringify(body)}`,
  );
}

console.log("Functions health endpoint passed its emulator smoke test.");
