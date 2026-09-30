/* ============================================================
   Lab 6 — Order Service (independently runnable microservice)
   Owns Order data. Validates orders by calling the User Service
   and Product Service over REST — NEVER by querying their
   databases directly.
   ============================================================ */
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const PORT = process.env.ORDER_SERVICE_PORT || 3003;

// Service URLs come from environment variables — never hard-coded.
// Inside Docker these resolve via the Compose service name
// (e.g. "user-service"), NOT "localhost".
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3001";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://localhost:3002";

// Give up quickly rather than hanging forever if a dependency is down —
// this is the "timeout" concept from the assignment's error-handling section.
const CALL_TIMEOUT_MS = 3000;

let orders = [];
let nextId = 9001;

function structuredError(res, status, message) {
  const label = status === 404 ? "Not Found" : status === 503 ? "Service Unavailable" : "Bad Request";
  return res.status(status).json({ error: label, status, message });
}

/**
 * Calls a dependency service and translates failures into a clear,
 * predictable shape instead of letting the caller hang or crash:
 * - dependency responds with 404          -> we surface 404 (bad reference)
 * - dependency unreachable / times out    -> we surface 503 (dependency down)
 */
async function fetchDependency(url, serviceLabel) {
  try {
    const response = await axios.get(url, { timeout: CALL_TIMEOUT_MS });
    return { ok: true, data: response.data };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return { ok: false, status: 404, message: `${serviceLabel} resource not found` };
    }
    // ECONNREFUSED (service down) or ECONNABORTED (timeout) both land here
    return { ok: false, status: 503, message: `${serviceLabel} is unavailable` };
  }
}

app.get("/orders", (req, res) => {
  res.status(200).json(orders);
});

app.get("/orders/:id", (req, res) => {
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return structuredError(res, 404, `Order ${req.params.id} not found`);
  res.status(200).json(order);
});

app.post("/orders", async (req, res) => {
  const { userId, productId, quantity } = req.body;

  if (!userId || !productId || !quantity || quantity <= 0) {
    return structuredError(res, 400, "userId, productId and a positive quantity are required");
  }

  // Validate the referenced User via the User Service's own API.
  const userResult = await fetchDependency(`${USER_SERVICE_URL}/users/${userId}`, "User Service");
  if (!userResult.ok) return structuredError(res, userResult.status, userResult.message);

  // Validate the referenced Product via the Product Service's own API.
  const productResult = await fetchDependency(`${PRODUCT_SERVICE_URL}/products/${productId}`, "Product Service");
  if (!productResult.ok) return structuredError(res, productResult.status, productResult.message);

  const order = {
    id: nextId++,
    userId,
    productId,
    quantity,
    userName: userResult.data.name,
    productName: productResult.data.name,
    totalPrice: productResult.data.price * quantity,
    status: "CONFIRMED",
  };
  orders.push(order);
  res.status(201).json(order);
});

app.get("/health", (req, res) => res.status(200).json({ service: "order-service", status: "up" }));

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
  console.log(`  -> USER_SERVICE_URL:    ${USER_SERVICE_URL}`);
  console.log(`  -> PRODUCT_SERVICE_URL: ${PRODUCT_SERVICE_URL}`);
});
