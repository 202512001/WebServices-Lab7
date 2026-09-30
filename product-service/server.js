/* ============================================================
   Lab 6 — Product Service (independently runnable microservice)
   Owns all Product data.
   ============================================================ */
const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PRODUCT_SERVICE_PORT || 3002;

let products = [
  { id: 501, name: "Wireless Mouse", price: 799 },
  { id: 502, name: "Mechanical Keyboard", price: 3499 },
];
let nextId = 503;

function structuredError(res, status, message) {
  return res.status(status).json({ error: status === 404 ? "Not Found" : "Bad Request", status, message });
}

app.get("/products", (req, res) => {
  res.status(200).json(products);
});

app.get("/products/:id", (req, res) => {
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return structuredError(res, 404, `Product ${req.params.id} not found`);
  res.status(200).json(product);
});

app.post("/products", (req, res) => {
  const { name, price } = req.body;
  if (!name || typeof price !== "number" || price <= 0) {
    return structuredError(res, 400, "name and a positive numeric price are required");
  }
  const product = { id: nextId++, name, price };
  products.push(product);
  res.status(201).json(product);
});

app.put("/products/:id", (req, res) => {
  const index = products.findIndex(p => p.id === Number(req.params.id));
  if (index === -1) return structuredError(res, 404, `Product ${req.params.id} not found`);
  const { name, price } = req.body;
  if (!name || typeof price !== "number" || price <= 0) {
    return structuredError(res, 400, "name and a positive numeric price are required");
  }
  products[index] = { id: products[index].id, name, price };
  res.status(200).json(products[index]);
});

app.delete("/products/:id", (req, res) => {
  const index = products.findIndex(p => p.id === Number(req.params.id));
  if (index === -1) return structuredError(res, 404, `Product ${req.params.id} not found`);
  products.splice(index, 1);
  res.status(204).send();
});

app.get("/health", (req, res) => res.status(200).json({ service: "product-service", status: "up" }));

app.listen(PORT, () => console.log(`Product Service running on port ${PORT}`));
