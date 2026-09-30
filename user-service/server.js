/* ============================================================
   Lab 6 — User Service (independently runnable microservice)
   Owns all User data. No other service may query this data
   directly — they must call this service's REST API.
   ============================================================ */
const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.USER_SERVICE_PORT || 3001;

// In-memory store — this service's own data, not shared with anyone.
let users = [
  { id: 101, name: "Aarav Patel", email: "aarav@example.com" },
  { id: 102, name: "Shruti", email: "202512001@dau.ac.in" },
];
let nextId = 103;

function structuredError(res, status, message) {
  return res.status(status).json({ error: status === 404 ? "Not Found" : "Bad Request", status, message });
}

app.get("/users", (req, res) => {
  res.status(200).json(users);
});

app.get("/users/:id", (req, res) => {
  const user = users.find(u => u.id === Number(req.params.id));
  if (!user) return structuredError(res, 404, `User ${req.params.id} not found`);
  res.status(200).json(user);
});

app.post("/users", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return structuredError(res, 400, "name and email are required");
  const user = { id: nextId++, name, email };
  users.push(user);
  res.status(201).json(user);
});

app.put("/users/:id", (req, res) => {
  const index = users.findIndex(u => u.id === Number(req.params.id));
  if (index === -1) return structuredError(res, 404, `User ${req.params.id} not found`);
  const { name, email } = req.body;
  if (!name || !email) return structuredError(res, 400, "name and email are required");
  users[index] = { id: users[index].id, name, email };
  res.status(200).json(users[index]);
});

app.delete("/users/:id", (req, res) => {
  const index = users.findIndex(u => u.id === Number(req.params.id));
  if (index === -1) return structuredError(res, 404, `User ${req.params.id} not found`);
  users.splice(index, 1);
  res.status(204).send();
});

app.get("/health", (req, res) => res.status(200).json({ service: "user-service", status: "up" }));

app.listen(PORT, () => console.log(`User Service running on port ${PORT}`));
