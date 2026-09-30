/* ============================================================
   Lab 7 — API Gateway
   Single public entry point. Contains NO business logic — only
   routing, logging, and centralized error handling. Service
   locations come entirely from environment variables (the
   "service registry" / config-based service discovery for
   this lab), never hard-coded in the routing code below.
   ============================================================ */
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.GATEWAY_PORT || 8080;

// ---------- Service registry (config-based service discovery) ----------
// These are the ONLY place service locations are defined. Routes below
// reference these variables — never a literal URL — so changing where a
// service lives means changing an environment variable, not this file.
const SERVICE_REGISTRY = {
  user: process.env.USER_SERVICE_URL || "http://localhost:3001",
  product: process.env.PRODUCT_SERVICE_URL || "http://localhost:3002",
  order: process.env.ORDER_SERVICE_URL || "http://localhost:3003",
};

console.log("Gateway starting with service registry:");
console.log("  user:    ", SERVICE_REGISTRY.user);
console.log("  product: ", SERVICE_REGISTRY.product);
console.log("  order:   ", SERVICE_REGISTRY.order);

// ---------- Request logging (method, path, target service, status) ----------
function requestLogger(serviceName) {
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      console.log(
        `[GATEWAY] ${req.method} ${req.originalUrl} -> ${serviceName} | ${res.statusCode} (${ms}ms)`
      );
    });
    next();
  };
}

// ---------- Centralized error handling for unreachable services ----------
// Any proxy target that's unreachable, refuses the connection, or times
// out lands here — the gateway returns a clear, structured 502/503
// instead of hanging indefinitely or crashing.
function proxyErrorHandler(serviceName) {
  return (err, req, res) => {
    console.error(`[GATEWAY] Error reaching ${serviceName}:`, err.code || err.message);
    const status = err.code === "ECONNREFUSED" || err.code === "ECONNRESET" ? 503 : 502;
    if (!res.headersSent) {
      res.status(status).json({
        error: status === 503 ? "Service Unavailable" : "Bad Gateway",
        status,
        message: `${serviceName} service is unreachable`,
      });
    }
  };
}

function proxyFor(serviceKey, serviceLabel) {
  return createProxyMiddleware({
    target: SERVICE_REGISTRY[serviceKey],
    changeOrigin: true,
    timeout: 5000,
    proxyTimeout: 5000,
    onError: proxyErrorHandler(serviceLabel),
  });
}

// ---------- Gateway's own health check (never proxied) ----------
app.get("/health", (req, res) => {
  res.status(200).json({
    gateway: "up",
    registry: SERVICE_REGISTRY,
    timestamp: new Date().toISOString(),
  });
});

// ---------- Routing table: path prefix -> backend service ----------
app.use("/users", requestLogger("User Service"), proxyFor("user", "User Service"));
app.use("/products", requestLogger("Product Service"), proxyFor("product", "Product Service"));
app.use("/orders", requestLogger("Order Service"), proxyFor("order", "Order Service"));

// ---------- Fallback for anything else ----------
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", status: 404, message: `No gateway route for ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
